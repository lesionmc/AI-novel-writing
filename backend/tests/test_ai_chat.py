"""AI 对话工作台（`POST /api/books/{book}/ai/chat`）。

## 本文件守的三条红线

1. **上下文真的注入了** —— 断言提示词里带着设定库、人物现状、未回收伏笔、
   本章大纲与上一章摘要。否则"AI 有记忆"只是注释里的一句话。
2. **产出的是草稿，绝不写库** —— 用「直读 SQLite 比行数」来证明，而不是只看接口返回。
3. **未配模型必须给可读错误**，不泄漏 Traceback。

另外验证 `context_used`（"这次读了什么"）与实际注入一致 —— 它是给用户看的，
谎报比不报更糟。
"""

from __future__ import annotations

import json
import sqlite3

from app.config import settings
from tests.fakes import FakeLLMClient


def _add_provider(client) -> None:
    resp = client.post(
        "/api/providers", json={"provider": "ollama", "model": "fake-model"}
    )
    assert resp.status_code == 201, resp.text


def _counts(book: str) -> dict[str, int]:
    """直读 SQLite 统计设定库行数 —— 断言「草稿不落库」的证据。"""
    conn = sqlite3.connect(settings.books_dir / book / "novel.db")
    try:
        return {
            table: int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])  # noqa: S608
            for table in ("character", "world_entry", "outline", "chapter")
        }
    finally:
        conn.close()


def _make_chapter(client, book: str, *, seq_title: str = "第一章") -> int:
    created = client.post(f"/api/books/{book}/chapters", json={"title": seq_title})
    assert created.status_code == 201, created.text
    return int(created.json()["id"])


def _seed_memory(client, book: str) -> None:
    char = client.post(
        f"/api/books/{book}/characters",
        json={"name": "陈默", "role": "supporting", "surface_identity": "补给站保安"},
    )
    assert char.status_code == 201, char.text
    fs = client.post(
        f"/api/books/{book}/foreshadows",
        json={"title": "断齿钥匙的来历", "importance": "high", "planted_chapter_seq": 1},
    )
    assert fs.status_code == 201, fs.text


# ------------------------------------------------------------- 未配模型
def test_chat_without_model_readable_error(client, book):
    resp = client.post(
        f"/api/books/{book}/ai/chat", json={"messages": [{"role": "user", "content": "你好"}]}
    )
    assert resp.status_code == 400, resp.text
    err = resp.json()["error"]
    assert err["code"] == "LLM_NOT_CONFIGURED"
    assert err["message"]
    assert "Traceback" not in resp.text


# --------------------------------------------------------------- 正常对话
def test_chat_injects_memory_and_reports_usage(client, book, fake_llm):
    _add_provider(client)
    _seed_memory(client, book)
    fake = FakeLLMClient(
        chat_responses=[json.dumps({"reply": "陈默这个人还可以再狠一点。", "draft": None}, ensure_ascii=False)]
    )
    fake_llm(fake)

    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={"messages": [{"role": "user", "content": "陈默这角色怎么样？"}]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reply"] == "陈默这个人还可以再狠一点。"
    assert body["draft"] is None

    prompt = fake.chat_calls[0][0]["content"]
    # 记忆包真的注入了：书名 / 人物 / 伏笔
    assert "测试书" in prompt
    assert "陈默" in prompt
    assert "断齿钥匙的来历" in prompt
    assert "陈默这角色怎么样？" in prompt  # 对话历史也在

    used = body["context_used"]
    assert used["characters"] == 1
    assert used["foreshadows"] == 1
    assert used["outlines"] == 0
    assert used["has_prev_summary"] is False
    assert used["injected_chars"] > 0


# --------------------------------------------- 带 chapter_id：本章上下文进场
def test_chat_with_chapter_id_includes_chapter_context(client, book, fake_llm):
    _add_provider(client)
    _seed_memory(client, book)
    chapter_id = _make_chapter(client, book)
    saved = client.patch(
        f"/api/chapters/{chapter_id}", json={"content": "<p>陈默推开铁门，风灌了进来。</p>"}
    )
    assert saved.status_code == 200, saved.text
    outline = client.post(
        f"/api/books/{book}/outlines",
        json={"level": "chapter", "title": "第一章", "content": "陈默接班，发现钥匙", "chapter_id": chapter_id},
    )
    assert outline.status_code == 201, outline.text

    fake = FakeLLMClient(
        chat_responses=[json.dumps({"reply": "接着这里写就行。", "draft": None}, ensure_ascii=False)]
    )
    fake_llm(fake)
    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={
            "messages": [{"role": "user", "content": "往下写"}],
            "chapter_id": chapter_id,
            "intent": "continue",
        },
    )
    assert resp.status_code == 200, resp.text
    used = resp.json()["context_used"]
    assert used["outlines"] == 1

    prompt = fake.chat_calls[0][0]["content"]
    assert "陈默接班，发现钥匙" in prompt  # 本章大纲要点
    assert "推开铁门" in prompt  # 最近正文
    assert "接着往下写一段正文" in prompt  # intent 传到了模型


