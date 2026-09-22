"""AI 辅助路由。只解析请求、调服务、组装响应。

`setup-chat` **无写入副作用**：只回草稿，落库由前端确认后调用已有设定端点完成。
"""

from __future__ import annotations

from fastapi import APIRouter

from app.models.ai_setup import SetupChatRequest, SetupChatResponse
from app.services import ai_setup_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/setup-chat", response_model=SetupChatResponse)
def setup_chat(payload: SetupChatRequest) -> SetupChatResponse:
    """AI 对话式建设定（只出草稿，绝不写库）。"""
    return ai_setup_service.setup_chat(payload)
