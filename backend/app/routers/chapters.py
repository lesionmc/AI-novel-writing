"""章节与版本路由（R2 / R11）。"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.routers._params import RowId
from app.models.chapter import (
    ChapterBrief,
    ChapterCreate,
    ChapterOut,
    ChapterPatch,
    ChapterSaveResult,
    ChapterVersionCreate,
    ChapterVersionOut,
)
from app.services import chapter_service

router = APIRouter(tags=["chapters"])


@router.get("/api/books/{book}/chapters", response_model=list[ChapterBrief])
def list_chapters(book: str) -> list[ChapterBrief]:
    return chapter_service.list_chapters(book)


@router.post(
    "/api/books/{book}/chapters",
    response_model=ChapterOut,
    status_code=status.HTTP_201_CREATED,
)
def create_chapter(book: str, payload: ChapterCreate) -> ChapterOut:
    return chapter_service.create_chapter(book, payload)


@router.get("/api/chapters/{chapter_id}", response_model=ChapterOut)
def get_chapter(chapter_id: RowId) -> ChapterOut:
    return chapter_service.get_chapter(chapter_id)


@router.patch("/api/chapters/{chapter_id}", response_model=ChapterSaveResult)
def save_chapter(chapter_id: RowId, payload: ChapterPatch) -> ChapterSaveResult:
    return chapter_service.save_chapter(chapter_id, payload)


@router.delete("/api/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter(chapter_id: RowId) -> None:
    chapter_service.delete_chapter(chapter_id)


@router.get("/api/chapters/{chapter_id}/versions", response_model=list[ChapterVersionOut])
def list_versions(chapter_id: RowId) -> list[ChapterVersionOut]:
    return chapter_service.list_versions(chapter_id)


@router.post(
    "/api/chapters/{chapter_id}/versions",
    response_model=ChapterVersionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_version(chapter_id: RowId, payload: ChapterVersionCreate) -> ChapterVersionOut:
    return chapter_service.create_version(chapter_id, payload)


@router.post(
    "/api/chapters/{chapter_id}/versions/{version_id}/restore",
    response_model=ChapterOut,
)
def restore_version(chapter_id: RowId, version_id: RowId) -> ChapterOut:
    return chapter_service.restore_version(chapter_id, version_id)
