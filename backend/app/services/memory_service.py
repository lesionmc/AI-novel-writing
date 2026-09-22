"""记忆服务（R3）：finalize 生成回写建议（不落库）、confirm 委托、记忆读取端点。"""

from __future__ import annotations

import json
import sqlite3

from app.db.registry import get_registry
from app.errors import ChapterNotFoundError, JSONParseFailedError
from app.logging_config import get_logger, log_fields
from app.models.memory import (
    CharacterStateView,
    ConfirmResult,
    RecallLogOut,
    WritebackSuggestion,
)
from app.repositories import book_repo, chapter_repo, character_repo, foreshadow_repo, memory_repo
from app.services import foreshadow_rules, workspace
from app.services.llm import registry as llm_registry
from app.services.llm.prompts import build_prompt
from app.services.presence import characters_in_text
from app.services.writeback import confirm_writeback as _confirm
from app.utils.json_parse import parse_json_loose
from app.utils.labels import importance_label, role_label

logger = get_logger(__name__)

_VALID_IMPORTANCE = {"high", "medium", "low"}


def _matched_characters(conn: sqlite3.Connection, content: str) -> list[dict]:
    all_chars = character_repo.all_rows(conn)
    matched = [
        c for c in all_chars
        if (c["name"] and c["name"] in content)
        or (c.get("alias") and c["alias"] in content)
    ]
    if not matched:
        matched = [c for c in all_chars if c["role"] == "protagonist"]
    return matched


def _chapter_outline_text(conn: sqlite3.Connection, chapter_id: int) -> str:
    from app.repositories.base import fetch_all

    rows = fetch_all(
        conn,
        "SELECT title, content FROM outline WHERE level = 'chapter' AND chapter_id = ?",
        (chapter_id,),
    )
    if not rows:
        return "（本章暂无大纲要点）"
    return "\n".join(
        f"- {r.get('title') or ''}：{r.get('content') or ''}".strip() for r in rows
    )


def _build_variables(conn: sqlite3.Connection, chapter: dict) -> dict[str, str]:
    content = chapter.get("content") or ""
    chars = characters_in_text(conn, content)
    cards = "\n".join(
        f"{c['name']}（{role_label(c['role'])}）：{c.get('surface_identity') or '—'} / "
        f"{c.get('secret_desire') or '—'} / {c.get('fatal_weakness') or '—'}"
        for c in chars
    ) or "（本章无出场人物记录）"

    open_fs = foreshadow_repo.open_foreshadows(conn)
    fs_lines = "\n".join(
        f"[{f['id']}] {f['title']}（埋于第{f.get('planted_chapter_seq') or '?'}章，"
        f"重要度：{importance_label(f['importance'])}）"
        for f in open_fs
    ) or "（暂无未回收伏笔）"

    states = memory_repo.latest_states(conn, int(chapter["seq"]))
    state_lines = "\n".join(f"{s['name']}：{s['state']}" for s in states) or "（暂无角色状态）"

    return {
        "character_cards": cards,
        "open_foreshadows": fs_lines,
        "character_states": state_lines,
        "chapter_outline": _chapter_outline_text(conn, int(chapter["id"])),
        "chapter_content": content,
    }


def _normalize(data: dict, raw: str) -> WritebackSuggestion:
    updates = []
    for item in data.get("character_updates") or []:
        if isinstance(item, dict) and item.get("name") and item.get("state"):
            updates.append({
                "name": str(item["name"]), "state": str(item["state"]),
                "reason": item.get("reason"), "accepted": True,
            })
    progress = []
    for item in data.get("plot_progress") or []:
        if isinstance(item, dict) and item.get("arc") and item.get("progress"):
            progress.append({
                "arc": str(item["arc"]), "progress": str(item["progress"]), "accepted": True,
            })
    new_fs: list[dict] = []
    for item in data.get("new_foreshadows") or []:
        if isinstance(item, dict) and item.get("title"):
            importance = str(item.get("importance") or "medium").lower()
            if importance not in _VALID_IMPORTANCE:
                importance = "medium"
            new_fs.append({
                "title": str(item["title"]),
                "importance": importance,
                # accepted 的**权威默认**由后端按重要度给出：高/中保留，低默认不保留
                "accepted": foreshadow_rules.default_accepted(importance),
            })
    # 解析层硬裁剪：模型常超发（M2 实测每章 4~10 条），按重要度保留前 N 条再返回建议，
    # 用户在确认弹窗里看到的就是裁剪后的结果（不能只靠提示词约束模型）。
    new_fs, dropped = foreshadow_rules.keep_top_by_importance(
        new_fs,
        lambda x: x["importance"],
        foreshadow_rules.MAX_NEW_FORESHADOWS_PER_CHAPTER,
    )
    if dropped:
        logger.info(
            "new_foreshadows trimmed to per-chapter limit",
            **log_fields(
                kept=len(new_fs),
                dropped=dropped,
                limit=foreshadow_rules.MAX_NEW_FORESHADOWS_PER_CHAPTER,
            ),
        )
    closed = [int(x) for x in (data.get("closed_foreshadow_ids") or []) if isinstance(x, int)]
    return WritebackSuggestion(
        chapter_summary=data.get("chapter_summary"),
        character_updates=updates,
        plot_progress=progress,
        new_foreshadows=new_fs,
        closed_foreshadow_ids=closed,
        hook=data.get("hook"),
        raw_ai_output=raw,
    )


def finalize_chapter(slug: str, chapter_id: int) -> WritebackSuggestion:
    """生成回写建议：调用 AI，**不写任何库**。解析失败重试一次后仍失败则抛可读错误。"""
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        chapter = chapter_repo.get(conn, chapter_id)
        if chapter is None:
            raise ChapterNotFoundError()
        client = llm_registry.require_client("content")
        variables = _build_variables(conn, chapter)
        prompt = build_prompt("memory_writeback", variables, provider=client.provider)

    raw = client.chat([{"role": "user", "content": prompt}], json_mode=True)
    try:
        data = parse_json_loose(raw)
    except json.JSONDecodeError as first_err:
        retry_prompt = (
            f"{prompt}\n\n上次输出的 JSON 解析失败，错误信息：{first_err}。"
            "请重新输出，确保是合法 JSON，不要包含任何解释文字。"
        )
        raw = client.chat([{"role": "user", "content": retry_prompt}], json_mode=True)
        try:
            data = parse_json_loose(raw)
        except json.JSONDecodeError:
            logger.warning("writeback json parse failed after retry",
                           **log_fields(slug=slug, chapter_id=chapter_id))
            raise JSONParseFailedError(detail={"raw_ai_output": raw}) from None
    return _normalize(data, raw)


def confirm_chapter(slug: str, chapter_id: int, suggestion: WritebackSuggestion) -> ConfirmResult:
    workspace.set_active(slug)
    return _confirm(slug, chapter_id, suggestion)


def get_summary(slug: str) -> dict:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        row = book_repo.get_summary(conn)
    return {"summary": (row or {}).get("summary"), "updated_at": (row or {}).get("updated_at")}


def get_character_states(slug: str, upto_seq: int | None) -> list[CharacterStateView]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = memory_repo.latest_states(conn, upto_seq)
    return [CharacterStateView(**r) for r in rows]


def get_plot_arcs(slug: str) -> list[dict]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        return memory_repo.list_plot_arcs(conn)


def get_recall_logs(slug: str, limit: int) -> list[RecallLogOut]:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        rows = memory_repo.list_recall_logs(conn, limit)
    return [RecallLogOut(**r) for r in rows]
