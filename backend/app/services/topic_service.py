"""选题助手服务（R0）。

- `list_genres`：**纯本地**读 `data/genres.json`，不调模型、不落库；
  缺文件/坏文件 → 空列表 + 可读提示，不报错（对齐《11-敏感词库说明》§5 的
  「入口不隐藏、给引导」风格）。
- `advice`：走模型同步生成（非流式），只输出建议、**不落库**。
  关键：把题材库的**全文真实数据**注入提示词（不是摘要），否则模型会编数字。
"""

from __future__ import annotations

import json
from pathlib import Path

from app.config import settings
from app.errors import JSONParseFailedError
from app.logging_config import get_logger, log_fields
from app.models.topic import (
    AvoidDirection,
    GenreInfo,
    GenresResponse,
    TopicAdviceRequest,
    TopicAdviceResponse,
    TopicRecommendation,
)
from app.services.llm import registry as llm_registry
from app.services.llm.json_chat import chat_json
from app.services.llm.prompts import build_prompt

logger = get_logger(__name__)

GENRES_FILENAME = "genres.json"

_MISSING_NOTE = (
    "还没有题材库文件（data/genres.json）。选题建议要靠它提供真实数据，"
    "补上文件即可使用；缺了它写作、设定、导出等功能不受影响。"
)
_UNUSABLE_NOTE = (
    "题材库文件存在，但没有可用的题材数据（内容为空或字段不合法），"
    "请检查 data/genres.json 的格式。"
)
_NO_DATA_HINT = (
    "（题材库未配置：请在理由中说明数据不足，**不要编造任何数字**）"
)


def _genres_path() -> Path:
    return settings.data_dir / GENRES_FILENAME


def list_genres() -> GenresResponse:
    """读本地题材库；任何异常都降级为「空列表 + 提示」，绝不抛错。"""
    path = _genres_path()
    if not path.is_file():
        return GenresResponse(genres=[], note=_MISSING_NOTE)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        logger.warning("genres file unreadable", **log_fields(path=str(path)))
        return GenresResponse(genres=[], note=_UNUSABLE_NOTE)

    items = raw.get("genres") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        return GenresResponse(genres=[], note=_UNUSABLE_NOTE)

    genres: list[GenreInfo] = []
    for item in items:
        if not isinstance(item, dict) or not item.get("name"):
            continue  # 单条坏数据跳过，不拖垮整库
        try:
            genres.append(GenreInfo(**item))
        except ValueError:
            continue
    if not genres:
        return GenresResponse(genres=[], note=_UNUSABLE_NOTE)
    return GenresResponse(genres=genres, note=None)


def _genre_data_text(genres: list[GenreInfo]) -> str:
    """注入**真实数据全文**（全部题材、全部字段），不是摘要。"""
    if not genres:
        return _NO_DATA_HINT
    return json.dumps(
        [g.model_dump() for g in genres], ensure_ascii=False, indent=2
    )


def _to_response(data: dict, raw: str) -> TopicAdviceResponse:
    recommendations: list[TopicRecommendation] = []
    for item in data.get("recommendations") or []:
        if not isinstance(item, dict) or not item.get("niche"):
            continue
        marks = item.get("benchmarks")
        recommendations.append(
            TopicRecommendation(
                niche=str(item["niche"]),
                reason=str(item.get("reason") or ""),
                benchmarks=[str(b) for b in marks] if isinstance(marks, list) else [],
                sample_premise=(
                    str(item["sample_premise"])
                    if item.get("sample_premise") is not None
                    else None
                ),
            )
        )
    if not recommendations:
        # 一个方向都没解析出来 = 模型没按格式回，不能当成功返回（前端会看到空页）
        raise JSONParseFailedError(detail={"raw_ai_output": raw})

    avoid: list[AvoidDirection] = []
    for item in data.get("avoid") or []:
        if not isinstance(item, dict) or not item.get("direction"):
            continue
        avoid.append(
            AvoidDirection(
                direction=str(item["direction"]),
                reason=str(item.get("reason") or ""),
            )
        )
    return TopicAdviceResponse(recommendations=recommendations, avoid=avoid)


def advice(payload: TopicAdviceRequest) -> TopicAdviceResponse:
    """生成选题建议（同步）。无模型 → LLM_NOT_CONFIGURED 可读错误。"""
    genres = list_genres().genres
    client = llm_registry.require_any_client("content")
    variables = {
        "favorite_genres": "、".join(payload.favorite_genres),
        "unique_background": payload.unique_background or "（未提供）",
        "daily_words": _opt(payload.daily_words),
        "target_length": _opt(payload.target_length),
        "genre_data": _genre_data_text(genres),
    }
    prompt = build_prompt("topic_advice", variables, provider=client.provider)
    data, raw = chat_json(client, prompt)
    result = _to_response(data, raw)
    logger.info(
        "topic advice generated",
        **log_fields(
            recommendations=len(result.recommendations),
            genres_available=len(genres),
        ),
    )
    return result


def _opt(value: int | None) -> str:
    return "（未提供）" if value is None else str(value)
