"""路由层共用参数类型。

`RowId` 用于所有 `{id}` 形态的路径参数：本项目 id 来自 SQLite INTEGER PRIMARY KEY，
合法范围是 int64 正整数。**不加约束会出现 500**：超范围的值在绑定 SQL 参数时抛
`OverflowError`，冒泡成 `INTERNAL_ERROR`。加了约束后由 FastAPI 在进入业务逻辑前
挡成 400 VALIDATION_ERROR（语义正确：参数非法，而非资源不存在）。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Path as PathParam

#: 资源 id —— int64 正整数（下界 1，上界 2^63-1）
RowId = Annotated[
    int,
    PathParam(ge=1, le=2 ** 63 - 1, description="资源 id（int64 正整数）"),
]
