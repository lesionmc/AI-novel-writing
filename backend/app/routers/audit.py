"""质检路由（R8 一致性审校 / R10 去 AI 味 / R18 敏感词 / 词库状态）。

只解析请求、调服务、组装响应。
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.routers._params import RowId
from app.models.audit import AiFlavorResult, SensitiveResult, WordlistStatus
from app.models.writing_ai import ConsistencyRequest
from app.services import audit_service, consistency_service

router = APIRouter(tags=["audit"])


@router.post("/api/chapters/{chapter_id}/audit/ai-flavor", response_model=AiFlavorResult)
def audit_ai_flavor(chapter_id: RowId) -> AiFlavorResult:
    return audit_service.detect_ai_flavor(chapter_id)


@router.post("/api/books/{book}/audit/sensitive", response_model=SensitiveResult)
def audit_sensitive(book: str) -> SensitiveResult:
    return audit_service.scan_sensitive(book)


@router.get("/api/audit/wordlist-status", response_model=WordlistStatus)
def wordlist_status() -> WordlistStatus:
    return audit_service.wordlist_status()


@router.post("/api/books/{book}/audit/consistency/stream")
def audit_consistency_stream(
    book: str, payload: ConsistencyRequest | None = None
) -> StreamingResponse:
    """一致性审校（SSE）。

    事件类型与契约一致：`progress` / `conflict` / `done`。

    **所有 4xx 类前置检查必须在这里就做完**（`ensure_ready(book)`：作品存在 + 模型可用）——
    一旦开始流式响应，HTTP 状态码就定型了，之后再抛异常只会让客户端看到
    「莫名断掉的流」（实测会变成 `RuntimeError: ... response already started`）。
    """
    consistency_service.ensure_ready(book)
    scope = payload.scope if payload else None
    return StreamingResponse(
        consistency_service.stream(book, scope),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # 反代（nginx 等）默认会缓冲响应体，那样 SSE 就变成"审完一次性吐出来"，
            # 前端看不到进度。这个头是关闭 nginx 缓冲的通行做法。
            "X-Accel-Buffering": "no",
        },
    )
