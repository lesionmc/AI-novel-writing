"""chapter / chapter_version 表数据访问（R2 / R11）。"""

from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.base import fetch_one, fetch_scalar, insert

_BRIEF_COLS = "id, seq, title, word_count, status, updated_at"


def next_seq(conn: sqlite3.Connection) -> int:
    return int(fetch_scalar(conn, "SELECT COALESCE(MAX(seq), 0) + 1 FROM chapter") or 1)


def create(conn: sqlite3.Connection, *, seq: int, title: str | None, now: str) -> int:
    return insert(
        conn,
        """
        INSERT INTO chapter (seq, title, content, word_count, status, created_at, updated_at)
        VALUES (?, ?, '', 0, 'draft', ?, ?)
        """,
        (seq, title, now, now),
    )


def list_briefs(conn: sqlite3.Connection) -> list[dict]:
    """章节列表：**不含正文**（坑 11 / TC-13）。"""
    rows = conn.execute(
        f"SELECT {_BRIEF_COLS} FROM chapter ORDER BY seq ASC"  # noqa: S608 - 常量列名
    ).fetchall()
    return [dict(r) for r in rows]


def get(conn: sqlite3.Connection, chapter_id: int) -> dict | None:
    return fetch_one(conn, "SELECT * FROM chapter WHERE id = ?", (chapter_id,))


def get_by_seq(conn: sqlite3.Connection, seq: int) -> dict | None:
    return fetch_one(conn, "SELECT * FROM chapter WHERE seq = ?", (seq,))


def exists(conn: sqlite3.Connection, chapter_id: int) -> bool:
    return fetch_scalar(conn, "SELECT 1 FROM chapter WHERE id = ?", (chapter_id,)) is not None


def save(
    conn: sqlite3.Connection,
    chapter_id: int,
    fields: dict[str, Any],
    now: str,
) -> None:
    allowed = {"title", "content", "hook", "word_count"}
    clean = {k: v for k, v in fields.items() if k in allowed}
    if not clean:
        return
    clean["updated_at"] = now
    assignments = ", ".join(f"{col} = ?" for col in clean)
    conn.execute(
        f"UPDATE chapter SET {assignments} WHERE id = ?",  # noqa: S608
        [*clean.values(), chapter_id],
    )


def finalize(
    conn: sqlite3.Connection,
    chapter_id: int,
    *,
    status: str,
    chapter_summary: str | None,
    hook: str | None,
    finalized_at: str,
    now: str,
) -> None:
    """章末回写落库（R3）：写 status / chapter_summary / hook / finalized_at。

    与 `save` 分开：`save` 仅服务正文编辑（allowlist 限制），回写字段不混入其路径。
    """
    conn.execute(
        """
        UPDATE chapter
           SET status = ?, chapter_summary = ?, hook = ?, finalized_at = ?, updated_at = ?
         WHERE id = ?
        """,
        (status, chapter_summary, hook, finalized_at, now, chapter_id),
    )


def delete(conn: sqlite3.Connection, chapter_id: int) -> bool:
    cur = conn.execute("DELETE FROM chapter WHERE id = ?", (chapter_id,))
    return cur.rowcount > 0


# ------------------------------------------------------------------ versions
def create_version(
    conn: sqlite3.Connection,
    *,
    chapter_id: int,
    content: str,
    word_count: int,
    note: str | None,
    now: str,
) -> int:
    return insert(
        conn,
        """
        INSERT INTO chapter_version (chapter_id, content, word_count, note, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (chapter_id, content, word_count, note, now),
    )


def list_versions(conn: sqlite3.Connection, chapter_id: int) -> list[dict]:
    """版本列表：不含正文，正文按需单取。"""
    rows = conn.execute(
        """
        SELECT id, chapter_id, word_count, note, created_at
          FROM chapter_version WHERE chapter_id = ? ORDER BY id DESC
        """,
        (chapter_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def get_version(conn: sqlite3.Connection, version_id: int) -> dict | None:
    return fetch_one(conn, "SELECT * FROM chapter_version WHERE id = ?", (version_id,))


def get_content(conn: sqlite3.Connection, chapter_id: int) -> str:
    row = fetch_one(conn, "SELECT content FROM chapter WHERE id = ?", (chapter_id,))
    return str(row["content"]) if row else ""


def list_full_chapters(
    conn: sqlite3.Connection, start_seq: int | None = None, end_seq: int | None = None
) -> list[dict]:
    """导出用：取章节正文（含标题），可按范围过滤。"""
    sql = "SELECT id, seq, title, content FROM chapter"
    clauses: list[str] = []
    params: list[Any] = []
    if start_seq is not None:
        clauses.append("seq >= ?")
        params.append(start_seq)
    if end_seq is not None:
        clauses.append("seq <= ?")
        params.append(end_seq)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY seq ASC"
    return [dict(r) for r in conn.execute(sql, params).fetchall()]
