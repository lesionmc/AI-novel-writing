"""检索命中（R19）模型。"""

from __future__ import annotations

from pydantic import BaseModel


class SearchHit(BaseModel):
    source_type: str
    source_id: int
    chapter_seq: int | None = None
    title: str | None = None
    snippet: str = ""
