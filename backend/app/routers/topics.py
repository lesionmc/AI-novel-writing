"""选题助手路由（R0）。只解析请求、调服务、组装响应。"""

from __future__ import annotations

from fastapi import APIRouter

from app.models.topic import GenresResponse, TopicAdviceRequest, TopicAdviceResponse
from app.services import topic_service

router = APIRouter(prefix="/api/topics", tags=["topics"])


@router.get("/genres", response_model=GenresResponse)
def list_genres() -> GenresResponse:
    """题材知识库（只读本地文件，无副作用、不调模型）。"""
    return topic_service.list_genres()


@router.post("/advice", response_model=TopicAdviceResponse)
def topic_advice(payload: TopicAdviceRequest) -> TopicAdviceResponse:
    """选题建议（同步生成，**不落库**）。"""
    return topic_service.advice(payload)
