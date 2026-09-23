"""AI 对话工作台路由（`POST /api/books/{book}/ai/chat`）。

只解析请求、调服务、组装响应 —— 业务逻辑全在 `services/ai_chat_service.py`。

**为什么是 `{book}` 路径而不是 by-id**：本端点一次要做三件事——解析作品、组装记忆包、
查可选章节，全都属于「这部作品」。放在作品路径下就不必靠"全局当前作品指针"猜归属，
从根上避免多标签页把甲书的话写进乙书（P0-2 那类问题）。
"""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models.ai_chat import AiChatRequest, AiChatResponse
from app.services import ai_chat_service

router = APIRouter(tags=["ai"])


@router.post("/api/books/{book}/ai/chat", response_model=AiChatResponse)
def ai_chat(book: str, payload: AiChatRequest) -> AiChatResponse:
    """一轮「有记忆」的对话（非流式）。**不写库** —— 草稿必须由用户确认后才落库。"""
    return ai_chat_service.chat(book, payload)


@router.post("/api/books/{book}/ai/chat/stream")
def ai_chat_stream(book: str, payload: AiChatRequest) -> StreamingResponse:
    """流式对话：SSE 帧 delta（人话片段）→ final（完整结果）/ error。

    前置检查（作品/章节/模型）在开流前同步完成，4xx 仍走正常状态码；
    开流之后的异常以 error 帧送达。与审校同一套 SSE 约定。
    """
    frames = ai_chat_service.chat_stream(book, payload)
    return StreamingResponse(
        frames,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
