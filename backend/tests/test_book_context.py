"""P0-2 回归：请求级作品上下文（`X-Book-Slug`）阻断跨书静默覆盖。

背景：by-id 端点不带作品标识，旧实现靠进程内「当前作品指针」解析归属。
两个标签页各开一本书时指针互相抢占 → 甲书标签页的自动保存会**静默写进乙书**。
修法见 `app/book_context.py` + `app/middlewares.py` + `app/services/workspace.py`。
"""

from __future__ import annotations

from urllib.parse import quote

from app.services import workspace


def _h(slug: str) -> dict[str, str]:
    """构造带作品上下文请求头（值 percent-encode，与前端 `request.ts` 一致）。"""
    return {"X-Book-Slug": quote(slug, safe="")}


def _make_two_books(client) -> tuple[str, str]:
    a = client.post("/api/books", json={"title": "甲书"}).json()["slug"]
    b = client.post("/api/books", json={"title": "乙书"}).json()["slug"]
    # 两书各自的第一章 id 都是 1（每书独立库、自增主键）—— 正是冲突场景
    ca = client.post(f"/api/books/{a}/chapters", json={"title": "甲一"}).json()
    cb = client.post(f"/api/books/{b}/chapters", json={"title": "乙一"}).json()
    assert ca["id"] == cb["id"] == 1
    return a, b


def test_header_scopes_patch_to_correct_book(client):
    """带 `X-Book-Slug` 时，同一 id=1 的 PATCH 必须分别落到各自的书。"""
    a, b = _make_two_books(client)

    assert (
        client.patch("/api/chapters/1", json={"content": "甲书的正文"}, headers=_h(a)).status_code
        == 200
    )
    # 模拟「乙书标签页」抢占全局指针后再改乙书
    client.get(f"/api/books/{b}")
    assert (
        client.patch("/api/chapters/1", json={"content": "乙书的正文"}, headers=_h(b)).status_code
        == 200
    )

    assert client.get("/api/chapters/1", headers=_h(a)).json()["content"] == "甲书的正文"
    assert client.get("/api/chapters/1", headers=_h(b)).json()["content"] == "乙书的正文"


def test_stolen_global_pointer_cannot_hijack_scoped_save(client):
    """即使全局指针被别的标签页抢走，带头请求仍写进自己的书（核心回归）。"""
    a, b = _make_two_books(client)
    client.patch("/api/chapters/1", json={"content": "甲书正文"}, headers=_h(a))
    client.patch("/api/chapters/1", json={"content": "乙书正文"}, headers=_h(b))

    client.get(f"/api/books/{b}")  # 全局指针被「乙书」抢走
    assert (
        client.patch("/api/chapters/1", json={"content": "甲书再改"}, headers=_h(a)).status_code
        == 200
    )

    assert client.get("/api/chapters/1", headers=_h(a)).json()["content"] == "甲书再改"
    assert client.get("/api/chapters/1", headers=_h(b)).json()["content"] == "乙书正文"


def test_scoped_lookup_never_falls_back_to_other_books(client):
    """请求级上下文下，本作品没有的 id 必须 404，绝不回退别书。"""
    a, b = _make_two_books(client)
    client.post(f"/api/books/{b}/chapters", json={"title": "乙二"})  # 乙书有 id=2

    # 甲书没有 id=2 → 404（若回退全库扫描就会命中乙书的 id=2）
    resp = client.get("/api/chapters/2", headers=_h(a))
    assert resp.status_code == 404, resp.text
    assert resp.json()["error"]["code"] == "CHAPTER_NOT_FOUND"


def test_no_header_multi_match_is_conflict_not_silent_pick(client):
    """无请求头（老客户端）且 id 在多书命中时，必须 409，不得静默选一本。"""
    _make_two_books(client)
    workspace.reset_active_for_tests()  # 清掉全局指针，迫使走全库扫描

    resp = client.get("/api/chapters/1")
    assert resp.status_code == 409, resp.text
    assert resp.json()["error"]["code"] == "CONFLICT"


def test_no_header_single_match_still_works(client):
    """老客户端回归：只有一本书命中时，无头请求照常解析（向后兼容）。"""
    book = client.post("/api/books", json={"title": "独苗书"}).json()["slug"]
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "唯一章"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "只有这一本"})
    workspace.reset_active_for_tests()

    resp = client.get(f"/api/chapters/{ch['id']}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["content"] == "只有这一本"


def test_illegal_header_is_ignored_not_500(client, book):
    """坏 header（非法 slug）必须被忽略，退回全局语义，而不是 500。"""
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "章"}).json()
    resp = client.get(
        f"/api/chapters/{ch['id']}", headers={"X-Book-Slug": quote("../evil", safe="")}
    )
    assert resp.status_code == 200, resp.text
