"""writing_log 表数据访问（R17 日更记录）。"""

from __future__ import annotations

import sqlite3


def list_all(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        "SELECT date, words_added, chapters_finalized FROM writing_log ORDER BY date ASC"
    ).fetchall()
    return [dict(r) for r in rows]


def add_words(conn: sqlite3.Connection, date: str, delta: int) -> None:
    conn.execute(
        """
        INSERT INTO writing_log (date, words_added, chapters_finalized)
        VALUES (?, ?, 0)
        ON CONFLICT(date) DO UPDATE SET words_added = words_added + excluded.words_added
        """,
        (date, int(delta)),
    )


def increment_finalized(conn: sqlite3.Connection, date: str, delta: int = 1) -> None:
    conn.execute(
        """
        INSERT INTO writing_log (date, words_added, chapters_finalized)
        VALUES (?, 0, ?)
        ON CONFLICT(date) DO UPDATE SET
            chapters_finalized = chapters_finalized + excluded.chapters_finalized
        """,
        (date, int(delta)),
    )
