"""路由层共用件：路径参数类型 + SSE 响应构造。

`RowId` 用于所有 `{id}` 形态的路径参数：本项目 id 来自 SQLite INTEGER PRIMARY KEY，
合法范围是 int64 正整数。**不加约束会出现 500**：超范围的值在绑定 SQL 参数时抛
`OverflowError`，冒泡成 `INTERNAL_ERROR`。加了约束后由 FastAPI 在进入业务逻辑前
挡成 400 VALIDATION_ERROR（语义正确：参数非法，而非资源不存在）。

`sse_response` 统一三个流式端点（对话 / 无作品对话 / 一致性审校）的 SSE 响应头，
避免同一组头逐字抄三遍。
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Annotated

from fastapi import Path as PathParam
from fastapi.responses import StreamingResponse

#: 资源 id —— int64 正整数（下界 1，上界 2^63-1）
RowId = Annotated[
    int,
    PathParam(ge=1, le=2 ** 63 - 1, description="资源 id（int64 正整数）"),
]


def sse_response(frames: Iterable[str]) -> StreamingResponse:
    """把帧生成器包成 SSE 响应。

    `X-Accel-Buffering: no` 是关键：反代（nginx 等）默认缓冲响应体，那样 SSE
    会退化成「算完一次性吐出」，前端看不到进度 —— 这是关闭 nginx 缓冲的通行做法。
    """
    return StreamingResponse(
        frames,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
