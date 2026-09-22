"""类型化错误体系。

统一响应结构：{"error": {"code", "message", "detail"}}
错误文案为可读中文（Spec 第 10 章），绝不把堆栈或原始 HTTP 错误返回前端。
"""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    """所有业务错误的基类。"""

    code: str = "INTERNAL_ERROR"
    http_status: int = 500
    message: str = "服务器内部错误"

    def __init__(self, message: str | None = None, detail: Any = None) -> None:
        self.message = message or type(self).message
        self.detail = detail
        super().__init__(self.message)

    def to_payload(self) -> dict[str, Any]:
        return {"error": {"code": self.code, "message": self.message, "detail": self.detail}}


class ValidationError(AppError):
    code = "VALIDATION_ERROR"
    http_status = 400
    message = "请求参数不合法"


class NotFoundError(AppError):
    code = "NOT_FOUND"
    http_status = 404
    message = "资源不存在"


class ConflictError(AppError):
    code = "CONFLICT"
    http_status = 409
    message = "资源冲突"


class BookNotFoundError(NotFoundError):
    code = "BOOK_NOT_FOUND"
    message = "作品不存在"


class ChapterNotFoundError(NotFoundError):
    code = "CHAPTER_NOT_FOUND"
    message = "章节不存在"


class CharacterNotFoundError(NotFoundError):
    code = "CHARACTER_NOT_FOUND"
    message = "人物不存在"


class WorldEntryNotFoundError(NotFoundError):
    code = "WORLD_ENTRY_NOT_FOUND"
    message = "世界词条不存在"


class ForeshadowNotFoundError(NotFoundError):
    code = "FORESHADOW_NOT_FOUND"
    message = "伏笔不存在"


class VersionNotFoundError(NotFoundError):
    code = "VERSION_NOT_FOUND"
    message = "版本不存在"


class NoActiveBookError(AppError):
    code = "NO_ACTIVE_BOOK"
    http_status = 400
    message = "当前没有打开的作品，请先进入一部作品"


class BookExistsError(ConflictError):
    code = "BOOK_EXISTS"
    message = "同名作品已存在"


class LLMNotConfiguredError(AppError):
    code = "LLM_NOT_CONFIGURED"
    http_status = 400
    message = "还没有可用的模型，请先到设置里添加并检测连通"


class JSONParseFailedError(AppError):
    code = "JSON_PARSE_FAILED"
    http_status = 400
    message = "模型返回的内容无法解析，已自动重试一次仍失败，请更换模型或稍后重试"


class SecretStoreError(AppError):
    code = "SECRET_STORE_UNAVAILABLE"
    http_status = 500
    message = "无法访问系统密钥环，密钥未保存，请检查系统凭据服务是否可用"


class LLMRequestError(AppError):
    code = "LLM_REQUEST_FAILED"
    http_status = 502
    message = "模型请求失败，请检查网络或稍后重试"


class ProviderNotFoundError(NotFoundError):
    code = "PROVIDER_NOT_FOUND"
    message = "模型配置不存在"


class OutlineNotFoundError(NotFoundError):
    code = "OUTLINE_NOT_FOUND"
    message = "大纲节点不存在"
