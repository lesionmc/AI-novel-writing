"""AI 对话式建设定：只出草稿、绝不写库；done/draft 分支；无模型可读错误。"""

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


def _setting_counts(book: str) -> tuple[int, int]:
    """设定库里的人物数 / 词条数（用于断言「绝不写库」）。"""
    path = settings.books_dir / book / "novel.db"
    conn = sqlite3.connect(path)
    try:
        chars = conn.execute("SELECT COUNT(*) FROM character").fetchone()[0]
        worlds = conn.execute("SELECT COUNT(*) FROM world_entry").fetchone()[0]
    finally:
        conn.close()
    return chars, worlds


def _chat(client, messages, book_context=None):
    payload: dict = {"messages": messages}
    if book_context is not None:
        payload["book_context"] = book_context
    return client.post("/api/ai/setup-chat", json=payload)


# ------------------------------------------------------------- 对话中（提问）
def test_setup_chat_asks_next_question(client, book, fake_llm):
    _add_provider(client)
    fake = FakeLLMClient(
        chat_responses=[
            json.dumps(
                {"reply": "这本书大概讲什么？一句话就行。", "done": False, "draft": None},
                ensure_ascii=False,
            )
        ]
    )
    fake_llm(fake)

    resp = _chat(
        client,
        [{"role": "user", "content": "我想写个玄幻"}],
        {"title": "断剑", "genre": "玄幻"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["done"] is False
    assert body["draft"] is None
    assert body["reply"] == "这本书大概讲什么？一句话就行。"

    prompt = fake.chat_calls[0][0]["content"]
    # 提示词模板 + 书籍上下文 + 已有对话都注入了
    assert "引导式对话" in prompt
    assert "断剑" in prompt and "玄幻" in prompt
    assert "我想写个玄幻" in prompt


# ------------------------------------------------------- 汇总（done + draft）
def test_setup_chat_returns_draft_when_done_without_persisting(client, book, fake_llm):
    _add_provider(client)
    before = _setting_counts(book)
    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps(
                    {
                        "reply": "我已经整理好了，你看看要不要改。",
                        "done": True,
                        "draft": {
                            "premise": "废材少年以断剑证道",
                            "characters": [
                                {
                                    "name": "林晚",
                                    "role": "protagonist",
                                    "surface_identity": "外门杂役",
                                    "secret_desire": "想被看见",
                                    "fatal_weakness": "心软",
                                    "contradiction": "怕杀生却必须杀人",
                                    "appearance": "瘦高个",
                                    "background": "家族弃子",
                                },
                                {"name": "无名的路人", "role": "路人甲"},
                            ],
                            "world_entries": [
                                {"category": "place", "name": "断剑冢", "content": "埋剑之地"},
                                {"category": "瞎写的分类", "name": "旧约", "content": "规则"},
                            ],
                        },
                    },
                    ensure_ascii=False,
                )
            ]
        )
    )

    resp = _chat(client, [{"role": "user", "content": "你帮我整理吧"}])
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["done"] is True
    assert body["draft"]["premise"] == "废材少年以断剑证道"

    roles = {c["name"]: c["role"] for c in body["draft"]["characters"]}
    assert roles["林晚"] == "protagonist"
    assert roles["无名的路人"] == "supporting"  # 非法 role 归一到安全值
    assert body["draft"]["characters"][0]["contradiction"] == "怕杀生却必须杀人"

    cats = {w["name"]: w["category"] for w in body["draft"]["world_entries"]}
    assert cats["断剑冢"] == "place"
    assert cats["旧约"] == "other"  # 非法 category 归一到 other

    # 红线：只出草稿，不写任何库表
    assert _setting_counts(book) == before == (0, 0)


def test_setup_chat_done_without_draft_falls_back_to_continue(client, book, fake_llm):
    """模型说 done 但给不出草稿 → 不能返回 done=true+draft=null（与契约矛盾）。"""
    _add_provider(client)
    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps(
                    {"reply": "我觉得够了。", "done": True, "draft": None},
                    ensure_ascii=False,
                )
            ]
        )
    )
    body = _chat(client, [{"role": "user", "content": "好了"}]).json()
    assert body["done"] is False
    assert body["draft"] is None
    assert body["reply"] == "我觉得够了。"


def test_draft_is_accepted_by_existing_setting_endpoints(client, book, fake_llm):
    """草稿字段直接喂给已有写入端点应被接受 —— 证明枚举与字段对齐，前端可无感接线。"""
    _add_provider(client)
    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps(
                    {
                        "reply": "整理好了。",
                        "done": True,
                        "draft": {
                            "premise": "一句话卖点",
                            "characters": [
                                {
                                    "name": "林晚",
                                    "role": "protagonist",
                                    "surface_identity": "外门杂役",
                                    "secret_desire": "想被看见",
                                    "fatal_weakness": "心软",
                                    "contradiction": "怕杀生却必须杀人",
                                    "appearance": "瘦高个",
                                    "background": "家族弃子",
                                }
                            ],
                            "world_entries": [
                                {"category": "force", "name": "剑阁", "content": "旧秩序"}
                            ],
                        },
                    },
                    ensure_ascii=False,
                )
            ]
        )
    )
    draft = _chat(client, [{"role": "user", "content": "整理"}]).json()["draft"]

    # 人物：草稿直接过已有校验
    char_resp = client.post(f"/api/books/{book}/characters", json=draft["characters"][0])
    assert char_resp.status_code == 201, char_resp.text
    assert char_resp.json()["role"] == "protagonist"
    # 词条：同上
    entry_resp = client.post(f"/api/books/{book}/world-entries", json=draft["world_entries"][0])
    assert entry_resp.status_code == 201, entry_resp.text
    assert entry_resp.json()["category"] == "force"

    assert _setting_counts(book) == (1, 1)


# ------------------------------------------------------------ 错误与校验
def test_setup_chat_without_model_readable_error(client):
    resp = _chat(client, [{"role": "user", "content": "你好"}])
    assert resp.status_code == 400
    err = resp.json()["error"]
    assert err["code"] == "LLM_NOT_CONFIGURED"
    assert err["message"]
    assert "Traceback" not in resp.text


def test_setup_chat_requires_messages(client):
    resp = _chat(client, [])
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_setup_chat_parse_failure_is_readable(client, book, fake_llm):
    _add_provider(client)
    fake_llm(FakeLLMClient(chat_responses=["不是 JSON", "还是不是 JSON"]))
    resp = _chat(client, [{"role": "user", "content": "你好"}])
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "JSON_PARSE_FAILED"
    assert "Traceback" not in resp.text
