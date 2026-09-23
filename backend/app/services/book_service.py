"""作品服务（R15）：列表扫描、新建、详情、更新、删除、统计缓存刷新。"""

from __future__ import annotations

from app.db.registry import (
    get_registry,
    now_iso,
    sanitize_slug,
)
from app.errors import BookExistsError, BookNotFoundError, ConflictError
from app.logging_config import get_logger, log_fields
from app.models.book import BookBrief, BookCreate, BookOut, BookUpdate
from app.repositories import book_repo
from app.services import workspace

logger = get_logger(__name__)

# `_unique_slug` 是「查可用名 → 再建目录」的两步，存在查-写竞态：两个并发请求可能
# 选中同一个候选名。撞上时重算 slug 重试；有限次后仍冲突才 409。
_SLUG_RETRIES = 5


def _unique_slug(base_title: str) -> str:
    registry = get_registry()
    base = sanitize_slug(base_title) or "book"
    candidate = base
    index = 2
    while registry.exists(candidate) or registry.book_dir(candidate).exists():
        candidate = f"{base}-{index}"
        index += 1
    return candidate


def _row_to_out(slug: str, row: dict) -> BookOut:
    return BookOut(
        id=row["id"],
        slug=slug,
        title=row["title"],
        genre=row.get("genre"),
        target_words=row.get("target_words") or 0,
        premise=row.get("premise"),
        summary=row.get("summary"),
        writing_mode=row.get("writing_mode") or "assist",
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _refresh_stats(slug: str, meta: dict) -> dict:
    registry = get_registry()
    with registry.database(slug).connection() as conn:
        total = book_repo.total_words(conn)
        count = book_repo.count_chapters(conn)
    meta.update({"total_words": total, "chapter_count": count})
    registry.write_meta(slug, meta)
    return meta


def refresh_stats(slug: str) -> None:
    registry = get_registry()
    if not registry.exists(slug):
        return
    _refresh_stats(slug, registry.read_meta(slug))


def list_books() -> list[BookBrief]:
    registry = get_registry()
    briefs: list[BookBrief] = []
    for slug in registry.list_slugs():
        meta = registry.read_meta(slug)
        briefs.append(
            BookBrief(
                slug=slug,
                title=meta.get("title") or slug,
                genre=meta.get("genre"),
                total_words=int(meta.get("total_words") or 0),
                chapter_count=int(meta.get("chapter_count") or 0),
                updated_at=meta.get("updated_at"),
            )
        )
    return briefs


def create_book(payload: BookCreate) -> BookOut:
    registry = get_registry()
    now = now_iso()
    slug = ""
    meta: dict = {}
    for attempt in range(_SLUG_RETRIES):
        slug = _unique_slug(payload.title)
        meta = {
            "slug": slug,
            "title": payload.title,
            "genre": payload.genre,
            "target_words": payload.target_words,
            "premise": payload.premise,
            "writing_mode": "assist",
            "created_at": now,
            "updated_at": now,
            "total_words": 0,
            "chapter_count": 0,
        }
        try:
            registry.create(slug, meta)
        except BookExistsError:
            # 查-写竞态：别的请求刚抢占了我们选的 slug → 重算并重试
            logger.warning(
                "book slug race; recomputing",
                **log_fields(slug=slug, attempt=attempt + 1),
            )
            continue
        break
    else:
        # 重试耗尽仍撞名：明确 409（BOOK_EXISTS），不要退化成 500
        raise BookExistsError(f"同名作品已存在：{payload.title}")

    try:
        with registry.database(slug).transaction() as conn:
            book_id = book_repo.create_row(
                conn,
                title=payload.title,
                genre=payload.genre,
                target_words=payload.target_words,
                premise=payload.premise,
                writing_mode="assist",
                now=now,
            )
        meta["book_id"] = book_id
        registry.write_meta(slug, meta)
    except Exception:
        registry.move_to_recycle(slug)
        raise
    workspace.set_active(slug)
    # 模型配置已全局化（data/app.db），新书天然共享，无需再复制
    logger.info("book_service.create", **log_fields(slug=slug, book_id=book_id))
    return get_book(slug)


def get_book(slug: str) -> BookOut:
    registry = get_registry()
    registry.require(slug)
    with registry.database(slug).connection() as conn:
        row = book_repo.get_row(conn)
    if row is None:
        raise BookNotFoundError(f"作品缺少元信息记录：{slug}")
    # 契约口径（workspace.py 文档）：凡带 {book} 的端点都应更新当前作品指针。
    # get_book 也必须设 —— 前端「进入作品」最自然的动作就是先 GET 这本书的详情，
    # 若这一步不设指针，之后所有依赖指针的调用（providers / chapters 等）都会 NO_ACTIVE_BOOK。
    workspace.set_active(slug)
    return _row_to_out(slug, row)


def update_book(slug: str, payload: BookUpdate) -> BookOut:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    fields = payload.model_dump(exclude_unset=True)
    now = now_iso()
    if fields:
        fields["updated_at"] = now
        with registry.database(slug).transaction() as conn:
            row = book_repo.get_row(conn)
            if row is None:
                raise BookNotFoundError(f"作品缺少元信息记录：{slug}")
            book_repo.update_row(conn, row["id"], fields)
    meta_updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items()}
    meta_updates["updated_at"] = now
    registry.patch_meta(slug, meta_updates)
    return get_book(slug)


def delete_book(slug: str) -> None:
    registry = get_registry()
    registry.require(slug)
    registry.move_to_recycle(slug)
    if workspace.get_active() == slug:
        workspace.clear_active()
    logger.info("book_service.delete", **log_fields(slug=slug))
