"""P0-1 回归：一部损坏的兄弟作品库，不得让全站 by-id 端点 500。

背景：by-id 端点（`GET /api/chapters/{id}` / `GET /api/characters/{id}` …）在
「当前作品里没有该 id」时会回退**全库扫描**。`books/` 下只要有残留脏目录
（0 字节库、非 SQLite 文件、缺业务表的库），旧实现会在扫描时抛出未捕获的
`sqlite3.OperationalError`（`no such table: chapter`）→ **500**，
且**任何**不存在的 id 都受影响。

修法见 `app/services/workspace.py::_contains_id`（逐库容错）与
`app/db/registry.py::_looks_like_sqlite`（扫描时排除明显非法的库）。
"""

from __future__ import annotations

import sqlite3

from app.config import settings
from app.db.registry import get_registry


def _write_bytes_book(name: str, payload: bytes) -> None:
    book_dir = settings.books_dir / name
    book_dir.mkdir(parents=True, exist_ok=True)
    (book_dir / "novel.db").write_bytes(payload)


def _write_tableless_book(name: str) -> None:
    """文件头合法、能打开，但**没有 chapter 等业务表**（真实触发场景）。"""
    book_dir = settings.books_dir / name
    book_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(book_dir / "novel.db")
    try:
        conn.execute("CREATE TABLE unrelated (x INTEGER)")
        conn.commit()
    finally:
        conn.close()


def _make_corrupt_siblings() -> None:
    _write_bytes_book("坏库-非SQLite", b"\x00" * 4096)
    _write_bytes_book("坏库-空文件", b"")
    _write_tableless_book("坏库-缺表")


def test_corrupt_sibling_db_does_not_break_by_id(client, book):
    chapter = client.post(
        f"/api/books/{book}/chapters", json={"title": "第1章 起因"}
    ).json()
    client.patch(f"/api/chapters/{chapter['id']}", json={"content": "正文内容。"})

    _make_corrupt_siblings()

    # 把「当前作品」切到另一本正常作品，迫使 by-id 走全库扫描路径
    other = client.post("/api/books", json={"title": "另一本正常书"}).json()["slug"]
    assert other != book

    # ① 全库扫描仍能正确定位到正常作品里的章节（坏库被跳过，不影响结果）
    found = client.get(f"/api/chapters/{chapter['id']}")
    assert found.status_code == 200, found.text
    assert found.json()["title"] == "第1章 起因"
    assert found.json()["content"] == "正文内容。"

    # ② 不存在的 id → 404（不是 500）
    missing = client.get("/api/chapters/99999999")
    assert missing.status_code == 404, missing.text
    assert missing.json()["error"]["code"] == "CHAPTER_NOT_FOUND"

    # ③ 其它 by-id 资源同样不受影响
    missing_char = client.get("/api/characters/99999999")
    assert missing_char.status_code == 404, missing_char.text
    assert missing_char.json()["error"]["code"] == "CHARACTER_NOT_FOUND"


def test_list_slugs_skips_obviously_invalid_db_but_keeps_openable_ones(client, book):
    """扫描只做「像不像库」的廉价过滤；能打开但缺表的库仍交给 resolve_slug 容错。"""
    _make_corrupt_siblings()
    slugs = get_registry().list_slugs()
    assert book in slugs
    assert "坏库-非SQLite" not in slugs  # 非 SQLite 文件头 → 直接排除
    assert "坏库-缺表" in slugs  # 文件头合法 → 保留，由逐库容错兜底
