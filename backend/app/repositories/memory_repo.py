"""记忆域数据访问：character_state / plot_arc / recall_log（R3 / R4）。"""

from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.base import fetch_one, insert


# --------------------------------------------------------------- character_state
def latest_state(
    conn: sqlite3.Connection, character_id: int, upto_seq: int
) -> dict | None:
    """核心读取规则：chapter_seq <= N 的最后一条（增量式）。"""
    return fetch_one(
        conn,
        """
        SELECT state, chapter_seq, source FROM character_state
         WHERE character_id = ? AND chapter_seq <= ?
         ORDER BY chapter_seq DESC, id DESC LIMIT 1
        """,
        (character_id, upto_seq),
    )


def insert_state(
    conn: sqlite3.Connection,
    *,
    character_id: int,
    chapter_seq: int,
    state: str,
    source: str,
    now: str,
) -> int:
    return insert(
        conn,
        """
        INSERT INTO character_state (character_id, chapter_seq, state, source, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (character_id, chapter_seq, state, source, now),
    )


def latest_states(conn: sqlite3.Connection, upto_seq: int | None = None) -> list[dict]:
    """每个角色在 upto_seq（含）之前的最新一条状态。"""
    inner = (
        "SELECT id, ROW_NUMBER() OVER (PARTITION BY character_id"
        " ORDER BY chapter_seq DESC, id DESC) AS rn FROM character_state"
    )
    params: list[Any] = []
    if upto_seq is not None:
        inner += " WHERE chapter_seq <= ?"
        params.append(upto_seq)
    sql = f"""
        SELECT cs.character_id, c.name, c.role, cs.chapter_seq, cs.state, cs.source
          FROM character_state cs
          JOIN character c ON c.id = cs.character_id
         WHERE cs.id IN (SELECT id FROM ({inner}) WHERE rn = 1)
         ORDER BY c.id ASC
    """  # noqa: S608 - 内层为常量 SQL 片段
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def count(conn: sqlite3.Connection) -> int:
    row = fetch_one(conn, "SELECT COUNT(*) AS c FROM character_state")
    return int(row["c"]) if row else 0


# --------------------------------------------------------------------- plot_arc
def list_plot_arcs(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("SELECT * FROM plot_arc ORDER BY id ASC").fetchall()
    return [dict(r) for r in rows]


def upsert_plot_arc(
    conn: sqlite3.Connection,
    *,
    name: str,
    arc_type: str,
    content: str,
    last_seq: int,
    now: str,
) -> int:
    row = fetch_one(conn, "SELECT id FROM plot_arc WHERE name = ?", (name,))
    if row:
        conn.execute(
            "UPDATE plot_arc SET content = ?, last_chapter_seq = ?, updated_at = ? WHERE id = ?",
            (content, last_seq, now, row["id"]),
        )
        return int(row["id"])
    return insert(
        conn,
        """
        INSERT INTO plot_arc (name, type, content, last_chapter_seq, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (name, arc_type, content, last_seq, now, now),
    )


# ------------------------------------------------------------------ recall_log
def insert_recall_log(
    conn: sqlite3.Connection,
    *,
    chapter_seq: int,
    query_text: str | None,
    hit_chunk_ids: str | None,
    hit_scores: str | None,
    structured_hits: int,
    semantic_hits: int,
    injected_chars: int,
    injected_tokens_est: int,
    now: str,
) -> int:
    return insert(
        conn,
        """
        INSERT INTO recall_log
            (chapter_seq, query_text, hit_chunk_ids, hit_scores, structured_hits,
             semantic_hits, injected_chars, injected_tokens_est, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (chapter_seq, query_text, hit_chunk_ids, hit_scores, structured_hits,
         semantic_hits, injected_chars, injected_tokens_est, now),
    )


def list_recall_logs(conn: sqlite3.Connection, limit: int = 50) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM recall_log ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]


def recall_stats(
    conn: sqlite3.Connection, from_date: str | None, to_date: str | None
) -> dict:
    sql = "SELECT COUNT(*) AS calls, COALESCE(SUM(injected_tokens_est), 0) AS tokens FROM recall_log"
    clauses: list[str] = []
    params: list[Any] = []
    if from_date:
        clauses.append("substr(created_at, 1, 10) >= ?")
        params.append(from_date)
    if to_date:
        clauses.append("substr(created_at, 1, 10) <= ?")
        params.append(to_date)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    row = fetch_one(conn, sql, params)
    return {"calls": int(row["calls"]) if row else 0, "tokens": int(row["tokens"]) if row else 0}
