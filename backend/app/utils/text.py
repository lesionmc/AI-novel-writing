"""纯文本工具：HTML 清洗与中文字数统计（无业务、无副作用）。"""

from __future__ import annotations

import re
from html import unescape

_TAG_RE = re.compile(r"<[^>]+>")
_ASCII_RUN_RE = re.compile(r"[A-Za-z0-9]+")
_WS_RE = re.compile(r"\s+")
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

    规则：去除 HTML 与空白后，每个中日韩字符 / 全角标点记 1，
         每段连续的 ASCII 字母数字记 1（英文单词按词计）。
    与前端 Intl.Segmenter 计口径近似，允许 ±2 字误差（坑 19）。
    """
    text = strip_html(raw or "")
    if not text:
        return 0
    ascii_runs = _ASCII_RUN_RE.findall(text)
    remainder = _ASCII_RUN_RE.sub("", text)
    remainder = _WS_RE.sub("", remainder)
    return len(remainder) + len(ascii_runs)


def estimate_tokens(text: str) -> int:
    """粗略估算 token 数：中文约 1.5 字/token，用于成本监控。"""
    if not text:
        return 0
    return max(1, int(len(text) / 1.5)) if len(text) > 1 else len(text)
