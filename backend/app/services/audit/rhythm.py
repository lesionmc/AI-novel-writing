"""爽点—节奏曲线（PHASE 5 质检）：**纯本地统计启发**，不调模型、不花额度。

每章算三个可解释的指标，合成 0–100 的「节奏强度」：
  · 对话占比     —— 「」/"" 内文字占总字数的比例（冲突最常发生的地方）
  · 句长波动     —— 句长变异系数，越小说明句子一个节奏、容易流水账
  · 对峙词密度   —— 突然/竟然/逼到/冷笑 这类词每百字出现次数

刻意不叫「爽点分」：它衡量的是**文本节奏**，不是读者满意度；分数只做
「哪几段平得可疑」的指路牌，结论仍要人来读。低洼区 = 连续 ≥2 章低于阈值。
"""

from __future__ import annotations

import re
import statistics

#: 低洼判定阈值（节奏分）与「连续几章算掉速」
LOW_THRESHOLD = 40
DIP_MIN_RUN = 2

_DIALOGUE_RES = (re.compile(r"“[^“”]{1,400}”"), re.compile(r"「[^「」]{1,400}」"))
_SENTENCE_SPLIT_RE = re.compile(r"[。！？…；]+")
_CONFLICT_RE = re.compile(
    "|".join(
        re.escape(w)
        for w in (
            "突然", "竟然", "居然", "没想到", "偏偏", "反手", "翻脸", "逼到", "杀机",
            "危机", "反转", "威胁", "冷笑", "怒吼", "爆发", "碎裂", "破口", "赌上",
            "誓", "陷阱", "暴露", "追上来", "来不及",
        )
    )
)


def _ratio(part: float, whole: int) -> float:
    return round(part / whole, 4) if whole > 0 else 0.0


def _dialogue_chars(text: str) -> int:
    total = 0
    for pattern in _DIALOGUE_RES:
        for m in pattern.finditer(text):
            total += len(m.group(0))
    return total


def _sentence_cv(text: str) -> float:
    """句长变异系数（std/mean）。0 = 所有句子一样长（最像流水账的形状）。"""
    lengths = [len(s) for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]
    if len(lengths) < 3:
        return 0.0
    mean = statistics.fmean(lengths)
    if mean <= 0:
        return 0.0
    return statistics.pstdev(lengths) / mean


def _pace_score(word_count: int, dialogue_ratio: float, cv: float, conflict_density: float) -> int:
    if word_count < 50:
        return 0
    dialogue_part = min(dialogue_ratio / 0.35, 1.0) * 45
    rhythm_part = min(cv / 0.9, 1.0) * 30
    conflict_part = min(conflict_density / 3.0, 1.0) * 25
    return round(dialogue_part + rhythm_part + conflict_part)


def analyze(chapters: list[dict]) -> dict:
    """输入 chapter_repo.list_full_chapters 的行（seq/title/content），输出曲线数据。

    空章（还没写正文）不进曲线：给平线读数等于骗人，前端会如实显示「暂无可分析章节」。
    """
    points: list[dict] = []
    for ch in chapters:
        text = (ch.get("content") or "").strip()
        n = len(text)
        if n == 0:
            continue
        dialogue_ratio = _ratio(_dialogue_chars(text), n)
        cv = round(_sentence_cv(text), 4)
        conflict_density = round(len(_CONFLICT_RE.findall(text)) / max(n / 100, 1), 3)
        points.append(
            {
                "seq": int(ch["seq"]),
                "title": ch.get("title"),
                "word_count": n,
                "dialogue_ratio": dialogue_ratio,
                "conflict_density": conflict_density,
                "pace": _pace_score(n, dialogue_ratio, cv, conflict_density),
            }
        )
    # 低洼区：连续 ≥DIP_MIN_RUN 章 pace < 阈值
    dips: list[dict] = []
    run: list[dict] = []
    for p in points:
        if p["pace"] < LOW_THRESHOLD:
            run.append(p)
            continue
        if len(run) >= DIP_MIN_RUN:
            dips.append({"start_seq": run[0]["seq"], "end_seq": run[-1]["seq"]})
        run = []
    if len(run) >= DIP_MIN_RUN:
        dips.append({"start_seq": run[0]["seq"], "end_seq": run[-1]["seq"]})
    return {"chapters": points, "low_threshold": LOW_THRESHOLD, "dips": dips}
