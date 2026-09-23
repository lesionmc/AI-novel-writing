"""各厂商模型客户端实现（httpx）。错误统一映射为可读中文，不暴露堆栈。"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator

import httpx

from app.errors import LLMRequestError
from app.services.llm.base import ChatMessage, readable_http_error

# 模型调用默认超时（秒）。可用环境变量 `AINOVEL_LLM_TIMEOUT` 覆盖。
#
# 为什么默认是 180 而不是原来的 60：
#   本轮 M2 实跑（阶跃 step-3.5-flash）暴露了这个值定得太小 —— 「读一整章 3000 字
#   + 输出结构化回写建议」这类请求，单次耗时稳定落在 **62~82 秒**区间：
#     第 1 章 68.0s、第 2 章 65.8s、第 3 章 69.8s、第 4 章 66.3s、第 5 章 62.5s（侥幸通过）
#     第 6 章 81.4s → 502 LLM_REQUEST_FAILED，记忆闭环直接断掉
#   即 60 秒让回写长期在极限边缘游走，**失败是迟早的、且随章节长度波动而随机发生**。
#   推理模型（思考写入 `reasoning_content`）本身就更慢，给足余量是必要而非奢侈。
DEFAULT_LLM_TIMEOUT_SEC = 180.0

# LLM 调用**不继承系统/注册表代理**（trust_env=False）：
# httpx 默认会读系统代理，连 127.0.0.1 的本地端点（Ollama、自建服务）也会被
# 代理截走 —— E2E 实测配了系统代理的机器上直接 502，本地开发工具必须直连。
# 需要代理访问海外模型的用户，请在 VPN/系统层解决或把 base_url 指到本地转发端。
_TRUST_ENV = False


def default_llm_timeout() -> float:
    """解析当前生效的模型调用超时（秒）。非法值一律回落到默认，不抛异常。"""
    raw = os.environ.get("AINOVEL_LLM_TIMEOUT")
    if raw:
        try:
            value = float(raw)
            if value > 0:
                return value
        except ValueError:
            pass
    return DEFAULT_LLM_TIMEOUT_SEC


class OpenAICompatibleClient:
    """OpenAI 兼容协议：DeepSeek / 通义 / Kimi 等通用。"""

    def __init__(self, provider: str, base_url: str, api_key: str, model: str) -> None:
        self.provider = provider
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self.model = model

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

    def chat(
        self,
        messages: list[ChatMessage],
        *,
        json_mode: bool = False,
        timeout: float | None = None,
    ) -> str:
        payload: dict = {"model": self.model, "messages": messages}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            resp = httpx.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
                timeout=timeout if timeout is not None else default_llm_timeout(),
                trust_env=_TRUST_ENV,
            )
        except httpx.HTTPError as exc:
            raise LLMRequestError(detail=None) from exc
        if resp.status_code >= 400:
            raise LLMRequestError(readable_http_error(resp.status_code, self.provider))
        data = resp.json()
        # 部分推理模型（如 OpenRouter 上的 *:free 推理档）在思考阶段会返回
        # `content: null`；直接 str() 会得到字面量 "None" 并被当成模型输出，
        # 掩盖真实原因。统一成空串，交给调用方的 JSON 容错给出可读错误。
        content = data["choices"][0]["message"].get("content")
        return content if isinstance(content, str) else ""

    def chat_stream(
        self,
        messages: list[ChatMessage],
        *,
        json_mode: bool = False,
        timeout: float | None = None,
    ) -> Iterator[str]:
        """OpenAI 兼容流式（SSE `data:` 行）。不支持流的平台会在解析层拿不到
        delta 而自然输出空串——final 帧仍由完整 JSON 解析兜底。"""
        payload: dict = {"model": self.model, "messages": messages, "stream": True}
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        try:
            with httpx.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=payload,
                timeout=timeout if timeout is not None else default_llm_timeout(),
                trust_env=_TRUST_ENV,
            ) as resp:
                if resp.status_code >= 400:
                    resp.read()
                    raise LLMRequestError(
                        readable_http_error(resp.status_code, self.provider)
                    )
                for line in resp.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    body = line[5:].strip()
                    if body == "[DONE]":
                        return
                    try:
                        obj = json.loads(body)
                    except json.JSONDecodeError:
                        continue
                    choices = obj.get("choices") or [{}]
                    delta = (choices[0].get("delta") or {}).get("content")
                    if isinstance(delta, str) and delta:
                        yield delta
        except httpx.HTTPError as exc:
            raise LLMRequestError(detail=None) from exc

    def embed(self, texts: list[str], *, timeout: float = 60.0) -> list[list[float]]:
        try:
            resp = httpx.post(
                f"{self.base_url}/embeddings",
                headers=self._headers(),
                json={"model": self.model, "input": texts},
                timeout=timeout,
                trust_env=_TRUST_ENV,
            )
        except httpx.HTTPError as exc:
            raise LLMRequestError(detail=None) from exc
        if resp.status_code >= 400:
            raise LLMRequestError(readable_http_error(resp.status_code, self.provider))
        data = resp.json()
        return [item["embedding"] for item in data["data"]]


class ClaudeClient:
    def __init__(self, api_key: str, model: str) -> None:
        self.provider = "claude"
        self.base_url = "https://api.anthropic.com"
        self._api_key = api_key
        self.model = model

    def _split(self, messages: list[ChatMessage]) -> tuple[str, list[dict]]:
        system = "\n".join(m["content"] for m in messages if m["role"] == "system")
        convo = [m for m in messages if m["role"] != "system"]
        return system, convo

    def chat(
        self,
        messages: list[ChatMessage],
        *,
        json_mode: bool = False,
        timeout: float = 60.0,
    ) -> str:
        system, convo = self._split(messages)
        payload: dict = {"model": self.model, "messages": convo, "max_tokens": 4096}
        if system:
            payload["system"] = system
        try:
            resp = httpx.post(
                f"{self.base_url}/v1/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=timeout,
                trust_env=_TRUST_ENV,
            )
        except httpx.HTTPError as exc:
            raise LLMRequestError(detail=None) from exc
        if resp.status_code >= 400:
            raise LLMRequestError(readable_http_error(resp.status_code, self.provider))
        data = resp.json()
        return "".join(block.get("text", "") for block in data.get("content", []))

    def embed(self, texts: list[str], *, timeout: float = 60.0) -> list[list[float]]:
        raise LLMRequestError("Claude 未提供本地 embedding 接口，请改用 Ollama 或通义")


class OllamaClient:
    def __init__(self, base_url: str, model: str) -> None:
        self.provider = "ollama"
        self.base_url = (base_url or "http://127.0.0.1:11434").rstrip("/")
        self.model = model

    def chat(
        self,
        messages: list[ChatMessage],
        *,
        json_mode: bool = False,
        timeout: float = 120.0,
    ) -> str:
        payload = {"model": self.model, "messages": messages, "stream": False}
        if json_mode:
            payload["format"] = "json"
        try:
            resp = httpx.post(
                f"{self.base_url}/api/chat", json=payload, timeout=timeout, trust_env=_TRUST_ENV
            )
        except httpx.HTTPError as exc:
            raise LLMRequestError(
                "没能连上本地 Ollama 服务，请确认它已启动"
            ) from exc
        if resp.status_code >= 400:
            raise LLMRequestError(readable_http_error(resp.status_code, self.provider))
        data = resp.json()
        return str(data.get("message", {}).get("content", ""))

    def chat_stream(
        self,
        messages: list[ChatMessage],
        *,
        json_mode: bool = False,
        timeout: float = 120.0,
    ) -> Iterator[str]:
        """Ollama 流式是 NDJSON（每行一个完整 JSON），不是 SSE。"""
        payload: dict = {"model": self.model, "messages": messages, "stream": True}
        if json_mode:
            payload["format"] = "json"
        try:
            with httpx.stream(
                "POST", f"{self.base_url}/api/chat", json=payload, timeout=timeout, trust_env=_TRUST_ENV
            ) as resp:
                if resp.status_code >= 400:
                    resp.read()
                    raise LLMRequestError(
                        readable_http_error(resp.status_code, self.provider)
                    )
                for line in resp.iter_lines():
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    piece = (obj.get("message") or {}).get("content")
                    if isinstance(piece, str) and piece:
                        yield piece
                    if obj.get("done"):
                        return
        except httpx.HTTPError as exc:
            raise LLMRequestError("没能连上本地 Ollama 服务，请确认它已启动") from exc

    def embed(self, texts: list[str], *, timeout: float = 120.0) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            try:
                resp = httpx.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model, "prompt": text},
                    timeout=timeout,
                    trust_env=_TRUST_ENV,
                )
            except httpx.HTTPError as exc:
                raise LLMRequestError(
                    "没能连上本地 Ollama 服务，请确认它已启动"
                ) from exc
            if resp.status_code >= 400:
                raise LLMRequestError(readable_http_error(resp.status_code, self.provider))
            vectors.append(resp.json()["embedding"])
        return vectors
