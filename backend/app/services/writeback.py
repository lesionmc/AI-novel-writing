"""章末回写落库（R3 核心）：单事务 8 步，全部成功或全部回滚（TC-26）。

  1. chapter.status = done + chapter_summary / hook / finalized_at
  2. character_state 增量新增（无变化不写）
  3. plot_arc 更新
  4. 新伏笔写入
  5. 已回收伏笔关闭
  6. book.summary 更新
  7. chunk_meta 写入（+ vec_chunk **条件化**：扩展可用才写，否则跳过，坑 6 / D-17）
  8. writing_log 累加
"""

from __future__ import annotations

from datetime import datetime

from app.db.registry import BookRegistry, now_iso
from app.errors import ChapterNotFoundError
from app.logging_config import get_logger, log_fields
from app.models.memory import ConfirmResult, WritebackSuggestion
from app.repositories import (
    book_repo,
    chapter_repo,
    character_repo,
    chunk_repo,
    foreshadow_repo,
    memory_repo,
    writing_log_repo,
)
from app.services import foreshadow_rules
from app.services.llm import registry as llm_registry
from app.utils.chunk import split_text
from app.utils.text import strip_html

logger = get_logger(__name__)

_SUMMARY_CAP = 4000


def _today() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d")


def _update_book_summary(conn, seq: int, summary: str | None, now: str) -> None:
    if not summary:
        return
    row = book_repo.get_row(conn)
    if row is None:
        return
    line = f"第{seq}章：{summary.strip()}"
    existing = (row.get("summary") or "").strip()
    merged = f"{existing}\n{line}" if existing else line
    if len(merged) > _SUMMARY_CAP:
        merged = merged[-_SUMMARY_CAP:]
    book_repo.update_row(conn, row["id"], {"summary": merged, "updated_at": now})


def _index_chapter(
    conn,
    registry: BookRegistry,
    *,
    chapter_id: int,
    seq: int,
    content: str,
    now: str,
) -> int:
    chunks = split_text(strip_html(content or ""))
    if not chunks:
        return 0
    embeddings = None
    model_name = None
    embedding_client = llm_registry.get_embedding_client()
    if embedding_client is not None:
        try:
            vectors = embedding_client.embed(chunks)
            if len(vectors) == len(chunks):
                embeddings = vectors
                model_name = embedding_client.model
        except Exception as exc:  # 语义不可用不影响回写落库
            logger.warning("embedding failed during writeback; store chunks without vectors",
                           **log_fields(error=exc.__class__.__name__))
    count = 0
    for index, chunk in enumerate(chunks):
        vector = embeddings[index] if embeddings else None
        chunk_id = chunk_repo.upsert_chunk(
            conn,
            source_type="chapter",
            source_id=chapter_id,
            chapter_seq=seq,
            text=chunk,
            char_count=len(chunk),
            embedding_model=model_name,
            embedding=vector,
            now=now,
        )
        chunk_repo.insert_vec(conn, registry.caps, chunk_id=chunk_id, embedding=vector)
        count += 1
    return count


def confirm_writeback(slug: str, chapter_id: int, suggestion: WritebackSuggestion) -> ConfirmResult:
    from app.db.registry import get_registry

    registry = get_registry()
    result = ConfirmResult()
    with registry.database(slug).transaction() as conn:
        chapter = chapter_repo.get(conn, chapter_id)
        if chapter is None:
            raise ChapterNotFoundError()
        seq = int(chapter["seq"])
        was_done = chapter.get("status") == "done"
        now = now_iso()

        # 回写前自动快照当前正文（可回滚）
        chapter_repo.create_version(
            conn, chapter_id=chapter_id, content=chapter.get("content") or "",
            word_count=chapter.get("word_count") or 0, note="完成本章前自动快照", now=now,
        )

        # 1. 章节状态与摘要
        chapter_repo.finalize(
            conn,
            chapter_id,
            status="done",
            chapter_summary=suggestion.chapter_summary,
            hook=suggestion.hook,
            finalized_at=now,
            now=now,
        )

        # 2. 角色状态（仅 accepted；无变化不写）
        for item in suggestion.character_updates:
            if not item.accepted:
                continue
            char = character_repo.get_by_name(conn, item.name)
            if char is None:
                logger.warning("writeback: unknown character skipped",
                               **log_fields(name=item.name, seq=seq))
                continue
            prev = memory_repo.latest_state(conn, char["id"], seq)
            if prev is not None and prev["state"] == item.state:
                continue
            memory_repo.insert_state(
                conn, character_id=char["id"], chapter_seq=seq,
                state=item.state, source="manual", now=now,
            )
            result.character_states_written += 1

        # 3. 剧情线
        for item in suggestion.plot_progress:
            if not item.accepted:
                continue
            memory_repo.upsert_plot_arc(
                conn, name=item.arc, arc_type="sub", content=item.progress,
                last_seq=seq, now=now,
            )
            result.plot_arcs_updated += 1

        # 4. 新伏笔（硬兜底：即使调用方绕过 finalize 直接 confirm，也不允许单章超上限）
        accepted_fs = [item for item in suggestion.new_foreshadows if item.accepted]
        kept_fs, dropped_fs = foreshadow_rules.keep_top_by_importance(
            accepted_fs,
            lambda x: x.importance,
            foreshadow_rules.MAX_NEW_FORESHADOWS_PER_CHAPTER,
        )
        if dropped_fs:
            logger.info(
                "writeback: new_foreshadows trimmed at confirm",
                **log_fields(
                    seq=seq,
                    kept=len(kept_fs),
                    dropped=dropped_fs,
                    limit=foreshadow_rules.MAX_NEW_FORESHADOWS_PER_CHAPTER,
                ),
            )
        for item in kept_fs:
            foreshadow_repo.create(
                conn,
                {
                    "title": item.title,
                    "importance": item.importance,
                    "status": "open",
                    "planted_chapter_seq": seq,
                },
                now,
            )
            result.foreshadows_created += 1

        # 5. 关闭已回收伏笔
        for fid in suggestion.closed_foreshadow_ids:
            row = foreshadow_repo.get(conn, fid)
            if row is not None and row.get("status") != "closed":
                foreshadow_repo.update(
                    conn, fid, {"status": "closed", "actual_payoff_seq": seq}, now
                )
                result.foreshadows_closed += 1

        # 6. 全书摘要
        _update_book_summary(conn, seq, suggestion.chapter_summary, now)

        # 7. 分块与向量（vec 条件化）
        result.chunks_indexed = _index_chapter(
            conn, registry, chapter_id=chapter_id, seq=seq,
            content=chapter.get("content") or "", now=now,
        )

        # 8. 日更记录
        date = _today()
        if not was_done:
            writing_log_repo.add_words(conn, date, int(chapter.get("word_count") or 0))
        writing_log_repo.increment_finalized(conn, date, 1)

    logger.info(
        "writeback confirmed",
        **log_fields(slug=slug, chapter_id=chapter_id, **result.model_dump()),
    )
    return result
