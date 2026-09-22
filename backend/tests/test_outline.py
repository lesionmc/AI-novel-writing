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
