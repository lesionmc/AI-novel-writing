"""章节与版本（chapter / chapter_version，R2 / R11）模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

ChapterStatus = Literal["draft", "done"]


class ChapterCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    seq: int | None = None


class ChapterPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    content: str | None = None
    hook: str | None = None


class ChapterBrief(BaseModel):
    """章节列表项：**不含正文**（坑 11，TC-13）。"""

    id: int
    seq: int
    title: str | None = None
    word_count: int = 0
    status: ChapterStatus = "draft"
    updated_at: str


class ChapterOut(ChapterBrief):
    content: str = ""
    chapter_summary: str | None = None
    hook: str | None = None
    finalized_at: str | None = None
    created_at: str


class ChapterSaveResult(BaseModel):
    id: int
    word_count: int
    updated_at: str


class ChapterVersionOut(BaseModel):
    id: int
    chapter_id: int
    word_count: int
    note: str | None = None
    created_at: str


class ChapterVersionCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    note: str | None = None
