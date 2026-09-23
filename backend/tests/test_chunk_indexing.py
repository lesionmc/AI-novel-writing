"""chunk_meta 分块落库回归（P0）：一章 N 块必须落 N 行，且接口回报与库里一致。

背景（审计 A-01，2026-09-22 修）：
  · 旧表级唯一键 `UNIQUE(source_type, source_id, chapter_seq)` 不含块序号 ——
    同章逐块 upsert 时块块互相覆盖，整章只剩最后一块（实测某作品应 89 块、库里仅 20 行）。
  · `writeback` 又把**循环次数**当 `chunks_indexed` 上报（89），指标本身在骗人，
    缺陷因此完全静默。

本文件把这两件事都钉死：落库行数、接口数字、重复确认幂等、存量库迁移、NULL 分支不回归。
"""

from __future__ import annotations

from app.db.registry import get_registry
from app.repositories import chunk_repo
from app.utils.chunk import split_text

#: 足够长到必然分出多块（chunk_size=800 / overlap=100 → step 700，3500 字约 5 块）
_LONG = "测试正文内容。" * 500

_LEGACY_DDL = """
CREATE TABLE chunk_meta (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    source_type     TEXT    NOT NULL,
    source_id       INTEGER NOT NULL,
    chapter_seq     INTEGER,
    text            TEXT    NOT NULL,
    char_count      INTEGER NOT NULL,
    embedding_model TEXT,
    embedding       BLOB,
    embedding_dim   INTEGER NOT NULL DEFAULT 1024,
    created_at      TEXT    NOT NULL,
    UNIQUE(source_type, source_id, chapter_seq)
)
"""


def _registry():
    return get_registry()


def _scalar(book: str, sql: str, params: tuple = ()):
    with _registry().database(book).connection() as conn:
        return conn.execute(sql, params).fetchone()[0]


def _rows_for_chapter(book: str, chapter_id: int) -> int:
    return int(
        _scalar(
            book,
            "SELECT COUNT(*) FROM chunk_meta WHERE source_type='chapter' AND source_id=?",
            (chapter_id,),
        )
    )


def _make_chapter(client, book: str, content: str) -> dict:
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "长章"}).json()
    resp = client.patch(f"/api/chapters/{ch['id']}", json={"content": content})
    assert resp.status_code == 200, resp.text
    return ch


def _confirm(client, chapter_id: int) -> dict:
    resp = client.post(f"/api/chapters/{chapter_id}/finalize/confirm", json={})
    assert resp.status_code == 200, resp.text
    return resp.json()


# ------------------------------------------------- 核心：一章 N 块 -> N 行
def test_long_chapter_keeps_every_chunk(client, book):
    expected = split_text(_LONG)
    assert len(expected) > 1, "用例前提：正文必须能切出多块"

    ch = _make_chapter(client, book, _LONG)
    _confirm(client, ch["id"])

    assert _rows_for_chapter(book, ch["id"]) == len(expected), (
        "一章的每个分块都必须落库（旧缺陷：后一块覆盖前一块，只剩最后一块）"
    )


def test_chunks_indexed_matches_actual_rows(client, book):
    ch = _make_chapter(client, book, _LONG)
    body = _confirm(client, ch["id"])
    rows = _rows_for_chapter(book, ch["id"])

    assert rows > 1
    assert body["chunks_indexed"] == rows, (
        "接口回报必须等于实际落库行数（旧缺陷：回报循环次数 89、库里 20 行）"
    )


def test_reconfirm_is_idempotent_and_trims_stale_tail(client, book):
    ch = _make_chapter(client, book, _LONG)
    _confirm(client, ch["id"])
    first = _rows_for_chapter(book, ch["id"])

    # 同内容重复确认：行数不翻倍
    _confirm(client, ch["id"])
    assert _rows_for_chapter(book, ch["id"]) == first

    # 正文删短后重新确认：旧的尾部块必须被清掉，行数 == 新分块数
    shortened = _LONG[:1000]
    client.patch(f"/api/chapters/{ch['id']}", json={"content": shortened})
    body = _confirm(client, ch["id"])
    expected = split_text(shortened)
    assert len(expected) < first
    assert _rows_for_chapter(book, ch["id"]) == len(expected)
    assert body["chunks_indexed"] == len(expected)


