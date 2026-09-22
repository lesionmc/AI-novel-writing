"""系统能力探测路由（Spec §5.8 · D-24）。只读、无副作用、不联网。"""

from __future__ import annotations

from fastapi import APIRouter

from app.models.system import SystemCapabilities
from app.services import system_service

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/capabilities", response_model=SystemCapabilities)
def get_capabilities() -> SystemCapabilities:
    return system_service.get_capabilities()
