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
    """是否存在**真正可用**的模型：已启用 **且** 现在就能构造出客户端。

    「有 enabled 行」不等于「能用」：用户可能清空/失效了系统密钥环里的密钥
    （库里的 `key_ref` 还在），此时所有 AI 端点都会 400 `LLM_NOT_CONFIGURED`。
    能力探测必须与之一致，否则前端会误判「已配模型」而不走降级（P0-2）。

    判定口径 = 逐条 `build_client(row)`（它才是唯一的构造入口，内部按 `_require_secret`
    取密钥；`_KEYLESS_PROVIDERS` 里的 ollama 无需密钥，照常算可用）。
    **命中第一条可用即返回**，避免遍历时反复读密钥环 —— 本函数是能力探测热点，
    前端每次进写作台都会问一次。
    """
    with get_global_database().connection() as conn:
        rows = provider_repo.list_enabled(conn)
    for row in rows:
        try:
            build_client(row)
        except Exception:  # noqa: BLE001 - 单条配置不可用（缺密钥/密钥环异常）即换下一条
            continue
        return True
    return False


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
