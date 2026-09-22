"""步骤 9：写前召回（R4）——结构化优先 + 语义补充，两路合并去重，预算截断。

定向单测覆盖：
  · 两路召回合并去重
  · 未配模型时结构化召回照常返回（红线 1/3，TC-19）
  · 预算 4000 字硬截断
  · recall_log 记录 structured_hits / semantic_hits
"""

from __future__ import annotations

import json

from app.config import settings
from tests.fakes import FakeLLMClient, constant_vector

_SENT = "张三走进洞府，发现了一块神秘玉佩。"


def _add_provider(client, role: str) -> dict:
    resp = client.post(
        "/api/providers",
        json={"provider": "ollama", "model": "fake-model", "task_role": role},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _index_chapter(client, book: str, content: str) -> None:
    """建章 → 回写确认（触发分块索引），回写内容留空即可。"""
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "素材章"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": content})
    resp = client.post(
        f"/api/chapters/{ch['id']}/finalize/confirm",
        json={"chapter_summary": content[:20], "closed_foreshadow_ids": []},
    )
    assert resp.status_code == 200, resp.text


# ------------------------------------------------------------------ 两路合并去重
def test_recall_merges_and_dedupes_two_paths(client, book, fake_llm):
    _add_provider(client, "content")
    _add_provider(client, "embedding")
    client.post(f"/api/books/{book}/characters", json={"name": "张三", "role": "protagonist"})
    client.post(
        f"/api/books/{book}/foreshadows",
        json={"title": "玉佩来历", "importance": "high", "planted_chapter_seq": 1},
    )

    vec = constant_vector(1.0)
    fake = FakeLLMClient(
        chat_responses=[json.dumps({"queries": ["洞府", "玉佩"]}, ensure_ascii=False)],
        embed_map={"洞府 玉佩": vec, _SENT: vec},
    )
    fake_llm(fake)

    # 两章正文完全相同 → 两片文本一致的分块，召回时须去重为 1
    _index_chapter(client, book, _SENT)
    _index_chapter(client, book, _SENT)

    target = client.post(f"/api/books/{book}/chapters", json={"title": "待写章"}).json()
    client.patch(f"/api/chapters/{target['id']}", json={"content": "张三再次回到洞府。"})

    resp = client.get(f"/api/chapters/{target['id']}/recall")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # 结构化：人物 + 未回收伏笔
    assert [c["name"] for c in body["characters"]] == ["张三"]
    assert [f["title"] for f in body["open_foreshadows"]] == ["玉佩来历"]
    # 语义：两片同文本合并去重为 1，且与查询向量高度相似
    assert len(body["recalled_chunks"]) == 1
    assert body["recalled_chunks"][0]["score"] >= 0.99
    assert body["recalled_chunks"][0]["text"] == _SENT
    assert body["budget"]["semantic_available"] is True
    assert body["budget"]["injected_chars"] <= settings.recall_budget_chars

    # recall_log 记录两路命中
    logs = client.get(f"/api/books/{book}/recall-logs").json()
    assert logs, "召回必须写 recall_log"
    assert logs[0]["structured_hits"] == 2
    assert logs[0]["semantic_hits"] == 1


# ------------------------------------------------- 未配模型：结构化召回照常返回
def test_recall_without_model_returns_structured(client, book):
    client.post(f"/api/books/{book}/characters", json={"name": "张三", "role": "protagonist"})
    client.post(
        f"/api/books/{book}/foreshadows",
        json={"title": "旧伏笔", "importance": "medium", "planted_chapter_seq": 1},
    )
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "无模型章"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "张三独自前行。"})

    resp = client.get(f"/api/chapters/{ch['id']}/recall")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # 红线 1/3：面板绝不整体空白
    assert body["characters"], "未配模型时结构化召回仍须返回人物"
    assert body["open_foreshadows"], "未配模型时结构化召回仍须返回伏笔"
    assert body["recalled_chunks"] == []
    assert body["budget"]["semantic_available"] is False

    logs = client.get(f"/api/books/{book}/recall-logs").json()
    assert logs[0]["semantic_hits"] == 0
    assert logs[0]["structured_hits"] >= 2


# ------------------------------------------------------------- 预算 4000 字硬截断
def test_recall_budget_truncates_at_4000(client, book):
    names = ["甲", "乙", "丙"]
    content = "甲、乙、丙三人到场。"
    for name in names:
        client.post(f"/api/books/{book}/characters", json={"name": name, "role": "supporting"})
    ch1 = client.post(f"/api/books/{book}/chapters", json={"title": "铺垫"}).json()
    client.patch(f"/api/chapters/{ch1['id']}", json={"content": content})
    long_state = "状态" + "长" * 2000
    payload = {
        "chapter_summary": "三人登场",
        "character_updates": [
            {"name": name, "state": long_state, "accepted": True} for name in names
        ],
        "closed_foreshadow_ids": [],
    }
    assert client.post(
        f"/api/chapters/{ch1['id']}/finalize/confirm", json=payload
    ).status_code == 200

    target = client.post(f"/api/books/{book}/chapters", json={"title": "召回目标"}).json()
    client.patch(f"/api/chapters/{target['id']}", json={"content": content})

    body = client.get(f"/api/chapters/{target['id']}/recall").json()
    assert len(body["characters"]) == 3
    assert body["budget"]["truncated"] is True
    assert body["budget"]["injected_chars"] <= settings.recall_budget_chars


def test_recall_missing_chapter_typed_error(client):
    resp = client.get("/api/chapters/99999/recall")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "CHAPTER_NOT_FOUND"
