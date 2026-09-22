"""chunk_meta / vec_chunk 数据访问。

vec_chunk 为 sqlite-vec 虚拟表：扩展不可用时**跳过**，其余流程照常（坑 6 / D-17）。
chunk_meta.embedding 存向量本体副本，作为扩展不可用时的重建源（D-18）。
"""

from __future__ import annotations

import sqlite3

from app.db.connection import Capabilities
from app.repositories.base import fetch_all, fetch_one, insert
from app.utils.vector import to_blob


def upsert_chunk(
    conn: sqlite3.Connection,
    *,
    source_type: str,
    source_id: int,
    chapter_seq: int | None,
    text: str,
    char_count: int,
    embedding_model: str | None,
    embedding: list[float] | None,
    now: str,
    dim: int = 1024,
) -> int:
    """写入一块文本；chapter_seq 为 NULL 时应用层先删后插保证唯一（D-15）。"""
    blob = to_blob(embedding) if embedding else None
    if chapter_seq is None:
        conn.execute(
            "DELETE FROM chunk_meta WHERE source_type = ? AND source_id = ? AND chapter_seq IS NULL",
            (source_type, source_id),
        )
        return insert(
            conn,
            """
            INSERT INTO chunk_meta
                (source_type, source_id, chapter_seq, text, char_count,
                 embedding_model, embedding, embedding_dim, created_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)
            """,
            (source_type, source_id, text, char_count, embedding_model, blob, dim, now),
        )
    conn.execute(
        """
        INSERT INTO chunk_meta
            (source_type, source_id, chapter_seq, text, char_count,
             embedding_model, embedding, embedding_dim, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_type, source_id, chapter_seq) DO UPDATE SET
            text = excluded.text,
            char_count = excluded.char_count,
            embedding_model = excluded.embedding_model,
            embedding = excluded.embedding,
            embedding_dim = excluded.embedding_dim
        """,
        (source_type, source_id, chapter_seq, text, char_count,
         embedding_model, blob, dim, now),
    )
    row = fetch_one(
        conn,
        "SELECT id FROM chunk_meta WHERE source_type = ? AND source_id = ? AND chapter_seq = ?",
        (source_type, source_id, chapter_seq),
    )
    return int(row["id"]) if row else 0


def insert_vec(
    conn: sqlite3.Connection,
    caps: Capabilities,
    *,
    chunk_id: int,
    embedding: list[float] | None,
) -> bool:
    """写 vec_chunk：扩展不可用或无向量时返回 False（条件化，不抛错）。"""
    if not caps.vec_available or embedding is None or chunk_id <= 0:
        return False
    try:
        conn.execute("DELETE FROM vec_chunk WHERE chunk_id = ?", (chunk_id,))
        conn.execute(
            "INSERT INTO vec_chunk (chunk_id, embedding) VALUES (?, ?)",
            (chunk_id, to_blob(embedding)),
        )
        return True
    except sqlite3.Error:
        return False


def ids_for_source(
    conn: sqlite3.Connection, source_type: str, source_id: int
) -> list[int]:
    rows = fetch_all(
        conn,
        "SELECT id FROM chunk_meta WHERE source_type = ? AND source_id = ?",
        (source_type, source_id),
    )
    return [int(r["id"]) for r in rows]


def delete_for_source(
    conn: sqlite3.Connection,
    caps: Capabilities,
    *,
    source_type: str,
    source_id: int,
) -> int:
    """删除某来源的全部分块，并同步清理 vec_chunk（坑 13）。"""
    chunk_ids = ids_for_source(conn, source_type, source_id)
    if chunk_ids and caps.vec_available:
        try:
            placeholders = ",".join("?" for _ in chunk_ids)
            conn.execute(
                f"DELETE FROM vec_chunk WHERE chunk_id IN ({placeholders})",  # noqa: S608
                chunk_ids,
            )
        except sqlite3.Error:
            pass
    cur = conn.execute(
        "DELETE FROM chunk_meta WHERE source_type = ? AND source_id = ?",
        (source_type, source_id),
    )
    return cur.rowcount


def count(conn: sqlite3.Connection, source_type: str | None = None) -> int:
    if source_type:
        row = fetch_one(
            conn, "SELECT COUNT(*) AS c FROM chunk_meta WHERE source_type = ?", (source_type,)
        )
    else:
        row = fetch_one(conn, "SELECT COUNT(*) AS c FROM chunk_meta")
    return int(row["c"]) if row else 0


def search_candidates(
    conn: sqlite3.Connection,
    caps: Capabilities,
    *,
    query_embedding: list[float],
    limit: int,
) -> list[dict]:
    """经 vec_chunk 取候选 chunk_id（向量唯一检索入口）。不可用则返回空。"""
    if not caps.vec_available or not query_embedding:
        return []
    try:
        rows = conn.execute(
            """
            SELECT chunk_id, distance FROM vec_chunk
             WHERE embedding MATCH ? ORDER BY distance LIMIT ?
            """,
            (to_blob(query_embedding), limit),
        ).fetchall()
    except sqlite3.Error:
        return []
    return [{"chunk_id": int(r["chunk_id"]), "distance": float(r["distance"])} for r in rows]


def get_chunks_with_embedding(
    conn: sqlite3.Connection, chunk_ids: list[int]
) -> list[dict]:
    if not chunk_ids:
        return []
    placeholders = ",".join("?" for _ in chunk_ids)
    rows = conn.execute(
        f"""
        SELECT id, source_type, source_id, chapter_seq, text, embedding
          FROM chunk_meta WHERE id IN ({placeholders})
        """,  # noqa: S608
        chunk_ids,
    ).fetchall()
    return [dict(r) for r in rows]
