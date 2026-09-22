"""模型列表拉取与草稿检测（不落库、不写密钥环）。

- `list_models`：OpenAI 兼容端点 `GET {base}/models`；Ollama `GET {base}/api/tags`；
  Claude 无公开 models 端点 → 返回空列表 + 提示语（不报错，前端退化为手打）。
- `minimal_chat`：用一套临时凭据发一次最小 chat 请求（max_tokens=1，prompt "hi"），
  供「保存前测试」使用。

本层不感知业务语义；错误统一转可读中文，绝不抛原始异常/堆栈。
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.errors import LLMRequestError
from app.services.llm.base import readable_http_error

DEFAULT_TIMEOUT = 18.0
CHAT_TIMEOUT = 20.0
CLAUDE_NOTE = "该平台未提供公开的模型列表接口，请手动填写模型名"


@dataclass(frozen=True)
class ModelList:
    models: list[str]
    note: str | None = None


def _request(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    json_body: dict | None,
    timeout: float,
) -> tuple[int, dict | None]:
    """发一次请求，返回 (status_code, body)。网络失败统一转可读中文。"""
    try:
        if method == "GET":
            resp = httpx.get(url, headers=headers, timeout=timeout)
        else:
            resp = httpx.post(url, headers=headers, json=json_body, timeout=timeout)
    except httpx.HTTPError as exc:
        raise LLMRequestError("无法连接到该地址，请检查 Base URL 是否正确") from exc
    try:
        body = resp.json()
    except ValueError:
        body = None
    return resp.status_code, body


def _discovery_error(status: int, provider: str) -> str:
    if status in (401, 403):
        return "密钥无效或已过期，请重新填写"
    return readable_http_error(status, provider)


def _require_base(base_url: str | None, provider: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise LLMRequestError(f"缺少「{provider}」的 Base URL，请先填写")
    return base


def list_models(
    provider: str, base_url: str | None, api_key: str | None, *, timeout: float = DEFAULT_TIMEOUT
) -> ModelList:
    """拉取平台可用模型 id 列表（去重 + 排序）。"""
    if provider == "claude":
        return ModelList(models=[], note=CLAUDE_NOTE)

    base = _require_base(base_url, provider)
    if provider == "ollama":
        status, body = _request("GET", f"{base}/api/tags", headers={}, json_body=None, timeout=timeout)
        if status >= 400:
            raise LLMRequestError(_discovery_error(status, provider))
        raw = (body or {}).get("models") or []
        models = [str(item.get("name")) for item in raw if isinstance(item, dict) and item.get("name")]
    else:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        status, body = _request("GET", f"{base}/models", headers=headers, json_body=None, timeout=timeout)
        if status >= 400:
            raise LLMRequestError(_discovery_error(status, provider))
        raw = (body or {}).get("data") or []
        models = [str(item.get("id")) for item in raw if isinstance(item, dict) and item.get("id")]

    return ModelList(models=sorted(set(models)))


def minimal_chat(
    provider: str,
    base_url: str | None,
    api_key: str | None,
    model: str,
    *,
    timeout: float = CHAT_TIMEOUT,
) -> None:
    """发一次最小 chat 请求验证凭据与模型可用性；失败抛可读 LLMRequestError。"""
    base = _require_base(base_url, provider)
    if provider == "claude":
        status, _ = _request(
            "POST",
            f"{base}/v1/messages",
            headers={
                "x-api-key": api_key or "",
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json_body={"model": model, "max_tokens": 1, "messages": [{"role": "user", "content": "hi"}]},
            timeout=timeout,
        )
    elif provider == "ollama":
        status, _ = _request(
            "POST",
            f"{base}/api/chat",
            headers={},
            json_body={
                "model": model,
                "messages": [{"role": "user", "content": "hi"}],
                "stream": False,
                "options": {"num_predict": 1},
            },
            timeout=timeout,
        )
    else:
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        status, _ = _request(
            "POST",
            f"{base}/chat/completions",
            headers=headers,
            json_body={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
            timeout=timeout,
        )
    if status >= 400:
        raise LLMRequestError(readable_http_error(status, provider))
