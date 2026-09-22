"""llm_provider 表数据访问（R5）。密钥本体在系统密钥环，此处仅 key_ref。"""

from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.base import fetch_one, insert

_COLUMNS = ("provider", "model", "base_url", "key_ref", "task_role", "is_default", "enabled")


def create(conn: sqlite3.Connection, data: dict[str, Any], now: str) -> int:
    return insert(
        conn,
        """
        INSERT INTO llm_provider
            (provider, model, base_url, key_ref, task_role, is_default, enabled, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["provider"],
            data["model"],
            data.get("base_url"),
            data.get("key_ref"),
            data.get("task_role", "content"),
            1 if data.get("is_default") else 0,
            1 if data.get("enabled", 1) else 0,
            now,
        ),
    )


def get(conn: sqlite3.Connection, provider_id: int) -> dict | None:
    return fetch_one(conn, "SELECT * FROM llm_provider WHERE id = ?", (provider_id,))


def list_all(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM llm_provider ORDER BY is_default DESC, id ASC"
    ).fetchall()
    return [dict(r) for r in rows]


def update(conn: sqlite3.Connection, provider_id: int, fields: dict[str, Any]) -> None:
    clean = {k: v for k, v in fields.items() if k in _COLUMNS}
    if not clean:
        return
    assignments = ", ".join(f"{col} = ?" for col in clean)
    conn.execute(
        f"UPDATE llm_provider SET {assignments} WHERE id = ?",  # noqa: S608
        [*clean.values(), provider_id],
    )


def delete(conn: sqlite3.Connection, provider_id: int) -> bool:
    cur = conn.execute("DELETE FROM llm_provider WHERE id = ?", (provider_id,))
    return cur.rowcount > 0


def find_for_role(conn: sqlite3.Connection, task_role: str) -> dict | None:
    return fetch_one(
        conn,
        """
        SELECT * FROM llm_provider
         WHERE enabled = 1 AND task_role = ?
         ORDER BY is_default DESC, id ASC LIMIT 1
        """,
        (task_role,),
    )


def find_default(conn: sqlite3.Connection) -> dict | None:
    return fetch_one(
        conn,
        "SELECT * FROM llm_provider WHERE enabled = 1 ORDER BY is_default DESC, id ASC LIMIT 1",
    )


def find_by_provider(conn: sqlite3.Connection, provider: str) -> dict | None:
    """按平台名取一条已配置记录（用于复用其 key_ref / base_url）。"""
    return fetch_one(
        conn,
        "SELECT * FROM llm_provider WHERE provider = ? ORDER BY is_default DESC, id ASC LIMIT 1",
        (provider,),
    )


def any_enabled(conn: sqlite3.Connection) -> bool:
    return fetch_one(conn, "SELECT 1 AS x FROM llm_provider WHERE enabled = 1 LIMIT 1") is not None


def clear_defaults(conn: sqlite3.Connection) -> None:
    conn.execute("UPDATE llm_provider SET is_default = 0")
