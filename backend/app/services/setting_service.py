"""设定库服务（R1）：人物 / 世界词条 / 伏笔，含 FTS 同步与设定变更追踪。"""

from __future__ import annotations

from app.db.registry import get_registry, now_iso
import sqlite3

from app.errors import (
    CharacterNotFoundError,
    ConflictError,
    ForeshadowNotFoundError,
    NotFoundError,
    ValidationError,
    WorldEntryNotFoundError,
)
from app.logging_config import get_logger
from app.models.character import (
    AffectedChapter,
    CharacterInput,
    CharacterOut,
    CharacterRelationInput,
    CharacterRelationOut,
    CharacterUpdate,
)
from app.models.foreshadow import ForeshadowInput, ForeshadowOut, ForeshadowUpdate
from app.models.world_entry import WorldEntryInput, WorldEntryOut, WorldEntryUpdate
from app.repositories import (
    character_repo,
    foreshadow_repo,
    locate_repo,
    search_repo,
    world_entry_repo,
)
from app.services import workspace

logger = get_logger(__name__)


# ------------------------------------------------------------------ helpers
def _char_body(row: dict) -> str:
    parts = [
        row.get("alias"),
        row.get("surface_identity"),
        row.get("secret_desire"),
        row.get("fatal_weakness"),
        row.get("contradiction"),
        row.get("appearance"),
        row.get("background"),
    ]
    return "\n".join(str(p) for p in parts if p)


def _char_name(row: dict) -> str:
    alias = row.get("alias")
    return f"{row.get('name', '')} {alias}".strip() if alias else str(row.get("name", ""))


def _world_body(row: dict) -> str:
    return str(row.get("content") or "")


# --------------------------------------------------------------- characters
def list_characters(slug: str, role: str | None, status: str | None) -> list[CharacterOut]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = character_repo.list_all(conn, role, status)
    return [CharacterOut(**row) for row in rows]


def create_character(slug: str, payload: CharacterInput) -> CharacterOut:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        char_id = character_repo.create(conn, payload.model_dump(), now)
        row = character_repo.get(conn, char_id)
        search_repo.setting_upsert(
            conn,
            registry.caps,
            source_type="character",
            source_id=char_id,
            name=_char_name(row),
            body=_char_body(row),
        )
    return CharacterOut(**row)


def get_character(char_id: int) -> CharacterOut:
    slug = workspace.resolve_slug(locate_repo.has_character, char_id, CharacterNotFoundError())
    with get_registry().database(slug).connection() as conn:
        row = character_repo.get(conn, char_id)
    if row is None:
        raise CharacterNotFoundError()
    return CharacterOut(**row)


def update_character(char_id: int, payload: CharacterUpdate) -> CharacterOut:
    slug = workspace.resolve_slug(locate_repo.has_character, char_id, CharacterNotFoundError())
    registry = get_registry()
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        character_repo.update(conn, char_id, payload.model_dump(exclude_unset=True), now)
        row = character_repo.get(conn, char_id)
        if row is None:
            raise CharacterNotFoundError()
        search_repo.setting_upsert(
            conn, registry.caps, source_type="character", source_id=char_id,
            name=_char_name(row), body=_char_body(row),
        )
    return CharacterOut(**row)


def delete_character(char_id: int) -> None:
    slug = workspace.resolve_slug(locate_repo.has_character, char_id, CharacterNotFoundError())
    registry = get_registry()
    with registry.database(slug).transaction() as conn:
        if not character_repo.delete(conn, char_id):
            raise CharacterNotFoundError()
        search_repo.setting_delete(
            conn, registry.caps, source_type="character", source_id=char_id
        )


def affected_chapters(char_id: int) -> list[AffectedChapter]:
    slug = workspace.resolve_slug(locate_repo.has_character, char_id, CharacterNotFoundError())
    with get_registry().database(slug).connection() as conn:
        row = character_repo.get(conn, char_id)
        if row is None:
            raise CharacterNotFoundError()
        rows = character_repo.affected_chapters(conn, row["name"])
    return [AffectedChapter(**r) for r in rows]