# ------------------------------------------------- 存量库迁移
def test_migration_upgrades_legacy_chunk_meta(client, book):
    """旧结构（无 chunk_index）→ 迁移后：结构升级、行数与 id 不变、再跑幂等。"""
    from app.services import chunk_migration

    with _registry().database(book).connection() as conn:
        conn.execute("DROP TABLE chunk_meta")
        conn.execute(_LEGACY_DDL)
        conn.execute(
            "CREATE INDEX idx_chunk_source ON chunk_meta(source_type, source_id)"
        )
        conn.executemany(
            "INSERT INTO chunk_meta"
            " (id, source_type, source_id, chapter_seq, text, char_count, created_at)"
            " VALUES (?, 'chapter', 7, ?, ?, 1, '2026-01-01T00:00:00')",
            [(1, 1, "旧块一"), (2, 2, "旧块二")],
        )
        conn.commit()
        assert "chunk_index" not in conn.execute(
            "SELECT sql FROM sqlite_master WHERE name='chunk_meta'"
        ).fetchone()[0]

    assert chunk_migration.migrate_all_book_chunks() == 1

    with _registry().database(book).connection() as conn:
        ddl = conn.execute(
            "SELECT sql FROM sqlite_master WHERE name='chunk_meta'"
        ).fetchone()[0]
        assert "chunk_index" in ddl
        rows = conn.execute(
            "SELECT id, chapter_seq, text, chunk_index FROM chunk_meta ORDER BY id"
        ).fetchall()
        assert [r["id"] for r in rows] == [1, 2], "id 必须原样保留（vec_chunk.chunk_id 引用它）"
        assert [r["text"] for r in rows] == ["旧块一", "旧块二"]
        assert [r["chunk_index"] for r in rows] == [0, 0]
        # 迁移后同章第二块能共存 —— 这正是本次修复的目的
        chunk_repo.upsert_chunk(
            conn, source_type="chapter", source_id=7, chapter_seq=1, chunk_index=1,
            text="新块", char_count=2, embedding_model=None, embedding=None, now="t",
        )
        conn.commit()
        assert conn.execute("SELECT COUNT(*) FROM chunk_meta").fetchone()[0] == 3

    # 幂等：再跑一次不重复迁移，数据不变
    assert chunk_migration.migrate_all_book_chunks() == 0
    assert _rows_for_chapter(book, 7) == 3


def test_migration_backfills_missing_chunks(client, book):
    """旧缺陷留给老库的状态是「每章只剩最后一块」—— 只改结构救不回来，必须回填。"""
    from app.services import chunk_migration

    ch = _make_chapter(client, book, _LONG)
    expected = split_text(_LONG)
    with _registry().database(book).connection() as conn:
        conn.execute(
            "DELETE FROM chunk_meta WHERE source_type='chapter' AND source_id=?", (ch["id"],)
        )
        conn.execute(
            "INSERT INTO chunk_meta"
            " (source_type, source_id, chapter_seq, chunk_index, text, char_count, created_at)"
            " VALUES ('chapter', ?, ?, 0, '只剩最后一块', 6, '2026-01-01T00:00:00')",
            (ch["id"], ch["seq"]),
        )
        conn.commit()
        assert conn.execute(
            "SELECT COUNT(*) FROM chunk_meta WHERE source_type='chapter'"
        ).fetchone()[0] == 1

    assert chunk_migration.migrate_all_book_chunks() == 1
    assert _rows_for_chapter(book, ch["id"]) == len(expected) > 1

    # 幂等：行数已与正文相符 → 再跑不动作
    assert chunk_migration.migrate_all_book_chunks() == 0
    assert _rows_for_chapter(book, ch["id"]) == len(expected)


# ------------------------------------------------- 不回归：NULL 分支
def test_null_chapter_seq_branch_unchanged(client, book):
    """setting / summary 类（chapter_seq IS NULL）仍走「先删后插」，唯一性由应用层保证。"""
    with _registry().database(book).connection() as conn:
        for text in ("设定一", "设定二"):
            chunk_repo.upsert_chunk(
                conn, source_type="setting", source_id=1, chapter_seq=None,
                text=text, char_count=3, embedding_model=None, embedding=None, now="t",
            )
        conn.commit()
        rows = conn.execute(
            "SELECT text, chunk_index FROM chunk_meta WHERE source_type='setting'"
        ).fetchall()
        assert len(rows) == 1, "先删后插 → 同一来源只留最后一次写入，行为与修正前一致"
        assert rows[0]["text"] == "设定二"
        assert rows[0]["chunk_index"] == 0
