"""敏感词扫描：把词库自动机应用到章节正文（纯本地，不联网）。

命中结构对齐契约 `auditSensitive`：`word / category / chapter_seq / count`。
每章正文先经 `app.utils.text.strip_html` 去 HTML，再交由词库做归一化匹配（复用既有工具，
不另写一套 HTML 剥离）。
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from app.services.audit.wordlist import WordList
from app.utils.text import strip_html


@dataclass(frozen=True)
class SensitiveHit:
    word: str
    category: str
    chapter_seq: int
    count: int


def scan_chapters(rows: Iterable[dict], wordlist: WordList) -> list[SensitiveHit]:
    """扫描章节（`rows` 需含 `seq` 与 `content`），按章聚合为命中列表。

    结果按 `(chapter_seq, word)` 排序，缺失正文的章节跳过。
    """
    hits: list[SensitiveHit] = []
    for row in rows:
        content = strip_html(row.get("content") or "")
        if not content:
            continue
        seq = int(row["seq"])
        for entry, count in wordlist.count_matches(content).items():
            hits.append(
                SensitiveHit(
                    word=entry.word, category=entry.category, chapter_seq=seq, count=count
                )
            )
    hits.sort(key=lambda h: (h.chapter_seq, h.word))
    return hits
