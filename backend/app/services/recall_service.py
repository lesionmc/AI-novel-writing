"""写前召回（R4 核心）：结构化优先 + 语义补充，两路合并去重，预算截断，写 recall_log。

红线：未配模型时**结构化召回照常返回**，面板绝不整体空白（TC-19）。
"""

from __future__ import annotations

import json
import sqlite3

from app.config import settings
from app.db.registry import get_registry, now_iso
from app.errors import ChapterNotFoundError
from app.logging_config import get_logger, log_fields
from app.models.memory import (
    RecallBudget,
    RecallCharacter,
    RecallChunk,
    RecallForeshadow,
    RecallResult,
)
from app.repositories import chapter_repo, chunk_repo, foreshadow_repo, memory_repo
from app.services import foreshadow_rules, workspace
from app.services.llm import registry as llm_registry
from app.services.llm.prompts import build_prompt
from app.services.presence import characters_in_text
from app.utils.text import estimate_tokens
from app.utils.vector import cosine, from_blob

logger = get_logger(__name__)


def _structured_characters(
    conn: sqlite3.Connection, chapter: dict
) -> list[RecallCharacter]:
    seq = int(chapter["seq"])
    result: list[RecallCharacter] = []
    seen: set[int] = set()
    for char in characters_in_text(conn, chapter.get("content") or ""):
        if char["id"] in seen:
            continue
        seen.add(char["id"])
        latest = memory_repo.latest_state(conn, char["id"], seq)
        result.append(
            RecallCharacter(
                character_id=char["id"],
                name=char["name"],
                role=char["role"],
                current_state=latest["state"] if latest else None,
                last_seen_seq=latest["chapter_seq"] if latest else None,
                relation_notes=None,
            )
        )
    return result


def _structured_foreshadows(conn: sqlite3.Connection, seq: int) -> list[RecallForeshadow]:
    # 按重要度排序（repo 已按 high→low 排）后截断：即使台账积了几十条，
    # 也不让"未回收伏笔"把召回上下文挤爆 —— 高/中重要度天然优先进入。
    rows = foreshadow_repo.open_foreshadows(conn)
    if len(rows) > foreshadow_rules.MAX_RECALL_FORESHADOWS:
        logger.info(
            "open foreshadows truncated for recall",
            **log_fields(total=len(rows), kept=foreshadow_rules.MAX_RECALL_FORESHADOWS),
        )
        rows = rows[: foreshadow_rules.MAX_RECALL_FORESHADOWS]
    result: list[RecallForeshadow] = []
    for row in rows:
        planted = row.get("planted_chapter_seq")
        age = seq - int(planted) if planted else 0
        result.append(
            RecallForeshadow(
                id=row["id"],
                title=row["title"],
                planted_seq=planted,
                importance=row["importance"],
                age=max(age, 0),
            )
        )
    return result


def _fallback_query(conn: sqlite3.Connection, chapter: dict) -> str:
    from app.repositories.base import fetch_all

    parts = [chapter.get("title") or ""]
    rows = fetch_all(
        conn,
        "SELECT content FROM outline WHERE level = 'chapter' AND chapter_id = ?",
        (int(chapter["id"]),),
    )
    parts.extend(r.get("content") or "" for r in rows)
    parts.append((chapter.get("content") or "")[:200])
    return " ".join(p.strip() for p in parts if p).strip()


def _build_query_text(conn: sqlite3.Connection, chapter: dict, char_names: list[str]) -> str:
    client = llm_registry.get_client_for_role("content")
    if client is None:
        return _fallback_query(conn, chapter)
    prev = chapter_repo.get_by_seq(conn, int(chapter["seq"]) - 1)
    variables = {
        "chapter_outline": _outline_text(conn, int(chapter["id"])),
        "characters": "、".join(char_names) or "（无）",
        "prev_summary": (prev or {}).get("chapter_summary") or "（无）",
    }
    try:
        prompt = build_prompt("recall_query", variables, provider=client.provider)
        # 不再写死 30 秒：推理模型（思考写入 reasoning_content）单次就可能 20 秒起步，
        # 30 秒会让召回在慢模型上频繁失败。统一走 llm 层的默认超时
        # （默认 180s，可用 AINOVEL_LLM_TIMEOUT 覆盖）。
        raw = client.chat([{"role": "user", "content": prompt}], json_mode=True)
        from app.utils.json_parse import parse_json_loose

        queries = parse_json_loose(raw).get("queries") or []
        joined = " ".join(str(q) for q in queries if q).strip()
        return joined or _fallback_query(conn, chapter)
    except Exception as exc:  # noqa: BLE001 - 查询生成失败静默降级
        logger.warning("recall query generation failed; fallback",
                       **log_fields(error=exc.__class__.__name__))
        return _fallback_query(conn, chapter)


