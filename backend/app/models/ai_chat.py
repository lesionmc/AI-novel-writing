"""AI 对话工作台（`POST /api/books/{book}/ai/chat`）模型。

## 定位
**唯一的 AI 对话入口**：一个 AI 做完全部 —— 建设定、排大纲、续写/扩写、
情节方向、联网查证，都在这一条对话里发生（原「对话式建设定」独立端点已并入，
2026-09-23 整合）。对话历史**存在前端本地**（OD-07：不建后端会话表），
后端每轮拿全量 `messages` 在**服务端**组装记忆包（复用 `services/writing_context.py`）。

## 红线
`draft` 仍是**草稿**：AI 可以产人物卡 / 世界词条 / 大纲节点 / 正文片段，
但落库一律由用户在界面上点确认后，由前端调**已有**写入端点完成。本端点不写任何库表。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.character import CharacterRole
from app.models.world_entry import WorldCategory

ChatRole = Literal["user", "assistant"]

#: 草稿类型。与前端「确认写入」的落库端点一一对应：
#:   characters    → POST /api/books/{book}/characters
#:   world_entries → POST /api/books/{book}/world-entries
#:   outline_nodes → POST /api/books/{book}/outlines
#:   prose         → 不落库，由前端放进编辑器（正文必须人工确认）
DraftKind = Literal["characters", "world_entries", "outline_nodes", "prose"]

#: 前端可指定的"要干什么"。`auto` = 让 AI 自己判断。
Intent = Literal[
    "auto",
    "characters",
    "world_entries",
    "outline_nodes",
    "continue",
    "expand",
    "plot_directions",
]

#: 大纲层级（与 `OutlineLevel` 一致）；非法值归一到 chapter。
OutlineNodeLevel = Literal["total", "volume", "chapter"]


class ChatMessageIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: ChatRole
    content: str


class DraftCharacter(BaseModel):
    """草稿人物：字段与 `CharacterInput` 对齐，`role` 用英文枚举（对齐 CHECK 约束）。"""

    model_config = ConfigDict(extra="ignore")

    name: str
    role: CharacterRole = "supporting"
    surface_identity: str | None = None
    secret_desire: str | None = None
    fatal_weakness: str | None = None
    contradiction: str | None = None
    appearance: str | None = None
    background: str | None = None


class DraftWorldEntry(BaseModel):
    """草稿词条：字段与 `WorldEntryInput` 对齐。"""

    model_config = ConfigDict(extra="ignore")

    category: WorldCategory = "other"
    name: str
    content: str | None = None


class AiChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    messages: list[ChatMessageIn] = Field(min_length=1)
    #: 在哪一章说话（可选）。给了就把该章的大纲 / 状态 / 上一章摘要 / 最近正文也带上。
    chapter_id: int | None = None
    #: 前端指定要干什么；缺省 / `auto` 由 AI 自己判断。
    intent: str | None = None
    #: 允许本轮联网检索（作者打开「联网」开关）。服务端先让模型判断要不要搜、搜什么。
    use_web: bool = False


class AiChatDraft(BaseModel):
    """结构化草稿：`kind` 决定 `payload` 形状（形状与对应写入端点对齐）。"""

    model_config = ConfigDict(extra="ignore")

    kind: DraftKind
    payload: dict[str, Any] = Field(default_factory=dict)


class AiChatContextUsed(BaseModel):
    """「这次 AI 读了什么」—— 让"有记忆"这件事对用户**看得见**。"""

    characters: int = 0
    foreshadows: int = 0
    outlines: int = 0
    has_prev_summary: bool = False
    injected_chars: int = 0


class WebSource(BaseModel):
    """一条联网检索结果（标题 / 地址 / 摘要），前端展示为可点开的来源。"""

    title: str
    url: str
    snippet: str = ""


class AiChatResponse(BaseModel):
    reply: str
    draft: AiChatDraft | None = None
    context_used: AiChatContextUsed = Field(default_factory=AiChatContextUsed)
    #: 本轮实际联网检索并注入提示词的资料；空表 = 没搜或没搜到。
    web_sources: list[WebSource] = Field(default_factory=list)
    #: 本轮确实发起过联网检索（哪怕 0 命中）—— 前端据此如实提示"搜了但没搜到"。
    web_attempted: bool = False
