"""R20 正文辅助 AI（剧情走向 / 校对 / 续写 / 扩写）+ R8 一致性审校。

## 本文件守的两条红线

1. **产物是建议 / 草稿，绝不写库** —— 每个用例都用「直接读库比对」来证明，
   而不是只看接口返回。续写 / 扩写最容易在这里出事：一旦后端顺手把草稿写进
   `chapter.content`，作者没确认的 AI 文字就成了他的稿子。
2. **上下文真的喂进去了** —— 断言提示词里带着设定库、人物现状与未回收伏笔。
   否则"AI 有记忆"只是注释里的一句话。

无模型时必须给**可读错误**且不泄漏 Traceback。
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


def _make_chapter(client, book: str, *, content: str = "<p>陈默推开门走了进去。</p>") -> int:
    created = client.post(f"/api/books/{book}/chapters", json={"title": "第一章"})
    assert created.status_code == 201, created.text
    chapter_id = created.json()["id"]
    if content:
        saved = client.patch(f"/api/chapters/{chapter_id}", json={"content": content})
        assert saved.status_code == 200, saved.text
    return chapter_id


def _chapter_row(book: str, chapter_id: int) -> tuple[str, int]:
    """直读 SQLite 拿正文与字数 —— 断言「绝不写库」的证据。"""
    conn = sqlite3.connect(settings.books_dir / book / "novel.db")
    try:
        row = conn.execute(
            "SELECT content, word_count FROM chapter WHERE id = ?", (chapter_id,)
        ).fetchone()
    finally:
        conn.close()
    assert row is not None
    return str(row[0]), int(row[1])


def _seed_memory(client, book: str, chapter_id: int) -> None:
    """铺一点"记忆"：一个人物 + 一条未回收伏笔，用来验证上下文注入。"""
    char = client.post(
        f"/api/books/{book}/characters",
        json={
            "name": "陈默",
            "role": "supporting",
            "surface_identity": "补给站保安",
            "fatal_weakness": "心软",
        },
    )
    assert char.status_code == 201, char.text
    fs = client.post(
        f"/api/books/{book}/foreshadows",
        json={
            "title": "断齿钥匙的来历",
            "importance": "high",
            "planted_chapter_seq": 1,
        },
    )
    assert fs.status_code == 201, fs.text
    _ = chapter_id


def _sse_frames(text: str) -> list[tuple[str, dict]]:
    """把 SSE 响应体解析成 (event, data) 列表。"""
    frames: list[tuple[str, dict]] = []
    for block in text.split("\n\n"):
        event, data = "message", ""
        for line in block.split("\n"):
            if line.startswith("event:"):
                event = line[6:].strip()
            elif line.startswith("data:"):
                data = line[5:].strip()
        if data:
            frames.append((event, json.loads(data)))
    return frames


# ------------------------------------------------------------- 剧情走向
def test_plot_directions_injects_memory_and_writes_nothing(client, book, fake_llm):
    _add_provider(client)
    chapter_id = _make_chapter(client, book)
    _seed_memory(client, book, chapter_id)
    before = _chapter_row(book, chapter_id)

    fake = FakeLLMClient(
        chat_responses=[
            json.dumps(
                {
                    "directions": [
                        {
                            "title": "陈默摊牌",
                            "summary": "他把钥匙的来历说了",
                            "payoff": "回收断齿钥匙的来历",
                            "risk": "节奏会慢一章",
                        },
                        {"title": "", "summary": "没有标题应被丢弃"},
                    ]
                },
                ensure_ascii=False,
            )
        ]
    )
    fake_llm(fake)

    resp = client.post(f"/api/chapters/{chapter_id}/plot-directions", json={"count": 2})
    assert resp.status_code == 200, resp.text
    directions = resp.json()["directions"]
    # 没有 title 的条目被丢弃
    assert len(directions) == 1
    assert directions[0]["payoff"] == "回收断齿钥匙的来历"

    prompt = fake.chat_calls[0][0]["content"]
    # 上下文真的注入了：书名 / 人物现状 / 未回收伏笔 / 最近正文
    assert "测试书" in prompt
    assert "陈默" in prompt
    assert "断齿钥匙的来历" in prompt
    assert "推开门" in prompt
    # 红线：不写库
    assert _chapter_row(book, chapter_id) == before


def test_plot_directions_without_usable_directions_is_parse_failure(client, book, fake_llm):
    _add_provider(client)
    chapter_id = _make_chapter(client, book)
    fake_llm(FakeLLMClient(chat_responses=[json.dumps({"directions": []}), "{}"]))
    resp = client.post(f"/api/chapters/{chapter_id}/plot-directions")
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "JSON_PARSE_FAILED"
    assert "Traceback" not in resp.text


# --------------------------------------------------------------- 校对
def test_proofread_returns_issues_normalizes_type_and_writes_nothing(
    client, book, fake_llm
):
    _add_provider(client)
    chapter_id = _make_chapter(client, book)
    before = _chapter_row(book, chapter_id)

    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps(
                    {
                        "issues": [
                            {
                                "type": "name",
                                "excerpt": "陈墨",
                                "problem": "人物名不一致",
                                "suggestion": "改为「陈默」",
                            },
                            {"type": "瞎写的类别", "excerpt": "的的", "problem": "重复"},
                            {"excerpt": ""},  # 空片段应被丢弃
                        ]
                    },
                    ensure_ascii=False,
                )
            ]
        )
    )

    resp = client.post(f"/api/chapters/{chapter_id}/proofread", json={})
    assert resp.status_code == 200, resp.text
    issues = resp.json()["issues"]
    assert len(issues) == 2
    assert issues[0]["type"] == "name"
    assert issues[1]["type"] == "grammar"  # 非法枚举归一到安全值
    assert _chapter_row(book, chapter_id) == before  # 绝不改字
    assert _chapter_row(book, chapter_id) == before


def test_proofread_empty_issues_is_legal_result(client, book, fake_llm):
    """通篇没问题 → 空数组是**合法结果**，不能当成失败。"""
    _add_provider(client)
    chapter_id = _make_chapter(client, book)
    fake_llm(FakeLLMClient(chat_responses=[json.dumps({"issues": []})]))
    resp = client.post(f"/api/chapters/{chapter_id}/proofread", json={})
    assert resp.status_code == 200, resp.text
    assert resp.json()["issues"] == []


def test_proofread_blank_chapter_readable_error(client, book, fake_llm):
    """空章节：明说"没有可校对的内容"，而不是回一个空清单让人以为全对。"""
    _add_provider(client)
    chapter_id = _make_chapter(client, book, content="")
    fake_llm(FakeLLMClient(chat_responses=[json.dumps({"issues": []})]))
    resp = client.post(f"/api/chapters/{chapter_id}/proofread", json={})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


# ------------------------------------------------------- 续写 / 扩写
def test_continue_returns_draft_and_does_not_touch_chapter(client, book, fake_llm):
    _add_provider(client)
    chapter_id = _make_chapter(client, book)
    before = _chapter_row(book, chapter_id)

    fake = FakeLLMClient(
        chat_responses=[
            json.dumps({"text": "他握紧了钥匙，指节发白。"}, ensure_ascii=False)
        ]
    )
    fake_llm(fake)
    resp = client.post(
        f"/api/chapters/{chapter_id}/continue", json={"target_chars": 300, "hint": "别写打斗"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["text"] == "他握紧了钥匙，指节发白。"

    prompt = fake.chat_calls[0][0]["content"]
    assert "别写打斗" in prompt  # 作者要求注入了
    # 红线：草稿**不落库**，正文与字数逐字未变
    assert _chapter_row(book, chapter_id) == before


def test_expand_returns_draft_and_does_not_touch_chapter(client, book, fake_llm):
    _add_provider(client)
    chapter_id = _make_chapter(client, book)
    before = _chapter_row(book, chapter_id)

    fake_llm(
        FakeLLMClient(chat_responses=[json.dumps({"text": "他推开门，门轴发出一声闷响。"})])
    )
    resp = client.post(
        f"/api/chapters/{chapter_id}/expand", json={"text": "他推开门。", "target_chars": 200}
    )
    assert resp.status_code == 200, resp.text
    assert "门轴" in resp.json()["text"]
    assert _chapter_row(book, chapter_id) == before


def test_expand_requires_text(client, book):
    """`text` 必填（契约 required）。

    注：本项目把请求体校验错误统一映射成 **400 + VALIDATION_ERROR**（不是 FastAPI 默认的 422），
    与 `test_ai_setup.py::test_setup_chat_requires_messages` 同一口径 —— 前端只认这套。
    """
    chapter_id = _make_chapter(client, book)
    resp = client.post(f"/api/chapters/{chapter_id}/expand", json={})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_expand_blank_text_rejected(client, book):
    """`text` 传空串也应被挡（min_length=1）。"""
    chapter_id = _make_chapter(client, book)
    resp = client.post(f"/api/chapters/{chapter_id}/expand", json={"text": ""})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


# --------------------------------------------------------- 无模型错误
def test_writing_ai_without_model_readable_error(client, book):
    chapter_id = _make_chapter(client, book)
    for path, payload in (
        (f"/api/chapters/{chapter_id}/plot-directions", {}),
        (f"/api/chapters/{chapter_id}/proofread", {}),
        (f"/api/chapters/{chapter_id}/continue", {}),
    ):
        resp = client.post(path, json=payload)
        assert resp.status_code == 400, f"{path} -> {resp.status_code}"
        err = resp.json()["error"]
        assert err["code"] == "LLM_NOT_CONFIGURED"
        assert err["message"]
        assert "Traceback" not in resp.text


# ------------------------------------------------------- 一致性审校 SSE
def test_consistency_stream_emits_frames_and_dedups_across_rounds(client, book, fake_llm):
    """两轮审校：分块轮报 A/B，全局轮重复 A 并新报 C → 去重后应为 3 条。"""
    _add_provider(client)
    _make_chapter(client, book, content="<p>陈默说他从没拿过钥匙。</p>")

    conflict_a = {
        "severity": "high",
        "chapters": [1, 8],
        "subject": "陈默",
        "conflict": "第 8 章他持有钥匙，第 1 章说没拿过",
        "evidence": "第1章『从没拿过』 vs 第8章『他摸出钥匙』",
    }
    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps(
                    {
                        "conflicts": [
                            conflict_a,
                            {
                                "severity": "瞎写",
                                "chapters": ["x", 3],
                                "subject": "时间线",
                                "conflict": "年份前后矛盾",
                            },
                        ]
                    },
                    ensure_ascii=False,
                ),
                # 全局轮：A 又来一遍（应被去重）+ 新增 C
                json.dumps(
                    {
                        "conflicts": [
                            conflict_a,
                            {
                                "severity": "low",
                                "chapters": [2],
                                "subject": "外貌",
                                "conflict": "称呼不一致",
                            },
                        ]
                    },
                    ensure_ascii=False,
                ),
            ]
        )
    )

    resp = client.post(f"/api/books/{book}/audit/consistency/stream", json={"scope": "1"})
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("text/event-stream")

    frames = _sse_frames(resp.text)
    events = [e for e, _ in frames]
    assert events.count("progress") >= 1
    assert events[-1] == "done"

    conflicts = [d for e, d in frames if e == "conflict"]
    assert len(conflicts) == 3, conflicts  # A 被去重
    by_subject = {c["subject"]: c for c in conflicts}
    assert by_subject["陈默"]["severity"] == "high"
    assert by_subject["时间线"]["severity"] == "medium"  # 非法枚举归一
    assert by_subject["时间线"]["chapters"] == [3]  # 非法章节号被丢掉
    assert by_subject["外貌"]["severity"] == "low"

    done = [d for e, d in frames if e == "done"][0]
    assert done["total"] == 3
    assert done["high"] == 1 and done["medium"] == 1 and done["low"] == 1
    assert done["reviewed"] == 1  # scope=1 只审 1 章


def test_consistency_without_model_returns_json_not_broken_stream(client, book):
    """未配模型必须在**开流之前**拒掉 —— 否则前端只会看到"莫名断掉的流"。"""
    _make_chapter(client, book)
    resp = client.post(f"/api/books/{book}/audit/consistency/stream", json={"scope": "1"})
    assert resp.status_code == 400
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json()["error"]["code"] == "LLM_NOT_CONFIGURED"
    assert "Traceback" not in resp.text


def test_consistency_unknown_book_is_not_found(client, fake_llm):
    _add_provider(client)
    fake_llm(FakeLLMClient(chat_responses=[json.dumps({"conflicts": []})]))
    resp = client.post("/api/books/不存在的书/audit/consistency/stream", json={})
    assert resp.status_code == 404
