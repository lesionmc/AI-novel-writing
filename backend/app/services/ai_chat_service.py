"""AI 对话工作台服务：一个 AI 做完全部，且**有记忆**（必要时还能联网）。

## 为什么上下文不在这里拼
`services/writing_context.py` 是本项目「记忆包」的**唯一组装点**（设定库 + 本章人物现状
+ 未回收伏笔 + 本章大纲 + 上一章摘要 + 最近正文），所有写作 AI 能力共用它。
本服务同样只调 `writing_context.load()`，**一句上下文都不自己拼** ——
否则「到底喂了什么给模型」会散落成两份答案（双真源，本项目已因它吃过亏，见 ADR-006）。

## 联网检索（use_web）
两段式：先让模型判断「这句话需不需要查外部资料、该搜什么」，需要才发一次
DuckDuckGo 检索并把结果注入最终提示词。搜索失败一律降级为不联网（见 web_search 模块头）。

## 红线
本服务**不写任何库表**。AI 产出的`characters` / `world_entries` / `outline_nodes` 都是草稿，
由前端展示、用户点确认后调已有的写入端点落库；`prose` 更是只交给用户自己删改。
未配置模型 → 抛 `LLMNotConfiguredError`，由上层统一转成人话错误。
"""

from __future__ import annotations

from app.db.registry import get_registry
from app.errors import ChapterNotFoundError, JSONParseFailedError
from app.logging_config import get_logger, log_fields
from app.models.ai_chat import (
    AiChatContextUsed,
    AiChatDraft,
    AiChatRequest,
    AiChatResponse,
    ChatMessageIn,
    DraftCharacter,
    DraftWorldEntry,
    WebSource,
)
from app.repositories import chapter_repo
from app.services import web_search, writing_context
from app.services.llm import registry as llm_registry
from app.services.llm.json_chat import chat_json
from app.services.llm.prompts import build_prompt

logger = get_logger(__name__)

_ROLES = ("protagonist", "supporting", "antagonist", "minor")
_CATEGORIES = ("force", "place", "rule", "item", "other")
_LEVELS = ("total", "volume", "chapter")
_TEXT_FIELDS = (
    "surface_identity",
    "secret_desire",
    "fatal_weakness",
    "contradiction",
    "appearance",
    "background",
)

#: 前端动作 → 给模型的大白话指令。**不认识的 intent 一律当 auto**（不猜语义）。
_INTENT_TEXT = {
    "auto": "他没指定要干什么，你按他的话自己判断该做什么。",
    "characters": "他想整理人物（加角色 / 补人物卡）。",
    "world_entries": "他想整理世界观（地点 / 势力 / 规则 / 道具）。",
    "outline_nodes": "他想排大纲（总纲 / 卷纲 / 章节卡，往后写什么）。",
    "continue": "他想接着往下写一段正文（产出草稿，由他自己删改）。",
    "expand": (
        "他想把一段已有文字**扩写**得更丰满（一般是他贴来的原句，或本章最近正文）。"
        "产出 `prose` 草稿：保留原意与视角，补细节、动作、氛围，不要另起新剧情。"
    ),
    "plot_directions": (
        "他想看**接下来可以往哪几个方向走**。在 `reply` 里给 3 个彼此明显不同的方向，"
        "每个两三句话说清冲突与代价，按你的推荐度排序；`draft` 留 null "
        "（他看中哪个，会再让你展开成章节卡）。"
    ),
}

#: 没有指定章节时用的"空章节"：设定库照常注入，但不带任何本章上下文。
_NO_CHAPTER = {"id": 0, "seq": 0, "title": "", "content": ""}

#: 联网开关打开时的前置判断：要不要搜、搜什么。刻意短，一次小调用。
_SEARCH_PLAN_PROMPT = (
    "你是检索规划器。作者的最后一句话如下，他打开了联网搜索开关。\n"
    "判断这句话是否依赖**书外部的实时/事实信息**（时事、资料、数据、专业知识、"
    "市场行情等）；纯虚构创作类请求（续写、建人物、排大纲）和打招呼**不需要**联网。\n"
    '只输出 JSON：{{"need_search": true/false, "query": "适合搜索引擎的中文关键词，不超过30字"}}\n'
    "不需要联网时 query 给空字符串。\n\n作者的话：{question}"
)


def _text(value: object, limit: int = 20000) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] or None


def _conversation_text(messages: list[ChatMessageIn]) -> str:
    lines = [
        f"{'作者' if m.role == 'user' else '你'}：{m.content.strip()}" for m in messages
    ]
    return "\n".join(line for line in lines if line.split("：", 1)[-1]) or "（还没有对话）"


def _norm_characters(raw: object) -> list[dict]:
    out: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"), 120)
        if not name:
            continue
        role = str(item.get("role") or "").strip()
        out.append(
            DraftCharacter(
                name=name,
                role=role if role in _ROLES else "supporting",  # type: ignore[arg-type]
                **{field: _text(item.get(field), 2000) for field in _TEXT_FIELDS},
            ).model_dump()
        )
    return out


def _norm_world_entries(raw: object) -> list[dict]:
    out: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        name = _text(item.get("name"), 120)
        if not name:
            continue
        category = str(item.get("category") or "").strip()
        out.append(
            DraftWorldEntry(
                category=category if category in _CATEGORIES else "other",  # type: ignore[arg-type]
                name=name,
                content=_text(item.get("content"), 2000),
            ).model_dump()
        )
    return out


