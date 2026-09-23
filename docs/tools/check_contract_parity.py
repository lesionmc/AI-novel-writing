"""契约 ↔ 代码 对账工具（`06-API定义-openapi.yaml` vs `app.openapi()`）。

## 为什么需要它

项目的第 3 条铁律是「契约先行 + 改完对账」，但**此前没有工具化** ——
只能靠人肉数 path，于是历史上出现过两种事故：
  · 把 path 数和 operation 数混着报，造成"对账差 1"的误导；
  · 契约里标了 `deferred` 的端点被误判成"漏做"。

本工具把对账变成**可执行、可退出码门禁**的一步。

## 用法（在 `ai-novel/` 目录下执行）

    python docs/tools/check_contract_parity.py          # 只对账，退出码 0/1
    python docs/tools/check_contract_parity.py -v       # 打印逐条差异

退出码：0 = 完全一致；1 = 存在差异（可直接用作提交前门禁）。

## 对账口径（与契约头部说明一致）

- **path 集合必须逐个相等**（契约里已无 `deferred` 端点，差集应为空）。
- operation 数按 HTTP 方法逐个累加 —— 与 path 数**分开报**，不混算。
- **method-per-path 必须一致**：同一形状的路径，契约与代码的 HTTP 方法集合要完全相同。
  只比 path 集合 + operation 总数是不够的 —— 把 `GET /x` 改成 `DELETE /x`、同时在别处补一个
  `GET`，集合与总数都不变，旧口径会误判为 PASS（A-08）。
- 路径模板里的参数名差异（`{id}` vs `{chapter_id}`）**视为已知遗留、不判失败**，
  但会在 `-v` 下打印提醒。理由：URL 形状一致、运行期无影响，
  统一它要改 16 个路由签名，收益为零、回归风险高（见 `docs/decisions/OPEN-DECISIONS.md`）。
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / "backend"
CONTRACT = REPO_ROOT.parent / "06-API定义-openapi.yaml"

HTTP_METHODS = ("get", "post", "put", "patch", "delete", "options", "head", "trace")


def _append_backend_to_path() -> None:
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))


def contract_operations(text: str) -> dict[str, set[str]]:
    """解析契约：返回 `{path: {方法集合}}`（方法为大写）。

    用极简缩进解析而不是 PyYAML —— 本工具要在**裸 Python**（可能没装第三方库）下也能跑，
    因为它是"环境出问题时最需要能跑"的那类工具。
    """
    ops: dict[str, set[str]] = {}
    in_paths = False
    in_current_path = False
    current = ""
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip())
        body = line.strip()

        if indent == 0:
            in_paths = body.startswith("paths:")
            in_current_path = False
            continue
        if not in_paths:
            continue
        if indent == 2 and body.startswith("/") and body.endswith(":"):
            current = body[:-1]
            ops.setdefault(current, set())
            in_current_path = True
            continue
        if indent == 2:
            in_current_path = False
            continue
        if in_current_path and indent == 4:
            m = re.match(r"^([a-z]+):", body)
            if m and m.group(1) in HTTP_METHODS:
                ops[current].add(m.group(1).upper())
    return ops


def code_operations() -> dict[str, set[str]]:
    _append_backend_to_path()
    from app.main import app  # noqa: PLC0415 - 延迟导入，保证纯解析模式也能用

    spec = app.openapi()
    return {
        path: {m.upper() for m in item if m.lower() in HTTP_METHODS}
        for path, item in spec.get("paths", {}).items()
    }


def _normalize(path: str) -> str:
    """把路径模板里的参数名抹平成 `{}`，用于判定"同一形状的路径"。

    这样 `{id}` 与 `{chapter_id}` 会被认成同一条，从而把"参数名差异"
    与"真的少/多了一条端点"区分开 —— 前者是已知遗留，后者才是缺陷。
    """
    return re.sub(r"\{[^}]*\}", "{}", path)


def main() -> int:
    parser = argparse.ArgumentParser(description="契约 ↔ 代码 path/operation 对账")
    parser.add_argument("-v", "--verbose", action="store_true", help="打印逐条差异与参数名提醒")
    args = parser.parse_args()

    if not CONTRACT.is_file():
        print(f"[FAIL] 找不到契约文件：{CONTRACT}")
        print("       契约不在仓库内，而在其**上一级目录**（与 ai-novel/ 同级）。")
        return 1

    text = CONTRACT.read_text(encoding="utf-8")
    c_ops_map = contract_operations(text)
    k_ops_map = code_operations()
    c_paths = sorted(c_ops_map)
    k_paths = sorted(k_ops_map)
    c_ops = sum(len(v) for v in c_ops_map.values())
    k_ops = sum(len(v) for v in k_ops_map.values())

    print("契约 ↔ 代码 对账")
    print("-" * 62)
    print(f"  契约 path 数        = {len(c_paths)}（去重后 {len(set(c_paths))}）")
    print(f"  代码 path 数        = {len(k_paths)}")
    print(f"  契约 operation 数   = {c_ops}")
    print(f"  代码 operation 数   = {k_ops}")

    c_norm = {_normalize(p): p for p in c_paths}
    k_norm = {_normalize(p): p for p in k_paths}

    only_contract = sorted(c_norm[k] for k in set(c_norm) - set(k_norm))
    only_code = sorted(k_norm[k] for k in set(k_norm) - set(c_norm))

    # 参数名差异：形状相同但写法不同 = 已知遗留，仅提醒
    renames = sorted(
        (c_norm[k], k_norm[k]) for k in set(c_norm) & set(k_norm) if c_norm[k] != k_norm[k]
    )

    # method-per-path：同一形状路径的 HTTP 方法集合必须完全相同
    method_mismatches = [
        (c_norm[shape], k_norm[shape], c_ops_map[c_norm[shape]], k_ops_map[k_norm[shape]])
        for shape in set(c_norm) & set(k_norm)
        if c_ops_map[c_norm[shape]] != k_ops_map[k_norm[shape]]
    ]

    ok = True
    if only_contract:
        ok = False
        print(f"\n[FAIL] 契约里有、代码里没有（{len(only_contract)} 条）：")
        for p in only_contract:
            print(f"     - {p}")
    if only_code:
        ok = False
        print(f"\n[FAIL] 代码里有、契约里没有（{len(only_code)} 条）：")
        for p in only_code:
            print(f"     + {p}")
    if c_ops != k_ops:
        ok = False
        print(f"\n[FAIL] operation 数不一致：契约 {c_ops} vs 代码 {k_ops}")
    if method_mismatches:
        ok = False
        print(f"\n[FAIL] 同一路径的 HTTP 方法不一致（{len(method_mismatches)} 条）：")
        for c_path, k_path, c_methods, k_methods in sorted(method_mismatches):
            print(f"     {c_path} ↔ {k_path}：契约 {sorted(c_methods)} vs 代码 {sorted(k_methods)}")

    if renames:
        print(f"\n[提醒] 同一路径的参数名写法不同（已知遗留，**不计失败**，共 {len(renames)} 条）：")
        for c, k in (renames if args.verbose else renames[:3]):
            print(f"     {c}  ↔  {k}")
        if not args.verbose and len(renames) > 3:
            print(f"     …另有 {len(renames) - 3} 条（加 -v 看全部）")

    print()
    print("结论：" + ("全部一致 ✅" if ok else "存在差异 ❌"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
