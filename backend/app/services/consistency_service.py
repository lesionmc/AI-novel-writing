"""一致性审校（R8）：找全书范围里**客观存在的设定矛盾**，SSE 流式返回。

## 实现依据

- 提示词与输出格式：`prompts/consistency_audit.md`（来自《08-提示词规格.md》§3.1 的权威草案）
- 长文策略：规格 §3.2 —— **分块审校 + 全局核对两轮**，最后合并去重
    · 第一轮（分块）：每 {{CHUNK}} 章一组，与该组相关的设定一起送入 → 抓组内矛盾
    · 第二轮（全局）：全书章节摘要序列 + 全部设定 → 抓跨组矛盾
- SSE 事件：`progress` / `conflict` / `done`（与契约 `auditConsistencyStream` 一致）

## 模型选择

用 `task_role='review'` 的模型；**没单独配 review 时 `get_client_for_role` 会回落到默认模型**
（见 `services/llm/registry.py`）。规格里"应与正文生成用不同的模型、换视角才能发现盲区"
是**建议**而非硬要求 —— 用户只配一个模型时也必须能用，否则这个功能对多数人等于不存在。

## 为什么"无模型"要在 router 层就报错

流一旦开始就无法改 HTTP 状态码了。所以未配模型必须在**返回 StreamingResponse 之前**
用普通 JSON 错误响应拒掉（`ensure_ready()`），而不是推一个错误事件进去。

## 文件拆分

读库、拼文本、解析冲突这些**数据准备**逻辑在 `consistency_context.py`
（本文件守住 ≤300 行的硬规则）；本文件只保留「帧编排 + 两轮审校」的主流程。
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator

from app.db.registry import get_registry
from app.errors import BookNotFoundError
from app.logging_config import get_logger, log_fields
from app.models.writing_ai import ConsistencyConflict
from app.services import consistency_context as ctx
from app.services.llm import registry as llm_registry
from app.services.llm.base import LLMClient
from app.services.llm.json_chat import chat_json
from app.services.llm.prompts import build_prompt

logger = get_logger(__name__)

#: 分块大小（每轮送多少章摘要给模型）—— 与规格 §3.2 的「每 20 章为一组」一致
CHUNK_SIZE = 20
#: 最多审校多少章（防止 1000 章的书发起上百次模型调用把用户的钱烧光）
MAX_CHAPTERS = 200


def ensure_ready(slug: str) -> None:
    """开流之前的**全部**前置检查；必须在返回 StreamingResponse 之前调用。

    ## 为什么必须前置
    SSE 一旦开始，HTTP 状态码就定型了 —— 之后再抛任何异常，客户端都只会看到
    一个"莫名断掉的流"，拿不到可读原因（实测会变成
    `RuntimeError: Caught handled exception, but response already started`）。

    所以两类「本来该是 4xx」的情况都在这里挡掉：
      · 作品不存在 → 404
      · 没有任何可用模型 → 400 `LLM_NOT_CONFIGURED`
    """
    if not get_registry().exists(slug):
        raise BookNotFoundError()
    llm_registry.require_client("review")


# --------------------------------------------------------------------------
# SSE 帧构造
# --------------------------------------------------------------------------
def _frame(event: str, data: object) -> str:
    """SSE 单帧。data 必须是单行 JSON（多行会破坏 SSE 帧结构）。"""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"


def _progress(percent: int, note: str) -> str:
    return _frame("progress", {"percent": max(0, min(100, percent)), "note": note})


def _audit_one(
    client: LLMClient,
    conn: sqlite3.Connection,
    summaries: str,
    chunk_note: str,
    settings: str,
    states: str,
) -> list[ConsistencyConflict]:
    """跑一次审校。单次失败**不中断整条流** —— 记录 warning 后返回空列表。"""
    variables = {
        "settings": settings,
        "character_states_history": states,
        "chapter_summaries": summaries,
        "scope": chunk_note,
        "chunk_note": chunk_note,
    }
    try:
        prompt = build_prompt("consistency_audit", variables, provider=client.provider)
        data, _raw = chat_json(client, prompt)
    except Exception as exc:  # noqa: BLE001 - 单块失败不拖垮整体
        logger.warning(
            "consistency chunk failed",
            **log_fields(note=chunk_note, error=exc.__class__.__name__),
        )
        return []

    found: list[ConsistencyConflict] = []
    for item in data.get("conflicts") or []:
        parsed = ctx.to_conflict(item)
        if parsed is not None:
            found.append(parsed)
    return found


# --------------------------------------------------------------------------
# 主流程（生成 SSE）
# --------------------------------------------------------------------------
def stream(slug: str, scope: str | None) -> Iterator[str]:
    """产出 SSE 帧序列：progress → conflict×N → done。

    前置条件由 `ensure_ready(slug)` 保证（作品存在 + 模型可用）——
    本函数**不再自己抛 4xx 类异常**，因为一旦开流就无法改状态码了。
    """
    registry = get_registry()
    client = llm_registry.require_client("review")
    with registry.database(slug).connection() as conn:
        all_rows = ctx.chapters(conn)
        if not all_rows:
            yield _progress(100, "这部作品还没有章节，没有可审校的内容")
            yield _frame("done", {"total": 0, "high": 0, "medium": 0, "low": 0, "reviewed": 0})
            return

        seqs = [int(r["seq"]) for r in all_rows]
        wanted = set(ctx.parse_scope(scope, seqs))
        rows = [r for r in all_rows if int(r["seq"]) in wanted]
        truncated = len(rows) > MAX_CHAPTERS
        if truncated:
            rows = rows[:MAX_CHAPTERS]

        # 设定与状态历史在整条流里只取一次（每块都用同一份）
        book = ctx.book_row(conn)
        settings = ctx.settings_for_audit(conn, book)
        states = ctx.states_text(conn, max(int(r["seq"]) for r in rows))

        chunks = [rows[i : i + CHUNK_SIZE] for i in range(0, len(rows), CHUNK_SIZE)]
        collected: dict[tuple, ConsistencyConflict] = {}

        note_prefix = f"本次审校范围：第 {rows[0]['seq']}–{rows[-1]['seq']} 章"
        if truncated:
            note_prefix += f"（长文保护：只审前 {MAX_CHAPTERS} 章）"

        total_rounds = len(chunks) + 1  # +1 = 全局轮
        for index, chunk in enumerate(chunks, start=1):
            note = f"{note_prefix}。本轮只看第 {chunk[0]['seq']}–{chunk[-1]['seq']} 章，请只报这些章节之间的矛盾。"
            yield _progress(
                int(index / total_rounds * 90),
                f"正在审校第 {chunk[0]['seq']}–{chunk[-1]['seq']} 章…",
            )
            for conflict in _audit_one(
                client, conn, ctx.summaries_text(chunk), note, settings, states
            ):
                key = ctx.dedup_key(conflict)
                if key in collected:
                    continue
                collected[key] = conflict
                yield _frame("conflict", conflict.model_dump())

        # 第二轮：全局核对（抓跨组矛盾）
        yield _progress(92, "正在做全书交叉核对…")
        global_note = (
            f"本次审校范围：第 {rows[0]['seq']}–{rows[-1]['seq']} 章。"
            "本轮做**全书交叉核对**：请重点找跨章节、相隔较远的矛盾（时间线、已死角色复现、"
            "能力等级倒退、道具凭空出现）。不要重复报同一组内的细枝末节。"
        )
        for conflict in _audit_one(
            client, conn, ctx.summaries_text(rows), global_note, settings, states
        ):
            key = ctx.dedup_key(conflict)
            if key in collected:
                continue
            collected[key] = conflict
            yield _frame("conflict", conflict.model_dump())

    final = list(collected.values())
    summary = {
        level: sum(1 for c in final if c.severity == level) for level in ("high", "medium", "low")
    }
    logger.info(
        "consistency audit done",
        **log_fields(slug=slug, reviewed=len(rows), found=len(final), **summary),
    )
    yield _progress(100, "审校完成")
    yield _frame("done", {"total": len(final), "reviewed": len(rows), **summary})
