"""一致性审校的**数据准备层**：章节/设定/状态文本的取用与冲突解析。

从 `consistency_service.py` 拆出（守住单文件 ≤ 300 行的硬规则）—— 这里全是
与模型调用无关的纯函数：读库、拼文本、把模型返回的条目解析成 `ConsistencyConflict`。
主流程（SSE 帧编排、两轮审校）仍在 `consistency_service.py`。
"""

from __future__ import annotations

import sqlite3

from app.models.writing_ai import ConsistencyConflict
from app.repositories.base import fetch_all
from app.services import writing_ai_service, writing_context
from app.logging_config import get_logger, log_fields

logger = get_logger(__name__)

#: 单次送审的章节摘要字符预算
CHUNK_SUMMARY_CHARS = 6000


def parse_scope(scope: str | None, seqs: list[int]) -> list[int]:
    """把 `scope` 解析成本次要审校的章节号列表。

    支持：缺省 / "all" = 全部；"1-50" = 区间；"3" = 单章。
    解析不出东西时**回退为全部**（宁多做，不可静默什么都不审）。
    """
    if not scope or scope.strip().lower() == "all":
        return seqs
    text = scope.strip()
    try:
        if "-" in text:
            lo, hi = text.split("-", 1)
            start, end = int(lo), int(hi)
            picked = [s for s in seqs if start <= s <= end]
        else:
            target = int(text)
            picked = [s for s in seqs if s == target]
    except ValueError:
        logger.warning("consistency scope unparsable; fallback to all", **log_fields(scope=scope))
        return seqs
    return picked or seqs


def chapters(conn: sqlite3.Connection) -> list[dict]:
    return fetch_all(
        conn,
        """
        SELECT c.seq AS seq, c.title AS title, c.chapter_summary AS summary
        FROM chapter c
        ORDER BY c.seq ASC
        """,
    )


def summaries_text(rows: list[dict]) -> str:
    lines: list[str] = []
    for row in rows:
        summary = (row.get("summary") or "").strip()
        title = (row.get("title") or "").strip()
        if summary:
            lines.append(f"第 {row['seq']} 章《{title}》：{summary}")
        else:
            lines.append(f"第 {row['seq']} 章《{title}》：（本章没有记忆摘要，无法比对）")
    return writing_context.clip_text("\n".join(lines), CHUNK_SUMMARY_CHARS)


def to_conflict(item: object) -> ConsistencyConflict | None:
    if not isinstance(item, dict):
        return None
    conflict = str(item.get("conflict") or "").strip()
    subject = str(item.get("subject") or "").strip()
    if not conflict and not subject:
        return None
    chapters: list[int] = []
    for value in item.get("chapters") or []:
        try:
            chapters.append(int(value))
        except (TypeError, ValueError):
            continue
    return ConsistencyConflict(
        severity=writing_ai_service.normalize_severity(item.get("severity")),
        chapters=sorted(set(chapters)),
        subject=subject,
        conflict=conflict,
        evidence=str(item.get("evidence") or "").strip(),
    )


def dedup_key(conflict: ConsistencyConflict) -> tuple:
    """去重键：跨轮次同一条矛盾很常见（分块和全局都可能抓到）。

    用「涉及对象 + 矛盾描述前 40 字」做键 —— 同一矛盾换个说法描述时截断相同前缀仍能命中；
    只按 severity 或章节号去重则会误伤（同一章可能有多条不同矛盾）。
    """
    return (conflict.subject, conflict.conflict[:40])


def book_row(conn: sqlite3.Connection) -> dict:
    rows = fetch_all(conn, "SELECT title, genre, premise FROM book LIMIT 1")
    return rows[0] if rows else {}


def settings_for_audit(conn: sqlite3.Connection, book: dict) -> str:
    """审校用的设定文本：书名/题材 + 设定库全文。"""
    head = f"书名：{book.get('title') or '（未命名）'}　题材：{book.get('genre') or '（未指定）'}"
    premise = (book.get("premise") or "").strip()
    if premise:
        head += f"\n一句话卖点：{premise}"
    from app.repositories import character_repo, world_entry_repo

    lines = [head, "", "【人物卡】"]
    for row in character_repo.all_rows(conn):
        bits = [f"- {row['name']}（{row.get('role') or '未标注'}）"]
        for label, key in (
            ("表面身份", "surface_identity"),
            ("秘密欲望", "secret_desire"),
            ("致命弱点", "fatal_weakness"),
            ("矛盾行为", "contradiction"),
        ):
            value = (row.get(key) or "").strip()
            if value:
                bits.append(f"{label}：{value}")
        lines.append("｜".join(bits))

    world_rows = world_entry_repo.all_rows(conn)
    if world_rows:
        lines.append("")
        lines.append("【世界观 / 设定词条】")
        for row in world_rows:
            content = (row.get("content") or "").strip()
            lines.append(f"- {row['name']}" + (f"：{content}" if content else ""))

    return writing_context.clip_text("\n".join(lines), writing_context.MAX_SETTINGS_CHARS)


def states_text(conn: sqlite3.Connection, upto_seq: int) -> str:
    rows = fetch_all(
        conn,
        """
        SELECT c.name AS name, s.chapter_seq AS seq, s.state AS state
        FROM character_state s
        JOIN character c ON c.id = s.character_id
        WHERE s.chapter_seq <= ?
        ORDER BY s.chapter_seq ASC, s.id ASC
        """,
        (upto_seq,),
    )
    lines = [f"- 第 {r['seq']} 章｜{r['name']}：{r['state']}" for r in rows if r.get("state")]
    return writing_context.clip_text("\n".join(lines), writing_context.MAX_SUMMARY_CHARS * 2)
