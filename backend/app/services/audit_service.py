"""质检服务（R10 去 AI 味 / R18 敏感词自查 / 词库状态）。

两个检测功能都是**纯本地**：读章节正文、跑本地规则或本地词库，**不调用模型、不联网**。
因此即便用户没有配置任何模型，这两个端点也必须正常返回 200（项目红线 3）。
"""

from __future__ import annotations

from app.config import settings
from app.db.registry import get_registry
from app.errors import ChapterNotFoundError
from app.models.audit import (
    AiFlavorResult,
    FlavorHitOut,
    SensitiveHitOut,
    SensitiveResult,
    WordlistStatus,
)
from app.repositories import chapter_repo, locate_repo
from app.services import workspace
from app.services.audit import ai_flavor, sensitive
from app.services.audit.wordlist import load_wordlist, wordlist_path
from app.utils.text import strip_html


def detect_ai_flavor(chapter_id: int) -> AiFlavorResult:
    """对单章正文跑去 AI 味本地规则，返回评分与命中列表。"""
    slug = workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())
    with get_registry().database(slug).connection() as conn:
        row = chapter_repo.get(conn, chapter_id)
    if row is None:
        raise ChapterNotFoundError()
    plain = strip_html(row.get("content") or "")
    score, hits = ai_flavor.detect(plain)
    return AiFlavorResult(
        score=score,
        hits=[
            FlavorHitOut(type=h.type, text=h.text, position=h.position, suggestion=h.suggestion)
            for h in hits
        ],
    )


def scan_sensitive(slug: str) -> SensitiveResult:
    """扫描整部作品的正文，按「词条 × 章节」返回命中与总次数。"""
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = chapter_repo.list_full_chapters(conn)
    wordlist = load_wordlist(wordlist_path(settings.data_dir))
    hits = sensitive.scan_chapters(rows, wordlist)
    return SensitiveResult(
        total_hits=sum(h.count for h in hits),
        hits=[
            SensitiveHitOut(
                word=h.word, category=h.category, chapter_seq=h.chapter_seq, count=h.count
            )
            for h in hits
        ],
    )


def wordlist_status() -> WordlistStatus:
    """词库状态：未配置 / 已配置 N 条。只读、无副作用。"""
    path = wordlist_path(settings.data_dir)
    wordlist = load_wordlist(path)
    return WordlistStatus(configured=wordlist.count > 0, count=wordlist.count, path=str(path))
