"""outline 表数据访问（R7）。"""

from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.base import fetch_one, insert

_COLUMNS = ("level", "parent_id", "seq", "title", "content", "chapter_id")


def create(conn: sqlite3.Connection, data: dict[str, Any], now: str) -> int:
    return insert(
        conn,
        """
        INSERT INTO outline (level, parent_id, seq, title, content, chapter_id,
                             created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["level"],
            data.get("parent_id"),
            data.get("seq", 0),
            data.get("title"),
            data.get("content"),
            data.get("chapter_id"),
            now,
            now,
        ),
    )


def get(conn: sqlite3.Connection, outline_id: int) -> dict | None:
    return fetch_one(conn, "SELECT * FROM outline WHERE id = ?", (outline_id,))


def list_all(
    conn: sqlite3.Connection,
    level: str | None = None,
    parent_id: int | None = None,
) -> list[dict]:
    sql = "SELECT * FROM outline"
    clauses: list[str] = []
    params: list[Any] = []
    if level:
        clauses.append("level = ?")
        params.append(level)
    if parent_id is not None:
        clauses.append("parent_id = ?")
        params.append(parent_id)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY level ASC, seq ASC, id ASC"
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def update(conn: sqlite3.Connection, outline_id: int, fields: dict[str, Any], now: str) -> None:
    clean = {k: v for k, v in fields.items() if k in _COLUMNS}
    if not clean:
        return
    clean["updated_at"] = now
    assignments = ", ".join(f"{col} = ?" for col in clean)
    conn.execute(
        f"UPDATE outline SET {assignments} WHERE id = ?",  # noqa: S608
        [*clean.values(), outline_id],
    )


def delete(conn: sqlite3.Connection, outline_id: int) -> bool:
    cur = conn.execute("DELETE FROM outline WHERE id = ?", (outline_id,))
    return cur.rowcount > 0


def next_seq(conn: sqlite3.Connection, level: str, parent_id: int | None) -> int:
    if parent_id is None:
        row = fetch_one(
            conn,
            "SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM outline WHERE level = ? AND parent_id IS NULL",
            (level,),
        )
    else:
        row = fetch_one(
            conn,
            "SELECT COALESCE(MAX(seq), 0) + 1 AS n FROM outline WHERE level = ? AND parent_id = ?",
            (level, parent_id),
        )
    return int(row["n"]) if row else 1
