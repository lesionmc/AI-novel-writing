"""把书库的 FTS 索引从 `unicode61` 重建为 `trigram`（幂等、失败非致命）。

## 背景：为什么要换分词器

`schema.sql` 的 FTS 表原用 `unicode61` —— 它把**连续中文当成一个超长 token**，
于是「七号仓库」这类中文子串的 `MATCH` **恒为 0 条**，全文检索只能静默降级成
全表 `LIKE` 扫描（功能没错，性能会崩）。

2026-09-22 改成 `trigram`（按三字滑动窗口建索引）。实测 SQLite 3.49.1：
`trigram` 对「七号仓库」「断齿钥匙」命中 ✅，而 `unicode61` 全部 0 条。

## 为什么必须有这个迁移

`CREATE VIRTUAL TABLE IF NOT EXISTS` **不会改动已存在的表** —— 老书库开库时那条
建表语句会被直接跳过，于是它一直用 `unicode61`，造成「新书快、老书慢」的不一致。

## 幂等判据：看表定义，不记标记

· 表定义里已含 `trigram` → 跳过；
· 不含 → `DROP` + 用**真源 `schema.sql` 的同一条 DDL** 重建 + 从源表重灌数据。

用「看定义」而不是「记标记」：DDL 本身才是权威，标记会与实际漂移 ——
本项目已经因为「双真源 / 标记与实际不一致」吃过亏（见 ADR-006 与 pitfalls）。

## 失败处理

任何异常都吞掉并记 WARN，**绝不阻断启动**（与 `provider_migration` 同一原则）：
全文检索坏掉是降级，应用起不来是停机，后者严重得多。
"""

from __future__ import annotations

import sqlite3

from app.db import schema_loader
from app.db.connection import Capabilities
from app.db.registry import get_registry
from app.logging_config import get_logger, log_fields
from app.repositories import character_repo, search_repo, world_entry_repo

logger = get_logger(__name__)

_FTS_TABLES = ("chapter_fts", "setting_fts")
#: 期望的分词器关键字（判据就是它，改 schema 时这里要跟着改）
_WANT_TOKENIZER = "trigram"


def _fts_ddls(caps: Capabilities) -> dict[str, str]:
    """从**真源** `schema.sql` 取 FTS 建表语句。

    不硬编码 DDL —— 否则 schema 一改就得记得同步改这里，又是一处双真源。
    """
    ddls: dict[str, str] = {}
    for stmt in schema_loader.load_statements(caps, scope="book"):
        for name in _FTS_TABLES:
            if f"EXISTS {name}" in stmt:
                ddls[name] = stmt
    return ddls


def _existing_ddl(conn: sqlite3.Connection, name: str) -> str | None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return str(row[0]) if row and row[0] else None


def _needs_rebuild(conn: sqlite3.Connection, name: str) -> bool:
    """表不存在（如 FTS5 不可用的库）→ False；已含目标分词器 → False。"""
    ddl = _existing_ddl(conn, name)
    if ddl is None:
        return False
    return _WANT_TOKENIZER not in ddl


def _refill_settings(conn: sqlite3.Connection, caps: Capabilities) -> int:
    """重灌设定索引。

    **复用 `setting_service` 的正文构造器（`_char_name` / `_char_body` / `_world_body`）** ——
    搜索正文的格式必须**只有一个定义处**。在这里另写一份就是新的双真源，
    而本项目已经因为双真源踩过坑（缺列只在运行时才炸）。
    同层模块之间复用私有构造器不好看，但比复制一份格式定义安全得多。
    """
    from app.services import setting_service  # 延迟导入，避免模块级循环

    count = 0
    for row in character_repo.all_rows(conn):
        search_repo.setting_upsert(
            conn,
            caps,
            source_type="character",
            source_id=int(row["id"]),
            name=setting_service._char_name(row),  # noqa: SLF001 - 见上方说明
            body=setting_service._char_body(row),  # noqa: SLF001
        )
        count += 1
    for row in world_entry_repo.all_rows(conn):
        search_repo.setting_upsert(
            conn,
            caps,
            source_type="world_entry",
            source_id=int(row["id"]),
            name=str(row.get("name", "")),
            body=setting_service._world_body(row),  # noqa: SLF001
        )
        count += 1
    return count


def _rebuild_book(
    conn: sqlite3.Connection, caps: Capabilities, ddls: dict[str, str]
) -> list[str]:
    """就地重建单个书库的 FTS 表，返回被重建的表名。"""
    rebuilt: list[str] = []

    for name in _FTS_TABLES:
        if name not in ddls or not _needs_rebuild(conn, name):
            continue
        conn.execute(f"DROP TABLE IF EXISTS {name}")  # noqa: S608 - name 来自白名单常量
        conn.execute(ddls[name])
        rebuilt.append(name)

    if "chapter_fts" in rebuilt:
        conn.execute(
            """
            INSERT INTO chapter_fts (chapter_id, title, content)
            SELECT id, COALESCE(title, ''), COALESCE(content, '')
            FROM chapter
            """
        )
    if "setting_fts" in rebuilt:
        _refill_settings(conn, caps)

    return rebuilt


def migrate_all_book_fts() -> int:
    """把所有书库的 FTS 索引重建为 trigram；返回**实际重建过的书库数**。

    一次性、幂等、失败非致命。已迁移过的库不会重复重建（判据见文件头）。
    """
    try:
        return _migrate()
    except Exception:  # noqa: BLE001 - 索引重建属增强，失败不得影响启动
        logger.warning("fts migration failed (non-fatal); will retry next start")
        return 0


def _migrate() -> int:
    registry = get_registry()
    if not registry.caps.fts5_available:
        return 0  # 没有 FTS5 就没有可重建的表

    ddls = _fts_ddls(registry.caps)
    if len(ddls) < len(_FTS_TABLES):
        logger.warning(
            "fts migration skipped: schema ddls not found",
            **log_fields(found=sorted(ddls)),
        )
        return 0

    migrated = 0
    for slug in registry.list_slugs():
        try:
            with registry.database(slug).transaction() as conn:
                rebuilt = _rebuild_book(conn, registry.caps, ddls)
        except Exception:  # noqa: BLE001 - 单本坏书不得阻断整体
            logger.warning("fts migration failed for book", **log_fields(slug=slug))
            continue
        if rebuilt:
            migrated += 1
            logger.info("book fts rebuilt", **log_fields(slug=slug, tables=rebuilt))
    if migrated:
        logger.info("fts migration done", **log_fields(books=migrated))
    return migrated
