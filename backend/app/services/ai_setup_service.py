"""AI 对话式建设定服务。

红线：**AI 只产出草稿，绝不写库**。草稿返回给前端展示，用户确认后再由前端
调用已有的 `POST /api/books/{book}/characters` / `/world-entries` 落库。
本服务不碰数据库、不碰密钥环。

同一个接口承担「AI 提问」与「AI 汇总」两种角色：由 `messages` 的历史内容决定，
判断逻辑写在提示词里（`prompts/setup_chat.md`）。
"""

from __future__ import annotations

from app.errors import JSONParseFailedError
from app.logging_config import get_logger, log_fields
from app.models.ai_setup import (
    ChatMessageIn,
    DraftCharacter,
    DraftWorldEntry,
    SetupChatRequest,
    SetupChatResponse,
    SetupDraft,
)
from app.services.llm import registry as llm_registry
from app.services.llm.json_chat import chat_json
from app.services.llm.prompts import build_prompt

logger = get_logger(__name__)

_ROLES = ("protagonist", "supporting", "antagonist", "minor")
_CATEGORIES = ("force", "place", "rule", "item", "other")

# 作者回答到第几轮就强制收敛。取 3：真人耐心约 2-3 轮，再往下问就开始劝退了。
# 提示词里虽写了「最多 3-5 轮」，但实测模型不遵守 —— 故在代码层设硬上限。
_MAX_ASK_TURNS = 3

_FORCE_SUMMARIZE_SUFFIX = """

---
【系统指令 · 优先级最高】
作者已经回答了足够多轮，**现在必须停止提问**。
请立刻把目前聊到的信息整理成草稿并输出（`done` 置为 true）：
- 作者没说的细节，由你**合理补全**，并在 `reply` 里一句话点明哪些是你补的
- 不要再说「我还想了解 X」这类追问
- 若信息确实很少，就按已有的一点点内容先给一版草稿，让作者看着改
"""
_TEXT_FIELDS = (
    "surface_identity",
    "secret_desire",
    "fatal_weakness",
    "contradiction",
    "appearance",
    "background",
)


def _conversation_text(messages: list[ChatMessageIn]) -> str:
    lines = [f"{'作者' if m.role == 'user' else '你'}：{m.content.strip()}" for m in messages]
    return "\n".join(line for line in lines if line.split("：", 1)[-1]) or "（还没有对话）"


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _draft_from(raw_draft: object) -> SetupDraft | None:
    """把模型返回的草稿规范化成**可直接写入**的形状（枚举非法就归一到安全值）。"""
    if not isinstance(raw_draft, dict):
        return None

    characters: list[DraftCharacter] = []
    for item in raw_draft.get("characters") or []:
        if not isinstance(item, dict) or not _text(item.get("name")):
            continue
        role = str(item.get("role") or "").strip()
        characters.append(
            DraftCharacter(
                name=_text(item["name"]) or "",
                role=role if role in _ROLES else "supporting",
                **{field: _text(item.get(field)) for field in _TEXT_FIELDS},
            )
        )

    world_entries: list[DraftWorldEntry] = []
    for item in raw_draft.get("world_entries") or []:
        if not isinstance(item, dict) or not _text(item.get("name")):
            continue
        category = str(item.get("category") or "").strip()
        world_entries.append(
            DraftWorldEntry(
                category=category if category in _CATEGORIES else "other",
                name=_text(item["name"]) or "",
                content=_text(item.get("content")),
            )
        )

    premise = _text(raw_draft.get("premise"))
    if not premise and not characters and not world_entries:
        return None
    return SetupDraft(premise=premise, characters=characters, world_entries=world_entries)


def setup_chat(payload: SetupChatRequest) -> SetupChatResponse:
    """一轮建设定对话。无模型 → LLM_NOT_CONFIGURED 可读错误。

    **收敛兜底（为什么需要）**：提示词里已写「最多 3-5 轮就要收敛」，但实测模型
    会一路追问下去（连问 5 轮仍 `done:false`）—— 这是「提示词约束 ≠ 模型行为」的
    典型。真人的耐心是 2-3 轮，不能把收敛寄托在模型自觉上，所以在**代码层**设硬上限：
    作者回答到 `_MAX_ASK_TURNS` 轮后，强制注入汇总指令，并放宽解析层（只要模型给出了
    可用的草稿就接受，不再要求它同时把 done 置 true）。
    """
    ctx = payload.book_context
    client = llm_registry.require_any_client("content")

    user_turns = sum(1 for m in payload.messages if m.role == "user")
    force_summarize = user_turns >= _MAX_ASK_TURNS

    variables = {
        "book_title": _text(ctx.title if ctx else None) or "（未命名）",
        "book_genre": _text(ctx.genre if ctx else None) or "（未指定）",
        "book_premise": _text(ctx.premise if ctx else None) or "（未填写）",
        "conversation": _conversation_text(payload.messages),
    }
    prompt = build_prompt("setup_chat", variables, provider=client.provider)
    if force_summarize:
        prompt += _FORCE_SUMMARIZE_SUFFIX
    data, raw = chat_json(client, prompt)

    reply = _text(data.get("reply"))
    if not reply:
        # 连话都没得说 → 不是可用的回复，按解析失败处理（给前端可读原因）
        raise JSONParseFailedError(detail={"raw_ai_output": raw})

    draft = _draft_from(data.get("draft"))
    # done 只在「真的给得出草稿」时才为 true —— 否则前端会拿到 done=true + draft=null，
    # 与契约矛盾且无处展示。
    # 并且：到了轮次上限时，只要草稿可用就算收敛（不再依赖模型自报 done）。
    done = draft is not None and (bool(data.get("done")) or force_summarize)
    logger.info(
        "setup chat turn",
        **log_fields(
            done=done,
            turns=user_turns,
            forced=force_summarize,
            chars=len(reply),
        ),
    )
    return SetupChatResponse(reply=reply, done=done, draft=draft if done else None)
