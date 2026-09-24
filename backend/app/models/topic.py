"""选题助手（R0）模型：题材知识库 + 选题建议。

题材库是**纯本地数据文件**（`data/genres.json`），不调模型、不落库；
选题建议才走模型（同步生成，非流式）。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class GenreInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    category: str = ""
    heat: int = 0
    competition: int = 0
    blue_ocean_score: int = 0
    core_experience: str = ""
    typical_tropes: list[str] = Field(default_factory=list)
    benchmarks: list[str] = Field(default_factory=list)


class GenresResponse(BaseModel):
    """题材库读取结果。缺文件或坏文件时返回空列表 + 可读提示，**不报错**。"""

    genres: list[GenreInfo] = Field(default_factory=list)
    note: str | None = None


class TopicAdviceRequest(BaseModel):
    """对应问卷五问（四问作者自己 + 一问写给谁）。"""

    model_config = ConfigDict(extra="ignore")

    favorite_genres: list[str] = Field(min_length=1)
    unique_background: str | None = None
    daily_words: int | None = Field(default=None, ge=0)
    target_length: int | None = Field(default=None, ge=0)
    readers: str | None = None


class TopicRecommendation(BaseModel):
    niche: str
    reason: str
    benchmarks: list[str] = Field(default_factory=list)
    sample_premise: str | None = None


class AvoidDirection(BaseModel):
    direction: str
    reason: str


class TopicAdviceResponse(BaseModel):
    recommendations: list[TopicRecommendation] = Field(default_factory=list)
    avoid: list[AvoidDirection] = Field(default_factory=list)
