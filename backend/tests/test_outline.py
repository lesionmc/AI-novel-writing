"""步骤 10：三级大纲（R7）——树 CRUD + AI 展开（只出候选，不落库）。"""

from __future__ import annotations

import json

from tests.fakes import FakeLLMClient


def _add_outline_provider(client) -> dict:
    resp = client.post(
        "/api/providers",
        json={"provider": "ollama", "model": "fake-model", "task_role": "outline"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ------------------------------------------------------------------- 树 CRUD
def test_delete_chapter_detaches_outline_node(client, book):
    """T-C 回归：删章不得在大纲里留下指向已删章节的孤儿。

    `outline.chapter_id` 在 schema 里**没有**外键约束，删章不会自动 SET NULL，
    必须由删章逻辑在同一事务内显式解绑；节点行本身要保留（章节卡内容仍有价值）。
    """
    chapter = client.post(f"/api/books/{book}/chapters", json={"title": "第1章"}).json()
    node = client.post(
        f"/api/books/{book}/outlines",
        json={
            "level": "chapter",
            "title": "第一章卡",
            "content": "主角觉醒",
            "chapter_id": chapter["id"],
        },
    ).json()
    assert node["chapter_id"] == chapter["id"]

    assert client.delete(f"/api/chapters/{chapter['id']}").status_code == 204

    kept = [
        n
        for n in client.get(f"/api/books/{book}/outlines").json()
        if n["id"] == node["id"]
    ]
    assert kept, "大纲行必须保留（只是解绑，不是删除）"
    assert kept[0]["chapter_id"] is None
    assert kept[0]["content"] == "主角觉醒"


def test_outline_crud_hierarchy(client, book):
    total = client.post(
        f"/api/books/{book}/outlines",
        json={"level": "total", "title": "总纲", "content": "一句话卖点"},
    ).json()
    volume = client.post(
        f"/api/books/{book}/outlines",
        json={"level": "volume", "parent_id": total["id"], "title": "第一卷"},
    ).json()
    chapter = client.post(
        f"/api/books/{book}/outlines",
        json={
            "level": "chapter",
            "parent_id": volume["id"],
            "title": "第一章",
            "content": "主角觉醒",
        },
    ).json()

    assert total["seq"] == 1 and volume["seq"] == 1 and chapter["seq"] == 1
    assert chapter["parent_id"] == volume["id"]

    volumes = client.get(f"/api/books/{book}/outlines", params={"level": "volume"}).json()
    assert [v["id"] for v in volumes] == [volume["id"]]
    children = client.get(
        f"/api/books/{book}/outlines", params={"parent_id": volume["id"]}
    ).json()
    assert [c["id"] for c in children] == [chapter["id"]]

    # 部分更新：只改标题
    updated = client.patch(
        f"/api/outlines/{chapter['id']}", json={"title": "第一章（改）"}
    ).json()
    assert updated["title"] == "第一章（改）"
    assert updated["content"] == "主角觉醒"

    assert client.delete(f"/api/outlines/{chapter['id']}").status_code == 204
    assert client.patch(
        f"/api/outlines/{chapter['id']}", json={"title": "x"}
    ).status_code == 404


# --------------------------------------------------------------- AI 展开（候选）
def test_outline_expand_returns_candidates_without_persisting(client, book, fake_llm):
    _add_outline_provider(client)
    total = client.post(
        f"/api/books/{book}/outlines",
        json={"level": "total", "title": "总纲", "content": "修仙复仇"},
    ).json()
    candidates = {
        "candidates": [
            {"title": "第一卷 觉醒", "content": "主角血脉苏醒", "seq": 1, "rationale": "开篇"},
            {"title": "第二卷 入世", "content": "踏入宗门", "seq": 2},
        ]
    }
    fake_llm(FakeLLMClient(chat_responses=[json.dumps(candidates, ensure_ascii=False)]))

    resp = client.post(
        f"/api/outlines/{total['id']}/expand",
        json={"expand_level": "volume", "count": 2},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["parent_id"] == total["id"]
    assert body["expand_level"] == "volume"
    assert [c["title"] for c in body["candidates"]] == ["第一卷 觉醒", "第二卷 入世"]
    assert body["raw_ai_output"]

    # 只出候选：不落库（大纲总数仍只有总纲 1 条）
    all_nodes = client.get(f"/api/books/{book}/outlines").json()
    assert [n["id"] for n in all_nodes] == [total["id"]]


def test_outline_expand_rejects_wrong_parent_level(client, book, fake_llm):
    _add_outline_provider(client)
    total = client.post(
        f"/api/books/{book}/outlines", json={"level": "total", "title": "总纲"}
    ).json()
    fake_llm(FakeLLMClient(chat_responses=["[]"]))
    resp = client.post(
        f"/api/outlines/{total['id']}/expand", json={"expand_level": "chapter"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_outline_expand_without_model_typed_error(client, book):
    total = client.post(
        f"/api/books/{book}/outlines", json={"level": "total", "title": "总纲"}
    ).json()
    resp = client.post(
        f"/api/outlines/{total['id']}/expand", json={"expand_level": "volume"}
    )
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "LLM_NOT_CONFIGURED"


def test_outline_expand_parse_failure_readable(client, book, fake_llm):
    _add_outline_provider(client)
    total = client.post(
        f"/api/books/{book}/outlines", json={"level": "total", "title": "总纲"}
    ).json()
    fake_llm(FakeLLMClient(chat_responses=["不是 JSON", "仍然不是 JSON"]))
    resp = client.post(
        f"/api/outlines/{total['id']}/expand", json={"expand_level": "volume"}
    )
    assert resp.status_code == 400
    err = resp.json()["error"]
    assert err["code"] == "JSON_PARSE_FAILED"
    assert "Traceback" not in resp.text
    assert err["detail"]["raw_ai_output"] == "仍然不是 JSON"


# ------------------------------------------------------------- 汇总本卷（记忆金字塔）
def test_summarize_volume_writes_marked_section(client, book, fake_llm):
    import json as _json

    from tests.fakes import FakeLLMClient

    client.post("/api/providers", json={"provider": "ollama", "model": "fake-model"})
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "第一章"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "陈默进了老楼。"})
    client.post(
        f"/api/chapters/{ch['id']}/finalize/confirm",
        json={"chapter_summary": "陈默深夜进入空置两年的老楼。", "character_states": []},
    )
    vol = client.post(
        f"/api/books/{book}/outlines", json={"level": "volume", "title": "第一卷·楼影"}
    ).json()
    client.post(
        f"/api/books/{book}/outlines",
        json={"level": "chapter", "title": "第一章", "parent_id": vol["id"], "chapter_id": ch["id"]},
    )

    fake_llm(
        FakeLLMClient(
            chat_responses=[_json.dumps({"summary": "陈默夜探老楼，发现楼内有人活动。"}, ensure_ascii=False)]
        )
    )
    resp = client.post(f"/api/outlines/{vol['id']}/summarize-volume")
    assert resp.status_code == 200, resp.text
    assert "夜探老楼" in resp.json()["summary"]

    node = next(o for o in client.get(f"/api/books/{book}/outlines").json() if o["id"] == vol["id"])
    assert "【本卷摘要】" in node["content"] and "陈默夜探老楼" in node["content"]
    assert "【本卷摘要完】" in node["content"]

    # 用户在摘要后面补了卷末备注 —— 重跑只替换标记对内，备注必须活着
    client.patch(f"/api/outlines/{vol['id']}", json={"content": node["content"] + "\n备注：第三卷要回收楼里的钟。"})
    fake_llm(
        FakeLLMClient(
            chat_responses=[_json.dumps({"summary": "（修订版）陈默夜探老楼。"}, ensure_ascii=False)]
        )
    )
    assert client.post(f"/api/outlines/{vol['id']}/summarize-volume").status_code == 200
    node = next(o for o in client.get(f"/api/books/{book}/outlines").json() if o["id"] == vol["id"])
    assert node["content"].count("【本卷摘要】") == 1
    assert "修订版" in node["content"] and "陈默夜探老楼，发现" not in node["content"]
    assert "第三卷要回收楼里的钟" in node["content"]


def test_summarize_volume_rejects_non_string_summary(client, book, fake_llm):
    """模型把 summary 给成数组 → 不能把 Python repr 写进用户卷纲（审查发现的坑）。"""
    import json as _json

    from tests.fakes import FakeLLMClient

    client.post("/api/providers", json={"provider": "ollama", "model": "fake-model"})
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "第一章"}).json()
    client.post(
        f"/api/chapters/{ch['id']}/finalize/confirm",
        json={"chapter_summary": "摘要内容。", "character_states": []},
    )
    vol = client.post(f"/api/books/{book}/outlines", json={"level": "volume", "title": "卷一"}).json()
    client.post(
        f"/api/books/{book}/outlines",
        json={"level": "chapter", "parent_id": vol["id"], "chapter_id": ch["id"]},
    )
    fake_llm(FakeLLMClient(chat_responses=[_json.dumps({"summary": ["要点一", "要点二"]})]))
    resp = client.post(f"/api/outlines/{vol['id']}/summarize-volume")
    assert resp.status_code == 400
    node = next(o for o in client.get(f"/api/books/{book}/outlines").json() if o["id"] == vol["id"])
    assert "【本卷摘要】" not in (node.get("content") or "")


def test_summarize_volume_rejects_non_volume_and_empty(client, book, fake_llm):
    client.post("/api/providers", json={"provider": "ollama", "model": "fake-model"})
    total = client.post(f"/api/books/{book}/outlines", json={"level": "total", "title": "总纲"}).json()
    assert client.post(f"/api/outlines/{total['id']}/summarize-volume").status_code == 400
    vol = client.post(f"/api/books/{book}/outlines", json={"level": "volume", "title": "空卷"}).json()
    bad = client.post(f"/api/outlines/{vol['id']}/summarize-volume")
    assert bad.status_code == 400
    assert "还没有" in bad.json()["error"]["message"]
