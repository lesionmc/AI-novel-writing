"""把「随书存储」的模型配置一次性迁移到全局库（`data/app.db`）。

背景：M1 把 `llm_provider` 放在每部作品的独立库里，导致换一本书就要重配模型。
现改为全局存储（见 `app/db/global_db.py`）。本模块负责把**老书库**里已有的
模型配置搬到全局库，使老用户升级后配置不丢。

**一次性移交（不是"每次启动兜底补齐"）** —— 判据是全局库 `meta` 表里的标记
`providers_migrated_v1`，而**不是**「全局库有没有 provider 行」：

    用「行数非空」当判据会产生用户可见缺陷 —— 用户在设置页把模型全删光后，
    只要 `books/*/novel.db` 里还留着旧行（旧库按设计保留、不删），
    每次重启都会把删掉的模型**复活**，永远删不干净。
    改成一次性标记后：迁移只发生一次；清空后重启仍为空。
    （若 `app.db` 文件被删、重新生成 → 标记也没了 → 会再迁一次；属可接受的数据恢复行为。）

其余规则（对齐任务要求）：
  · **取第一本非空**：扫描作品库，遇到第一本含 provider 的库即为迁移源
    （历史「建新书复制上一本配置」已使各书内容基本一致，取一本即可，避免重复）。
  · **去重**：源内按 `(provider, model, key_ref)` 去重，防止历史复制产生的重复行。
  · **幂等**：`meta` 已有标记则直接返回 0。
  · **失败非致命**：任何异常都被吞掉并记 WARN，绝不阻断应用启动（且不写标记，下次可重试）。

新书库已不含 `llm_provider` 表 —— 读取时命中 `OperationalError` 视为「无内容可迁」，
静默跳过（不是错误）。
"""

from __future__ import annotations

import sqlite3

from app.db.global_db import get_global_database
from app.db.registry import get_registry, now_iso
from app.logging_config import get_logger, log_fields
from app.repositories import provider_repo

logger = get_logger(__name__)

_MIGRATION_KEY = "providers_migrated_v1"
_DEDUP_KEYS = ("provider", "model", "key_ref")


def _is_migrated(conn: sqlite3.Connection) -> bool:
    row = conn.execute("SELECT 1 FROM meta WHERE key = ?", (_MIGRATION_KEY,)).fetchone()
    return row is not None


def _mark_migrated(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        (_MIGRATION_KEY, "1"),
    )


def _dedup(rows: list[dict]) -> list[dict]:
    seen: set[tuple] = set()
    unique: list[dict] = []
    for row in rows:
        sig = tuple(row.get(k) for k in _DEDUP_KEYS)
        if sig in seen:
            continue
        seen.add(sig)
        unique.append(row)
    return unique


def migrate_providers_to_global() -> int:
    """迁移并返回迁移条数；一次性、幂等、失败非致命（异常 → 0 并记 WARN）。"""
    try:
        return _migrate()
    except Exception:  # noqa: BLE001 - 迁移属增强，失败不得影响启动
        logger.warning("provider migration failed (non-fatal); will retry next start")
        return 0


def _migrate() -> int:
    global_db = get_global_database()
    with global_db.connection() as conn:
        if _is_migrated(conn):
            return 0  # 已标记迁移过：不论全局库现在是否为空，都不再自动搬运
        # 兼容：全局库已有配置（例如从"旧判据"版本升级上来）→ 无需重复搬运，直接落标记
        already_configured = bool(provider_repo.list_all(conn))
    if already_configured:
        with global_db.transaction() as conn:
            _mark_migrated(conn)
        logger.info("provider migration: skipped (global already configured); marker set")
        return 0

    migrated = 0
    registry = get_registry()
    for slug in registry.list_slugs():
        try:
            with registry.database(slug).connection() as conn:
                rows = provider_repo.list_all(conn)
        except sqlite3.OperationalError:
            # 新书库已无 llm_provider 表 → 无内容可迁
            continue
        except Exception:  # noqa: BLE001 - 单本坏书不得阻断整体迁移
            logger.warning("provider migration: unreadable book", **log_fields(slug=slug))
            continue
        if not rows:
            continue

        unique = _dedup(rows)
        now = now_iso()
        with global_db.transaction() as conn:
            for row in unique:
                provider_repo.create(conn, row, now)
        migrated = len(unique)
        logger.info(
            "providers migrated to global",
            **log_fields(source=slug, count=migrated),
        )
        break  # 取第一本非空即可

    # 无论是否搬到数据，都落标记：迁移是一次性动作，不是每次启动的兜底补齐。
    with global_db.transaction() as conn:
        _mark_migrated(conn)
    if migrated == 0:
        logger.info("provider migration: nothing to migrate; marker set")
    return migrated
