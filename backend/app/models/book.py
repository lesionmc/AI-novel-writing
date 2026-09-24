"""作品（book / R15）相关的 Pydantic 模型。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

WritingMode = Literal["manual", "assist", "semi"]

# 与 `app/db/registry.py::MAX_SLUG_LENGTH` 对齐：slug 由书名净化而来，书名长度也就是
# slug 长度的上界。在 Pydantic 层先挡一层，超长书名返回 400 而不是让建目录抛 500（P1-3）。
MAX_TITLE_LENGTH = 80


def _require_non_blank(value: str | None) -> str | None:
    if value is not None and not value.strip():
        raise ValueError("不能为空白字符")
    return value


class BookCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=MAX_TITLE_LENGTH)
    genre: str | None = None
    target_words: int = 0
    premise: str | None = None
    readers: str | None = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("书名不能为空白")
        return value


class BookUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = Field(default=None, min_length=1, max_length=MAX_TITLE_LENGTH)
    genre: str | None = None
    target_words: int | None = None
    premise: str | None = None
    readers: str | None = None
    summary: str | None = None
    writing_mode: WritingMode | None = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str | None) -> str | None:
        return _require_non_blank(value)


class BookOut(BaseModel):
    id: int
    slug: str
    title: str
    genre: str | None = None
    target_words: int = 0
    premise: str | None = None
    readers: str | None = None
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
