"""人物出场判断（供回写与召回共用）：按姓名/别名在文本中出现。"""

from __future__ import annotations

import sqlite3

from app.repositories import character_repo


def characters_in_text(
    conn: sqlite3.Connection,
    text: str,
    *,
    fallback_role: str = "protagonist",
) -> list[dict]:
    all_chars = character_repo.all_rows(conn)
    content = text or ""
    matched = [
        c
        for c in all_chars
        if (c["name"] and c["name"] in content)
        or (c.get("alias") and c["alias"] in content)
    ]
    if not matched and fallback_role:
        matched = [c for c in all_chars if c["role"] == fallback_role]
    return matched
