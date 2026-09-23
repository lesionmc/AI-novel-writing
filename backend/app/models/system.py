"""系统能力探测（system / Spec §5.8 · D-24）模型。"""

from __future__ import annotations

from pydantic import BaseModel, field_validator


class SystemCapabilities(BaseModel):
    """本机能力自检状态：只读、无副作用、不联网。"""

    vector_available: bool
    fts_available: bool
    # 语义 = 「确实有一个能用的模型」：存在已启用的模型配置 **且** 其密钥此刻可加载
    # （无密钥 provider 如 ollama 无需密钥）。**不是**「库里有没有启用的配置行」——
    # 密钥被清空/失效时这里必须为 false，前端据此走「未配模型」降级。
    llm_configured: bool


class WebSearchSettings(BaseModel):
    """联网搜索配置。两者都留空 = 用默认 DuckDuckGo 直连（大陆网络需代理）。

    endpoint 约定：自建/第三方 JSON 端点，`GET {endpoint}?q=...` 返回
    `{"results": [{"title","url","snippet"}]}`。
    """

    endpoint: str | None = None
    proxy: str | None = None

    @field_validator("endpoint")
    @classmethod
    def _endpoint_http(cls, v: str | None) -> str | None:
        if v and not v.startswith(("http://", "https://")):
            raise ValueError("搜索端点必须以 http:// 或 https:// 开头")
        return v or None

    @field_validator("proxy")
    @classmethod
    def _proxy_scheme(cls, v: str | None) -> str | None:
        if v and not v.startswith(("http://", "https://", "socks5://")):
            raise ValueError("代理需带协议前缀，如 http://127.0.0.1:7890")
        return v or None
