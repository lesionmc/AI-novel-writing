"""正文辅助 AI 服务：剧情走向 / 校对 / 续写 / 扩写。

## 红线（改前必读）

1. **四个能力全部无落库副作用** —— 只返回建议 / 草稿。正文与设定必须人工确认才入库
   （红线 2 精神）。续写 / 扩写的草稿由**前端**放进编辑器、作者自己决定留不留；
   本模块自始至终**不写 `chapter.content`**。
2. 「剧情走向」「校对」**不产出正文**，与需求文档「AI 只在想的环节帮忙」完全一致。
3. 「续写」「扩写」会产出正文草稿 —— 属"代笔"，因此必须是**作者显式开启**的辅助。
   需求文档那句强制声明已同步修订为
   「默认不代笔；续写 / 扩写为显式可选辅助，产出草稿由作者删改」
   （见 `12-需求变更记录.md`）。**不允许"偷偷代笔"**。
4. 未配置模型 → 抛 `LLMNotConfiguredError`，由上层统一转成人话错误，
   **绝不返回空结果充数**（那会让用户以为"AI 说没问题"）。

## 上下文

四个能力都通过 `writing_context.load()` 取"记忆包"，没有一处自己拼字符串 ——
这样"到底喂了什么给模型"只有一个答案，可审计。
"""

from __future__ import annotations

import sqlite3

from app.db.registry import get_registry
from app.errors import ChapterNotFoundError, JSONParseFailedError, ValidationError
from app.logging_config import get_logger, log_fields
from app.models.writing_ai import (
    DraftTextResponse,
    PlotDirection,
    PlotDirectionsRequest,
    PlotDirectionsResponse,
    ProofreadIssue,
    ProofreadRequest,
    ProofreadResponse,
    ConflictSeverity,
    ExpandRequest,
    ContinueRequest,
)
from app.repositories import chapter_repo, locate_repo
from app.services import workspace, writing_context
from app.services.llm import registry as llm_registry
from app.services.llm.json_chat import chat_json
from app.services.llm.prompts import build_prompt

logger = get_logger(__name__)

_ISSUE_TYPES = ("typo", "punctuation", "grammar", "name", "setting", "repeat")
_SEVERITIES = ("high", "medium", "low")

# 校对最多回多少条（提示词里写了 12，代码层再兜一次 —— 提示词约束 ≠ 模型行为）
MAX_PROOFREAD_ISSUES = 12
# 扩写时要喂给模型的"上下文正文"预算
EXPAND_CONTEXT_CHARS = 3000


def _resolve_slug(chapter_id: int) -> str:
    return workspace.resolve_slug(locate_repo.has_chapter, chapter_id, ChapterNotFoundError())


def _require_chapter(conn: sqlite3.Connection, chapter_id: int) -> dict:
    row = chapter_repo.get(conn, chapter_id)
    if row is None:
        raise ChapterNotFoundError()
    return row


def _context(chapter_id: int) -> tuple[str, writing_context.WritingContext]:
    """取「记忆包」：解析章节所属作品 → 组装上下文。**只读。**"""
    slug = _resolve_slug(chapter_id)
    with get_registry().database(slug).connection() as conn:
        chapter = _require_chapter(conn, chapter_id)
        ctx = writing_context.load(conn, slug, chapter)
    return slug, ctx


def _text(value: object, limit: int = 8000) -> str:
    return str(value or "").strip()[:limit]


# --------------------------------------------------------------------------
# 1. 剧情走向（不产出正文）
# --------------------------------------------------------------------------
def plot_directions(chapter_id: int, payload: PlotDirectionsRequest) -> PlotDirectionsResponse:
    slug, ctx = _context(chapter_id)
    client = llm_registry.require_any_client("content")

    variables = ctx.variables() | {"count": payload.count}
    prompt = build_prompt("plot_directions", variables, provider=client.provider)
    data, raw = chat_json(client, prompt)

    directions: list[PlotDirection] = []
    for item in data.get("directions") or []:
        if not isinstance(item, dict):
            continue
        title = _text(item.get("title"), 120)
        if not title:
            continue
        directions.append(
            PlotDirection(
                title=title,
                summary=_text(item.get("summary")),
                payoff=_text(item.get("payoff")),
                risk=_text(item.get("risk")),
            )
        )
    if not directions:
        raise JSONParseFailedError(detail={"raw_ai_output": raw})

    logger.info(
        "plot directions generated",
        **log_fields(slug=slug, chapter_id=chapter_id, count=len(directions)),
    )
    return PlotDirectionsResponse(directions=directions)


