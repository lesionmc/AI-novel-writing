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


def detach_chapter(conn: sqlite3.Connection, chapter_id: int) -> int:
    """把挂在该章上的大纲节点解绑：`chapter_id` 置 NULL，**保留行本身**。

    为什么必须显式做：`outline.chapter_id` 在 schema 里**没有**外键约束
    （见 `db/schema.sql` 的 outline 建表），删章不会自动 SET NULL，
    节点会永久悬空指向一个已不存在的章节。

    为什么是解绑而不是连行删掉：大纲节点自身是用户写的内容（章节卡），
    章可以不在了，卡还有价值 —— 只是不再属于某一章。返回改动行数便于日志。
    """
    cur = conn.execute(
        "UPDATE outline SET chapter_id = NULL WHERE chapter_id = ?", (chapter_id,)
    )
    return cur.rowcount


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
