"""导出与统计路由（R16 / R17）。"""

from __future__ import annotations

from fastapi import APIRouter, Query, Response

from app.errors import ValidationError
from app.models.search import SearchHit
from app.models.stats import BookStats
from app.services import export_service, search_service, stats_service

router = APIRouter(prefix="/api/books", tags=["export"])


@router.get("/{book}/export")
def export_book(
    book: str,
    format: str = Query(...),  # noqa: A002 - 契约字段名
    range: str | None = Query(default=None),  # noqa: A002 - 契约字段名
) -> Response:
    if format == "txt":
        data, filename = export_service.export_txt(book, range)
        media = "text/plain; charset=utf-8"
    elif format == "docx":
        data, filename = export_service.export_docx(book, range)
        media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        raise ValidationError(f"不支持的导出格式：{format}（仅支持 txt / docx）")
    return Response(
        content=data,
        media_type=media,
        headers={"Content-Disposition": export_service.content_disposition(filename)},
    )


@router.get("/{book}/stats", response_model=BookStats)
def get_stats(book: str) -> BookStats:
    return BookStats(**stats_service.get_stats(book))


@router.get("/{book}/search", response_model=list[SearchHit])
def search_book(
    book: str,
    q: str = Query(...),
    limit: int = Query(default=30),
) -> list[SearchHit]:
    """M1 仅覆盖设定库范围（character / world_entry）；全书级检索留 M3。"""
    return [SearchHit(**hit) for hit in search_service.search_settings(book, q, limit)]
