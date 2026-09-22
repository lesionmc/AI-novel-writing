"""book 表数据访问（R15）。一书一库，库内仅一行 book 记录。"""

from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.base import fetch_one, fetch_scalar, insert


def create_row(
    conn: sqlite3.Connection,
    *,
    title: str,
    genre: str | None,
    target_words: int,
    premise: str | None,
    writing_mode: str,
    now: str,
) -> int:
    return insert(
        conn,
        """
        INSERT INTO book (title, genre, target_words, premise, summary, writing_mode,
                          created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
        """,
        (title, genre, target_words, premise, writing_mode, now, now),
    )


def get_row(conn: sqlite3.Connection) -> dict | None:
    return fetch_one(conn, "SELECT * FROM book ORDER BY id ASC LIMIT 1")


def get_row_by_id(conn: sqlite3.Connection, book_id: int) -> dict | None:
    return fetch_one(conn, "SELECT * FROM book WHERE id = ?", (book_id,))


def update_row(conn: sqlite3.Connection, book_id: int, fields: dict[str, Any]) -> None:
    if not fields:
        return
    allowed = {
        "title", "genre", "target_words", "premise", "summary", "writing_mode",
    }
    clean = {k: v for k, v in fields.items() if k in allowed}
    if not clean:
        return
    assignments = ", ".join(f"{col} = ?" for col in clean)
    conn.execute(
        f"UPDATE book SET {assignments} WHERE id = ?",  # noqa: S608 - 列名来自白名单
        [*clean.values(), book_id],
    )


def get_summary(conn: sqlite3.Connection) -> dict | None:
    return fetch_one(conn, "SELECT summary, updated_at FROM book ORDER BY id ASC LIMIT 1")


def count_chapters(conn: sqlite3.Connection) -> int:
    return int(fetch_scalar(conn, "SELECT COUNT(*) FROM chapter") or 0)


def count_done_chapters(conn: sqlite3.Connection) -> int:
    return int(fetch_scalar(conn, "SELECT COUNT(*) FROM chapter WHERE status = 'done'") or 0)


def total_words(conn: sqlite3.Connection) -> int:
    return int(fetch_scalar(conn, "SELECT COALESCE(SUM(word_count), 0) FROM chapter") or 0)
