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


# ------------------------------------------------------------- 联网检索回路
def test_use_web_plans_searches_and_injects_sources(client, book, fake_llm, monkeypatch):
    """开联网开关：先让模型出检索计划 → 搜索 → 资料注入最终提示词并回传来源。"""
    _add_provider(client)
    calls: list[str] = []

    def fake_search(query, max_results=5):
        calls.append(query)
        return [
            {"title": "宋代城防制度", "url": "https://example.org/a", "snippet": "瓮城与马面……"},
        ]

    monkeypatch.setattr("app.services.web_search.web_search", fake_search)
    fake = FakeLLMClient(
        chat_responses=[
            json.dumps({"need_search": "true", "query": "宋代城防 瓮城"}, ensure_ascii=False),  # 字符串布尔也要认
            json.dumps(
                {"reply": "查到了：宋代城防普遍设瓮城（来源：宋代城防制度）。", "draft": None},
                ensure_ascii=False,
            ),
        ]
    )
    fake_llm(fake)

    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={
            "messages": [{"role": "user", "content": "宋代城墙的瓮城一般什么形制？"}],
            "use_web": True,
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert calls == ["宋代城防 瓮城"]
    assert body["web_sources"][0]["url"] == "https://example.org/a"
    assert body["web_attempted"] is True
    # 两次模型调用：第一次是检索计划，第二次带上了资料
    assert len(fake.chat_calls) == 2
    assert "瓮城与马面" in fake.chat_calls[1][0]["content"]


def test_use_web_planner_declines_skips_search(client, book, fake_llm, monkeypatch):
    """模型判断不需要联网（打招呼/纯创作）→ 一次都不搜，正常回话。"""
    _add_provider(client)

    def boom(*_a, **_k):
        raise AssertionError("不该触发搜索")

    monkeypatch.setattr("app.services.web_search.web_search", boom)
    fake = FakeLLMClient(
        chat_responses=[
            json.dumps({"need_search": False, "query": ""}),
            json.dumps({"reply": "早，今天想推进哪块？", "draft": None}, ensure_ascii=False),
        ]
    )
    fake_llm(fake)

    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={"messages": [{"role": "user", "content": "你好"}], "use_web": True},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["web_sources"] == []
    assert resp.json()["web_attempted"] is False  # 模型说不搜 ≠ 搜了没搜到
    assert len(fake.chat_calls) == 2


def test_search_plan_parse_failure_degrades_to_no_search(client, book, fake_llm, monkeypatch):
    """检索计划解析失败 → 降级为不联网，主回答照常。"""
    _add_provider(client)
    monkeypatch.setattr(
        "app.services.web_search.web_search",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("不该触发搜索")),
    )
    fake = FakeLLMClient(
        chat_responses=[
            "not json at all",
            "still not json",
            json.dumps({"reply": "好，接着写。", "draft": None}, ensure_ascii=False),
        ]
    )
    fake_llm(fake)
    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={"messages": [{"role": "user", "content": "继续"}], "use_web": True},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reply"] == "好，接着写。"


def test_chat_without_use_web_never_searches(client, book, fake_llm, monkeypatch):
    """没开开关：即使模型想搜也不给搜（联网是作者显式授权）。"""
    _add_provider(client)

    def boom(*_a, **_k):
        raise AssertionError("不该触发搜索")

    monkeypatch.setattr("app.services.web_search.web_search", boom)
    fake_llm(
        FakeLLMClient(
            chat_responses=[json.dumps({"reply": "嗯。", "draft": None}, ensure_ascii=False)]
        )
    )
    resp = client.post(
        f"/api/books/{book}/ai/chat",
        json={"messages": [{"role": "user", "content": "最新网文行情怎么样？"}]},
    )
    assert resp.status_code == 200, resp.text


# ------------------------------------------------------------- 流式对话
def _collect_sse(response) -> list[tuple[str, dict]]:
    """把 SSE 响应读成 [(event, data), ...]（TestClient 流模式）。"""
    frames: list[tuple[str, dict]] = []
    event = None
    for line in response.iter_lines():
        if line.startswith("event: "):
            event = line[7:]
        elif line.startswith("data: ") and event:
            frames.append((event, json.loads(line[6:])))
            event = None
    return frames


