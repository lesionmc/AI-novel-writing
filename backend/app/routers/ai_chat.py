"""AI 对话工作台路由（`POST /api/books/{book}/ai/chat`）。

只解析请求、调服务、组装响应 —— 业务逻辑全在 `services/ai_chat_service.py`。

**为什么是 `{book}` 路径而不是 by-id**：本端点一次要做三件事——解析作品、组装记忆包、
查可选章节，全都属于「这部作品」。放在作品路径下就不必靠"全局当前作品指针"猜归属，
从根上避免多标签页把甲书的话写进乙书（P0-2 那类问题）。
"""

from __future__ import annotations

from fastapi import APIRouter

from app.models.ai_chat import AiChatRequest, AiChatResponse
from app.services import ai_chat_service

router = APIRouter(tags=["ai"])


@router.post("/api/books/{book}/ai/chat", response_model=AiChatResponse)
def ai_chat(book: str, payload: AiChatRequest) -> AiChatResponse:
    """一轮「有记忆」的对话。**不写库** —— 草稿必须由用户确认后才落库。"""
    return ai_chat_service.chat(book, payload)
