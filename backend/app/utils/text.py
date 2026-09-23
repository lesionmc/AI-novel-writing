"""纯文本工具：HTML 清洗与中文字数统计（无业务、无副作用）。"""

from __future__ import annotations

import re
from html import unescape

_TAG_RE = re.compile(r"<[^>]+>")
_ASCII_RUN_RE = re.compile(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*")
_CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_BLOCK_TAGS_RE = re.compile(
    r"</?(p|div|br|li|h[1-6]|blockquote|tr|td)[^>]*>", re.IGNORECASE
)


def strip_html(raw: str) -> str:
    """把 TipTap 富文本转为纯文本：块级标签转行、去标签、解实体。"""
    if not raw:
        return ""
    text = _BLOCK_TAGS_RE.sub("\n", raw)
    text = _TAG_RE.sub("", text)
    text = unescape(text)
    return text


def count_words(raw: str) -> int:
    """中文字数统计。

    规则（与前端 `lib/wordCount.ts` 逐字对齐：同一字符集、同一 ASCII 词正则）：
    每个中日韩汉字记 1，每段连续的 ASCII 字母数字记 1；**标点与空白一律不计**。
    曾把全角标点也记 1，导致同一章「顶栏 44 字 / 接口 66 字」两套答案 ——
    字数只允许有一个真源规则，故在此对齐（原"坑 19 ±2 字误差"约定作废：
    中文按词计与按字计差 30% 以上，容差救不了两套口径）。
    """
    text = strip_html(raw or "")
    if not text:
        return 0
    ascii_runs = len(_ASCII_RUN_RE.findall(text))
    cjk = len(_CJK_RE.findall(text))
    return cjk + ascii_runs


def estimate_tokens(text: str) -> int:
    """粗略估算 token 数：中文约 1.5 字/token，用于成本监控。"""
    if not text:
        return 0
    return max(1, int(len(text) / 1.5)) if len(text) > 1 else len(text)
