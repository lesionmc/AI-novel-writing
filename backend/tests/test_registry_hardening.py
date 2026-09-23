"""注册表加固回归：并发 meta 写（P0-3a）、并发建书 409（P0-3b）、slug 校验缺口（P1）。

对应改动：`app/db/registry.py::write_meta`（唯一临时名）、`::create`（FileExistsError→409）、
`app/services/book_service.py::create_book`（slug 竞态重试）、`app/db/registry.py::is_valid_slug`
（保留设备名 / 前导 `_` / 超长）。
"""

from __future__ import annotations

import threading

from app.config import settings
from app.db.registry import get_registry
from app.errors import BookExistsError
from app.models.book import BookCreate
from app.services import book_service


def _book_dirs() -> set[str]:
    if not settings.books_dir.is_dir():
        return set()
    return {p.name for p in settings.books_dir.iterdir() if p.is_dir()}


# --------------------------------------------------------- T4 并发写 meta.json
def test_concurrent_write_meta_all_succeed_and_no_leftover(client, book):
    registry = get_registry()
    errors: list[BaseException] = []
    barrier = threading.Barrier(10)

    def worker(i: int) -> None:
        barrier.wait()  # 尽量让 10 个线程同时进入写
        try:
            registry.write_meta(book, {"slug": book, "title": f"标题{i}", "n": i})
        except BaseException as exc:  # noqa: BLE001 - 测试要捕获任何失败
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"并发 write_meta 不应抛异常：{errors!r}"
    meta = registry.read_meta(book)
    assert isinstance(meta, dict)
    assert str(meta.get("title", "")).startswith("标题")  # 最终内容是完整合法 JSON
    # 不留任何临时文件残留
    leftover = [p.name for p in (settings.books_dir / book).iterdir() if p.name.endswith(".tmp")]
    assert leftover == []


# --------------------------------------------------------- T5 并发建同名作品
def test_concurrent_create_same_title_distinct_slugs_and_no_500(client):
    results: list[str] = []
    conflicts: list[BookExistsError] = []
    barrier = threading.Barrier(5)

    def worker() -> None:
        barrier.wait()
        try:
            results.append(book_service.create_book(BookCreate(title="并发同名")).slug)
        except BookExistsError as exc:
            conflicts.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert len(results) + len(conflicts) == 5
    assert results, "至少应有一个请求成功建书"
    assert len(set(results)) == len(results), f"成功的 slug 必须互不相同：{results}"


def test_create_book_conflict_after_retries_is_409_not_500(client, book, monkeypatch):
    """slug 竞态重试耗尽 → 409 BOOK_EXISTS，而不是 FileExistsError 500。"""
    monkeypatch.setattr(book_service, "_unique_slug", lambda _title: book)  # 永远撞已有 slug
    resp = client.post("/api/books", json={"title": "另一个名字"})
    assert resp.status_code == 409, resp.text
    assert resp.json()["error"]["code"] == "BOOK_EXISTS"


def test_registry_create_existing_slug_raises_book_exists(client, book):
    registry = get_registry()
    try:
        registry.create(book, {"slug": book})
    except BookExistsError:
        pass
    else:  # pragma: no cover
        raise AssertionError("重复建同名目录应抛 BookExistsError")


# --------------------------------------------------------- T6 slug / 书名校验
def test_reject_reserved_and_invalid_titles_without_leaving_dirs(client):
    before = _book_dirs()

    invalid_titles = [
        "CON",
        "con",
        "AUX",
        "PRN",
        "NUL.json",
        "COM1",
        "LPT9",
        "CONIN$",
        "_abc",  # 前导下划线 → 列表里永远看不见的孤儿作品
        "   ",  # 纯空白
        "L" * 81,  # 超长（Pydantic max_length 先挡）
    ]
    for title in invalid_titles:
        resp = client.post("/api/books", json={"title": title})
        assert resp.status_code == 400, f"{title!r} 应为 400，实际 {resp.status_code}: {resp.text}"

    # 关键断言：一次非法创建都不得留下目录残留
    after = _book_dirs()
    assert after == before, f"非法创建留下了目录：{after - before}"


def test_reserved_name_check_handles_extension_and_case():
    from app.db.registry import is_valid_slug

    assert not is_valid_slug("NUL.json")
    assert not is_valid_slug("nul.TXT")
    assert not is_valid_slug("CON")
    assert not is_valid_slug("_hidden")
    assert not is_valid_slug("a" * 81)
    assert is_valid_slug("正常书名")
    assert is_valid_slug("Book-Title_2")


def test_valid_title_still_creates(client):
    resp = client.post("/api/books", json={"title": "正常的新书"})
    assert resp.status_code == 201, resp.text
    assert (settings.books_dir / "正常的新书" / "novel.db").is_file()
