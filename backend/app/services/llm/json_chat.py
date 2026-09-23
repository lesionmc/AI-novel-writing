"""一次 chat → 宽松 JSON 解析；失败按「坑 9」重试一次，仍失败抛可读错误。

两个新的 AI 端点（选题建议 / 建设定对话）都要求模型只回 JSON，故把
「调用 + 容错 + 重试」收敛到这里，避免各服务各写一份（原来 outline 里那份
只针对数组，这里通用化为对象）。
"""

from __future__ import annotations

import json
from collections.abc import Iterator

from app.errors import JSONParseFailedError
from app.services.llm.base import LLMClient
from app.utils.json_parse import parse_json_loose

_RETRY_SUFFIX = (
    "\n\n上次输出的 JSON 解析失败，错误信息：{err}。"
    "请只重新输出合法 JSON，不要包含任何解释文字或 Markdown 代码块。"
)

# 这两个 AI 功能要一次生成**长结构化 JSON**（3–5 条推荐 + 理由 / 完整设定草稿），
# 慢模型常常超过默认 60s；60s 会让用户看到「模型请求失败」而其实只是没等完。
DEFAULT_GENERATE_TIMEOUT = 120.0


def retry_prompt(prompt: str, err: object) -> str:
    """解析失败后的重试提示（供流式路径做**单次**重试，不再叠加内部重试）。"""
    return prompt + _RETRY_SUFFIX.format(err=err)


def stream_chat(
    client: LLMClient, prompt: str, *, timeout: float = DEFAULT_GENERATE_TIMEOUT
) -> Iterator[str]:
    """流式产出模型原始输出片段。客户端没实现 `chat_stream`（如 Claude）
    就退回一次性 `chat` 单块发出 —— 调用方无需感知差异。"""
    messages = [{"role": "user", "content": prompt}]
    stream = getattr(client, "chat_stream", None)
    if callable(stream):
        yield from stream(messages, json_mode=True, timeout=timeout)  # type: ignore[attr-defined]
        return
    yield client.chat(messages, json_mode=True, timeout=timeout)


def chat_json(
    client: LLMClient, prompt: str, *, timeout: float = DEFAULT_GENERATE_TIMEOUT
) -> tuple[dict, str]:
    """返回 `(解析后的 dict, 最后一次原始输出)`；原始输出用于排障与回传。"""
    raw = client.chat([{"role": "user", "content": prompt}], json_mode=True, timeout=timeout)
    try:
        return parse_json_loose(raw), raw
    except json.JSONDecodeError as first_err:
        raw = client.chat(
            [{"role": "user", "content": prompt + _RETRY_SUFFIX.format(err=first_err)}],
            json_mode=True,
            timeout=timeout,
        )
        try:
            return parse_json_loose(raw), raw
        except json.JSONDecodeError:
            raise JSONParseFailedError(detail={"raw_ai_output": raw}) from None
