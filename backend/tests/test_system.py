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
    # 模型配置即时生效（非启动快照）
    assert client.get("/api/system/capabilities").json()["llm_configured"] is True