def test_chat_unknown_chapter_is_not_found(client, book, fake_llm):
    _add_provider(client)
    fake_llm(FakeLLMClient(chat_responses=[json.dumps({"reply": "x"})]))
    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={"messages": [{"role": "user", "content": "hi"}], "chapter_id": 999999},
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "CHAPTER_NOT_FOUND"


def test_chat_unknown_book_is_not_found(client):
    resp = client.post(
        "/api/books/不存在的书/ai/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "BOOK_NOT_FOUND"
    assert "Traceback" not in resp.text


# --------------------------------------------------- 草稿：规范化 + 不落库
def test_chat_returns_normalized_draft_and_writes_nothing(client, book, fake_llm):
    _add_provider(client)
    before = _counts(book)
    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps(
                    {
                        "reply": "我整理了两个角色，你看着改。",
                        "draft": {
                            "kind": "characters",
                            "payload": {
                                "characters": [
                                    {
                                        "name": "林晚",
                                        "role": "瞎写的角色",
                                        "surface_identity": "外门杂役",
                                        "secret_desire": "想被看见",
                                        "fatal_weakness": "心软",
                                        "contradiction": "怕杀生却必须杀人",
                                    },
                                    {"name": "", "role": "protagonist"},  # 无名 → 丢弃
                                ]
                            },
                        },
                    },
                    ensure_ascii=False,
                )
            ]
        )
    )
    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={"messages": [{"role": "user", "content": "帮我加两个角色"}], "intent": "characters"},
    )
    assert resp.status_code == 200, resp.text
    draft = resp.json()["draft"]
    assert draft["kind"] == "characters"
    chars = draft["payload"]["characters"]
    assert len(chars) == 1
    assert chars[0]["role"] == "supporting"  # 非法枚举归一到安全值
    assert chars[0]["fatal_weakness"] == "心软"

    # 红线：草稿**不落库**
    assert _counts(book) == before


def test_chat_draft_kinds_are_normalized(client, book, fake_llm):
    """四类草稿都能产出，且形状与对应写入端点一致。"""
    _add_provider(client)
    cases = [
        (
            {"kind": "world_entries", "payload": {"entries": [{"category": "瞎写", "name": "断剑冢", "content": "埋剑之地"}]}},
            "world_entries",
            lambda p: p["entries"][0]["category"] == "other",
        ),
        (
            {"kind": "outline_nodes", "payload": {"nodes": [{"level": "瞎写", "title": "第2章", "content": "进城"}]}},
            "outline_nodes",
            lambda p: p["nodes"][0]["level"] == "chapter",
        ),
        (
            {"kind": "prose", "payload": {"text": "他握紧了钥匙。"}},
            "prose",
            lambda p: p["text"] == "他握紧了钥匙。",
        ),
    ]
    for raw_draft, kind, check in cases:
        fake_llm(FakeLLMClient(chat_responses=[json.dumps({"reply": "给", "draft": raw_draft}, ensure_ascii=False)]))
        resp = client.post(
            f"/api/books/{book}/ai/chat",
            json={"messages": [{"role": "user", "content": "做"}]},
        )
        assert resp.status_code == 200, resp.text
        draft = resp.json()["draft"]
        assert draft["kind"] == kind, draft
        assert check(draft["payload"]), draft
    assert _counts(book)["outline"] == 0  # 全程没落库


def test_chat_unknown_draft_kind_yields_no_draft(client, book, fake_llm):
    """认不出的草稿类型 → 只回话，不摆半张卡片给用户点「确认写入」。"""
    _add_provider(client)
    fake_llm(
        FakeLLMClient(
            chat_responses=[json.dumps({"reply": "好的", "draft": {"kind": "todos", "payload": {"x": 1}}}, ensure_ascii=False)]
        )
    )
    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={"messages": [{"role": "user", "content": "帮我记个待办"}]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reply"] == "好的"
    assert resp.json()["draft"] is None


def test_chat_empty_reply_is_parse_failure(client, book, fake_llm):
    _add_provider(client)
    fake_llm(FakeLLMClient(chat_responses=[json.dumps({"reply": "", "draft": None}), "{}"]))
    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "JSON_PARSE_FAILED"
    assert "Traceback" not in resp.text
