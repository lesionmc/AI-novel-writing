"""系统能力探测路由（Spec §5.8 · D-24）+ 联网搜索配置。"""

from __future__ import annotations

from fastapi import APIRouter

from app.models.system import SystemCapabilities, WebSearchSettings
from app.services import system_service, web_search

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/capabilities", response_model=SystemCapabilities)
def get_capabilities() -> SystemCapabilities:
    return system_service.get_capabilities()


@router.get("/web-search", response_model=WebSearchSettings)
def get_web_search() -> WebSearchSettings:
    cfg = web_search.get_config()
    endpoint = cfg["endpoint"]
    return WebSearchSettings(
        endpoint=None if endpoint == web_search.DEFAULT_ENDPOINT else endpoint,
        proxy=cfg["proxy"] or None,
    )


@router.put("/web-search", response_model=WebSearchSettings)
def put_web_search(payload: WebSearchSettings) -> WebSearchSettings:
    cfg = web_search.save_config(payload.endpoint, payload.proxy)
    endpoint = cfg["endpoint"]
    return WebSearchSettings(
        endpoint=None if endpoint == web_search.DEFAULT_ENDPOINT else endpoint,
        proxy=cfg["proxy"] or None,
    )
