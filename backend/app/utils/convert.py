"""tags 列表 <-> JSON 字符串 的通用转换工具。"""

from __future__ import annotations

import json
from typing import Any


def tags_to_db(tags: list[str] | None) -> str | None:
    if tags is None:
        return None
    return json.dumps(list(tags), ensure_ascii=False)


def tags_from_db(raw: Any) -> list[str]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(x) for x in raw]
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []
    if isinstance(parsed, list):
        return [str(x) for x in parsed]
    return []
