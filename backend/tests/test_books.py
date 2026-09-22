"""步骤 1-2：连接层自检、建库、作品 CRUD 与目录扫描。"""

from __future__ import annotations

import json

from app.config import settings
from app.db.connection import Capabilities, connect, probe_capabilities
from app.db.schema_loader import apply_schema, expected_objects, missing_objects
from app.services import workspace


def test_capabilities_probe_reports_vec_and_fts():
    caps = probe_capabilities(force=True)
    assert caps.loadable_extension is True
    assert caps.vec_available is True
    assert caps.vec_version is not None
    assert caps.fts5_available is True
    assert caps.degrade_reasons == ()


def test_degraded_capabilities_schema_only_base(tmp_path):
    """模拟扩展与 FTS 均不可用：仍能建出可用的库（红线 3 第一步）。"""
    caps = Capabilities(
        loadable_extension=False,
        vec_available=False,
        vec_version=None,
        fts5_available=False,
        degrade_reasons=("simulated",),
    )
    conn = connect(tmp_path / "degraded.db", caps=caps)
    try:
        apply_schema(conn, caps)
        assert missing_objects(conn, caps) == []
        names = {
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert "chapter" in names and "character" in names
        assert "vec_chunk" not in names
        assert "chapter_fts" not in names
    finally:
        conn.close()


def test_full_capabilities_schema_all_objects(tmp_path):
    caps = probe_capabilities()
    conn = connect(tmp_path / "full.db", caps=caps)
    try:
        apply_schema(conn, caps)
        assert missing_objects(conn, caps) == []
        assert set(expected_objects(caps)) <= {
            r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        # 向量表可实际写入并检索
        conn.execute(
            "INSERT INTO vec_chunk(chunk_id, embedding) VALUES (1, ?)",
            (b"\x00" * (1024 * 4),),
        )
        assert conn.execute("SELECT count(*) FROM vec_chunk").fetchone()[0] == 1
    finally:
        conn.close()


def test_create_book_creates_db_and_meta(client):
    resp = client.post("/api/books", json={"title": "测试书", "genre": "玄幻"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "测试书"
    book_dir = settings.books_dir / "测试书"
    assert (book_dir / "novel.db").is_file()
    meta = json.loads((book_dir / "meta.json").read_text(encoding="utf-8"))
    assert meta["title"] == "测试书"
    assert meta["book_id"] == body["id"]


def test_list_books_scan(client, book):
    resp = client.get("/api/books")
    assert resp.status_code == 200
    slugs = [b["slug"] for b in resp.json()]
    assert book in slugs


def test_get_and_update_book(client, book):
    resp = client.get(f"/api/books/{book}")
    assert resp.status_code == 200
    assert resp.json()["writing_mode"] == "assist"

    resp = client.patch(
        f"/api/books/{book}", json={"writing_mode": "semi", "target_words": 200000}
    )
    assert resp.status_code == 200
    assert resp.json()["writing_mode"] == "semi"
    assert resp.json()["target_words"] == 200000


def test_delete_book_moves_to_recycle(client, book):
    resp = client.delete(f"/api/books/{book}")
    assert resp.status_code == 204
    assert not (settings.books_dir / book).exists()
    recycled = list(settings.recycle_dir.glob(f"{book}-*"))
    assert recycled, "作品应被移入回收目录而非物理删除"
    assert (recycled[0] / "novel.db").is_file()


def test_second_book_isolated(client, book):
    resp = client.post("/api/books", json={"title": "第二本"})
    assert resp.status_code == 201
    slug2 = resp.json()["slug"]
    assert slug2 == "第二本"
    client.post(f"/api/books/{book}/chapters", json={"title": "甲"})
    chapters2 = client.get(f"/api/books/{slug2}/chapters").json()
    assert chapters2 == []


def test_missing_book_returns_typed_error(client):
    resp = client.get("/api/books/不存在的书")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "BOOK_NOT_FOUND"


# --------------------------------------------------------------------------
# 当前作品指针：GET /api/books/{slug}（「进入作品」）必须设置指针
# --------------------------------------------------------------------------


def test_get_book_sets_active_pointer(client):
    """进入作品后，当前作品指针必须就位。

    回归护栏：曾出现 get_book 未调用 set_active，导致「进了作品却连模型列表都拉不到」。
    模型配置已全局化后，`GET /api/providers` 不再依赖指针，故这里直接断言指针本身。
    """
    slug = client.post("/api/books", json={"title": "进入测试书"}).json()["slug"]
    workspace.reset_active_for_tests()  # 模拟"尚未进入任何作品"

    # 模型配置已全局化：无当前作品也能拉列表（不再是 NO_ACTIVE_BOOK）
    baseline = client.get("/api/providers")
    assert baseline.status_code == 200
    assert baseline.json() == []

    # 进入作品：只 GET 详情 → 指针就位
    assert client.get(f"/api/books/{slug}").status_code == 200
    assert workspace.get_active() == slug


def test_get_missing_book_does_not_set_pointer(client, book):
    """404 的书不得污染当前作品指针。"""
    client.get(f"/api/books/{book}")
    assert client.get("/api/books/根本没有这本书").status_code == 404
    assert workspace.get_active() == book


# --------------------------------------------------------------------------
# 模型配置全局共享（不再随书复制）：A 书配的模型，切到 B 书仍然可见
# --------------------------------------------------------------------------


def test_providers_are_global_across_books(client, secrets_backend):
    """模型配置全局共享：换书后仍可见，且密钥环只有一份（不因换书复制）。"""
    client.post("/api/books", json={"title": "甲书"})
    assert (
        client.post(
            "/api/providers",
            json={"provider": "deepseek", "model": "deepseek-chat", "api_key": "sk-global-1"},
        ).status_code
        == 201
    )

    second = client.post("/api/books", json={"title": "乙书"}).json()["slug"]
    assert client.get(f"/api/books/{second}").status_code == 200  # 进入乙书

    providers = client.get("/api/providers").json()
    assert len(providers) == 1
    assert providers[0]["provider"] == "deepseek"
    # 全局共享：密钥本体只有一份，不因换书复制（key_ref 复用全局密钥环条目）
    assert len(secrets_backend.store) == 1


def test_providers_visible_without_any_book(client):
    """一本作品都没有时，模型配置照样可读（全局库独立于作品）。"""
    assert client.get("/api/providers").status_code == 200
    assert client.get("/api/providers").json() == []

