"""foreshadow 表数据访问（R1）。"""

from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.base import fetch_one, insert

_COLUMNS = (
    "title", "planted_chapter_seq", "planned_payoff_seq", "actual_payoff_seq",
    "status", "importance", "note",
)


def create(conn: sqlite3.Connection, data: dict[str, Any], now: str) -> int:
    return insert(
        conn,
        """
        INSERT INTO foreshadow
            (title, planted_chapter_seq, planned_payoff_seq, actual_payoff_seq,
             status, importance, note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data["title"],
            data.get("planted_chapter_seq"),
            data.get("planned_payoff_seq"),
            data.get("actual_payoff_seq"),
            data.get("status", "open"),
            data.get("importance", "medium"),
            data.get("note"),
            now,
            now,
        ),
    )


def get(conn: sqlite3.Connection, fs_id: int) -> dict | None:
    return fetch_one(conn, "SELECT * FROM foreshadow WHERE id = ?", (fs_id,))


def list_all(conn: sqlite3.Connection, status: str | None = "open") -> list[dict]:
    sql = "SELECT * FROM foreshadow"
    params: list[Any] = []
    if status:
        sql += " WHERE status = ?"
        params.append(status)
    # 重要度降序（high->low）、埋设章升序（TC-30）
    sql += (
        " ORDER BY CASE importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,"
        " COALESCE(planted_chapter_seq, 0) ASC, id ASC"
    )
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def update(conn: sqlite3.Connection, fs_id: int, fields: dict[str, Any], now: str) -> None:
    clean = {k: v for k, v in fields.items() if k in _COLUMNS}
    if not clean:
        return
    clean["updated_at"] = now
    assignments = ", ".join(f"{col} = ?" for col in clean)
    conn.execute(
        f"UPDATE foreshadow SET {assignments} WHERE id = ?",  # noqa: S608
        [*clean.values(), fs_id],
    )


def open_foreshadows(conn: sqlite3.Connection) -> list[dict]:
    return list_all(conn, status="open")


def count(conn: sqlite3.Connection, status: str | None = None) -> int:
    if status:
        row = fetch_one(conn, "SELECT COUNT(*) AS c FROM foreshadow WHERE status = ?", (status,))
    else:
        row = fetch_one(conn, "SELECT COUNT(*) AS c FROM foreshadow")
    return int(row["c"]) if row else 0
