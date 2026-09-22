"""三级大纲（outline / R7）模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

OutlineLevel = Literal["total", "volume", "chapter"]
ExpandLevel = Literal["volume", "chapter"]


class OutlineInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    level: OutlineLevel
    parent_id: int | None = None
    seq: int = 0
    title: str | None = None
    content: str | None = None
    chapter_id: int | None = None


class OutlineOut(OutlineInput):
    id: int
    created_at: str
    updated_at: str


class OutlineUpdate(BaseModel):
    """PATCH 部分更新。"""

    model_config = ConfigDict(extra="ignore")

    level: OutlineLevel | None = None
    parent_id: int | None = None
    seq: int | None = None
    title: str | None = None
    content: str | None = None
    chapter_id: int | None = None


class OutlineExpandRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    expand_level: ExpandLevel
    count: int | None = Field(default=None, ge=1)
    context: dict | None = None


class OutlineCandidate(BaseModel):
    level: ExpandLevel
    title: str
    content: str = ""
    seq: int = 1
    rationale: str | None = None


class OutlineExpandResponse(BaseModel):
    parent_id: int
    expand_level: ExpandLevel
    candidates: list[OutlineCandidate]
    raw_ai_output: str | None = None
