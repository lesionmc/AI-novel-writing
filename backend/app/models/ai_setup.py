"""AI 对话式建设定（新端点）：只产出草稿，**绝不写库**。

草稿经用户确认后，由前端调用已有的 `POST /api/books/{book}/characters`
与 `/world-entries` 落库 —— 设定必须人工确认才入库（红线 2 精神）。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.character import CharacterRole
from app.models.world_entry import WorldCategory

ChatRole = Literal["user", "assistant"]


class ChatMessageIn(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: ChatRole
    content: str


class BookContext(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    genre: str | None = None
    premise: str | None = None


class SetupChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    messages: list[ChatMessageIn] = Field(min_length=1)
    book_context: BookContext | None = None


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


class SetupDraft(BaseModel):
    premise: str | None = None
    characters: list[DraftCharacter] = Field(default_factory=list)
    world_entries: list[DraftWorldEntry] = Field(default_factory=list)


class SetupChatResponse(BaseModel):
    reply: str
    done: bool = False
    draft: SetupDraft | None = None