# --------------------------------------------------------------------------
# 2. 校对（只挑错、不改字）
# --------------------------------------------------------------------------
def proofread(chapter_id: int, payload: ProofreadRequest) -> ProofreadResponse:
    slug, ctx = _context(chapter_id)
    target = (payload.text or "").strip() or ctx.chapter_text
    if not target.strip():
        # 空章节没什么可校对 —— 明说，别回一个空清单让用户以为"全对"
        raise ValidationError("本章还没有正文，没有可校对的内容")

    client = llm_registry.require_any_client("content")
    variables = ctx.variables() | {"target_text": writing_context.clip_text(target, 12000)}
    prompt = build_prompt("proofread", variables, provider=client.provider)
    data, raw = chat_json(client, prompt)

    issues: list[ProofreadIssue] = []
    for item in data.get("issues") or []:
        if not isinstance(item, dict):
            continue
        excerpt = _text(item.get("excerpt"), 400)
        if not excerpt:
            continue
        issue_type = _text(item.get("type"), 32)
        issues.append(
            ProofreadIssue(
                type=issue_type if issue_type in _ISSUE_TYPES else "grammar",  # type: ignore[arg-type]
                excerpt=excerpt,
                problem=_text(item.get("problem")),
                suggestion=_text(item.get("suggestion")),
            )
        )
        if len(issues) >= MAX_PROOFREAD_ISSUES:
            break

    # 空清单是**合法结果**（"通篇没有可报的问题"），不当作解析失败
    logger.info(
        "proofread done",
        **log_fields(slug=slug, chapter_id=chapter_id, issues=len(issues), raw_chars=len(raw)),
    )
    return ProofreadResponse(issues=issues)


# --------------------------------------------------------------------------
# 3/4. 续写 / 扩写（产出草稿，但**不落库**）
# --------------------------------------------------------------------------
def _draft(prompt_name: str, variables: dict[str, object]) -> DraftTextResponse:
    client = llm_registry.require_any_client("content")
    prompt = build_prompt(prompt_name, variables, provider=client.provider)
    data, raw = chat_json(client, prompt)
    text = _text(data.get("text"), 20000)
    if not text:
        raise JSONParseFailedError(detail={"raw_ai_output": raw})
    return DraftTextResponse(text=text)


def continue_writing(chapter_id: int, payload: ContinueRequest) -> DraftTextResponse:
    slug, ctx = _context(chapter_id)
    variables = ctx.variables() | {
        "hint": (payload.hint or "").strip() or "（没有额外要求，顺其自然往下写）",
        "target_chars": payload.target_chars,
    }
    result = _draft("continue_writing", variables)
    logger.info(
        "continue draft generated",
        **log_fields(slug=slug, chapter_id=chapter_id, chars=len(result.text)),
    )
    return result


def expand(chapter_id: int, payload: ExpandRequest) -> DraftTextResponse:
    slug, ctx = _context(chapter_id)
    variables = ctx.variables() | {
        "selected_text": payload.text.strip(),
        "context_text": writing_context.clip_text(ctx.chapter_text, EXPAND_CONTEXT_CHARS),
        "hint": (payload.hint or "").strip() or "（没有额外要求）",
        "target_chars": payload.target_chars,
    }
    result = _draft("expand_writing", variables)
    logger.info(
        "expand draft generated",
        **log_fields(slug=slug, chapter_id=chapter_id, chars=len(result.text)),
    )
    return result


def normalize_severity(value: object) -> ConflictSeverity:
    """一致性审校共用：把模型给的严重度归一到合法枚举。"""
    text = str(value or "").strip().lower()
    return text if text in _SEVERITIES else "medium"  # type: ignore[return-value]
