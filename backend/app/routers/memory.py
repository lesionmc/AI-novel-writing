"""记忆与召回路由（R3 / R4，产品核心）。"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.routers._params import RowId
from app.errors import ChapterNotFoundError
from app.models.memory import (
    CharacterStateView,
    ConfirmResult,
    RecallLogOut,
    RecallResult,
    WritebackSuggestion,
)
from app.repositories import locate_repo
from app.services import memory_service, recall_service, workspace

router = APIRouter(tags=["memory"])


def _slug_of_chapter(chapter_id: int) -> str:
    return workspace.resolve_slug(
        locate_repo.has_chapter, chapter_id, ChapterNotFoundError()
    )


@router.get("/api/chapters/{chapter_id}/recall", response_model=RecallResult)
def get_recall(chapter_id: RowId) -> RecallResult:
    """写前召回：**有写 recall_log 副作用，前端须禁缓存、禁并发重复触发**。"""
    return recall_service.get_recall(_slug_of_chapter(chapter_id), chapter_id)


@router.post("/api/chapters/{chapter_id}/finalize", response_model=WritebackSuggestion)
def finalize_chapter(chapter_id: RowId) -> WritebackSuggestion:
    return memory_service.finalize_chapter(_slug_of_chapter(chapter_id), chapter_id)


@router.post("/api/chapters/{chapter_id}/finalize/confirm", response_model=ConfirmResult)
def confirm_chapter(chapter_id: RowId, payload: WritebackSuggestion) -> ConfirmResult:
    return memory_service.confirm_chapter(_slug_of_chapter(chapter_id), chapter_id, payload)


@router.get("/api/books/{book}/memory/summary")
def get_summary(book: str) -> dict:
    return memory_service.get_summary(book)


@router.get(
    "/api/books/{book}/memory/character-states",
    response_model=list[CharacterStateView],
)
def get_character_states(
    book: str, upto_seq: int | None = Query(default=None)
) -> list[CharacterStateView]:
    return memory_service.get_character_states(book, upto_seq)


@router.get("/api/books/{book}/memory/plot-arcs")
def get_plot_arcs(book: str) -> list[dict]:
    return memory_service.get_plot_arcs(book)


@router.get("/api/books/{book}/recall-logs", response_model=list[RecallLogOut])
def list_recall_logs(
    book: str,
    # 同 search：SQLite 的 `LIMIT -1` = 无上限，必须给界（非法值 → 400）。
    limit: int = Query(default=50, ge=1, le=200),
) -> list[RecallLogOut]:
    return memory_service.get_recall_logs(book, limit)
