"""质检路由（R10 去 AI 味 / R18 敏感词 / 词库状态）。只解析请求、调服务、组装响应。"""

from __future__ import annotations

from fastapi import APIRouter

from app.models.audit import AiFlavorResult, SensitiveResult, WordlistStatus
from app.services import audit_service

router = APIRouter(tags=["audit"])


@router.post("/api/chapters/{chapter_id}/audit/ai-flavor", response_model=AiFlavorResult)
def audit_ai_flavor(chapter_id: int) -> AiFlavorResult:
    return audit_service.detect_ai_flavor(chapter_id)


@router.post("/api/books/{book}/audit/sensitive", response_model=SensitiveResult)
def audit_sensitive(book: str) -> SensitiveResult:
    return audit_service.scan_sensitive(book)


@router.get("/api/audit/wordlist-status", response_model=WordlistStatus)
def wordlist_status() -> WordlistStatus:
    return audit_service.wordlist_status()
