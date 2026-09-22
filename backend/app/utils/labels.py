"""展示用中文标签映射（存储英文枚举，界面展示中文）。"""

from __future__ import annotations

ROLE_LABELS = {
    "protagonist": "主角",
    "supporting": "配角",
    "antagonist": "反派",
    "minor": "龙套",
}

STATUS_LABELS = {
    "alive": "在世",
    "dead": "已死亡",
    "missing": "失踪",
    "unknown": "不明",
}

IMPORTANCE_LABELS = {
    "high": "高",
    "medium": "中",
    "low": "低",
}

ARC_TYPE_LABELS = {
    "main": "主线",
    "sub": "支线",
    "romance": "感情线",
    "growth": "成长线",
}


def role_label(role: str | None) -> str:
    return ROLE_LABELS.get(role or "", role or "")


def importance_label(importance: str | None) -> str:
    return IMPORTANCE_LABELS.get(importance or "", importance or "")