# ------------------------------------------------------------- world entries
def list_world_entries(
    slug: str, category: str | None, parent_id: int | None
) -> list[WorldEntryOut]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = world_entry_repo.list_all(conn, category, parent_id)
    return [WorldEntryOut(**row) for row in rows]


def create_world_entry(slug: str, payload: WorldEntryInput) -> WorldEntryOut:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        entry_id = world_entry_repo.create(conn, payload.model_dump(), now)
        row = world_entry_repo.get(conn, entry_id)
        search_repo.setting_upsert(
            conn, registry.caps, source_type="world_entry", source_id=entry_id,
            name=str(row.get("name", "")), body=_world_body(row),
        )
    return WorldEntryOut(**row)


def update_world_entry(entry_id: int, payload: WorldEntryUpdate) -> WorldEntryOut:
    slug = workspace.resolve_slug(
        locate_repo.has_world_entry, entry_id, WorldEntryNotFoundError()
    )
    registry = get_registry()
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        world_entry_repo.update(conn, entry_id, payload.model_dump(exclude_unset=True), now)
        row = world_entry_repo.get(conn, entry_id)
        if row is None:
            raise WorldEntryNotFoundError()
        search_repo.setting_upsert(
            conn, registry.caps, source_type="world_entry", source_id=entry_id,
            name=str(row.get("name", "")), body=_world_body(row),
        )
    return WorldEntryOut(**row)


def delete_world_entry(entry_id: int) -> None:
    slug = workspace.resolve_slug(
        locate_repo.has_world_entry, entry_id, WorldEntryNotFoundError()
    )
    registry = get_registry()
    with registry.database(slug).transaction() as conn:
        if not world_entry_repo.delete(conn, entry_id):
            raise WorldEntryNotFoundError()
        search_repo.setting_delete(
            conn, registry.caps, source_type="world_entry", source_id=entry_id
        )


# --------------------------------------------------------------- foreshadows
def list_foreshadows(slug: str, status: str | None) -> list[ForeshadowOut]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = foreshadow_repo.list_all(conn, status)
    return [ForeshadowOut(**row) for row in rows]


def create_foreshadow(slug: str, payload: ForeshadowInput) -> ForeshadowOut:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        fs_id = foreshadow_repo.create(conn, payload.model_dump(), now)
        row = foreshadow_repo.get(conn, fs_id)
    return ForeshadowOut(**row)


def update_foreshadow(fs_id: int, payload: ForeshadowUpdate) -> ForeshadowOut:
    slug = workspace.resolve_slug(
        locate_repo.has_foreshadow, fs_id, ForeshadowNotFoundError()
    )
    registry = get_registry()
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        foreshadow_repo.update(conn, fs_id, payload.model_dump(exclude_unset=True), now)
        row = foreshadow_repo.get(conn, fs_id)
        if row is None:
            raise ForeshadowNotFoundError()
    return ForeshadowOut(**row)


# ------------------------------------------------------------- 人物关系（图谱）
def list_character_relations(slug: str) -> list[CharacterRelationOut]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        return [CharacterRelationOut(**r) for r in character_repo.list_relations(conn)]


def create_character_relation(slug: str, payload: CharacterRelationInput) -> CharacterRelationOut:
    """建一条关系边。两端必须是本书人物且不相同；重复边由 UNIQUE 挡下（409）。"""
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    if payload.from_char_id == payload.to_char_id:
        raise ValidationError("不能和自己是关系")
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        if character_repo.get(conn, payload.from_char_id) is None:
            raise CharacterNotFoundError()
        if character_repo.get(conn, payload.to_char_id) is None:
            raise CharacterNotFoundError()
        try:
            rid = character_repo.create_relation(
                conn,
                payload.from_char_id,
                payload.to_char_id,
                payload.relation_type.strip(),
                payload.note,
                now,
            )
        except sqlite3.IntegrityError:
            raise ConflictError("这两个人物之间已经有同一条关系了") from None
        row = next(r for r in character_repo.list_relations(conn) if r["id"] == rid)
    return CharacterRelationOut(**row)


def delete_character_relation(slug: str, relation_id: int) -> None:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).transaction() as conn:
        if not character_repo.delete_relation(conn, relation_id):
            raise NotFoundError("这条关系不存在")
