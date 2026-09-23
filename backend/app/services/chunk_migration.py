"""chunk_meta 唯一键升级 + 存量库分块回填（幂等、失败非致命）。

## 背景：为什么必须重建表

旧表级唯一键是 `UNIQUE(source_type, source_id, chapter_seq)` —— 它把**一章的 N 个分块**
当成同一行：`writeback._index_chapter` 逐块 upsert 时，每一块都命中同一冲突键并覆盖前一块，
**整章只剩最后一块**（实测：某作品应 89 块，库里仅 20 行 = 章数，检索库缺 78% 内容），
而接口回报的 `chunks_indexed` 是循环次数 89，于是缺陷完全静默。

`schema.sql` 自己的注释写着「百万字约 1250 块」≈ 800 字/块 —— 说明**每章多块本来就是设计意图**，
是那条旧约束写错了。2026-09-22 修正：新增 `chunk_index`（章内块序号，0 起），唯一键取四列。

## 两步动作

1. **结构升级**：旧约束换成四列新约束（`CREATE TABLE IF NOT EXISTS` 改不动已存在的表）。
2. **数据回填**：仅改结构的话，老库那 20 行依旧是「每章只剩最后一块」——
   丢失的分块不会自己回来。故按 `chapter.content` **本地重新切块**补齐
   （不调 embedding 模型：向量只有配了 embedding 角色才算得出，此处留 NULL 正确）。

## 幂等判据：看表定义 / 看行数是否与正文相符，都不记标记文件

· 结构：`sqlite_master` 里 chunk_meta 的 DDL 已含 `chunk_index` → 跳过；
· 数据：某章的 `COUNT(chunk_meta)` 已等于 `len(split_text(chapter.content))` → 跳过。
  相等即不动它 —— 这样既幂等，也不会无谓重建 id / 丢弃已有向量。

用「看事实」而不是「记标记」：DDL 与行数才是权威，标记会与实际漂移（同 `fts_migration`）。

## 失败处理

任何异常都吞掉并记 WARN，**绝不阻断启动**（同 `provider_migration` / `fts_migration`）。
DDL 在 SQLite 里是事务性的：单本库迁移失败会整体回滚，不会留下半张表。
"""

from __future__ import annotations

import sqlite3

from app.db import schema_loader
from app.db.connection import Capabilities
from app.db.registry import get_registry, now_iso
from app.logging_config import get_logger, log_fields
from app.repositories import chunk_repo

logger = get_logger(__name__)

_TABLE = "chunk_meta"
#: 期望新增的列 —— **判据就是它**，以后改 schema 的列名要跟着改
_WANT_COLUMN = "chunk_index"
#: 迁移期间的临时表名（迁移结束即改名/删除，不会留存）
_NEW_TABLE = "_chunk_meta_migrating"
#: 拷贝时显式列出列名（不用 SELECT *：列序变化不该影响数据搬运）
_COPY_COLUMNS = (
    "id", "source_type", "source_id", "chapter_seq", "text", "char_count",
    "embedding_model", "embedding", "embedding_dim", "created_at",
)


def _chunk_meta_ddls(caps: Capabilities) -> tuple[str, list[str]] | None:
    """从**真源** `schema.sql` 取 chunk_meta 的建表语句与索引语句（不硬编码 DDL）。"""
    statements = [
        s for s in schema_loader.load_statements(caps, scope="book") if _TABLE in s
    ]
    table = next((s for s in statements if "CREATE TABLE" in s), None)
    if table is None:
        return None
    return table, [s for s in statements if "CREATE INDEX" in s]


def _existing_ddl(conn: sqlite3.Connection) -> str | None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (_TABLE,)
    ).fetchone()
    return str(row[0]) if row and row[0] else None


def _needs_migration(conn: sqlite3.Connection) -> bool:
    """表不存在（空库 / 坏库）→ False；表定义已含目标列 → False。"""
    ddl = _existing_ddl(conn)
    if ddl is None:
        return False
    return _WANT_COLUMN not in ddl


