"""Spec §5.8 / D-24：系统能力探测端点（只读、无副作用、不联网）。"""

from __future__ import annotations

from app.db.connection import probe_capabilities


def test_capabilities_shape_and_startup_cache(client):
    body = client.get("/api/system/capabilities").json()
    assert set(body) == {"vector_available", "fts_available", "llm_configured"}
    caps = probe_capabilities()  # 取进程内启动自检缓存
    assert body["vector_available"] is caps.vec_available
    assert body["fts_available"] is caps.fts5_available
    # 全局无模型配置（未添加任何 provider）→ 未配置
    assert body["llm_configured"] is False


def test_llm_configured_reflects_current_config(client, book):
    assert client.get("/api/system/capabilities").json()["llm_configured"] is False
    client.post(
        "/api/providers",
        json={"provider": "ollama", "model": "m", "task_role": "content"},
    )
    # 模型配置即时生效（非启动快照）；ollama 属无密钥 provider，无需密钥即算可用
    assert client.get("/api/system/capabilities").json()["llm_configured"] is True


def _create_provider(client, **overrides) -> dict:
    payload = {"provider": "deepseek", "model": "deepseek-chat", "task_role": "content"}
    payload.update(overrides)
    resp = client.post("/api/providers", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_llm_configured_false_when_secret_missing(client):
    """P0-2 回归：有**已启用**的 provider 行，但密钥环里没有对应密钥。

    旧实现只查 `llm_provider` 有没有 enabled 行 → 谎报 `true`，
    而所有 AI 端点都会 400 `LLM_NOT_CONFIGURED`，前端能力判断被误导。
    """
    created = _create_provider(client)  # 未传 api_key → key_ref 为空
    assert created["key_ref"] is None
    assert client.get("/api/providers").json()[0]["enabled"] == 1
    assert client.get("/api/system/capabilities").json()["llm_configured"] is False


def test_llm_configured_true_when_secret_loadable(client, secrets_backend):
    """密钥真的能从密钥环取到 → 才算「确实有一个能用的模型」。"""
    assert client.get("/api/system/capabilities").json()["llm_configured"] is False
    created = _create_provider(client, api_key="sk-unit-test")
    assert created["key_ref"]
    assert client.get("/api/system/capabilities").json()["llm_configured"] is True


def test_llm_configured_false_when_secret_slot_emptied(client, secrets_backend):
    """配置行仍在、密钥被清空（本机真实处境）→ 必须为 false。"""
    created = _create_provider(client, api_key="sk-unit-test")
    assert client.get("/api/system/capabilities").json()["llm_configured"] is True
    secrets_backend.delete(created["key_ref"])  # 模拟密钥环里的密钥失效/被清空
    assert client.get("/api/providers").json()[0]["enabled"] == 1  # 配置行未动
    assert client.get("/api/system/capabilities").json()["llm_configured"] is False


# ------------------------------------------------------------- 联网搜索配置
def test_web_search_settings_roundtrip(client):
    assert client.get("/api/system/web-search").json() == {"endpoint": None, "proxy": None}
    resp = client.put(
        "/api/system/web-search",
        json={"endpoint": "https://search.local/api", "proxy": "http://127.0.0.1:7890"},
    )
    assert resp.status_code == 200
    assert resp.json()["endpoint"] == "https://search.local/api"
    assert client.get("/api/system/web-search").json()["proxy"] == "http://127.0.0.1:7890"
    # 清空 = 恢复默认（GET 回 null，而不是把默认 DDG 端点暴露给用户）
    assert client.put("/api/system/web-search", json={}).json() == {"endpoint": None, "proxy": None}


def test_web_search_settings_validates_scheme(client):
    bad = client.put("/api/system/web-search", json={"endpoint": "ftp://x"})
    assert bad.status_code == 400
    bad_proxy = client.put("/api/system/web-search", json={"proxy": "127.0.0.1:7890"})
    assert bad_proxy.status_code == 400
