"""步骤 8-9：章末回写建议（JSON 解析容错）与落库单事务（R3，TC-24/26/27）。

定向单测覆盖：
  · 角色状态的 chapter_seq <= N 增量取值
  · 回写事务回滚（all-or-nothing）
  · JSON 解析容错（剥离围栏 / 重试一次 / 失败可读报错且不落库）
"""

from __future__ import annotations

import json

import pytest

from app.db.registry import get_registry
from app.models.memory import WritebackSuggestion
from app.repositories import memory_repo, writing_log_repo
from app.services import memory_service
from tests.fakes import FakeLLMClient

_VALID = {
    "chapter_summary": "张三在洞府血脉觉醒",
    "character_updates": [
        {"name": "张三", "state": "刚觉醒，血脉不稳", "reason": "触碰玉佩"}
    ],
    "plot_progress": [{"arc": "血脉觉醒线", "progress": "首次觉醒"}],
    "new_foreshadows": [{"title": "神秘玉佩", "importance": "high"}],
    "closed_foreshadow_ids": [],
    "hook": "玉佩在子夜自行发光",
}


def _add_provider(client, role: str = "content") -> dict:
    resp = client.post(
        "/api/providers",
        json={"provider": "ollama", "model": "fake-model", "task_role": role},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _setup_story(client, book: str) -> dict:
    client.post(f"/api/books/{book}/characters", json={"name": "张三", "role": "protagonist"})
    client.post(f"/api/books/{book}/characters", json={"name": "李四", "role": "supporting"})
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "第一章"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "张三握剑而立。李四在旁。"})
    return ch


def _count(book: str, table: str, where: str = "") -> int:
    registry = get_registry()
    with registry.database(book).connection() as conn:
        sql = f"SELECT COUNT(*) FROM {table}" + (f" WHERE {where}" if where else "")
        return int(conn.execute(sql).fetchone()[0])


# ----------------------------------------------------------- finalize: JSON 容错
def test_finalize_parses_plain_json(client, book, fake_llm):
    _add_provider(client)
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "第一章"}).json()
    fake_llm(FakeLLMClient(chat_responses=[json.dumps(_VALID, ensure_ascii=False)]))

    resp = client.post(f"/api/chapters/{ch['id']}/finalize")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["chapter_summary"] == _VALID["chapter_summary"]
    assert body["character_updates"][0]["name"] == "张三"
    assert body["new_foreshadows"][0]["importance"] == "high"
    assert body["raw_ai_output"]


def test_finalize_tolerates_fenced_json(client, book, fake_llm):
    _add_provider(client)
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "围栏"}).json()
    fenced = "这是结果：\n```json\n" + json.dumps(_VALID, ensure_ascii=False) + "\n```\n以上。"
    fake_llm(FakeLLMClient(chat_responses=[fenced]))

    resp = client.post(f"/api/chapters/{ch['id']}/finalize")
    assert resp.status_code == 200, resp.text
    assert resp.json()["chapter_summary"] == _VALID["chapter_summary"]


def test_finalize_retries_once_then_succeeds(client, book, fake_llm):
    _add_provider(client)
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "重试"}).json()
    fake = fake_llm(
        FakeLLMClient(chat_responses=["好的，这是回写结果（非 JSON）", json.dumps(_VALID)])
    )

    resp = client.post(f"/api/chapters/{ch['id']}/finalize")
    assert resp.status_code == 200, resp.text
    assert len(fake.chat_calls) == 2, "首次解析失败必须自动重试一次"


def test_finalize_parse_failure_returns_readable_error_without_db_write(
    client, book, fake_llm
):
    _add_provider(client)
    ch = client.post(f"/api/books/{book}/chapters", json={"title": "坏输出"}).json()
    client.patch(f"/api/chapters/{ch['id']}", json={"content": "张三出剑。"})
    bad = "抱歉，我无法按要求返回 JSON"
    fake_llm(FakeLLMClient(chat_responses=[bad, bad]))

    resp = client.post(f"/api/chapters/{ch['id']}/finalize")
    assert resp.status_code == 400, resp.text
    err = resp.json()["error"]
    assert err["code"] == "JSON_PARSE_FAILED"
    assert "Traceback" not in resp.text
    assert err["detail"]["raw_ai_output"] == bad, "须回传模型原始输出以便排查"
    # 解析失败绝不写库
    assert client.get(f"/api/chapters/{ch['id']}").json()["status"] == "draft"
    assert _count(book, "character_state") == 0
    assert _count(book, "foreshadow") == 0


# --------------------------------------------------------------- confirm: 落库
def test_confirm_writeback_persists_all_blocks(client, book):
    ch = _setup_story(client, book)
    payload = {
        "chapter_summary": "张三觉醒",
        "character_updates": [{"name": "张三", "state": "觉醒期", "accepted": True}],
        "plot_progress": [{"arc": "成长线", "progress": "首次突破", "accepted": True}],
        "new_foreshadows": [{"title": "神秘玉佩", "importance": "high", "accepted": True}],
        "closed_foreshadow_ids": [],
        "hook": "玉佩发光",
    }
    resp = client.post(f"/api/chapters/{ch['id']}/finalize/confirm", json=payload)
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["character_states_written"] == 1
    assert result["plot_arcs_updated"] == 1
    assert result["foreshadows_created"] == 1
    assert result["chunks_indexed"] >= 1

    detail = client.get(f"/api/chapters/{ch['id']}").json()
    assert detail["status"] == "done"
    assert detail["chapter_summary"] == "张三觉醒"
    assert detail["hook"] == "玉佩发光"

    states = client.get(f"/api/books/{book}/memory/character-states").json()
    assert {s["name"]: s["state"] for s in states} == {"张三": "觉醒期"}