def test_chat_stream_deltas_then_final(client, book, fake_llm):
    _add_provider(client)
    reply_json = json.dumps(
        {"reply": "早。今天想把哪一章往前推一推？", "draft": None}, ensure_ascii=False
    )
    fake = FakeLLMClient(chat_responses=[reply_json])
    fake_llm(fake)

    with client.stream(
        "POST",
        f"/api/books/{book}/ai/chat/stream",
        json={"messages": [{"role": "user", "content": "你好"}]},
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        frames = _collect_sse(resp)

    deltas = [d["text"] for e, d in frames if e == "delta"]
    finals = [d for e, d in frames if e == "final"]
    assert finals and finals[0]["reply"] == "早。今天想把哪一章往前推一推？"
    # 增量拼接必须等于最终 reply 的前缀（流式显示与最终内容一致，不出现两套话）
    assert "".join(deltas) == finals[0]["reply"]
    assert finals[0]["draft"] is None


def test_chat_stream_precheck_errors_keep_http_status(client, fake_llm):
    """未配模型：4xx 在开流**之前**发生，走正常状态码而不是流内 error 帧。"""
    resp = client.post(
        f"/api/books/{client.post('/api/books', json={'title': '流前检查'}).json()['slug']}"
        "/ai/chat/stream",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "LLM_NOT_CONFIGURED"


def test_chat_stream_carries_draft_and_web_fields(client, book, fake_llm):
    _add_provider(client)
    final_json = json.dumps(
        {
            "reply": "给你排了个章卡。",
            "draft": {
                "kind": "outline_nodes",
                "payload": {"nodes": [{"level": "chapter", "title": "雨夜", "content": "c"}]},
            },
        },
        ensure_ascii=False,
    )
    fake_llm(FakeLLMClient(chat_responses=[final_json]))
    with client.stream(
        "POST",
        f"/api/books/{book}/ai/chat/stream",
        json={"messages": [{"role": "user", "content": "排个大纲"}]},
    ) as resp:
        frames = _collect_sse(resp)
    final = [d for e, d in frames if e == "final"][0]
    assert final["draft"]["kind"] == "outline_nodes"
    assert final["web_attempted"] is False


# ------------------------------------------------- 无作品模式（AI 助手进来就能聊）
def test_chat_without_book_works(client, fake_llm):
    _add_provider(client)
    fake = FakeLLMClient(
        chat_responses=[json.dumps({"reply": "在的，先说说你在写什么。", "draft": None}, ensure_ascii=False)]
    )
    fake_llm(fake)

    resp = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "你好"}]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reply"] == "在的，先说说你在写什么。"
    assert body["context_used"]["characters"] == 0

    prompt = fake.chat_calls[0][0]["content"]
    assert "（未关联作品）" in prompt  # 空记忆包有兜底文案，不是插值崩
    assert "你好" in prompt


def test_chat_without_book_no_model_readable_error(client):
    resp = client.post("/api/ai/chat", json={"messages": [{"role": "user", "content": "你好"}]})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "LLM_NOT_CONFIGURED"


def test_chat_stream_without_book(client, fake_llm):
    _add_provider(client)
    fake_llm(
        FakeLLMClient(
            chat_responses=[json.dumps({"reply": "早。", "draft": None}, ensure_ascii=False)]
        )
    )
    with client.stream(
        "POST", "/api/ai/chat/stream", json={"messages": [{"role": "user", "content": "hi"}]}
    ) as resp:
        assert resp.status_code == 200
        frames = _collect_sse(resp)
    finals = [d for e, d in frames if e == "final"]
    assert finals and finals[0]["reply"] == "早。"


# --------------------------------------------------------- book_plan 立项卡
def test_book_plan_draft_normalized_and_gated(client, book, fake_llm):
    """立项卡：题材或卖点至少一样才成立；空壳 / 只有标题 → 丢卡只留话。"""
    _add_provider(client)

    def _ask(payload: dict):
        fake_llm(
            FakeLLMClient(
                chat_responses=[json.dumps({"reply": "整理好了", "draft": payload}, ensure_ascii=False)]
            )
        )
        resp = client.post(
            f"/api/books/{book}/ai/chat",
            json={"messages": [{"role": "user", "content": "就按这个方向来"}]},
        )
        assert resp.status_code == 200, resp.text
        return resp.json()["draft"]

    good = _ask({
        "kind": "book_plan",
        "payload": {
            "genre": " 玄幻 ",
            "readers": "番茄男频",
            "premise": "弃子握着祖碑残片",
            "target_words": 1500000,
        },
    })
    assert good["payload"]["genre"] == "玄幻"
    assert good["payload"]["target_words"] == 1500000

    assert _ask({"kind": "book_plan", "payload": {"title": "只起了名"}}) is None
    assert _ask({"kind": "book_plan", "payload": {"genre": ""}}) is None
