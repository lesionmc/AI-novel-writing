"""去 AI 味 —— 本地规则检测（纯函数，不调用模型、不读库、无副作用）。

输入：**已经过 HTML 清洗的纯文本**（调用方用 `app.utils.text.strip_html` 处理正文，本模块
不重复实现 HTML 剥离）。
输出：`(score, hits)`。

## position 口径（全模块统一）
`position` = 命中片段在**传入纯文本**（去 HTML 标签、已解实体后的字符串）中的起始字符偏移，
0 起计、按 Python `str` 的字符（码点）数。若调用方传入的正文与界面展示的富文本不一致，
高亮请以同一纯文本为基准。

## score 算法（可解释、可测）
1. 每个命中按类型取权重 `TYPE_WEIGHTS`（cliche 3.0 / emotion_label 2.5 / adjective_density 1.0）；
2. `weighted = Σ 权重`；
3. `effective_len = 纯文本字符数 + LEN_SMOOTHING_CHARS`（长度**加性平滑**，见下）；
4. `density = weighted * 1000 / effective_len`  —— 即"每千字加权命中密度"；
5. `score = round(100 * density / (density + SCORE_SATURATION_DENSITY))`，再截断到 0..100。

### 为什么用加性平滑的长度分母
若直接用裸字符数，28 字的短段会把密度放大到几十上百、一步饱和成"AI 味极重"
（旧实现里 28 字正常段落可得 98，属明显误报，会让作者不再信任整个质检页）。
改用 `字符数 + LEN_SMOOTHING_CHARS` 后：短文本被显著压平，而"堆满套话的长段"仍靠
**绝对命中量**把密度推高，真问题不会被压平。

### 满足的语义约束
- 无命中 / 干净正文 → 0；
- 单调：同字数下命中越多分越高；同命中数下字数越多分越低
  （加性平滑使"字数越多分越低"在**任意长度**上都严格成立，含极短文本）；
- 命中极密（如 4000 字里 2000 处程度副词）→ 逼近 100，不封死中高档位分辨率。
空文本（或无命中）→ score = 0、hits = []，**不报错**。
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.audit import rules_ai_flavor as rules


@dataclass(frozen=True)
class FlavorHit:
    """一条本地规则命中。"""

    type: str
    text: str
    position: int
    suggestion: str


def _alternation(words: tuple[str, ...]) -> str:
    """构造"最长优先"的正则分支，避免短词抢先匹配导致漏计/重复计数。"""
    ordered = sorted(set(words), key=len, reverse=True)
    return "|".join(re.escape(w) for w in ordered)


_CLICHE_RE = re.compile(_alternation(rules.CLICHE_PHRASES))
_DEGREE_RE = re.compile(_alternation(rules.DEGREE_WORDS))
# 触发词（短）… 间隔 ≤ EMOTION_WINDOW 个非句读字符 … 情感词。非贪婪取最短窗口。
_EMOTION_RE = re.compile(
    f"(?:{_alternation(rules.EMOTION_CUES)})"
    f"[^。！？；：\\n]{{0,{rules.EMOTION_WINDOW}}}?"
    f"(?:{_alternation(rules.EMOTION_WORDS)})"
)


def _suggest(kind: str, matched: str) -> str:
    return rules.SUGGESTION_TEMPLATES[kind].format(text=matched)


def _collect(pattern: re.Pattern[str], kind: str, text: str) -> list[FlavorHit]:
    return [
        FlavorHit(type=kind, text=m.group(0), position=m.start(), suggestion=_suggest(kind, m.group(0)))
        for m in pattern.finditer(text)
    ]


def score_hits(hits: list[FlavorHit], text_length: int) -> int:
    """按 §score 算法计算 0..100 的 AI 味评分。抽成独立函数便于单测与调参。"""
    weighted = sum(rules.TYPE_WEIGHTS.get(h.type, 0.0) for h in hits)
    if weighted <= 0:
        return 0
    effective_len = max(0, text_length) + rules.LEN_SMOOTHING_CHARS
    density = weighted * 1000.0 / effective_len
    raw = 100.0 * density / (density + rules.SCORE_SATURATION_DENSITY)
    return max(0, min(100, round(raw)))


def detect(text: str) -> tuple[int, list[FlavorHit]]:
    """对纯文本做三类本地规则检测，返回 `(score, hits)`；hits 按 position 升序。"""
    if not text:
        return 0, []

    hits: list[FlavorHit] = []
    hits.extend(_collect(_CLICHE_RE, "cliche", text))
    hits.extend(_collect(_EMOTION_RE, "emotion_label", text))
    hits.extend(_collect(_DEGREE_RE, "adjective_density", text))
    hits.sort(key=lambda h: (h.position, h.type))

    return score_hits(hits, len(text)), hits
