"""设定库路由（R1）：人物 / 世界词条 / 伏笔。"""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.models.character import (
    AffectedChapter,
    CharacterInput,
    CharacterOut,
    CharacterUpdate,
)
from app.models.foreshadow import ForeshadowInput, ForeshadowOut, ForeshadowUpdate
from app.models.world_entry import WorldEntryInput, WorldEntryOut, WorldEntryUpdate
from app.services import setting_service

router = APIRouter(tags=["settings"])


# --------------------------------------------------------------- characters
@router.get("/api/books/{book}/characters", response_model=list[CharacterOut])
def list_characters(
    book: str,
    role: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
) -> list[CharacterOut]:
    return setting_service.list_characters(book, role, status_filter)


@router.post(
    "/api/books/{book}/characters",
    response_model=CharacterOut,
    status_code=status.HTTP_201_CREATED,
)
def create_character(book: str, payload: CharacterInput) -> CharacterOut:
    return setting_service.create_character(book, payload)


@router.get("/api/characters/{char_id}", response_model=CharacterOut)
def get_character(char_id: int) -> CharacterOut:
    return setting_service.get_character(char_id)


@router.patch("/api/characters/{char_id}", response_model=CharacterOut)
def update_character(char_id: int, payload: CharacterUpdate) -> CharacterOut:
    return setting_service.update_character(char_id, payload)


@router.delete("/api/characters/{char_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_character(char_id: int) -> None:
    setting_service.delete_character(char_id)


@router.get("/api/characters/{char_id}/affected-chapters", response_model=list[AffectedChapter])
def affected_chapters(char_id: int) -> list[AffectedChapter]:
    return setting_service.affected_chapters(char_id)


# -------------------------------------------------------------- world entries
@router.get("/api/books/{book}/world-entries", response_model=list[WorldEntryOut])
def list_world_entries(
    book: str,
    category: str | None = Query(default=None),
    parent_id: int | None = Query(default=None),
) -> list[WorldEntryOut]:
    return setting_service.list_world_entries(book, category, parent_id)


@router.post(
    "/api/books/{book}/world-entries",
    response_model=WorldEntryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_world_entry(book: str, payload: WorldEntryInput) -> WorldEntryOut:
    return setting_service.create_world_entry(book, payload)


@router.patch("/api/world-entries/{entry_id}", response_model=WorldEntryOut)
def update_world_entry(entry_id: int, payload: WorldEntryUpdate) -> WorldEntryOut:
    return setting_service.update_world_entry(entry_id, payload)


@router.delete("/api/world-entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_world_entry(entry_id: int) -> None:
    setting_service.delete_world_entry(entry_id)


# --------------------------------------------------------------- foreshadows
@router.get("/api/books/{book}/foreshadows", response_model=list[ForeshadowOut])
def list_foreshadows(
    book: str,
    status_filter: str | None = Query(default="open", alias="status"),
) -> list[ForeshadowOut]:
    return setting_service.list_foreshadows(book, status_filter)


@router.post(
    "/api/books/{book}/foreshadows",
    response_model=ForeshadowOut,
    status_code=status.HTTP_201_CREATED,
)
def create_foreshadow(book: str, payload: ForeshadowInput) -> ForeshadowOut:
    return setting_service.create_foreshadow(book, payload)


@router.patch("/api/foreshadows/{fs_id}", response_model=ForeshadowOut)
def update_foreshadow(fs_id: int, payload: ForeshadowUpdate) -> ForeshadowOut:
    return setting_service.update_foreshadow(fs_id, payload)
