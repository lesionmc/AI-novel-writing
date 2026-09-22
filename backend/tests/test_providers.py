"""步骤 7：模型配置、密钥环、有效性检测、费用估算（R5，TC-20/21/22/23）。"""

from __future__ import annotations

from app.config import settings
from app.errors import LLMRequestError
from app.services.llm.base import readable_http_error
from tests.fakes import FakeLLMClient


def _db_bytes(book: str) -> bytes:
    base = settings.books_dir / book
    blob = b""
    for name in ("novel.db", "novel.db-wal", "novel.db-shm"):
        path = base / name
        if path.is_file():
            blob += path.read_bytes()
    return blob


def test_create_ollama_provider_without_key(client, book):
    resp = client.post(
        "/api/providers",
        json={"provider": "ollama", "model": "bge-m3", "task_role": "embedding"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["key_ref"] is None
    assert "api_key" not in body


def test_secret_stored_in_keyring_not_db(client, book, secrets_backend):
    secret = "sk-super-secret-123456"
    resp = client.post(
        "/api/providers",
        json={"provider": "deepseek", "model": "deepseek-chat", "api_key": secret},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["key_ref"]
    assert "api_key" not in body
    assert secret not in resp.text
    # 密钥只进密钥环
    assert secret in secrets_backend.store.values()
    # 三处不落盘：数据库文件与 WAL 中查不到明文（TC-21）
    assert secret.encode("utf-8") not in _db_bytes(book)


def test_provider_test_success_and_readable_error(client, book, fake_llm):
    prov = client.post(
        "/api/providers", json={"provider": "deepseek", "model": "deepseek-chat"}
    ).json()

    fake_llm(FakeLLMClient(chat_responses=['{"ok":true}']))
    ok = client.post(f"/api/providers/{prov['id']}/test").json()
    assert ok["ok"] is True
    assert ok["error"] is None

    fake_llm(FakeLLMClient(chat_responses=[LLMRequestError(readable_http_error(401, "deepseek"))]))
    bad = client.post(f"/api/providers/{prov['id']}/test").json()
    assert bad["ok"] is False
    assert "密钥" in bad["error"]
    assert "401" not in bad["error"]
    assert "Traceback" not in bad["error"]


def test_provider_delete_removes_secret(client, book, secrets_backend):
    client.post(
        "/api/providers",
        json={"provider": "kimi", "model": "moonshot-v1-8k", "api_key": "sk-to-delete"},
    )
    prov = client.get("/api/providers").json()[0]
    assert client.delete(f"/api/providers/{prov['id']}").status_code == 204
    assert secrets_backend.store == {}
    assert client.get("/api/providers").json() == []


def test_provider_partial_update_and_default(client, book, secrets_backend):
    a = client.post("/api/providers", json={"provider": "deepseek", "model": "m1"}).json()
    b = client.post("/api/providers", json={"provider": "qwen", "model": "m2"}).json()
    # 部分更新（只改 task_role）
    resp = client.patch(f"/api/providers/{a['id']}", json={"task_role": "outline"})
    assert resp.status_code == 200
    assert resp.json()["task_role"] == "outline"
    # 设为默认：应清除其他默认
    client.patch(f"/api/providers/{b['id']}", json={"is_default": True})
    providers = {p["id"]: p for p in client.get("/api/providers").json()}
    assert providers[b["id"]]["is_default"] == 1
    assert providers[a["id"]]["is_default"] == 0
    # 更换密钥写入新密钥环条目
    client.patch(f"/api/providers/{a['id']}", json={"api_key": "sk-rotated"})
    assert "sk-rotated" in secrets_backend.store.values()


def test_provider_usage_local_estimate(client, book):
    prov = client.post(
        "/api/providers", json={"provider": "deepseek", "model": "deepseek-chat"}
    ).json()
    usage = client.get(f"/api/providers/{prov['id']}/usage").json()
    assert usage["estimated"] is True
    assert usage["currency"] == "CNY"
    assert usage["provider_id"] == prov["id"]
    assert usage["total_tokens"] == usage["prompt_tokens"]
    assert usage["period"]["from"] is None


def test_unknown_provider_typed_error(client, book):
    resp = client.get("/api/providers/9999/usage")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "PROVIDER_NOT_FOUND"
