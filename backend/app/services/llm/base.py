"""统一模型调用接口（services/llm）。此层不感知业务语义。"""

from __future__ import annotations

from typing import Protocol, TypedDict


class ChatMessage(TypedDict):
    role: str  # system / user / assistant
    content: str


class LLMClient(Protocol):
    provider: str
    model: str

    def chat(
        self,
        messages: list[ChatMessage],
        *,
        json_mode: bool = False,
        timeout: float = 60.0,
    ) -> str: ...

    def embed(self, texts: list[str], *, timeout: float = 60.0) -> list[list[float]]: ...


class EmbeddingClient(Protocol):
    model: str

    def embed(self, texts: list[str], *, timeout: float = 60.0) -> list[list[float]]: ...


def readable_http_error(status_code: int, provider: str) -> str:
    """把 HTTP 状态映射为可读中文，绝不外泄原始错误/堆栈（TC-22）。"""
    if status_code in (401, 403):
        return "密钥好像不对，或没有访问该模型的权限，请检查后重试"
    if status_code == 404:
        return f"接口地址或模型名不正确（{provider}）"
    if status_code == 429:
        return "请求过于频繁或额度用尽，请稍后再试"
    if status_code == 451:
        # M2 实跑发现：阶跃对含「变异丧尸 / 持刀对峙」等描写的章节直接回 451
        # （Unavailable For Legal Reasons）= 平台内容审核拦截，与配置无关。
        # 原来的兜底文案「请检查配置后重试」会让人去瞎折腾模型设置，永远找不到原因。
        return (
            f"模型平台（{provider}）以**内容合规**为由拒绝了这次请求——不是配置问题。"
            "可以换一个模型再试，或把这一段里可能触发审核的描写改一改。"
        )
    if status_code >= 500:
        return f"模型服务暂时不可用（{provider}），请稍后再试"
    return "模型请求失败，请检查配置后重试"
