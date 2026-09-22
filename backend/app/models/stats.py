"""统计（stats / R17）模型。"""

from __future__ import annotations

from pydantic import BaseModel


class DailyEntry(BaseModel):
    date: str
    words_added: int = 0


class BookStats(BaseModel):
    total_words: int = 0
    chapter_count: int = 0
    done_chapters: int = 0
    daily: list[DailyEntry] = []
