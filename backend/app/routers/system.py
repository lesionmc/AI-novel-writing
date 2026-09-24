"""系统能力探测路由（Spec §5.8 · D-24）+ 联网搜索配置。"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import ValidationError

from app.models.system import SystemCapabilities, WebSearchSettings
from app.services import system_service, web_search

router = APIRouter(prefix="/api/system", tags=["system"])


def _settings_or_default(endpoint: str | None, proxy: str | None) -> WebSearchSettings:
    """库里可能躺着历史脏值（旧版本/手改库）—— 读取时按「未配置」降级，绝不 500。"""
    try:
        return WebSearchSettings(endpoint=endpoint, proxy=proxy)
    except ValidationError:
        try:
            return WebSearchSettings(endpoint=endpoint, proxy=None)
        except ValidationError:
            return WebSearchSettings(endpoint=None, proxy=None)


@router.get("/capabilities", response_model=SystemCapabilities)
def get_capabilities() -> SystemCapabilities:
    return system_service.get_capabilities()


@router.get("/web-search", response_model=WebSearchSettings)
def get_web_search() -> WebSearchSettings:
    cfg = web_search.get_config()
    endpoint = cfg["endpoint"]
    return _settings_or_default(
        None if endpoint == web_search.DEFAULT_ENDPOINT else endpoint,
        cfg["proxy"] or None,
    )


@router.put("/web-search", response_model=WebSearchSettings)
def put_web_search(payload: WebSearchSettings) -> WebSearchSettings:
    cfg = web_search.save_config(payload.endpoint, payload.proxy)
    endpoint = cfg["endpoint"]
    return _settings_or_default(
        None if endpoint == web_search.DEFAULT_ENDPOINT else endpoint,
        cfg["proxy"] or None,
    )
