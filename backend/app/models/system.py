"""系统能力探测（system / Spec §5.8 · D-24）模型。"""

from __future__ import annotations

from pydantic import BaseModel


class SystemCapabilities(BaseModel):
    """本机能力自检状态：只读、无副作用、不联网。"""

    vector_available: bool
    fts_available: bool
    llm_configured: bool
