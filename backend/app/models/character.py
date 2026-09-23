"""设定库 · 人物卡（character / R1）模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class CharacterRelationOut(BaseModel):
    """人物关系边（关系图谱数据源）。"""

    id: int
    from_char_id: int
    from_name: str = ""
    to_char_id: int
    to_name: str = ""
    relation_type: str
    note: str | None = None


class CharacterRelationInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    from_char_id: int
    to_char_id: int
    relation_type: str = Field(min_length=1, max_length=40)
    note: str | None = Field(default=None, max_length=200)

    @field_validator("relation_type")
    @classmethod
    def _type_not_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("关系类型不能是空白")
        return stripped
