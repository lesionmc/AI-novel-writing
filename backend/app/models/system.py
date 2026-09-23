"""系统能力探测（system / Spec §5.8 · D-24）模型。"""

from __future__ import annotations

from pydantic import BaseModel


class SystemCapabilities(BaseModel):
    """本机能力自检状态：只读、无副作用、不联网。"""

    vector_available: bool
    fts_available: bool
    # 语义 = 「确实有一个能用的模型」：存在已启用的模型配置 **且** 其密钥此刻可加载
    # （无密钥 provider 如 ollama 无需密钥）。**不是**「库里有没有启用的配置行」——
    # 密钥被清空/失效时这里必须为 false，前端据此走「未配模型」降级。
    llm_configured: bool
