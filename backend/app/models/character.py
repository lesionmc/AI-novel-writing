"""设定库 · 人物卡（character / R1）模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CharacterRole = Literal["protagonist", "supporting", "antagonist", "minor"]
CharacterStatus = Literal["alive", "dead", "missing", "unknown"]


class CharacterInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1)
    alias: str | None = None
    role: CharacterRole = "supporting"
    surface_identity: str | None = None
    secret_desire: str | None = None
    fatal_weakness: str | None = None
    contradiction: str | None = None
    appearance: str | None = None
    background: str | None = None
    first_chapter_seq: int | None = None
    status: CharacterStatus = "alive"
    tags: list[str] = Field(default_factory=list)


class CharacterOut(CharacterInput):
    id: int
    created_at: str
    updated_at: str


class CharacterUpdate(BaseModel):
    """PATCH 部分更新：所有字段可选，未提供者保持原值。"""

    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    alias: str | None = None
    role: CharacterRole | None = None
    surface_identity: str | None = None
    secret_desire: str | None = None
    fatal_weakness: str | None = None
    contradiction: str | None = None
    appearance: str | None = None
    background: str | None = None
    first_chapter_seq: int | None = None
    status: CharacterStatus | None = None
    tags: list[str] | None = None


class AffectedChapter(BaseModel):
    chapter_seq: int
    chapter_title: str | None = None
    matched_in: str  # content / chapter_summary
