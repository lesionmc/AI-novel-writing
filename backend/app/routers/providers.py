"""模型配置路由（R5）。响应绝不包含密钥明文。"""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.routers._params import RowId
from app.models.provider import (
    DiscoverModelsRequest,
    DiscoverModelsResult,
    DraftTestRequest,
    LLMProviderOut,
    ProviderCreate,
    ProviderTestResult,
    ProviderUpdate,
    ProviderUsage,
)
from app.services import provider_service

router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("", response_model=list[LLMProviderOut])
def list_providers() -> list[LLMProviderOut]:
    return provider_service.list_providers()


@router.post("", response_model=LLMProviderOut, status_code=status.HTTP_201_CREATED)
def create_provider(payload: ProviderCreate) -> LLMProviderOut:
    return provider_service.create_provider(payload)


# --- 保存前能力：拉取模型列表 / 测试草稿（均不落库、不写密钥环） ---
# 字面量路径定义在 /{provider_id} 之前，避免与路径参数混淆。
@router.post("/discover-models", response_model=DiscoverModelsResult)
def discover_models(payload: DiscoverModelsRequest) -> DiscoverModelsResult:
    return provider_service.discover_models(payload)


@router.post("/test-draft", response_model=ProviderTestResult)
def test_draft(payload: DraftTestRequest) -> ProviderTestResult:
    return provider_service.test_draft(payload)


@router.patch("/{provider_id}", response_model=LLMProviderOut)
def update_provider(provider_id: RowId, payload: ProviderUpdate) -> LLMProviderOut:
    return provider_service.update_provider(provider_id, payload)


@router.delete("/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(provider_id: RowId) -> None:
    provider_service.delete_provider(provider_id)


@router.post("/{provider_id}/test", response_model=ProviderTestResult)
def test_provider(provider_id: RowId) -> ProviderTestResult:
    return provider_service.test_provider(provider_id)


@router.get("/{provider_id}/usage", response_model=ProviderUsage)
def get_usage(
    provider_id: RowId,
    from_date: str | None = Query(default=None, alias="from"),
    to_date: str | None = Query(default=None, alias="to"),
) -> ProviderUsage:
    return provider_service.get_usage(provider_id, from_date, to_date)
