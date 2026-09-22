"""按任务角色路由模型：从**全局库** `llm_provider` 取配置，组装统一客户端（services/llm）。

模型配置已全局化（见 `app/db/global_db.py`）：本模块不再接收「书库连接」，
一律连全局库取配置。这样所有写作链路（大纲 / 记忆回写 / 召回 / 向量化）拿到的
都是同一份全局模型配置，与「当前打开的作品」解耦。
"""

from __future__ import annotations

from app.db.global_db import get_global_database
from app.errors import LLMNotConfiguredError
from app.repositories import provider_repo
from app.services.llm.base import EmbeddingClient, LLMClient
from app.services.llm.clients import ClaudeClient, OllamaClient, OpenAICompatibleClient
from app.services.llm.secrets import load_secret

DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com/v1",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "kimi": "https://api.moonshot.cn/v1",
    "claude": "https://api.anthropic.com",
    "ollama": "http://127.0.0.1:11434",
}

_KEYLESS_PROVIDERS = {"ollama"}


def build_client(row: dict) -> LLMClient:
    provider = row["provider"]
    model = row["model"]
    base_url = row.get("base_url") or DEFAULT_BASE_URLS.get(provider, "")
    if provider == "claude":
        secret = _require_secret(row)
        return ClaudeClient(secret, model)
    if provider == "ollama":
        return OllamaClient(base_url, model)
    secret = _require_secret(row)
    return OpenAICompatibleClient(provider, base_url, secret, model)


def _require_secret(row: dict) -> str:
    key_ref = row.get("key_ref")
    secret = load_secret(key_ref) if key_ref else None
    if not secret:
        raise LLMNotConfiguredError(
            f"模型「{row.get('provider')}/{row.get('model')}」的密钥不存在，请重新填写"
        )
    return secret


def get_client_for_role(task_role: str) -> LLMClient | None:
    with get_global_database().connection() as conn:
        row = provider_repo.find_for_role(conn, task_role)
        if row is None:
            row = provider_repo.find_default(conn)
    if row is None:
        return None
    return build_client(row)


def get_embedding_client() -> EmbeddingClient | None:
    with get_global_database().connection() as conn:
        row = provider_repo.find_for_role(conn, "embedding")
    if row is None:
        return None
    return build_client(row)  # type: ignore[return-value]


def has_enabled_provider() -> bool:
    with get_global_database().connection() as conn:
        return provider_repo.any_enabled(conn)


def require_client(task_role: str) -> LLMClient:
    client = get_client_for_role(task_role)
    if client is None:
        raise LLMNotConfiguredError()
    return client


def require_any_client(task_role: str = "content") -> LLMClient:
    """取一个可用模型。

    模型配置已全局共享，不再与作品绑定 —— 保存前的选题助手（R0）与写作链路
    拿到的是同一份配置，故直接复用 `require_client`。
    """
    return require_client(task_role)
