"""world_entry 表数据访问（R1）。"""

from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.base import fetch_one, insert
from app.utils.convert import tags_from_db, tags_to_db

_COLUMNS = ("category", "name", "content", "parent_id", "tags")


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    data = dict(row)
    data["tags"] = tags_from_db(data.get("tags"))
    return data


def create(conn: sqlite3.Connection, data: dict[str, Any], now: str) -> int:
    return insert(
        conn,
        """
        INSERT INTO world_entry (category, name, content, parent_id, tags, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.get("category", "other"),
            data["name"],
            data.get("content"),
            data.get("parent_id"),
            tags_to_db(data.get("tags")),
            now,
            now,
        ),
    )


def get(conn: sqlite3.Connection, entry_id: int) -> dict | None:
    return _row_to_dict(fetch_one(conn, "SELECT * FROM world_entry WHERE id = ?", (entry_id,)))


def list_all(
    conn: sqlite3.Connection,
    category: str | None = None,
    parent_id: int | None = None,
) -> list[dict]:
    sql = "SELECT * FROM world_entry"
    clauses: list[str] = []
    params: list[Any] = []
    if category:
        clauses.append("category = ?")
        params.append(category)
    if parent_id is not None:
        clauses.append("parent_id = ?")
        params.append(parent_id)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY category ASC, parent_id ASC, name ASC"
    rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]  # type: ignore[misc]


def update(conn: sqlite3.Connection, entry_id: int, fields: dict[str, Any], now: str) -> None:
    clean = {k: v for k, v in fields.items() if k in _COLUMNS}
    if "tags" in clean:
        clean["tags"] = tags_to_db(clean["tags"])
    if not clean:
        return
    clean["updated_at"] = now
    assignments = ", ".join(f"{col} = ?" for col in clean)
    conn.execute(
        f"UPDATE world_entry SET {assignments} WHERE id = ?",  # noqa: S608
        [*clean.values(), entry_id],
    )


def delete(conn: sqlite3.Connection, entry_id: int) -> bool:
    cur = conn.execute("DELETE FROM world_entry WHERE id = ?", (entry_id,))
    return cur.rowcount > 0


def all_rows(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM world_entry ORDER BY id ASC").fetchall()
    return [_row_to_dict(r) for r in rows]  # type: ignore[misc]
