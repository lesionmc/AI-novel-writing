"""文本分块：长章按 ~N 字切块并保留重叠（无业务、无副作用）。"""

from __future__ import annotations

from app.config import settings


def split_text(
    text: str,
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[str]:
    size = chunk_size or settings.chunk_size
    step = size - (overlap or settings.chunk_overlap)
    if step <= 0:
        step = size
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start += step
    return chunks
