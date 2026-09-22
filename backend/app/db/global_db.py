"""全局库（`data/app.db`）连接持有者。

为什么需要：有些数据**跨作品共享**（当前只有 `llm_provider` 模型配置）。
放在每部作品库里会出现「换一本书就要重配模型」，且各书副本随时间漂移。
故单开一个全局库承载这类数据。

书库仍是「一书一库」（`books/<slug>/novel.db`，ADR-001）；全局库独立于作品，
与「当前打开的作品」无关，因此依赖它的端点（`/api/providers` 等）**不需要活跃作品**。

DDL 复用 `schema.sql` 的 `@@GLOBAL` 段（`schema_loader.apply_global_schema`），
不在本模块另写一份建表语句，避免双真源漂移。
"""

from __future__ import annotations

import threading
from pathlib import Path

from app.config import settings
from app.db.connection import Database, probe_capabilities
from app.db.schema_loader import apply_global_schema, missing_global_objects
from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

_guard = threading.RLock()
_db: Database | None = None


def global_db_path() -> Path:
    return settings.data_dir / "app.db"


def _ensure_schema(db: Database) -> None:
    with db.connection() as conn:
        if not missing_global_objects(conn):
            return
        applied = apply_global_schema(conn)
        remaining = missing_global_objects(conn)
        if remaining:
            logger.warning(
                "global schema objects missing after apply",
                **log_fields(applied=applied, missing=remaining),
            )
        else:
            logger.info("global schema applied", **log_fields(statements=applied))


def get_global_database() -> Database:
    """返回全局库连接持有者；首次访问时建库并写入 schema。"""
    global _db
    path = global_db_path()
    with _guard:
        if _db is None or _db.path != path:
            path.parent.mkdir(parents=True, exist_ok=True)
            db = Database(path, probe_capabilities())
            _ensure_schema(db)
            _db = db
        return _db


def reset_global_database() -> None:
    """仅供测试使用：丢弃全局库连接持有者，使下次访问按当前 settings 重新建库。"""
    global _db
    with _guard:
        _db = None
