"""系统能力探测服务（Spec §5.8 · D-24）。

`vector_available` / `fts_available` 取连接层**启动自检**的进程内缓存（M1 不做运行时重算，
避免运行期返回假阳性）；`llm_configured` 反映**全局是否真有一个能用的模型**（即时生效，
非启动快照）—— 不只是「库里有没有启用的配置行」，还要求该配置的密钥此刻能从系统密钥环
取到（无密钥 provider 如 ollama 除外），语义与 `llm_registry.has_enabled_provider()` 一致。
模型配置已全局化，故其值不再依赖「当前打开的作品」。
"""

from __future__ import annotations

from app.db.connection import probe_capabilities
from app.models.system import SystemCapabilities
from app.services.llm import registry as llm_registry


def get_capabilities() -> SystemCapabilities:
    caps = probe_capabilities()
    try:
        llm_configured = llm_registry.has_enabled_provider()
    except Exception:  # noqa: BLE001 - 能力探测不得因局部失败而整体 500
        llm_configured = False
    return SystemCapabilities(
        vector_available=caps.vec_available,
        fts_available=caps.fts5_available,
        llm_configured=llm_configured,
    )
