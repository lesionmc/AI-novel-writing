"""FTS5 全文检索同步（R19）。FTS5 不可用时全部为 no-op（降级，不阻断）。"""

from __future__ import annotations

import sqlite3

from app.db.connection import Capabilities


def _has_fts(caps: Capabilities) -> bool:
    return caps.fts5_available


def chapter_upsert(
    conn: sqlite3.Connection,
    caps: Capabilities,
    *,
    chapter_id: int,
    title: str | None,
    content: str,
) -> None:
    if not _has_fts(caps):
        return
    conn.execute("DELETE FROM chapter_fts WHERE chapter_id = ?", (chapter_id,))
    conn.execute(
        "INSERT INTO chapter_fts (chapter_id, title, content) VALUES (?, ?, ?)",
        (chapter_id, title or "", content or ""),
    )


def chapter_delete(conn: sqlite3.Connection, caps: Capabilities, chapter_id: int) -> None:
    if not _has_fts(caps):
        return
    conn.execute("DELETE FROM chapter_fts WHERE chapter_id = ?", (chapter_id,))


def setting_upsert(
    conn: sqlite3.Connection,
    caps: Capabilities,
    *,
    source_type: str,
    source_id: int,
    name: str,
    body: str,
) -> None:
    if not _has_fts(caps):
        return
    conn.execute(
        "DELETE FROM setting_fts WHERE source_type = ? AND source_id = ?",
        (source_type, source_id),
    )
    conn.execute(
        "INSERT INTO setting_fts (source_type, source_id, name, body) VALUES (?, ?, ?, ?)",
        (source_type, source_id, name, body or ""),
    )


def setting_delete(
    conn: sqlite3.Connection,
    caps: Capabilities,
    *,
    source_type: str,
    source_id: int,
) -> None:
    if not _has_fts(caps):
        return
    conn.execute(
        "DELETE FROM setting_fts WHERE source_type = ? AND source_id = ?",
        (source_type, source_id),
    )
