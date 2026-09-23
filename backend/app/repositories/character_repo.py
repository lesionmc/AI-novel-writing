"""character 表数据访问（R1）。"""

from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.base import fetch_all, fetch_one, insert
from app.utils.convert import tags_from_db, tags_to_db

_COLUMNS = (
    "name", "alias", "role", "surface_identity", "secret_desire",
    "fatal_weakness", "contradiction", "appearance", "background",
    "first_chapter_seq", "status", "tags",
)


def _row_to_dict(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    data = dict(row)
    data["tags"] = tags_from_db(data.get("tags"))
    return data


def create(conn: sqlite3.Connection, data: dict[str, Any], now: str) -> int:
    payload = {
        "name": data["name"],
        "alias": data.get("alias"),
        "role": data.get("role", "supporting"),
        "surface_identity": data.get("surface_identity"),
        "secret_desire": data.get("secret_desire"),
        "fatal_weakness": data.get("fatal_weakness"),
        "contradiction": data.get("contradiction"),
        "appearance": data.get("appearance"),
        "background": data.get("background"),
        "first_chapter_seq": data.get("first_chapter_seq"),
        "status": data.get("status", "alive"),
        "tags": tags_to_db(data.get("tags")),
    }
    return insert(
        conn,
        """
        INSERT INTO character
            (name, alias, role, surface_identity, secret_desire, fatal_weakness,
             contradiction, appearance, background, first_chapter_seq, status, tags,
             created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (*payload.values(), now, now),
    )


def get(conn: sqlite3.Connection, char_id: int) -> dict | None:
    return _row_to_dict(fetch_one(conn, "SELECT * FROM character WHERE id = ?", (char_id,)))


def get_by_name(conn: sqlite3.Connection, name: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM character WHERE name = ? OR alias = ? ORDER BY id ASC LIMIT 1",
        (name, name),
    ).fetchone()
    return _row_to_dict(row)


def list_all(
    conn: sqlite3.Connection,
    role: str | None = None,
    status: str | None = None,
) -> list[dict]:
    sql = "SELECT * FROM character"
    clauses: list[str] = []
    params: list[Any] = []
    if role:
        clauses.append("role = ?")
        params.append(role)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY CASE role WHEN 'protagonist' THEN 0 WHEN 'supporting' THEN 1"
    sql += " WHEN 'antagonist' THEN 2 ELSE 3 END, id ASC"
    rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(r) for r in rows]  # type: ignore[misc]


def update(conn: sqlite3.Connection, char_id: int, fields: dict[str, Any], now: str) -> None:
    clean = {k: v for k, v in fields.items() if k in _COLUMNS}
    if "tags" in clean:
        clean["tags"] = tags_to_db(clean["tags"])
    if not clean:
        return
    clean["updated_at"] = now
    assignments = ", ".join(f"{col} = ?" for col in clean)
    conn.execute(
        f"UPDATE character SET {assignments} WHERE id = ?",  # noqa: S608
        [*clean.values(), char_id],
    )


def delete(conn: sqlite3.Connection, char_id: int) -> bool:
    cur = conn.execute("DELETE FROM character WHERE id = ?", (char_id,))
    return cur.rowcount > 0


def affected_chapters(conn: sqlite3.Connection, name: str) -> list[dict]:
    """设定变更追踪：该名字在哪些章节正文/摘要中出现（约束 3，TC-10）。"""
    rows = conn.execute(
        """
        SELECT seq AS chapter_seq, title AS chapter_title, 'content' AS matched_in
          FROM chapter WHERE instr(COALESCE(content, ''), ?) > 0
        UNION
        SELECT seq AS chapter_seq, title AS chapter_title, 'chapter_summary' AS matched_in
          FROM chapter WHERE instr(COALESCE(chapter_summary, ''), ?) > 0
        ORDER BY chapter_seq ASC
        """,
        (name, name),
    ).fetchall()
    return [dict(r) for r in rows]


def count(conn: sqlite3.Connection) -> int:
    row = fetch_one(conn, "SELECT COUNT(*) AS c FROM character")
    return int(row["c"]) if row else 0


def all_rows(conn: sqlite3.Connection) -> list[dict]:
    return fetch_all(conn, "SELECT * FROM character ORDER BY id ASC")


# ------------------------------------------------------------- 人物关系（图谱）
def list_relations(conn) -> list[dict]:
    return [
        dict(r)
        for r in conn.execute(
            "SELECT cr.id, cr.from_char_id, f.name AS from_name, cr.to_char_id, t.name AS to_name,"
            " cr.relation_type, cr.note"
            " FROM character_relation cr"
            " JOIN character f ON f.id = cr.from_char_id"
            " JOIN character t ON t.id = cr.to_char_id"
            " ORDER BY cr.id"
        ).fetchall()
    ]


def create_relation(conn, from_id: int, to_id: int, relation_type: str, note: str | None, now: str) -> int:
    cur = conn.execute(
        "INSERT INTO character_relation (from_char_id, to_char_id, relation_type, note, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (from_id, to_id, relation_type, note, now),
    )
    return int(cur.lastrowid or 0)


def delete_relation(conn, relation_id: int) -> bool:
    return conn.execute("DELETE FROM character_relation WHERE id = ?", (relation_id,)).rowcount > 0
