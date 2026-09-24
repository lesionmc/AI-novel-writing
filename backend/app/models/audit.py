"""质检（audit）相关响应模型。字段名与类型对齐契约 `06-API定义-openapi.yaml`。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

FlavorType = Literal["cliche", "emotion_label", "adjective_density"]


class FlavorHitOut(BaseModel):
    """去 AI 味的一条命中。`position` 为去 HTML 后纯文本中的起始字符偏移。"""

    type: FlavorType
    text: str
    position: int
    suggestion: str


class AiFlavorResult(BaseModel):
    """去 AI 味检测结果。`score` 越高表示 AI 味越重（0-100）。"""

    score: int
    hits: list[FlavorHitOut]


class RhythmPoint(BaseModel):
    """一章的节奏指标（纯本地统计，非读者满意度）。"""

    seq: int
    title: str | None = None
    word_count: int
    dialogue_ratio: float
    conflict_density: float
    pace: int


class RhythmDip(BaseModel):
    """一段低洼区：连续 ≥2 章 pace 低于阈值。"""

    start_seq: int
    end_seq: int


class RhythmResult(BaseModel):
    """爽点—节奏曲线。`pace` 只衡量文本节奏，指路用，结论仍要人来读。"""

    chapters: list[RhythmPoint]
    low_threshold: int
    dips: list[RhythmDip]


class SensitiveHitOut(BaseModel):
    """敏感词命中项，按「词条 × 章节」聚合。"""

    word: str
    category: str
    chapter_seq: int
    count: int


class SensitiveResult(BaseModel):
    """敏感词自查结果。`total_hits` 为全部命中次数之和。

    `wordlist_available` 必须透出：词库为空时 `total_hits=0` 会被用户误读成
    「稿子没问题」，而实际上**什么都没检查**（项目红线：禁止假安全感，见
    `11-敏感词库说明.md`）。前端据此显示醒目提示。
    """

    total_hits: int
    wordlist_available: bool
    hits: list[SensitiveHitOut]


class WordlistStatus(BaseModel):
    """敏感词库状态（设置页展示用）。"""

    model_config = ConfigDict(extra="forbid")

    configured: bool
    count: int
    path: str
