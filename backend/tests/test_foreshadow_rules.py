"""伏笔台账约束：每章新增上限（解析层硬裁剪）+ 重要度分档默认 + 召回注入上限。

背景：M2 真跑 20 章后 foreshadow 累积 114 条 / open 60 条 —— 章末回写每章抛 4~10 条
且默认全 accepted。未回收伏笔过多会稀释写前召回的提示价值。本文件锁定三项约束。
"""

from __future__ import annotations

import json

from app.db.registry import get_registry
from app.services import foreshadow_rules
from tests.fakes import FakeLLMClient


def _add_content_provider(client) -> None:
    resp = client.post(
        "/api/providers",
        json={"provider": "ollama", "model": "fake-model", "task_role": "content"},
    )
    assert resp.status_code == 201, resp.text


def _count(book: str, table: str) -> int:
    with get_registry().database(book).connection() as conn:
        return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])


def _finalize(client, book: str, payload: dict) -> dict:
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "回写章"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "张三握剑而立。"})
    resp = client.post(f"/api/chapters/{ch['id']}/finalize")
    assert resp.status_code == 200, resp.text
    return resp.json()


# --------------------------------------------------------- ① 裁剪生效（low 优先丢）
def test_new_foreshadows_trimmed_to_limit_low_dropped_first(client, book, fake_llm):
    """模型返回 8 条 → 最终 ≤ 上限，且被丢弃的是 low 优先。"""
    _add_content_provider(client)
    eight = [
        {"title": "L1", "importance": "low"},
        {"title": "H1", "importance": "high"},
        {"title": "L2", "importance": "low"},
        {"title": "M1", "importance": "medium"},
        {"title": "L3", "importance": "low"},
        {"title": "H2", "importance": "high"},
        {"title": "M2", "importance": "medium"},
        {"title": "L4", "importance": "low"},
    ]
    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps(
                    {"chapter_summary": "略", "new_foreshadows": eight,
                     "closed_foreshadow_ids": []},
                    ensure_ascii=False,
                )
            ]
        )
    )

    body = _finalize(client, book, {})
    fs = body["new_foreshadows"]
    assert foreshadow_rules.MAX_NEW_FORESHADOWS_PER_CHAPTER == 3
    assert len(fs) == 3, f"应裁剪到上限 3，实得 {len(fs)}"
    # 保留最高优先的 3 条（2 high + 1 medium），保持原顺序
    assert [f["title"] for f in fs] == ["H1", "M1", "H2"]
    assert all(f["importance"] in ("high", "medium") for f in fs)
    assert not any(f["title"].startswith("L") for f in fs), "低重要度必须优先被丢弃"


def test_confirm_also_hard_caps_new_foreshadows(client, book):
    """硬兜底：绕过 finalize 直接 confirm 传入 5 条，落库仍 ≤ 上限。"""
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "直传章"}).json()
    payload = {
        "chapter_summary": "略",
        "new_foreshadows": [
            {"title": f"N{i}", "importance": "high", "accepted": True} for i in range(5)
        ],
        "closed_foreshadow_ids": [],
    }
    result = client.post(f"/api/chapters/{ch['id']}/finalize/confirm", json=payload).json()
    assert result["foreshadows_created"] == foreshadow_rules.MAX_NEW_FORESHADOWS_PER_CHAPTER
    assert _count(book, "foreshadow") == foreshadow_rules.MAX_NEW_FORESHADOWS_PER_CHAPTER


# --------------------------------------------------------- ② 默认分档（low 默认 false）
def test_accepted_default_by_importance(client, book, fake_llm):
    """后端给出权威默认：high/medium=true，low=false。"""
    _add_content_provider(client)
    three = [
        {"title": "H", "importance": "high"},
        {"title": "M", "importance": "medium"},
        {"title": "L", "importance": "low"},
    ]
    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps({"new_foreshadows": three, "closed_foreshadow_ids": []},
                           ensure_ascii=False)
            ]
        )
    )

    fs = _finalize(client, book, {})["new_foreshadows"]
    assert {f["title"]: f["accepted"] for f in fs} == {"H": True, "M": True, "L": False}


# --------------------------------------------------------- ③ 召回不被淹（重要度优先）
def test_recall_caps_open_foreshadows_and_prefers_importance(client, book):
    """造 30 条未回收伏笔 → 召回只带 ≤ 上限条，且全是高重要度优先。"""
    for i in range(10):
        client.post(f"/api/books/{book}/foreshadows",
                    json={"title": f"H{i}", "importance": "high", "planted_chapter_seq": 1})
    for i in range(10):
        client.post(f"/api/books/{book}/foreshadows",
                    json={"title": f"M{i}", "importance": "medium", "planted_chapter_seq": 1})
    for i in range(10):
        client.post(f"/api/books/{book}/foreshadows",
                    json={"title": f"L{i}", "importance": "low", "planted_chapter_seq": 1})
    assert _count(book, "foreshadow") == 30

    ch = client.post(f"/api/books/{book}/chapters", json={"title": "召回章"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "张三独自前行。"})

    body = client.get(f"/api/chapters/{ch['id']}/recall").json()
    fs = body["open_foreshadows"]
    assert foreshadow_rules.MAX_RECALL_FORESHADOWS == 15
    assert len(fs) == 15, f"应截断到 {foreshadow_rules.MAX_RECALL_FORESHADOWS}，实得 {len(fs)}"
    assert all(f["importance"] != "low" for f in fs), "高/中优先，低不进召回"
    assert [f["importance"] for f in fs[:10]] == ["high"] * 10


def test_foreshadows_list_supports_open_filter(client, book):
    """③ 前置确认：台账列表能按 status=open 取（默认即 open）。"""
    opened = client.post(f"/api/books/{book}/foreshadows",
                         json={"title": "开", "importance": "high"}).json()
    closed = client.post(f"/api/books/{book}/foreshadows",
                         json={"title": "闭", "importance": "low"}).json()
    assert client.patch(f"/api/foreshadows/{closed['id']}", json={"status": "closed"}).status_code == 200

    assert [x["id"] for x in client.get(f"/api/books/{book}/foreshadows").json()] == [opened["id"]]
    assert [x["id"] for x in client.get(f"/api/books/{book}/foreshadows?status=open").json()] == [opened["id"]]
    assert [x["id"] for x in client.get(f"/api/books/{book}/foreshadows?status=closed").json()] == [closed["id"]]


# ------------------------------------------------------------------ 裁剪算法单测
def test_keep_top_by_importance_prefers_high_then_medium():
    items = [{"i": "low"}, {"i": "medium"}, {"i": "high"}, {"i": "low"}, {"i": "medium"}]
    kept, dropped = foreshadow_rules.keep_top_by_importance(items, lambda x: x["i"], 3)
    assert [x["i"] for x in kept] == ["medium", "high", "medium"]
    assert dropped == 2


def test_keep_top_no_trim_when_within_limit():
    items = [{"i": "low"}, {"i": "high"}]
    kept, dropped = foreshadow_rules.keep_top_by_importance(items, lambda x: x["i"], 3)
    assert kept == items and dropped == 0
