"""HTTP 中间件：request_id 注入 + 作品上下文 + 访问日志 + 耗时统计。"""

from __future__ import annotations

import time
import uuid
from urllib.parse import unquote

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.book_context import reset_request_slug, set_request_slug
from app.db.registry import is_valid_slug
from app.logging_config import get_logger, log_fields, request_id_var

logger = get_logger("app.access")

# 前端按当前路由 `/book/<slug>/...` 计算、percent-encode 后放在这个头里。
BOOK_SLUG_HEADER = "X-Book-Slug"


def _read_book_slug(request: Request) -> str | None:
    """从 `X-Book-Slug` 头解析作品 slug；缺失或非法一律返回 None。

    刻意「非法即忽略」而不是抛错：一个坏 header 不该让请求 500，
    保持与旧客户端（无此头）相同的语义。
    """
    raw = request.headers.get(BOOK_SLUG_HEADER)
    if not raw:
        return None
    try:
        candidate = unquote(raw)
    except (ValueError, UnicodeDecodeError):
        return None
    return candidate if is_valid_slug(candidate) else None


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = uuid.uuid4().hex[:12]
        token = request_id_var.set(request_id)
        slug = _read_book_slug(request)
        slug_token = set_request_slug(slug) if slug else None
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:  # 交给全局异常处理器，此处仅记录
            elapsed = (time.perf_counter() - start) * 1000
            logger.error(
                "request failed",
                **log_fields(
                    method=request.method,
                    path=request.url.path,
                    elapsed_ms=round(elapsed, 1),
                    error=exc.__class__.__name__,
                ),
            )
            raise
        finally:
            # 顺序与设置相反：先清作品上下文，再清 request_id。
            if slug_token is not None:
                reset_request_slug(slug_token)
            request_id_var.reset(token)

        elapsed = (time.perf_counter() - start) * 1000
        logger.info(
            "request done",
            **log_fields(
                method=request.method,
                path=request.url.path,
                status=response.status_code,
                elapsed_ms=round(elapsed, 1),
            ),
        )
        response.headers["X-Request-ID"] = request_id
        return response
