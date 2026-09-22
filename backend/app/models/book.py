"""作品（book / R15）相关的 Pydantic 模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

WritingMode = Literal["manual", "assist", "semi"]


class BookCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1)
    genre: str | None = None
    target_words: int = 0
    premise: str | None = None


class BookUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = None
    genre: str | None = None
    target_words: int | None = None
    premise: str | None = None
    summary: str | None = None
    writing_mode: WritingMode | None = None


class BookOut(BaseModel):
    id: int
    slug: str
    title: str
    genre: str | None = None
    target_words: int = 0
    premise: str | None = None
    summary: str | None = None
    writing_mode: WritingMode = "assist"
    created_at: str
    updated_at: str


class BookBrief(BaseModel):
    slug: str
    title: str
    genre: str | None = None
    total_words: int = 0
    chapter_count: int = 0
    updated_at: str | None = None
