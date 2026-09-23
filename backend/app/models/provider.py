"""模型配置（providers / R5）模型。响应绝不包含密钥明文。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# 契约口径（06 LLMProvider.provider = `type: string`；05 建表无 CHECK 约束）：
# provider 是**自由字符串**，不得做枚举白名单限制。
# 原因：BYOK 需要支持任意 OpenAI 兼容端点（OpenRouter / 阶跃 StepFun / 自建中转等）。
# `services/llm/registry.py` 里的 deepseek/qwen/kimi/claude/ollama 只是**内置 base_url 映射**（便利），
# **不是白名单** —— 不在映射里的平台，只要显式传 base_url 就必须能配上。
ProviderName = str
TaskRole = Literal["outline", "content", "review", "embedding"]
#: 角色的规范顺序（与 `provider_repo.ROLE_ORDER` 一致）—— 仅用于给契约/文档一个稳定枚举序。
TASK_ROLES: tuple[TaskRole, ...] = ("outline", "content", "review", "embedding")


class ProviderCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    provider: ProviderName
    model: str = Field(min_length=1)
    api_key: str | None = None
    base_url: str | None = None
    task_role: TaskRole = "content"
    #: 可选：一次挂多个角色。省略时取 `task_role` 单值（保持老客户端语义）。
    task_roles: list[TaskRole] | None = None
    is_default: bool = False
    enabled: bool = True


class ProviderUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    model: str | None = None
    base_url: str | None = None
    task_role: TaskRole | None = None
    #: 传了就**整体替换**该模型的角色集合（传 `[]` = 解除全部分配）；不传则不改。
    task_roles: list[TaskRole] | None = None
    is_default: bool | None = None
    enabled: bool | None = None
    api_key: str | None = None


class LLMProviderOut(BaseModel):
    id: int
    provider: str
    model: str
    base_url: str | None = None
    key_ref: str | None = None
    #: 旧字段（`llm_provider.task_role` 列）—— 保留以免破坏既有前端类型与契约，
    #: 但**路由不再读它**；真实分配见 `task_roles`。
    task_role: str = "content"
    #: 该模型承担的全部角色（可多个；空列表 = 未分配给任何角色，仅作默认回退候选）。
    task_roles: list[str] = Field(default_factory=list)
    is_default: int = 0
    enabled: int = 1


class ProviderTestResult(BaseModel):
    ok: bool
    latency_ms: int
    error: str | None = None


class DiscoverModelsRequest(BaseModel):
    """拉取平台可用模型列表（不落库、不写密钥环）。"""

    model_config = ConfigDict(extra="ignore")

    provider: str = Field(min_length=1)
    base_url: str | None = None
    api_key: str | None = None


class DiscoverModelsResult(BaseModel):
    models: list[str] = Field(default_factory=list)
    count: int = 0
    note: str | None = None


class DraftTestRequest(BaseModel):
    """保存前测试草稿配置（不落库、不写密钥环）。"""

    model_config = ConfigDict(extra="ignore")

    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)
    base_url: str | None = None
    api_key: str | None = None


class UsagePeriod(BaseModel):
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class ProviderUsage(BaseModel):
    provider_id: int
    model: str
    period: UsagePeriod
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost: float = 0.0
    currency: str = "CNY"
    estimated: bool = True
