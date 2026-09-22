"""端到端校验：按交接包指引（05）建出的库结构，与运行期真源一致。

做法：用 `app.db.schema_loader` 分别从「交接包 05 派生副本」与「运行期真源」执行建库，
再比对两份库的 sqlite_master（表/索引/虚拟表 的 type,name,sql 归一化）。
覆盖两种运行时能力：FTS5 可用（常见）、FTS5 与 vec 都不可用（降级）。
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

from app.db.connection import Capabilities  # noqa: E402
from app.db.schema_loader import load_statements  # noqa: E402

TRUE_SOURCE = REPO / "backend" / "app" / "db" / "schema.sql"
HANDOVER_COPY = REPO.parent / "05-数据库schema.sql"


def build(schema_path: Path, caps: Capabilities) -> list[tuple[str, str, str]]:
    conn = sqlite3.connect(":memory:")
    for stmt in load_statements(caps, schema_path):
        conn.execute(stmt)
    rows = conn.execute(
        "SELECT type, name, COALESCE(sql,'') FROM sqlite_master ORDER BY type, name"
    ).fetchall()
    conn.close()
    return [(t, n, re.sub(r"\s+", " ", s).strip()) for t, n, s in rows]


SCENARIOS = {
    "FTS5 可用 / vec 不可用（常见）": Capabilities(True, False, None, True, ("vec: not installed",)),
    "FTS5 与 vec 都不可用（降级）": Capabilities(False, False, None, False, ("vec: no", "fts5: no")),
}

fail = 0
for label, caps in SCENARIOS.items():
    a = build(HANDOVER_COPY, caps)
    b = build(TRUE_SOURCE, caps)
    print(f"--- 场景：{label} ---")
    print(f"  05 派生副本建出对象数：{len(a)}")
    print(f"  运行期真源建出对象数：{len(b)}")
    if a == b:
        print("  [PASS] sqlite_master 完全一致（表/索引/虚拟表逐条相同）")
    else:
        fail += 1
        print("  [FAIL] 结构不一致：")
        for row in [r for r in a if r not in b]:
            print("    仅 05：", row[0], row[1])
        for row in [r for r in b if r not in a]:
            print("    仅真源：", row[0], row[1])
    print()

# 额外：打印一份结构清单（供人工核对）
print("--- 05 派生副本在「FTS5 可用 / vec 不可用」下的库对象 ---")
for t, n, _ in build(HANDOVER_COPY, SCENARIOS["FTS5 可用 / vec 不可用（常见）"]):
    print(f"  {t:8} {n}")

sys.exit(1 if fail else 0)
