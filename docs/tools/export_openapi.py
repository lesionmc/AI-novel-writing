"""导出后端 OpenAPI 契约到 docs/openapi.json（前端类型生成的唯一数据源）。

用法（项目根）：backend/../.venv/Scripts/python.exe docs/tools/export_openapi.py
契约变了不重新导出 = 前端 `npm run check:contract` 直接报漂移，双保险。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.main import app  # noqa: E402

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "openapi.json"


def main() -> None:
    spec = app.openapi()
    OUT.write_text(
        json.dumps(spec, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    paths = len(spec.get("paths", {}))
    print(f"openapi.json 已导出：{paths} 个路径 → {OUT}")


if __name__ == "__main__":
    main()
