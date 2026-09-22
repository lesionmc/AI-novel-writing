"""设定库 · 世界词条（world_entry / R1）模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

WorldCategory = Literal["force", "place", "rule", "item", "other"]


class WorldEntryInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    category: WorldCategory = "other"
    name: str = Field(min_length=1)
    content: str | None = None
    parent_id: int | None = None
    tags: list[str] = Field(default_factory=list)


class WorldEntryOut(WorldEntryInput):
    id: int
    created_at: str
    updated_at: str


class WorldEntryUpdate(BaseModel):
    """PATCH 部分更新。"""

    model_config = ConfigDict(extra="ignore")

    category: WorldCategory | None = None
    name: str | None = None
    content: str | None = None
    parent_id: int | None = None
    tags: list[str] | None = None
