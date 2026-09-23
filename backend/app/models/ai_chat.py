"""AI 对话工作台（`POST /api/books/{book}/ai/chat`）模型。

## 定位
一个 AI 做完全部：「有上下文、有记忆、有对话，退出再进来还能接着做」。
对话历史**存在前端本地**（OD-07：不建后端会话表），后端每轮拿全量 `messages`
在**服务端**组装记忆包（复用 `services/writing_context.py`，不另写一套拼装逻辑）。

## 红线
`draft` 仍是**草稿**：AI 可以产人物卡 / 世界词条 / 大纲节点 / 正文片段，
但落库一律由用户在界面上点确认后，由前端调**已有**写入端点完成。本端点不写任何库表。
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.ai_setup import ChatMessageIn

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
]

#: 大纲层级（与 `OutlineLevel` 一致）；非法值归一到 chapter。
OutlineNodeLevel = Literal["total", "volume", "chapter"]


class AiChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    messages: list[ChatMessageIn] = Field(min_length=1)
    #: 在哪一章说话（可选）。给了就把该章的大纲 / 状态 / 上一章摘要 / 最近正文也带上。
    chapter_id: int | None = None
    #: 前端指定要干什么；缺省 / `auto` 由 AI 自己判断。
    intent: str | None = None


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


class AiChatResponse(BaseModel):
    reply: str
    draft: AiChatDraft | None = None
    context_used: AiChatContextUsed = Field(default_factory=AiChatContextUsed)
