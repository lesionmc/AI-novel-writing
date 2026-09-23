"""大纲路由（R7）。"""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.routers._params import RowId
from app.models.outline import (
    OutlineExpandRequest,
    OutlineExpandResponse,
    OutlineSummarizeResponse,
    OutlineInput,
    OutlineOut,
    OutlineUpdate,
)
from app.services import outline_service

router = APIRouter(tags=["outlines"])


@router.get("/api/books/{book}/outlines", response_model=list[OutlineOut])
def list_outlines(
    book: str,
    level: str | None = Query(default=None),
    parent_id: int | None = Query(default=None),
) -> list[OutlineOut]:
    return outline_service.list_outlines(book, level, parent_id)


@router.post(
    "/api/books/{book}/outlines",
    response_model=OutlineOut,
    status_code=status.HTTP_201_CREATED,
)
def create_outline(book: str, payload: OutlineInput) -> OutlineOut:
    return outline_service.create_outline(book, payload)


@router.patch("/api/outlines/{outline_id}", response_model=OutlineOut)
def update_outline(outline_id: RowId, payload: OutlineUpdate) -> OutlineOut:
    return outline_service.update_outline(outline_id, payload)


@router.delete("/api/outlines/{outline_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_outline(outline_id: RowId) -> None:
    outline_service.delete_outline(outline_id)


@router.post("/api/outlines/{outline_id}/expand", response_model=OutlineExpandResponse)
def expand_outline(outline_id: RowId, payload: OutlineExpandRequest) -> OutlineExpandResponse:
    return outline_service.expand_outline(outline_id, payload)


@router.post(
    "/api/outlines/{outline_id}/summarize-volume",
    response_model=OutlineSummarizeResponse,
)
def summarize_volume(outline_id: RowId) -> OutlineSummarizeResponse:
    """AI 把本卷各章摘要压成卷摘要并写回节点（记忆金字塔；重跑只替换标记段）。"""
    return OutlineSummarizeResponse(**outline_service.summarize_volume(outline_id))
