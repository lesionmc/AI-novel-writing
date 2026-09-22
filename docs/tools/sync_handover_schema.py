"""schema 单一真源同步与校验工具（架构：高见远 ｜ ADR-006）。

背景：项目里曾存在「schema 双真源」——
  交接包 `小说/05-数据库schema.sql`（陈旧，缺 chunk_meta.embedding 两列、
  且三张虚拟表无 `@@OPTIONAL` 条件块标记） 与
  运行期真源 `ai-novel/backend/app/db/schema.sql`（被 `schema_loader.py:14` 指向）。
照陈旧那份建库会缺列（向量一写即 `no such column: embedding`），并会在
缺 sqlite-vec / FTS5 的机器上整体建库失败。

本工具把关系收敛为「单一真源 + 派生」：
  · 唯一真源：`ai-novel/backend/app/db/schema.sql`（人工只改这里）
  · 派生副本：`小说/05-数据库schema.sql`（由本工具从真源同步生成，勿手工编辑）

用法（在 `ai-novel/` 目录下执行）：
  python docs/tools/sync_handover_schema.py --check   # 校验二者可执行 DDL 是否一致
  python docs/tools/sync_handover_schema.py --write    # 用真源重新生成 05 派生副本
  python docs/tools/sync_handover_schema.py --print-skeleton  # 打印提取出的纯 DDL 骨架

`--check` 退出码：0 = 一致（无漂移）；1 = 存在漂移或文件缺失（可直接用作提交前门禁）。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# tools/ -> docs/ -> ai-novel/ ；真源在仓库内，派生副本在仓库外的交接包根
REPO_ROOT = Path(__file__).resolve().parents[2]
TRUE_SOURCE = REPO_ROOT / "backend" / "app" / "db" / "schema.sql"
HANDOVER_COPY = REPO_ROOT.parent / "05-数据库schema.sql"

# 派生副本文件头（全为 `--` 注释，不影响可执行 DDL；`--check` 会连同真源一起忽略注释）
SYNC_HEADER = """\
-- ============================================================================
-- 本文件为【派生副本】—— 请勿手工编辑
-- ============================================================================
-- 同步来源（唯一真源）：ai-novel/backend/app/db/schema.sql
--   · 运行期真源是上面那份；`app/db/schema_loader.py` 的 SCHEMA_PATH 指向它。
--   · 本文件由工具同步生成，仅供交接包读者离线查阅；任何 DDL 变更都必须先改真源。
--   · 下方正文**逐字复制自真源**。正文里出现的「本文件」「唯一真相源」「基于 05-数据库schema.sql
--     修正」等自称，说的都是**真源**（backend/app/db/schema.sql），不是本派生副本——请勿混淆。
--
-- 同步方式（在 ai-novel/ 目录下执行）：
--   python docs/tools/sync_handover_schema.py --write    # 用真源重新生成本文件
--   python docs/tools/sync_handover_schema.py --check    # 校验本件与真源是否一致（提交前门禁）
--
-- 建库方式（重要）：
--   · 不得用 sqlite3 / DB 工具直接执行本文件。真源内含 `-- @@OPTIONAL fts` /
--     `-- @@OPTIONAL vec` 条件块标记（对 SQLite 只是普通注释），须由
--     `app/db/schema_loader.apply_schema()` 解析后按运行时能力择取执行。
--   · 直接执行会把三张虚拟表（vec_chunk / chapter_fts / setting_fts）一并无条件创建，
--     在缺 sqlite-vec 扩展或缺 FTS5 的机器上会**整体建库失败**。
--   权威口径见 `ai-novel/docs/decisions/ADR-006-*`。
-- ============================================================================

