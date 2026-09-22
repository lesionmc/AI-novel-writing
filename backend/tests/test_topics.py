"""选题助手（R0）：题材库读取（纯本地）+ 选题建议（模型，同步、不落库）。"""

from __future__ import annotations

import json

from app.config import settings
from app.services import workspace
from tests.fakes import FakeLLMClient

GENRES_FILE = "genres.json"

REAL_META = {"version": "test", "purpose": "单测用"}

SAMPLE_GENRES = [
    {
        "name": "传统玄幻",
        "category": "玄幻仙侠",
        "heat": 95,
        "competition": 95,
        "blue_ocean_score": 4,
        "core_experience": "变强、等级攀升",
        "typical_tropes": ["废材逆袭", "家族争斗"],
        "benchmarks": [],
    },
    {
        "name": "民俗志怪",
        "category": "悬疑灵异",
        "heat": 55,
        "competition": 20,
        "blue_ocean_score": 44,
        "core_experience": "本土怪谈",
        "typical_tropes": ["地方禁忌"],
        "benchmarks": ["对标书A", "对标书B"],
    },
]


def _write_genres(payload: object) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    (settings.data_dir / GENRES_FILE).write_text(text, encoding="utf-8")


def _add_provider(client) -> None:
    resp = client.post(
        "/api/providers", json={"provider": "ollama", "model": "fake-model"}
    )
    assert resp.status_code == 201, resp.text


def _advice_body(**overrides) -> dict:
    body = {"favorite_genres": ["玄幻"], "unique_background": "做过五年外贸", "daily_words": 4000}
    body.update(overrides)
    return body


# ------------------------------------------------------------------ genres
def test_genres_reads_real_file(client):
    _write_genres({"_meta": REAL_META, "genres": SAMPLE_GENRES})
    resp = client.get("/api/topics/genres")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["note"] is None
    assert [g["name"] for g in body["genres"]] == ["传统玄幻", "民俗志怪"]
    assert body["genres"][1]["blue_ocean_score"] == 44
    assert body["genres"][1]["benchmarks"] == ["对标书A", "对标书B"]


def test_genres_missing_file_returns_empty_with_note(client):
    """文件缺失 → 空数组 + 可读提示，**不报错**（对齐 11 §5「入口不隐藏」）。"""
    resp = client.get("/api/topics/genres")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["genres"] == []
    assert body["note"] and GENRES_FILE in body["note"]


def test_genres_broken_file_returns_empty_with_note(client):
    _write_genres("{ 这不是合法 JSON")
    resp = client.get("/api/topics/genres")
    assert resp.status_code == 200
    assert resp.json()["genres"] == []
    assert resp.json()["note"]
    assert "Traceback" not in resp.text


def test_genres_skips_malformed_entries_keeps_good_ones(client):
    _write_genres(
        {
            "genres": [
                SAMPLE_GENRES[0],
                {"no_name": True},
                "这一条根本不是对象",
                {"name": "半条数据", "heat": "heat 不是数字"},
            ]
        }
    )
    body = client.get("/api/topics/genres").json()
    assert [g["name"] for g in body["genres"]] == ["传统玄幻"]


# ------------------------------------------------------------------ advice
def test_advice_injects_real_genre_data(client, book, fake_llm):
    """核心约束：注入的是题材库**全文真实数据**，不是摘要 —— 否则模型会编数字。"""
    _write_genres({"_meta": REAL_META, "genres": SAMPLE_GENRES})
    _add_provider(client)
    fake = FakeLLMClient(
        chat_responses=[
            json.dumps(
                {
                    "recommendations": [
                        {
                            "niche": "民俗志怪 × 无限流",
                            "reason": "蓝海指数 44，竞争仅 20",
                            "benchmarks": ["书1", "书2", "书3"],
                            "sample_premise": "一句话卖点",
                        }
                    ],
                    "avoid": [{"direction": "传统玄幻", "reason": "竞争 95，新人难签"}],
                },
                ensure_ascii=False,
            )
        ]
    )
    fake_llm(fake)

    resp = client.post("/api/topics/advice", json=_advice_body())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["recommendations"][0]["niche"] == "民俗志怪 × 无限流"
    assert body["avoid"][0]["direction"] == "传统玄幻"

    prompt = fake.chat_calls[0][0]["content"]
    # 1) 真有提示词模板（不是自己拼字符串）
    assert "题材库数据（这是真实数据，不要编造）" in prompt
    # 2) 真注入了全部题材与全部字段
    assert "传统玄幻" in prompt and "民俗志怪" in prompt
    assert '"heat": 95' in prompt
    assert '"blue_ocean_score": 44' in prompt
    assert "对标书A" in prompt
    # 3) 四问变量也进去了
    assert "玄幻" in prompt and "做过五年外贸" in prompt and "4000" in prompt


def test_advice_finds_model_by_scanning_when_no_active_book(client, book, fake_llm):
    """选题发生在建作品之前，没有「当前作品」指针也要能找到已配好的模型。"""
    _write_genres({"_meta": REAL_META, "genres": SAMPLE_GENRES})
    _add_provider(client)
    workspace.reset_active_for_tests()
    fake_llm(
        FakeLLMClient(
            chat_responses=[
                json.dumps({"recommendations": [{"niche": "x", "reason": "y"}]})
            ]
        )
    )
    resp = client.post("/api/topics/advice", json=_advice_body())
    assert resp.status_code == 200, resp.text
    assert resp.json()["recommendations"][0]["niche"] == "x"


def test_advice_without_genre_file_marks_data_unavailable(client, book, fake_llm):
    """没有题材库时不编数字：提示词里改成「数据不足、不要编造」的明确指令。"""
    _add_provider(client)
    fake = FakeLLMClient(
        chat_responses=[json.dumps({"recommendations": [{"niche": "x", "reason": "y"}]})]
    )
    fake_llm(fake)
    resp = client.post("/api/topics/advice", json=_advice_body())
    assert resp.status_code == 200, resp.text
    prompt = fake.chat_calls[0][0]["content"]
    assert "不要编造任何数字" in prompt


def test_advice_without_model_readable_error(client):
    _write_genres({"_meta": REAL_META, "genres": SAMPLE_GENRES})
    resp = client.post("/api/topics/advice", json=_advice_body())
    assert resp.status_code == 400
    err = resp.json()["error"]
    assert err["code"] == "LLM_NOT_CONFIGURED"
    assert err["message"]
    assert "Traceback" not in resp.text


def test_advice_requires_at_least_one_genre(client):
    resp = client.post("/api/topics/advice", json={"favorite_genres": []})
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_advice_parse_failure_is_readable(client, book, fake_llm):
    _write_genres({"_meta": REAL_META, "genres": SAMPLE_GENRES})
    _add_provider(client)
    fake_llm(FakeLLMClient(chat_responses=["不是 JSON", "仍然不是 JSON"]))
    resp = client.post("/api/topics/advice", json=_advice_body())
    assert resp.status_code == 400
    err = resp.json()["error"]
    assert err["code"] == "JSON_PARSE_FAILED"
    assert err["detail"]["raw_ai_output"] == "仍然不是 JSON"
    assert "Traceback" not in resp.text
