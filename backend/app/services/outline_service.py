"""大纲服务（R7）：三级树 CRUD + AI 展开（只出候选，不落库）。"""

from __future__ import annotations

import json
import sqlite3

from app.db.registry import get_registry, now_iso
from app.errors import (
    JSONParseFailedError,
    OutlineNotFoundError,
    ValidationError,
)
from app.logging_config import get_logger, log_fields
from app.models.outline import (
    OutlineCandidate,
    OutlineExpandRequest,
    OutlineExpandResponse,
    OutlineInput,
    OutlineOut,
    OutlineUpdate,
)
from app.repositories import foreshadow_repo, locate_repo, outline_repo
from app.services import workspace
from app.services.llm import registry as llm_registry
from app.services.llm.prompts import build_prompt
from app.utils.json_parse import parse_json_array_loose

logger = get_logger(__name__)

_EXPAND_PARENT = {"volume": "total", "chapter": "volume"}
_LEVEL_ZH = {"total": "总纲", "volume": "卷纲", "chapter": "章节卡"}


def list_outlines(slug: str, level: str | None, parent_id: int | None) -> list[OutlineOut]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = outline_repo.list_all(conn, level, parent_id)
    return [OutlineOut(**r) for r in rows]


def create_outline(slug: str, payload: OutlineInput) -> OutlineOut:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        seq = payload.seq or outline_repo.next_seq(conn, payload.level, payload.parent_id)
        outline_id = outline_repo.create(
            conn, {**payload.model_dump(), "seq": seq}, now
        )
        row = outline_repo.get(conn, outline_id)
    return OutlineOut(**row)


def update_outline(outline_id: int, payload: OutlineUpdate) -> OutlineOut:
    slug = workspace.resolve_slug(locate_repo.has_outline, outline_id, OutlineNotFoundError())
    registry = get_registry()
    workspace.set_active(slug)
    now = now_iso()
    with registry.database(slug).transaction() as conn:
        outline_repo.update(conn, outline_id, payload.model_dump(exclude_unset=True), now)
        row = outline_repo.get(conn, outline_id)
        if row is None:
            raise OutlineNotFoundError()
    return OutlineOut(**row)


def delete_outline(outline_id: int) -> None:
    slug = workspace.resolve_slug(locate_repo.has_outline, outline_id, OutlineNotFoundError())
    registry = get_registry()
    with registry.database(slug).transaction() as conn:
        if not outline_repo.delete(conn, outline_id):
            raise OutlineNotFoundError()


def _validate_expand(node: dict, expand_level: str) -> None:
    required_parent = _EXPAND_PARENT[expand_level]
    if node["level"] != required_parent:
        raise ValidationError(
            f"只能把「{_LEVEL_ZH.get(required_parent, required_parent)}」展开为"
            f"「{_LEVEL_ZH.get(expand_level, expand_level)}」"
        )


def _normalize_candidates(data: dict, expand_level: str) -> list[OutlineCandidate]:
    result: list[OutlineCandidate] = []
    for index, item in enumerate(data.get("candidates") or [], start=1):
        if not isinstance(item, dict) or not item.get("title"):
            continue
        result.append(
            OutlineCandidate(
                level=expand_level,
                title=str(item["title"]),
                content=str(item.get("content") or ""),
                seq=int(item.get("seq") or index),
                rationale=item.get("rationale"),
            )
        )
    return result


def expand_outline(outline_id: int, payload: OutlineExpandRequest) -> OutlineExpandResponse:
    slug = workspace.resolve_slug(locate_repo.has_outline, outline_id, OutlineNotFoundError())
    registry = get_registry()
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        node = outline_repo.get(conn, outline_id)
        if node is None:
            raise OutlineNotFoundError()
        _validate_expand(node, payload.expand_level)
        client = llm_registry.require_client("outline")
        book = _book_context(conn)
        open_fs = foreshadow_repo.open_foreshadows(conn)
        variables = {
            "genre": book.get("genre") or "未指定",
            "premise": book.get("premise") or "（未填写）",
            "level_name": _LEVEL_ZH.get(node["level"], node["level"]),
            "title": node.get("title") or "（未命名）",
            "content": node.get("content") or "（暂无要点）",
            "open_foreshadows": "\n".join(f"- {f['title']}" for f in open_fs) or "（暂无）",
            "extra_notes": (payload.context or {}).get("extra_notes") or "（无）",
            "count": payload.count or (5 if payload.expand_level == "volume" else 10),
            "target_name": "卷纲" if payload.expand_level == "volume" else "章节卡",
        }
        prompt = build_prompt("outline_expand", variables, provider=client.provider)

    raw = client.chat([{"role": "user", "content": prompt}], json_mode=True)
    try:
        data = parse_json_array_loose(raw)
    except json.JSONDecodeError as first_err:
        retry = (
            f"{prompt}\n\n上次输出的 JSON 解析失败，错误信息：{first_err}。"
            "请重新输出，确保是合法 JSON，不要包含任何解释文字。"
        )
        raw = client.chat([{"role": "user", "content": retry}], json_mode=True)
        try:
            data = parse_json_array_loose(raw)
        except json.JSONDecodeError:
            logger.warning("outline expand parse failed", **log_fields(outline_id=outline_id))
            raise JSONParseFailedError(detail={"raw_ai_output": raw}) from None

    candidates = _normalize_candidates(data, payload.expand_level)
    return OutlineExpandResponse(
        parent_id=outline_id,
        expand_level=payload.expand_level,
        candidates=candidates,
        raw_ai_output=raw,
    )


def _book_context(conn: sqlite3.Connection) -> dict:
    from app.repositories import book_repo

    return book_repo.get_row(conn) or {}
