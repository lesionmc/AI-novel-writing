"""统计服务（R17）：总字数、章数、日更曲线。"""

from __future__ import annotations

from app.db.registry import get_registry
from app.repositories import book_repo, chapter_repo, writing_log_repo
from app.services import workspace


def get_stats(slug: str) -> dict:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        total = book_repo.total_words(conn)
        chapter_count = book_repo.count_chapters(conn)
        done = book_repo.count_done_chapters(conn)
        daily = writing_log_repo.list_all(conn)
    return {
        "total_words": total,
        "chapter_count": chapter_count,
        "done_chapters": done,
        "daily": daily,
    }


def chapter_count(slug: str) -> int:
    registry = get_registry()
    with registry.database(slug).connection() as conn:
        return len(chapter_repo.list_briefs(conn))
