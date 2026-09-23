"""schema.sql 加载器：按运行时能力与目标库（scope）条件化执行建表语句。

同一份 `schema.sql` 是**全部库**的唯一真相源，按 `scope` 择取：
  · `scope="book"`   —— 每部作品一个库（`books/<slug>/novel.db`）：
     执行无条件段 + 命中的 `@@OPTIONAL` 段；**跳过** `@@GLOBAL` 段。
  · `scope="global"` —— 全局库（`data/app.db`）：
     **只执行** `@@GLOBAL` 段（承载跨作品共享对象：`llm_provider` / `meta` / `provider_role`）。

`-- @@OPTIONAL vec` / `-- @@OPTIONAL fts` 标记块内语句，仅在对应能力可用时执行
（坑 3 / 坑 6 / D-17）。`-- @@GLOBAL` 块则与能力无关，只与目标库有关。
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.db.connection import Capabilities

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

# 书库（每书一份）普通表。注意：**不含** llm_provider —— 它已全局化，见 _GLOBAL_TABLES。
_BASE_TABLES = (
    "book",
    "character",
    "character_relation",
    "world_entry",
    "foreshadow",
    "outline",
    "chapter",
    "chapter_version",
    "character_state",
    "plot_arc",
    "recall_log",
    "chunk_meta",
    "writing_log",
    "material",
)
# 全局库（data/app.db）对象：模型配置 + 全局键值元信息（含一次性迁移标记）
#   + 模型↔角色关联表（provider_role）。
# ⚠ `provider_role` 必须登记在此：`global_db._ensure_schema` 只在
#   `missing_global_objects()` 非空时才执行建库语句 —— 漏登记会导致
#   **已存在的全局库永远补不上这张新表**（老库升级即缺表）。
_GLOBAL_TABLES = ("llm_provider", "meta", "provider_role")
_OPTIONAL_TABLE_CAP = {"vec_chunk": "vec", "chapter_fts": "fts", "setting_fts": "fts"}


def _cap_enabled(caps: Capabilities, name: str) -> bool:
    return caps.vec_available if name == "vec" else caps.fts5_available


def load_statements(
    caps: Capabilities | None = None,
    schema_path: Path | None = None,
    *,
    scope: str = "book",
) -> list[str]:
    """读取并按 scope / 能力过滤 schema.sql，返回可执行的语句列表。

    `scope="global"` 时不使用 `caps`（全局库只有无条件的 llm_provider 建表）。
    """
    if scope not in ("book", "global"):
        raise ValueError(f"未知 scope：{scope!r}")
    text = (schema_path or SCHEMA_PATH).read_text(encoding="utf-8")
    lines = text.splitlines()

    kept: list[str] = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped.startswith("-- @@OPTIONAL"):
            cap_name = stripped.split()[-1]
            i += 1
            block: list[str] = []
            while i < len(lines) and lines[i].strip() != "-- @@END":
                block.append(lines[i])
                i += 1
            i += 1  # 跳过 @@END
            if scope == "book" and caps is not None and _cap_enabled(caps, cap_name):
                kept.extend(block)
            continue
        if stripped.startswith("-- @@GLOBAL"):
            i += 1
            block = []
            while i < len(lines) and lines[i].strip() != "-- @@END":
                block.append(lines[i])
                i += 1
            i += 1  # 跳过 @@END
            if scope == "global":
                kept.extend(block)
            continue
        if scope == "global":
            # 全局库不承载书库对象（PRAGMA / 书库表 / 索引一律跳过）
            i += 1
            continue
        kept.append(lines[i])
        i += 1

    # 去行注释后按 ';' 切分（本 schema 无触发器，字符串内不含 ';'）
    cleaned: list[str] = []
    for line in kept:
        idx = line.find("--")
        cleaned.append(line[:idx] if idx != -1 else line)
    body = "\n".join(cleaned)
    return [s.strip() for s in body.split(";") if s.strip()]


def apply_schema(conn: sqlite3.Connection, caps: Capabilities) -> int:
    """建**书库**：执行条件化建库语句并写入 user_version，返回语句条数。"""
    statements = load_statements(caps, scope="book")
    for stmt in statements:
        conn.execute(stmt)
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    return len(statements)


def apply_global_schema(conn: sqlite3.Connection) -> int:
    """建**全局库**（data/app.db）：只执行 @@GLOBAL 段，返回语句条数。"""
    statements = load_statements(scope="global")
    for stmt in statements:
        conn.execute(stmt)
    conn.execute("PRAGMA user_version = 1")
    conn.commit()
    return len(statements)


def expected_objects(caps: Capabilities) -> tuple[str, ...]:
    """本能力下**书库**应当存在的库对象名（用于建库后自检）。"""
    names = list(_BASE_TABLES)
    if caps.fts5_available:
        names += ["chapter_fts", "setting_fts"]
    if caps.vec_available:
        names += ["vec_chunk"]
    return tuple(names)


def expected_global_objects() -> tuple[str, ...]:
    """全局库应当存在的库对象名。"""
    return _GLOBAL_TABLES


def _present_objects(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table','view')"
    ).fetchall()
    return {str(r[0]) for r in rows}


def missing_objects(conn: sqlite3.Connection, caps: Capabilities) -> list[str]:
    present = _present_objects(conn)
    return [n for n in expected_objects(caps) if n not in present]


def missing_global_objects(conn: sqlite3.Connection) -> list[str]:
    present = _present_objects(conn)
    return [n for n in expected_global_objects() if n not in present]
