"""步骤 4-5：章节自动保存、字数重算、列表无正文、版本快照与回滚、删除清理。"""

from __future__ import annotations

from app.db.registry import get_registry
from app.utils.text import count_words


def test_save_recomputes_word_count(client, book):
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "第一章"}).json()
    content = "张三握紧剑柄，指节的伤口又裂开了。"
    resp = client.patch(f"/api/chapters/{ch['id']}", json={"content": content})
    assert resp.status_code == 200
    # 17 个字符里有 2 个标点：与前端同口径，标点不计字（见 utils/text 注释）
    assert resp.json()["word_count"] == count_words(content) == 15


def test_chinese_word_count_rules():
    assert count_words("你好，世界。") == 4  # 标点不计
    assert count_words("hello world") == 2
    assert count_words("<p>你好</p><p>世界</p>") == 4
    assert count_words("，。！？、；：") == 0
    assert count_words("") == 0
    assert count_words("   \n  ") == 0


def test_chapter_list_excludes_content(client, book):
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "瘦身"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "一些很长的正文内容"})
    rows = client.get(f"/api/books/{book}/chapters").json()
    assert rows and "content" not in rows[0]
    # 详情接口才含正文
    assert client.get(f"/api/chapters/{ch['id']}").json()["content"] == "一些很长的正文内容"


def test_auto_save_is_throttled_update_not_snapshot(client, book):
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "节流"}).json()
    for i in range(3):
        client.patch(f"/api/chapters/{ch['id']}", json={"content": f"第{i}版内容"})
    versions = client.get(f"/api/chapters/{ch['id']}/versions").json()
    assert versions == [], "自动保存不应产生版本快照"


def test_version_snapshot_and_restore(client, book):
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "回滚"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "原始的一千字内容"})
    snap = client.post(f"/api/chapters/{ch['id']}/versions", json={"note": "初稿"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "被删改后的内容"})

    restored = client.post(
        f"/api/chapters/{ch['id']}/versions/{snap['id']}/restore"
    ).json()
    assert restored["content"] == "原始的一千字内容"
    # 回滚前自动快照：版本数应 >= 2，旧内容可再找回
    versions = client.get(f"/api/chapters/{ch['id']}/versions").json()
    assert len(versions) >= 2


def test_delete_chapter_cleans_fts_and_chunks(client, book):
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "待删"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "临时内容"})
    registry = get_registry()
    with registry.database(book).connection() as conn:
        conn.execute(
            "INSERT INTO chunk_meta (source_type, source_id, chapter_seq, text, char_count, created_at)"
            " VALUES ('chapter', ?, ?, 'x', 1, 'now')",
            (ch["id"], ch["seq"]),
        )
        conn.commit()
        assert conn.execute("SELECT count(*) FROM chapter_fts").fetchone()[0] == 1
    assert client.delete(f"/api/chapters/{ch['id']}").status_code == 204
    with registry.database(book).connection() as conn:
        assert conn.execute("SELECT count(*) FROM chapter_fts").fetchone()[0] == 0
        assert (
            conn.execute(
                "SELECT count(*) FROM chunk_meta WHERE source_type='chapter'"
            ).fetchone()[0]
            == 0
        )


def test_missing_chapter_typed_error(client):
    resp = client.get("/api/chapters/99999")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "CHAPTER_NOT_FOUND"
