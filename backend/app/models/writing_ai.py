"""正文辅助 AI（剧情走向 / 校对 / 续写 / 扩写）与一致性审校的数据模型。

## 定位约定（改这个文件前先读）

四个写作能力按「是否产出正文」分成两类，这个区分决定了产品定位是否被守住：

| 能力 | 产出 | 与「不在写的环节代笔」的关系 |
|---|---|---|
| `plot_directions` 剧情走向 | 几条**方向选项** | 完全一致（只帮"想"） |
| `proofread` 校对 | **问题清单 + 修改建议** | 完全一致（只挑错，不改字） |
| `continue` 续写 | **正文草稿** | 属"代笔"，是作者**显式开启**的辅助 |
| `expand` 扩写 | **正文草稿** | 同上 |

后两个之所以被允许，是因为需求文档里那句强制声明已被**同步修订**为
「默认不代笔；续写 / 扩写为显式可选辅助，产出草稿由作者删改」
（见 `12-需求变更记录.md` 的对应条目）。

## 无副作用红线

本模块的所有响应体**只承载"建议 / 草稿"，不含任何落库语义** ——
正文与设定必须经人工确认才入库（红线 2 精神）。
续写 / 扩写的草稿由**前端**放进编辑器，作者自己决定留不留；
后端全程不写 `chapter.content`。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ConflictSeverity = Literal["high", "medium", "low"]

ProofreadIssueType = Literal[
    "typo",
    "punctuation",
    "grammar",
    "name",
    "setting",
    "repeat",
]


# --------------------------------------------------------------------------
# 剧情走向（不产出正文）
# --------------------------------------------------------------------------
class PlotDirectionsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    count: int = Field(default=3, ge=2, le=5, description="要几条方向")


class PlotDirection(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str
    summary: str = ""
    payoff: str = ""
    risk: str = ""


class PlotDirectionsResponse(BaseModel):
    directions: list[PlotDirection] = Field(default_factory=list)


# --------------------------------------------------------------------------
# 校对（只挑错、不改字）
# --------------------------------------------------------------------------
class ProofreadRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    #: 只校对选中片段时传它；不传则校对整章正文
    text: str | None = None


class ProofreadIssue(BaseModel):
    model_config = ConfigDict(extra="ignore")

    type: ProofreadIssueType = "grammar"
    excerpt: str
    problem: str = ""
    suggestion: str = ""


class ProofreadResponse(BaseModel):
    issues: list[ProofreadIssue] = Field(default_factory=list)


# --------------------------------------------------------------------------
# 续写 / 扩写（产出草稿，但**不落库**）
# --------------------------------------------------------------------------
class ContinueRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    hint: str | None = None
    target_chars: int = Field(default=800, ge=200, le=3000)


class ExpandRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(min_length=1, description="要扩写的选中文本")
    hint: str | None = None
    target_chars: int = Field(default=400, ge=100, le=2000)


class DraftTextResponse(BaseModel):
    """续写 / 扩写共用：只回草稿正文，调用方负责把它放进编辑器让作者删改。"""

    text: str


# --------------------------------------------------------------------------
# 一致性审校
# --------------------------------------------------------------------------
class ConsistencyConflict(BaseModel):
    """字段与《08-提示词规格.md》§3.1 的输出格式逐项对齐。"""

    model_config = ConfigDict(extra="ignore")

    severity: ConflictSeverity = "medium"
    chapters: list[int] = Field(default_factory=list)
    subject: str = ""
    conflict: str = ""
    evidence: str = ""


class ConsistencyRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    #: 审校范围，如 "all" 或 "1-50"；缺省 = 全书
    scope: str | None = None
