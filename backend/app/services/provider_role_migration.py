"""把 `llm_provider.task_role` 回填进 `provider_role` 关联表（幂等、失败非致命）。

## 背景：为什么要回填

`llm_provider.task_role` 是**单值**列，表达不了「一个模型全包（写大纲 + 写正文 + 审校）」。
2026-09-22 起路由改读 `provider_role` 关联表（多对多，见 `schema.sql`），
但**老库里已有的分配只存在于那一列里** —— 不搬过去，升级后所有模型都会「没有角色」，
写作链路的按角色路由会整体退化成「全走默认模型」（用户会以为配置丢了）。

## 一次性移交，判据是标记而不是「表里有没有行」

与 `provider_migration.py` 同一教训：**「目标表非空」不能当迁移判据**。
用户在界面上「取消某模型对某角色的分配」后，`provider_role` 里那一行被删掉；
若重启时用「表里有没有行/这条在不在」判断要不要补，旧列里的值会把它**复活** ——
于是「取消分配」永远取消不掉。

故照 `provider_migration.py` 的做法：在全局库 `meta` 表写一次性标记
`provider_roles_migrated_v1`，**只迁移一次**；之后无论是清空还是删行，重启都不再回填。
（若 `data/app.db` 被删重建 → 标记与数据一起消失 → 回填一次，属可接受的数据恢复行为。）

## 其余规则

· **`INSERT OR IGNORE`**：主键 `(provider_id, task_role)` 天然去重，重复跑不新增行。
· **不覆盖已有分配**：只补那一列里已有的角色，不删、不改用户后来在界面上做的分配。
· **失败非致命**：任何异常吞掉并记 WARN，绝不阻断启动（且不落标记，下次可重试）。
"""

from __future__ import annotations

import sqlite3

from app.db.global_db import get_global_database
from app.db.registry import now_iso
from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

_MIGRATION_KEY = "provider_roles_migrated_v1"


def _is_migrated(conn: sqlite3.Connection) -> bool:
    row = conn.execute("SELECT 1 FROM meta WHERE key = ?", (_MIGRATION_KEY,)).fetchone()
    return row is not None


def _mark_migrated(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
        (_MIGRATION_KEY, "1"),
    )


def migrate_provider_roles() -> int:
    """回填并返回**实际新增的关联行数**；一次性、幂等、失败非致命（异常 → 0 并记 WARN）。"""
    try:
        return _migrate()
    except Exception:  # noqa: BLE001 - 迁移属增强，失败不得影响启动
        logger.warning("provider_role migration failed (non-fatal); will retry next start")
        return 0


def _migrate() -> int:
    db = get_global_database()  # 首次访问即建库；新表由 @@GLOBAL 段一并建出
    added = 0
    with db.transaction() as conn:
        if _is_migrated(conn):
            return 0
        rows = conn.execute("SELECT id, task_role FROM llm_provider").fetchall()
        now = now_iso()
        for row in rows:
            role = row["task_role"]
            if not role:
                continue  # 列是 NOT NULL，此分支只为防御历史脏数据
            cur = conn.execute(
                "INSERT OR IGNORE INTO provider_role (provider_id, task_role, created_at)"
                " VALUES (?, ?, ?)",
                (int(row["id"]), str(role), now),
            )
            added += cur.rowcount
        # 无论是否搬到数据都落标记：一次性动作，不是每次启动的兜底补齐。
        _mark_migrated(conn)
    logger.info("provider roles backfilled", **log_fields(added=added))
    return added