def _rebuild(conn: sqlite3.Connection, table_ddl: str, index_ddls: list[str]) -> None:
    """就地重建 chunk_meta：结构升级 + 原样搬数据（保留 id）。"""
    new_ddl = table_ddl.replace(
        f"IF NOT EXISTS {_TABLE} ", f"IF NOT EXISTS {_NEW_TABLE} ", 1
    )
    if new_ddl == table_ddl:
        # 真源 DDL 的写法变了 → 宁可放弃本次迁移（外层吞异常记 WARN），
        # 也不要凭猜测建错表。
        raise RuntimeError("schema.sql 的 chunk_meta DDL 格式与预期不符，跳过迁移")

    conn.execute(f"DROP TABLE IF EXISTS {_NEW_TABLE}")
    conn.execute(new_ddl)
    cols = ", ".join(_COPY_COLUMNS)
    conn.execute(
        f"INSERT INTO {_NEW_TABLE} ({cols}, {_WANT_COLUMN}) "
        f"SELECT {cols}, 0 FROM {_TABLE}"  # noqa: S608 - 表名/列名均来自本模块常量
    )
    conn.execute(f"DROP TABLE {_TABLE}")  # 原子性：DROP 与 RENAME 在同一事务内
    conn.execute(f"ALTER TABLE {_NEW_TABLE} RENAME TO {_TABLE}")
    for ddl in index_ddls:
        conn.execute(ddl)


def migrate_all_book_chunks() -> int:
    """升级结构 + 回填分块；返回**实际发生了变更的书库数**。幂等、失败非致命。"""
    try:
        return _migrate()
    except Exception:  # noqa: BLE001 - 结构升级属增强，失败不得影响启动
        logger.warning("chunk_meta migration failed (non-fatal); will retry next start")
        return 0


def _repair_chapters(conn: sqlite3.Connection, caps: Capabilities) -> int:
    """重建「分块数与当前正文不符」的章节索引，返回被重建的章节数。

    **纯本地、不调模型**：只按 `split_text` 重新切块，`embedding` 留 NULL
    （配了 embedding 角色才算得出向量，回填阶段不具备该条件，留空即为正确状态）。

    为什么不复用 `writeback._index_chapter`：那个函数会调用 embedding 模型 ——
    启动期对全书章节发起网络请求是不可接受的（几 MB 正文 × N 块向量）。
    """
    from app.utils.chunk import split_text  # 延迟导入，避免与 utils 的循环依赖
    from app.utils.text import strip_html

    now = now_iso()
    repaired = 0
    for row in conn.execute("SELECT id, seq, content FROM chapter").fetchall():
        chapter_id = int(row["id"])
        chunks = split_text(strip_html(row["content"] or ""))
        if len(chunks) == chunk_repo.count_for_source(conn, "chapter", chapter_id):
            continue  # 行数与正文相符 → 不动它（保住 id 与已有向量）
        chunk_repo.delete_for_source(conn, caps, source_type="chapter", source_id=chapter_id)
        for index, chunk in enumerate(chunks):
            chunk_repo.upsert_chunk(
                conn,
                source_type="chapter",
                source_id=chapter_id,
                chapter_seq=int(row["seq"]),
                chunk_index=index,
                text=chunk,
                char_count=len(chunk),
                embedding_model=None,
                embedding=None,
                now=now,
            )
        repaired += 1
    return repaired


def _migrate() -> int:
    registry = get_registry()
    ddls = _chunk_meta_ddls(registry.caps)
    if ddls is None:
        logger.warning("chunk_meta migration skipped: schema ddl not found")
        return 0
    table_ddl, index_ddls = ddls

    changed = 0
    for slug in registry.list_slugs():
        try:
            with registry.database(slug).transaction() as conn:
                rebuilt = _needs_migration(conn)
                if rebuilt:
                    _rebuild(conn, table_ddl, index_ddls)
                repaired = _repair_chapters(conn, registry.caps)
        except Exception:  # noqa: BLE001 - 单本坏库不得阻断整体
            logger.warning("chunk_meta migration failed for book", **log_fields(slug=slug))
            continue
        if rebuilt or repaired:
            changed += 1
            logger.info(
                "chunk_meta upgraded",
                **log_fields(slug=slug, structure_rebuilt=rebuilt, chapters_repaired=repaired),
            )
    if changed:
        logger.info("chunk_meta migration done", **log_fields(books=changed))
    return changed
