"""设定库检索（R19 在 M1 的范围：character / world_entry）。

FTS5 可用时走 setting_fts；不可用时降级为子串匹配（不阻断）。
"""

from __future__ import annotations

import sqlite3

from app.db.connection import Capabilities


def _like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def search_setting(
    conn: sqlite3.Connection, caps: Capabilities, q: str, limit: int
) -> list[dict]:
    query = (q or "").strip()
    if not query:
        return []
    if caps.fts5_available:
        phrase = '"' + query.replace('"', '""') + '"'
        try:
            rows = conn.execute(
                """
                SELECT source_type, source_id, name,
                       snippet(setting_fts, 3, '', '', '…', 12) AS snippet
                  FROM setting_fts WHERE setting_fts MATCH ? LIMIT ?
                """,
                (phrase, limit),
            ).fetchall()
            if rows:
                return [_hit(r, None) for r in rows]
        except sqlite3.Error:
            pass  # 降级到子串匹配
    return _substring_search(conn, query, limit)


def _substring_search(conn: sqlite3.Connection, query: str, limit: int) -> list[dict]:
    like = _like_pattern(query)
    rows = conn.execute(
        """
        SELECT 'character' AS source_type, id AS source_id, name,
               COALESCE(surface_identity, '') AS snippet
          FROM character
         WHERE name LIKE ? ESCAPE '\\' OR COALESCE(surface_identity, '') LIKE ? ESCAPE '\\'
         LIMIT ?
        """,
        (like, like, limit),
    ).fetchall()
    hits = [_hit(r, None) for r in rows]
    remaining = max(limit - len(hits), 0)
    if remaining:
        rows = conn.execute(
            """
            SELECT 'world_entry' AS source_type, id AS source_id, name,
                   COALESCE(content, '') AS snippet
              FROM world_entry
             WHERE name LIKE ? ESCAPE '\\' OR COALESCE(content, '') LIKE ? ESCAPE '\\'
             LIMIT ?
            """,
            (like, like, remaining),
        ).fetchall()
        hits.extend(_hit(r, None) for r in rows)
    return hits


def _hit(row: sqlite3.Row, chapter_seq: int | None) -> dict:
    data = dict(row)
    data["chapter_seq"] = chapter_seq
    data["title"] = data.get("name")
    data.setdefault("snippet", "")
    return data
