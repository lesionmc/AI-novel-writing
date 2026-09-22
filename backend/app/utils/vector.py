"""向量工具：float 列表 <-> BLOB、余弦相似度（无业务、无副作用）。"""

from __future__ import annotations

import math
import struct


def to_blob(vec: list[float]) -> bytes:
    """float32 小端 BLOB（sqlite-vec vec0 FLOAT[1024] 约定）。"""
    return struct.pack(f"<{len(vec)}f", *vec)


def from_blob(blob: bytes | memoryview | None) -> list[float]:
    if not blob:
        return []
    raw = bytes(blob)
    count = len(raw) // 4
    return list(struct.unpack(f"<{count}f", raw[: count * 4]))


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    size = min(len(a), len(b))
    dot = sum(a[i] * b[i] for i in range(size))
    na = math.sqrt(sum(x * x for x in a[:size]))
    nb = math.sqrt(sum(x * x for x in b[:size]))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)
