"""章节服务（R2 / R11）：读写、自动保存（重算字数 + 同步 FTS）、版本与回滚。"""

from __future__ import annotations

from app.db.registry import get_registry, now_iso
from app.errors import ChapterNotFoundError, VersionNotFoundError
from app.logging_config import get_logger, log_fields
from app.models.chapter import (
    ChapterBrief,
    ChapterCreate,
    ChapterOut,
    ChapterPatch,
    ChapterSaveResult,
    ChapterVersionCreate,
    ChapterVersionOut,
)
from app.repositories import (
    chapter_repo,
    chunk_repo,
    locate_repo,
    outline_repo,
    search_repo,
)
from app.services import book_service, workspace
from app.utils.text import count_words

logger = get_logger(__name__)


def _to_brief(row: dict) -> ChapterBrief:
    return ChapterBrief(
        id=row["id"],
        seq=row["seq"],
        title=row.get("title"),
        word_count=row.get("word_count") or 0,
        status=row.get("status") or "draft",
        updated_at=row["updated_at"],
    )


def _to_out(row: dict) -> ChapterOut:
    return ChapterOut(
        id=row["id"],
        seq=row["seq"],
        title=row.get("title"),
        word_count=row.get("word_count") or 0,
        status=row.get("status") or "draft",
        updated_at=row["updated_at"],
        content=row.get("content") or "",
        chapter_summary=row.get("chapter_summary"),
        hook=row.get("hook"),
        finalized_at=row.get("finalized_at"),
        created_at=row["created_at"],
    )


def _require_chapter(conn, chapter_id: int) -> dict:
    row = chapter_repo.get(conn, chapter_id)
    if row is None:
        raise ChapterNotFoundError()
    return row


def list_chapters(slug: str) -> list[ChapterBrief]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = chapter_repo.list_briefs(conn)
    return [_to_brief(r) for r in rows]


def create_chapter(slug: str, payload: ChapterCreate) -> ChapterOut:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        seq = payload.seq if payload.seq is not None else chapter_repo.next_seq(conn)
        chapter_id = chapter_repo.create(conn, seq=seq, title=payload.title, now=now)
        row = _require_chapter(conn, chapter_id)
        search_repo.chapter_upsert(
            conn, registry.caps, chapter_id=chapter_id,
            title=row.get("title"), content="",
        )
    book_service.refresh_stats(slug)
    return _to_out(row)


def get_chapter(chapter_id: int) -> ChapterOut:
    slug = workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())
    with get_registry().database(slug).connection() as conn:
        row = _require_chapter(conn, chapter_id)
    return _to_out(row)


def save_chapter(chapter_id: int, payload: ChapterPatch) -> ChapterSaveResult:
    slug = workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())
    registry = get_registry()
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        row = _require_chapter(conn, chapter_id)
        fields = payload.model_dump(exclude_unset=True)
        if "content" in fields and fields["content"] is not None:
            fields["word_count"] = count_words(fields["content"])
        if fields:
            chapter_repo.save(conn, chapter_id, fields, now)
        row = _require_chapter(conn, chapter_id)
        search_repo.chapter_upsert(
            conn, registry.caps, chapter_id=chapter_id,
            title=row.get("title"), content=row.get("content") or "",
        )
    book_service.refresh_stats(slug)
    return ChapterSaveResult(
        id=chapter_id, word_count=row.get("word_count") or 0, updated_at=row["updated_at"]
    )


def delete_chapter(chapter_id: int) -> None:
    slug = workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())
    registry = get_registry()
    detached = 0
    with registry.database(slug).transaction() as conn:
        if not chapter_repo.exists(conn, chapter_id):
            raise ChapterNotFoundError()
        search_repo.chapter_delete(conn, registry.caps, chapter_id)
        chunk_repo.delete_for_source(
            conn, registry.caps, source_type="chapter", source_id=chapter_id
        )
        # 先解绑大纲节点再删章：`outline.chapter_id` 无外键，不显式置 NULL 就会永久悬空
        detached = outline_repo.detach_chapter(conn, chapter_id)
        chapter_repo.delete(conn, chapter_id)
    book_service.refresh_stats(slug)
    if detached:
        logger.info(
            "chapter deleted; outlines detached",
            **log_fields(slug=slug, chapter_id=chapter_id, detached=detached),
        )
    logger.info("chapter deleted", **log_fields(slug=slug, chapter_id=chapter_id))


# ------------------------------------------------------------------ versions
def list_versions(chapter_id: int) -> list[ChapterVersionOut]:
    slug = workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())
    with get_registry().database(slug).connection() as conn:
        _require_chapter(conn, chapter_id)
        rows = chapter_repo.list_versions(conn, chapter_id)
    return [
        ChapterVersionOut(
            id=r["id"], chapter_id=r["chapter_id"], word_count=r["word_count"],
            note=r.get("note"), created_at=r["created_at"],
        )
        for r in rows
    ]


def create_version(chapter_id: int, payload: ChapterVersionCreate) -> ChapterVersionOut:
    slug = workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())
    registry = get_registry()
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        row = _require_chapter(conn, chapter_id)
        vid = chapter_repo.create_version(
            conn, chapter_id=chapter_id, content=row.get("content") or "",
            word_count=row.get("word_count") or 0, note=payload.note, now=now,
        )
        version = chapter_repo.get_version(conn, vid)
    return ChapterVersionOut(
        id=version["id"], chapter_id=version["chapter_id"],
        word_count=version["word_count"], note=version.get("note"),
        created_at=version["created_at"],
    )


def get_version_content(chapter_id: int, version_id: int) -> dict:
    """单个版本的正文（diff 对比用）。只读。"""
    slug = workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())
    with get_registry().database(slug).connection() as conn:
        _require_chapter(conn, chapter_id)
        version = chapter_repo.get_version(conn, version_id)
        if version is None or version["chapter_id"] != chapter_id:
            raise VersionNotFoundError()
    return {
        "id": version["id"],
        "chapter_id": chapter_id,
        "content": version.get("content") or "",
        "word_count": version.get("word_count") or 0,
        "note": version.get("note"),
        "created_at": version["created_at"],
    }


def restore_version(chapter_id: int, version_id: int) -> ChapterOut:
    slug = workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())
    registry = get_registry()
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        current = _require_chapter(conn, chapter_id)
        version = chapter_repo.get_version(conn, version_id)
        if version is None or version["chapter_id"] != chapter_id:
            raise VersionNotFoundError()
        # 回滚前自动快照当前内容，保证可再找回（TC-14）
        chapter_repo.create_version(
            conn, chapter_id=chapter_id, content=current.get("content") or "",
            word_count=current.get("word_count") or 0,
            note=f"回滚到版本 {version_id} 前自动快照", now=now,
        )
        restored = version.get("content") or ""
        chapter_repo.save(
            conn, chapter_id,
            {"content": restored, "word_count": count_words(restored)}, now,
        )
        row = _require_chapter(conn, chapter_id)
        search_repo.chapter_upsert(
            conn, registry.caps, chapter_id=chapter_id,
            title=row.get("title"), content=restored,
        )
    book_service.refresh_stats(slug)
    return _to_out(row)