def _norm_outline_nodes(raw: object) -> list[dict]:
    out: list[dict] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        title = _text(item.get("title"), 200)
        content = _text(item.get("content"), 4000)
        if not title and not content:
            continue
        level = str(item.get("level") or "").strip()
        out.append(
            {
                "level": level if level in _LEVELS else "chapter",
                "title": title or "未命名",
                "content": content or "",
            }
        )
    return out


def _draft_from(raw: object) -> AiChatDraft | None:
    """把模型给的草稿规范化成**可直接写入**的形状。

    任何解析不了 / 空壳 / 未知 `kind` 的草稿都返回 `None` —— 宁可只回一句话，
    也不要把半张卡片摆到用户面前让他点「确认写入」。
    """
    if not isinstance(raw, dict):
        return None
    kind = str(raw.get("kind") or "").strip()
    payload = raw.get("payload")
    if not kind or kind == "none" or not isinstance(payload, dict):
        return None

    if kind == "characters":
        characters = _norm_characters(payload.get("characters"))
        return AiChatDraft(kind="characters", payload={"characters": characters}) if characters else None
    if kind == "world_entries":
        entries = _norm_world_entries(payload.get("entries"))
        return AiChatDraft(kind="world_entries", payload={"entries": entries}) if entries else None
    if kind == "outline_nodes":
        nodes = _norm_outline_nodes(payload.get("nodes"))
        return AiChatDraft(kind="outline_nodes", payload={"nodes": nodes}) if nodes else None
    if kind == "prose":
        text = _text(payload.get("text"))
        return AiChatDraft(kind="prose", payload={"text": text}) if text else None
    return None


def _format_web_sources(sources: list[dict]) -> str:
    if not sources:
        return "（本轮没有联网资料）"
    lines = []
    for i, s in enumerate(sources, 1):
        snippet = s.get("snippet") or ""
        lines.append(f"{i}. {s.get('title', '')}｜{s.get('url', '')}\n   {snippet}")
    return "\n".join(lines)


def _plan_web_search(client: object, question: str, slug: str) -> str | None:
    """让模型决定要不要搜、搜什么。判断失败 = 不搜（宁可不联网），但**必须留日志**——
    否则某 provider 对规划提示词稳定解析失败时，"联网永久失效"与
    "模型判断不需要搜"表现完全相同，无从排查。"""
    try:
        # 规划只是产出几个 token 的小任务，不该沿用生成类的 120s 大超时
        plan, _ = chat_json(  # type: ignore[arg-type]
            client, _SEARCH_PLAN_PROMPT.format(question=question[:500]), timeout=30.0
        )
    except JSONParseFailedError as exc:
        logger.warning("web search plan failed", **log_fields(slug=slug, err=str(exc)[:160]))
        return None
    # 宽松真值：不少模型把布尔写成 "true"/1，严格 `is True` 会静默不搜
    if str(plan.get("need_search") or "").strip().lower() in ("true", "1", "yes"):
        query = str(plan.get("query") or "").strip()
        return query[:60] or None
    return None


def chat(book: str, payload: AiChatRequest) -> AiChatResponse:
    """一轮对话。**无写入副作用**；记忆包在服务端组装。"""
    registry = get_registry()
    registry.require(book)  # 作品不存在 → 404 BOOK_NOT_FOUND

    with registry.database(book).connection() as conn:
        if payload.chapter_id is not None:
            chapter = chapter_repo.get(conn, payload.chapter_id)
            if chapter is None:
                raise ChapterNotFoundError()
        else:
            chapter = dict(_NO_CHAPTER)
        ctx = writing_context.load(conn, book, chapter)
        context_used = AiChatContextUsed(**ctx.usage())

    client = llm_registry.require_any_client("content")
    intent = str(payload.intent or "auto").strip() or "auto"

    sources: list[dict] = []
    web_attempted = False
    if payload.use_web:
        last_user = next(
            (m.content for m in reversed(payload.messages) if m.role == "user"), ""
        )
        query = _plan_web_search(client, last_user, book)
        if query:
            web_attempted = True
            sources = web_search.web_search(query)
            logger.info("ai chat web search", **log_fields(slug=book, query=query[:60], hits=len(sources)))

    variables = ctx.variables() | {
        "conversation": _conversation_text(payload.messages),
        "intent": _INTENT_TEXT.get(intent, _INTENT_TEXT["auto"]),
        "web_results": _format_web_sources(sources),
    }
    prompt = build_prompt("ai_chat", variables, provider=client.provider)
    data, raw = chat_json(client, prompt)

    reply = _text(data.get("reply"))
    if not reply:
        # 连话都没得说 → 不是可用的回复，按解析失败处理（给前端可读原因）
        raise JSONParseFailedError(detail={"raw_ai_output": raw})

    draft = _draft_from(data.get("draft"))
    logger.info(
        "ai chat turn",
        **log_fields(
            slug=book,
            chapter_id=payload.chapter_id,
            intent=intent,
            turns=len(payload.messages),
            has_draft=draft is not None,
            draft_kind=draft.kind if draft else None,
            web_hits=len(sources),
            chars=len(reply),
        ),
    )
    return AiChatResponse(
        reply=reply,
        draft=draft,
        context_used=context_used,
        web_sources=[WebSource(**s) for s in sources],
        web_attempted=web_attempted,
    )
