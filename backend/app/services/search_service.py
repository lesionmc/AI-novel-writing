"""设定库检索服务（R19 的 M1 范围）。"""

from __future__ import annotations

from app.db.registry import get_registry
from app.repositories import search_setting_repo
from app.services import workspace


def search_settings(slug: str, query: str, limit: int) -> list[dict]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = search_setting_repo.search_setting(conn, registry.caps, query, limit)
    return [
        {
            "source_type": r["source_type"],
            "source_id": r["source_id"],
            "chapter_seq": r.get("chapter_seq"),
            "title": r.get("title"),
            "snippet": r.get("snippet") or "",
        }
        for r in rows
    ]
