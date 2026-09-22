"""pytest 公共夹具：把作品目录隔离到临时路径。"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.db import global_db as global_db_mod
from app.db import registry as registry_mod
from app.services import workspace
from tests.fakes import InMemorySecretBackend


@pytest.fixture()
def secrets_backend():
    from app.services.llm import secrets as secrets_mod

    backend = InMemorySecretBackend()
    secrets_mod.set_backend(backend)
    yield backend
    secrets_mod.set_backend(secrets_mod.KeyringBackend())


@pytest.fixture()
def fake_llm(monkeypatch):
    """安装假模型客户端：替换 registry.build_client 这一唯一构造入口。"""
    from app.services.llm import registry as llm_registry

    def install(client):
        monkeypatch.setattr(llm_registry, "build_client", lambda row: client)
        return client

    return install


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "project_root", tmp_path)
    registry_mod.reset_registry()
    global_db_mod.reset_global_database()
    workspace.reset_active_for_tests()
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client
    registry_mod.reset_registry()
    global_db_mod.reset_global_database()
    workspace.reset_active_for_tests()


@pytest.fixture()
def book(client) -> str:
    resp = client.post(
        "/api/books",
        json={"title": "测试书", "genre": "玄幻", "target_words": 100000},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["slug"]