def test_confirm_incremental_state_skips_when_unchanged(client, book):
    ch = _setup_story(client, book)
    payload = {
        "chapter_summary": "觉醒",
        "character_updates": [{"name": "张三", "state": "觉醒期"}],
        "closed_foreshadow_ids": [],
    }
    first = client.post(f"/api/chapters/{ch['id']}/finalize/confirm", json=payload).json()
    assert first["character_states_written"] == 1
    # 状态未变化：增量存储不重复写
    second = client.post(f"/api/chapters/{ch['id']}/finalize/confirm", json=payload).json()
    assert second["character_states_written"] == 0
    assert _count(book, "character_state") == 1


def test_confirm_respects_per_item_confirmation(client, book):
    """红线 2：章末回写逐项手动确认，未勾选项概不落库。"""
    ch = _setup_story(client, book)
    payload = {
        "chapter_summary": "略",
        "character_updates": [{"name": "张三", "state": "X", "accepted": False}],
        "plot_progress": [{"arc": "线", "progress": "进展", "accepted": False}],
        "new_foreshadows": [{"title": "被否的伏笔", "accepted": False}],
        "closed_foreshadow_ids": [],
    }
    result = client.post(f"/api/chapters/{ch['id']}/finalize/confirm", json=payload).json()
    assert result["character_states_written"] == 0
    assert result["plot_arcs_updated"] == 0
    assert result["foreshadows_created"] == 0
    assert _count(book, "character_state") == 0
    assert _count(book, "foreshadow") == 0


def test_confirm_closes_recycled_foreshadow(client, book):
    ch = _setup_story(client, book)
    fs = client.post(
        f"/api/books/{book}/foreshadows",
        json={"title": "待回收伏笔", "importance": "high", "planted_chapter_seq": 1},
    ).json()
    payload = {
        "chapter_summary": "回收",
        "closed_foreshadow_ids": [fs["id"]],
    }
    result = client.post(f"/api/chapters/{ch['id']}/finalize/confirm", json=payload).json()
    assert result["foreshadows_closed"] == 1
    opens = client.get(f"/api/books/{book}/foreshadows", params={"status": "closed"}).json()
    assert [f["id"] for f in opens] == [fs["id"]]


def test_writeback_transaction_rolls_back_on_failure(client, book, monkeypatch):
    """TC-26：8 步单事务，中途失败必须全部回滚。"""
    ch = _setup_story(client, book)

    def _boom(*_args, **_kwargs):
        raise RuntimeError("模拟落库最后一步失败")

    monkeypatch.setattr(writing_log_repo, "increment_finalized", _boom)

    suggestion = WritebackSuggestion(
        chapter_summary="会被回滚",
        character_updates=[{"name": "张三", "state": "觉醒期"}],
        new_foreshadows=[{"title": "会被回滚的伏笔", "importance": "high"}],
    )
    with pytest.raises(RuntimeError):
        memory_service.confirm_chapter(book, ch["id"], suggestion)

    # 全部回滚：状态、记忆、分块、自动快照均无残留
    assert _count(book, "character_state") == 0
    assert _count(book, "foreshadow") == 0
    assert _count(book, "chunk_meta") == 0
    assert _count(book, "chapter_version") == 0
    detail = client.get(f"/api/chapters/{ch['id']}").json()
    assert detail["status"] == "draft"


# ---------------------------------------------- 角色状态增量读取（chapter_seq <= N）
def test_character_state_incremental_read_le_n(client, book):
    client.post(f"/api/books/{book}/characters", json={"name": "甲", "role": "protagonist"})
    registry = get_registry()
    with registry.database(book).connection() as conn:
        char_id = int(conn.execute("SELECT id FROM character WHERE name='甲'").fetchone()[0])
        for seq, state in ((1, "状态一"), (3, "状态三"), (5, "状态五")):
            memory_repo.insert_state(
                conn, character_id=char_id, chapter_seq=seq, state=state,
                source="manual", now="2026-01-01T00:00:00",
            )
        conn.commit()
        assert memory_repo.latest_state(conn, char_id, 4)["state"] == "状态三"
        assert memory_repo.latest_state(conn, char_id, 2)["state"] == "状态一"
        assert memory_repo.latest_state(conn, char_id, 5)["state"] == "状态五"
        assert memory_repo.latest_state(conn, char_id, 0) is None

    rows = client.get(
        f"/api/books/{book}/memory/character-states", params={"upto_seq": 4}
    ).json()
    assert [r["state"] for r in rows] == ["状态三"]
    latest = client.get(f"/api/books/{book}/memory/character-states").json()
    assert [r["state"] for r in latest] == ["状态五"]


def test_missing_chapter_finalize_typed_error(client, book):
    resp = client.post("/api/chapters/99999/finalize")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "CHAPTER_NOT_FOUND"