def _outline_text(conn: sqlite3.Connection, chapter_id: int) -> str:
    from app.repositories.base import fetch_all

    rows = fetch_all(
        conn,
        "SELECT content FROM outline WHERE level = 'chapter' AND chapter_id = ?",
        (chapter_id,),
    )
    return "\n".join(r.get("content") or "" for r in rows) or "（本章暂无大纲要点）"


def _semantic_recall(
    conn: sqlite3.Connection, chapter: dict, char_names: list[str]
) -> tuple[list[RecallChunk], str | None, bool]:
    registry = get_registry()
    if not registry.caps.vec_available:
        return [], None, False
    embed_client = llm_registry.get_embedding_client()
    if embed_client is None:
        return [], None, False
    query_text = _build_query_text(conn, chapter, char_names) or None
    if not query_text:
        return [], None, False
    try:
        query_vec = embed_client.embed([query_text])[0]
    except Exception as exc:  # noqa: BLE001 - embedding 失败静默降级
        logger.warning("recall embedding failed; degrade to structured only",
                       **log_fields(error=exc.__class__.__name__))
        return [], query_text, False

    candidates = chunk_repo.search_candidates(
        conn, registry.caps, query_embedding=query_vec, limit=settings.semantic_top_k * 4
    )
    if not candidates:
        return [], query_text, True
    rows = chunk_repo.get_chunks_with_embedding(conn, [c["chunk_id"] for c in candidates])
    by_id = {int(r["id"]): r for r in rows}
    scored: list[RecallChunk] = []
    seen_text: set[str] = set()
    for cand in candidates:
        row = by_id.get(cand["chunk_id"])
        if row is None:
            continue
        score = cosine(query_vec, from_blob(row.get("embedding")))
        if score < settings.semantic_score_threshold:
            continue
        text = row.get("text") or ""
        if text in seen_text:
            continue
        seen_text.add(text)
        scored.append(
            RecallChunk(
                chunk_id=int(row["id"]),
                chapter_seq=row.get("chapter_seq"),
                text=text,
                score=round(score, 4),
            )
        )
    scored.sort(key=lambda c: c.score, reverse=True)
    return scored[: settings.semantic_top_k], query_text, True


def _apply_budget(
    characters: list[RecallCharacter],
    foreshadows: list[RecallForeshadow],
    chunks: list[RecallChunk],
    semantic_available: bool,
) -> RecallBudget:
    limit = settings.recall_budget_chars
    high = [f for f in foreshadows if f.importance == "high"]
    others = [f for f in foreshadows if f.importance != "high"]
    # 结构化在前（高重要度伏笔 → 人物状态 → 中低伏笔全量标题），语义在后
    segments: list[str] = []
    segments += [f"{f.title}（重要度：高，距今已{f.age}章）" for f in high]
    segments += [f"{c.name}：{c.current_state or ''}" for c in characters]
    segments += [f.title for f in others]
    segments += [c.text for c in chunks]

    total = 0
    truncated = False
    for seg in segments:
        if total + len(seg) > limit:
            truncated = True
            break
        total += len(seg)
    return RecallBudget(
        injected_chars=total,
        injected_tokens_est=estimate_tokens("字" * total) if total else 0,
        truncated=truncated,
        semantic_available=semantic_available,
    )


def get_recall(slug: str, chapter_id: int) -> RecallResult:
    registry = get_registry()
    registry.require(slug)
    workspace.set_active(slug)
    with registry.database(slug).transaction() as conn:
        chapter = chapter_repo.get(conn, chapter_id)
        if chapter is None:
            raise ChapterNotFoundError()
        seq = int(chapter["seq"])

        characters = _structured_characters(conn, chapter)
        foreshadows = _structured_foreshadows(conn, seq)
        plot_arcs = memory_repo.list_plot_arcs(conn)
        chunks, query_text, semantic_ok = _semantic_recall(
            conn, chapter, [c.name for c in characters]
        )
        budget = _apply_budget(characters, foreshadows, chunks, semantic_ok)

        memory_repo.insert_recall_log(
            conn,
            chapter_seq=seq,
            query_text=query_text,
            hit_chunk_ids=json.dumps([c.chunk_id for c in chunks]),
            hit_scores=json.dumps([c.score for c in chunks]),
            structured_hits=len(characters) + len(foreshadows),
            semantic_hits=len(chunks),
            injected_chars=budget.injected_chars,
            injected_tokens_est=budget.injected_tokens_est,
            now=now_iso(),
        )

    logger.info(
        "recall done",
        **log_fields(
            slug=slug, chapter_seq=seq, structured=len(characters) + len(foreshadows),
            semantic=len(chunks), semantic_available=semantic_ok,
        ),
    )
    return RecallResult(
        chapter_seq=seq,
        characters=characters,
        open_foreshadows=foreshadows,
        recalled_chunks=chunks,
        plot_arcs=plot_arcs,
        budget=budget,
    )

