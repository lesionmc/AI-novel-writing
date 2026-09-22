"""LLM 输出的 JSON 解析容错（08-提示词规格 §2.5 / 坑 9）。

流程：剥离 ```json 标记 → 截取首个 { 到最后一个 } → json.loads。
失败由调用方决定是否重试一次。
"""

from __future__ import annotations

import json
import re

_FENCE_START_RE = re.compile(r"^\s*```[a-zA-Z]*\s*", re.MULTILINE)
_FENCE_END_RE = re.compile(r"```\s*$")


def clean_json_text(raw: str) -> str:
    text = (raw or "").strip()
    text = _FENCE_START_RE.sub("", text)
    text = _FENCE_END_RE.sub("", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    return text


def parse_json_loose(raw: str) -> dict:
    """返回解析后的 dict；失败抛 json.JSONDecodeError。"""
    data = json.loads(clean_json_text(raw))
    if not isinstance(data, dict):
        raise json.JSONDecodeError("顶层不是 JSON 对象", raw or "", 0)
    return data


def parse_json_array_loose(raw: str) -> dict:
    """兼容模型直接返回数组 / 包在 candidates 里的情况，统一成 {"candidates": [...]}。"""
    text = clean_json_text(raw)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # 尝试截取数组
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end <= start:
            raise
        data = json.loads(text[start : end + 1])
    if isinstance(data, list):
        return {"candidates": data}
    if isinstance(data, dict):
        return data
    raise json.JSONDecodeError("无法解析为对象或数组", raw or "", 0)
