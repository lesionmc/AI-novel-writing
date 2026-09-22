"""模型管理补全：discover-models（拉模型列表）与 test-draft（保存前测试）。

两者均**不落库、不写密钥环**。HTTP 层用 monkeypatch 注入假响应，验证解析与错误翻译。
"""

from __future__ import annotations

from app.db.global_db import get_global_database
from app.errors import LLMRequestError
from app.services.llm import discovery


def _provider_count() -> int:
    """读**全局库**的 llm_provider 行数（模型配置已全局化）。"""
    with get_global_database().connection() as conn:
        return int(conn.execute("SELECT COUNT(*) FROM llm_provider").fetchone()[0])


# ------------------------------------------------------- discover-models 解析
def test_discover_models_parses_sorts_and_dedupes(client, monkeypatch):
    def fake(method, url, *, headers, json_body, timeout):
        assert method == "GET"
        assert url.endswith("/models")
        return 200, {"data": [{"id": "b"}, {"id": "a"}, {"id": "a"}, {"nope": 1}]}

    monkeypatch.setattr(discovery, "_request", fake)
    resp = client.post(
        "/api/providers/discover-models",
        json={
            "provider": "openrouter",
            "base_url": "https://openrouter.ai/api/v1",
            "api_key": "sk-or-x",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["models"] == ["a", "b"]
    assert body["count"] == 2
    assert body["note"] is None


def test_discover_models_ollama_uses_tags_endpoint(client, monkeypatch):
    seen = {}

    def fake(method, url, *, headers, json_body, timeout):
        seen["url"] = url
        return 200, {"models": [{"name": "qwen2.5:7b"}, {"name": "bge-m3"}]}

    monkeypatch.setattr(discovery, "_request", fake)
    resp = client.post(
        "/api/providers/discover-models",
        json={"provider": "ollama", "base_url": "http://127.0.0.1:11434"},
    )
    assert resp.status_code == 200, resp.text
    assert seen["url"].endswith("/api/tags")
    assert resp.json()["models"] == ["bge-m3", "qwen2.5:7b"]


def test_discover_models_claude_returns_note_not_error(client):
    # Claude 无公开 models 端点 → 空列表 + 提示，不报错（前端退化为手打）
    resp = client.post(
        "/api/providers/discover-models", json={"provider": "claude", "api_key": "sk-ant-x"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["models"] == []
    assert body["count"] == 0
    assert body["note"]


def test_discover_models_missing_base_url_is_readable_error(client):
    resp = client.post("/api/providers/discover-models", json={"provider": "custom-x"})
    assert resp.status_code == 502, resp.text
    err = resp.json()["error"]
    assert err["code"] == "LLM_REQUEST_FAILED"
    assert "Base URL" in err["message"]


# ---------------------------------------------------- discover-models 错误翻译
def test_discover_models_auth_failure_translated_to_chinese(client, monkeypatch):
    monkeypatch.setattr(discovery, "_request", lambda *a, **k: (401, {"error": "bad key"}))
    resp = client.post(
        "/api/providers/discover-models",
        json={"provider": "deepseek", "base_url": "https://api.deepseek.com/v1", "api_key": "bad"},
    )
    assert resp.status_code == 502, resp.text
    err = resp.json()["error"]
    assert err["code"] == "LLM_REQUEST_FAILED"
    assert "密钥无效或已过期" in err["message"]
    assert "401" not in err["message"]
    assert "Traceback" not in resp.text


def test_discover_models_connection_failure_translated(client, monkeypatch):
    def boom(*_a, **_k):
        raise LLMRequestError("无法连接到该地址，请检查 Base URL 是否正确")

    monkeypatch.setattr(discovery, "_request", boom)
    resp = client.post(
        "/api/providers/discover-models",
        json={"provider": "deepseek", "base_url": "http://127.0.0.1:1/v1", "api_key": "x"},
    )
    assert resp.status_code == 502
    assert "无法连接到该地址" in resp.json()["error"]["message"]


# ------------------------------------------- api_key 省略 → 复用密钥环已有 key
def test_discover_models_reuses_saved_key_and_writes_nothing(client, book, secrets_backend, monkeypatch):
    client.post(
        "/api/providers",
        json={
            "provider": "deepseek",
            "model": "deepseek-chat",
            "base_url": "https://api.deepseek.com/v1",
            "api_key": "sk-saved-key",
        },
    )
    before = _provider_count()
    captured = {}

    def fake(method, url, *, headers, json_body, timeout):
        captured["auth"] = headers.get("Authorization")
        return 200, {"data": [{"id": "deepseek-chat"}]}

    monkeypatch.setattr(discovery, "_request", fake)
    # 不传 api_key / base_url → 复用已保存的密钥与 base_url
    resp = client.post("/api/providers/discover-models", json={"provider": "deepseek"})
    assert resp.status_code == 200, resp.text
    assert captured["auth"] == "Bearer sk-saved-key"
    assert resp.json()["models"] == ["deepseek-chat"]
    assert _provider_count() == before, "discover-models 不得写库"


# ------------------------------------------------------------ test-draft 端点
def test_test_draft_success_writes_nothing(client, book, secrets_backend, monkeypatch):
    client.post(
        "/api/providers",
        json={"provider": "deepseek", "model": "deepseek-chat", "api_key": "sk-existing"},
    )
    before = _provider_count()
    secrets_before = dict(secrets_backend.store)
    calls = {}

    def fake_request(method, url, *, headers, json_body, timeout):
        calls["url"] = url
        calls["body"] = json_body
        return 200, {"choices": [{"message": {"content": "hi"}}]}

    monkeypatch.setattr(discovery, "_request", fake_request)
    resp = client.post(
        "/api/providers/test-draft",
        json={
            "provider": "stepfun",
            "base_url": "https://api.stepfun.com/v1",
            "api_key": "sk-draft-only",
            "model": "step-5-preview",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["error"] is None
    assert body["latency_ms"] >= 0
    # 最小请求：max_tokens=1、prompt "hi"
    assert calls["body"]["max_tokens"] == 1
    assert calls["body"]["messages"] == [{"role": "user", "content": "hi"}]
    # 不落库、不写密钥环（草稿密钥用后即弃）
    assert _provider_count() == before
    assert secrets_backend.store == secrets_before


def test_test_draft_auth_failure_reuses_readable_error(client, monkeypatch):
    monkeypatch.setattr(discovery, "_request", lambda *a, **k: (401, None))
    resp = client.post(
        "/api/providers/test-draft",
        json={
            "provider": "deepseek",
            "base_url": "https://api.deepseek.com/v1",
            "api_key": "bad",
            "model": "deepseek-chat",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert "密钥" in body["error"]
    assert "401" not in body["error"]
    assert "Traceback" not in resp.text


def test_test_draft_connection_failure_readable(client, monkeypatch):
    def boom(*_a, **_k):
        raise LLMRequestError("无法连接到该地址，请检查 Base URL 是否正确")

    monkeypatch.setattr(discovery, "_request", boom)
    resp = client.post(
        "/api/providers/test-draft",
        json={
            "provider": "custom-x",
            "base_url": "http://127.0.0.1:1/v1",
            "api_key": "x",
            "model": "m",
        },
    )
    body = resp.json()
    assert body["ok"] is False
    assert "无法连接到该地址" in body["error"]


def test_test_draft_rate_limit_message(client, monkeypatch):
    monkeypatch.setattr(discovery, "_request", lambda *a, **k: (429, None))
    resp = client.post(
        "/api/providers/test-draft",
        json={
            "provider": "qwen",
            "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
            "api_key": "x",
            "model": "qwen-plus",
        },
    )
    assert "请求过于频繁或额度用尽" in resp.json()["error"]