"""


def ddl_skeleton(text: str) -> list[str]:
    """抽取「可执行 DDL 骨架」，与 `schema_loader.load_statements` 的解析口径一致：
    解析 `@@OPTIONAL` 条件块（骨架保留段内语句，以做到能力无关）、去掉行注释、
    按 `;` 切分、折叠空白。仅比较 DDL 语句本身，注释差异一律忽略。
    """
    lines = text.splitlines()
    kept: list[str] = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if stripped.startswith("-- @@OPTIONAL"):
            i += 1
            while i < len(lines) and lines[i].strip() != "-- @@END":
                kept.append(lines[i])
                i += 1
            i += 1  # 跳过 @@END
            continue
        kept.append(lines[i])
        i += 1

    cleaned: list[str] = []
    for line in kept:
        idx = line.find("--")
        cleaned.append(line[:idx] if idx != -1 else line)
    body = "\n".join(cleaned)

    out: list[str] = []
    for stmt in body.split(";"):
        s = re.sub(r"\s+", " ", stmt).strip()
        if s:
            out.append(s)
    return out


def optional_markers(text: str) -> list[str]:
    """按出现顺序取出 `-- @@OPTIONAL <cap>` 行首标记的能力名序列。

    这一维专抓「DDL 骨架相同、但条件化标记缺失」的隐患：缺标记时，三张虚拟表会被
    无条件执行，在缺扩展 / 缺 FTS5 的环境里**整体建库失败**（DDL 骨架 diff 抓不到它）。
    """
    return [
        ln.strip().split()[-1]
        for ln in text.splitlines()
        if ln.strip().startswith("-- @@OPTIONAL")
    ]


def read_true_source() -> str:
    if not TRUE_SOURCE.is_file():
        sys.exit(f"[FAIL] 找不到真源：{TRUE_SOURCE}")
    return TRUE_SOURCE.read_text(encoding="utf-8")


def cmd_check() -> int:
    true_text = read_true_source()
    if not HANDOVER_COPY.is_file():
        print(f"[FAIL] 找不到派生副本：{HANDOVER_COPY}")
        return 1
    handover_text = HANDOVER_COPY.read_text(encoding="utf-8")

    a = ddl_skeleton(handover_text)
    b = ddl_skeleton(true_text)
    ma = optional_markers(handover_text)
    mb = optional_markers(true_text)
    print(f"真源      ：{TRUE_SOURCE}")
    print(f"派生副本  ：{HANDOVER_COPY}")
    print(f"真源 DDL 语句数：{len(b)}｜条件块标记：{mb}")
    print(f"副本 DDL 语句数：{len(a)}｜条件块标记：{ma}")

    ok = True

    if a == b:
        print("[PASS] 维1 · 可执行 DDL 骨架完全一致（仅允许注释差异）。")
    else:
        ok = False
        print("[FAIL] 维1 · 派生副本与真源 DDL 骨架不一致（双真源漂移）：")
        for s in [x for x in a if x not in b]:
            print("  仅在副本：", s)
        for s in [x for x in b if x not in a]:
            print("  仅在真源：", s)

    if ma == mb:
        print("[PASS] 维2 · 条件块（@@OPTIONAL）标记完全一致。")
    else:
        ok = False
        print("[FAIL] 维2 · 条件块标记不一致——虚拟表会被无条件执行，缺扩展/缺 FTS5 的机器建库即崩：")
        print("  真源标记：", mb)
        print("  副本标记：", ma)

    if ok:
        return 0
    print("请执行：python docs/tools/sync_handover_schema.py --write")
    return 1


def cmd_write() -> int:
    true_text = read_true_source()
    HANDOVER_COPY.write_text(SYNC_HEADER + true_text, encoding="utf-8")
    print(f"[OK] 已用真源重新生成派生副本：{HANDOVER_COPY}")
    return cmd_check()


def cmd_print_skeleton() -> int:
    for s in ddl_skeleton(read_true_source()):
        print(s)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="schema 单一真源同步/校验工具")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--check", action="store_true", help="校验派生副本与真源可执行 DDL 是否一致")
    g.add_argument("--write", action="store_true", help="用真源重新生成 05 派生副本")
    g.add_argument("--print-skeleton", action="store_true", help="打印真源的纯 DDL 骨架")
    args = ap.parse_args()
    if args.check:
        return cmd_check()
    if args.write:
        return cmd_write()
    return cmd_print_skeleton()


if __name__ == "__main__":
    raise SystemExit(main())
