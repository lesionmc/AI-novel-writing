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
            "readers": book.get("readers") or "（未填写）",
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


# ------------------------------------------------------------- 卷摘要（记忆金字塔）
_VOLUME_SUMMARY_MARK = "【本卷摘要】"
_VOLUME_SUMMARY_END = "【本卷摘要完】"


def _volume_chapter_rows(conn: sqlite3.Connection, volume_id: int) -> list[dict]:
    """卷纲子树里挂着的已写章节（按 seq 升序）。"""
    from app.repositories import chapter_repo

    children: dict[int, list[dict]] = {}
    for node in outline_repo.list_all(conn):
        parent = node.get("parent_id")
        if parent is not None:
            children.setdefault(int(parent), []).append(node)

    chapter_ids: list[int] = []
    stack = [volume_id]
    while stack:
        pid = stack.pop()
        for child in children.get(pid, []):
            if child["level"] == "chapter" and child.get("chapter_id"):
                chapter_ids.append(int(child["chapter_id"]))
            else:
                stack.append(int(child["id"]))

    rows = [chapter_repo.get(conn, cid) for cid in dict.fromkeys(chapter_ids)]
    return sorted((r for r in rows if r), key=lambda r: int(r["seq"]))


def _volume_summary_lines(chapters: list[dict]) -> str:
    from app.utils.text import strip_html

    lines: list[str] = []
    for ch in chapters:
        digest = (ch.get("chapter_summary") or "").strip()
        if not digest:
            digest = "…" + strip_html(ch.get("content") or "")[-120:]
        lines.append(f"- 第{ch['seq']}章｜{ch.get('title') or '未命名'}｜{digest or '（无内容）'}")
    return "\n".join(lines)


def _merge_volume_content(old_content: str, summary: str) -> str:
    """卷摘要作为**成对标记**的独立段合并进卷纲正文：重跑只替换标记对内的内容。

    没有结束标记的旧段（上一版格式）视为"到文末"，本次重跑会补上结束标记；
    此后用户在标记对之外写的卷末备注永远不受影响。
    """
    block = f"{_VOLUME_SUMMARY_MARK}\n{summary}\n{_VOLUME_SUMMARY_END}"
    start = old_content.find(_VOLUME_SUMMARY_MARK)
    if start == -1:
        base = old_content.rstrip()
        return f"{base}\n\n{block}" if base else block
    end = old_content.find(_VOLUME_SUMMARY_END, start)
    if end == -1:  # 旧格式：没有结束标记，替换到文末（此后升级为带尾标记的成对格式）
        head = old_content[:start].rstrip()
    else:
        head = (old_content[:start] + old_content[end + len(_VOLUME_SUMMARY_END):]).rstrip()
    return f"{head}\n\n{block}" if head else block


def summarize_volume(outline_id: int) -> dict:
    """AI 把本卷各章摘要压成一段卷摘要，写回卷纲节点（带标记、可重跑）。"""
    slug = workspace.resolve_slug(locate_repo.has_outline, outline_id, OutlineNotFoundError())
    registry = get_registry()
    workspace.set_active(slug)
    with registry.database(slug).connection() as conn:
        node = outline_repo.get(conn, outline_id)
        if node is None:
            raise OutlineNotFoundError()
        if node["level"] != "volume":
            raise ValidationError("只有卷纲节点能「汇总本卷」")
        chapters = _volume_chapter_rows(conn, outline_id)
        if not chapters:
            raise ValidationError("这一卷还没有挂着写完的章节 —— 先完成几章再回来汇总")
        client = llm_registry.require_client("content")
        book = _book_context(conn)
        prompt = build_prompt(
            "volume_summarize",
            {
                "book_title": book.get("title") or "（未命名）",
                "genre": book.get("genre") or "（未指定）",
                "volume_title": node.get("title") or "（未命名）",
                "volume_content": (node.get("content") or "（无）")[:800],
                "chapters": _volume_summary_lines(chapters),
            },
            provider=client.provider,
        )

    from app.services.llm.json_chat import chat_json

    data, raw = chat_json(client, prompt)
    raw_summary = data.get("summary")
    # 只接受字符串：模型给数组/对象时 str() 会把 Python repr 永久写进用户卷纲（审查发现）
    summary = raw_summary.strip() if isinstance(raw_summary, str) else ""
    if not summary:
        raise JSONParseFailedError(detail={"raw_ai_output": raw})

    with registry.database(slug).transaction() as conn:
        current = outline_repo.get(conn, outline_id) or {}
        outline_repo.update(
            conn,
            outline_id,
            {"content": _merge_volume_content(current.get("content") or "", summary),
             "updated_at": now_iso()},
            now_iso(),
        )
    logger.info("volume summarized", **log_fields(slug=slug, outline_id=outline_id, chapters=len(chapters)))
    return {"outline_id": outline_id, "summary": summary}
