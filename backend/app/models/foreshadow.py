"""设定库 · 伏笔台账（foreshadow / R1）模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ForeshadowStatus = Literal["open", "closed", "abandoned"]
ForeshadowImportance = Literal["high", "medium", "low"]


class ForeshadowInput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1)
    planted_chapter_seq: int | None = None
    planned_payoff_seq: int | None = None
    actual_payoff_seq: int | None = None
    status: ForeshadowStatus = "open"
    importance: ForeshadowImportance = "medium"
    note: str | None = None


class ForeshadowOut(ForeshadowInput):
    id: int
    created_at: str
    updated_at: str


class ForeshadowUpdate(BaseModel):
    """PATCH 部分更新（如仅标记已回收）。"""

    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    planted_chapter_seq: int | None = None
    planned_payoff_seq: int | None = None
    actual_payoff_seq: int | None = None
    status: ForeshadowStatus | None = None
    importance: ForeshadowImportance | None = None
    note: str | None = None
