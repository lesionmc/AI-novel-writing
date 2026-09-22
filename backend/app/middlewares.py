"""HTTP 中间件：request_id 注入 + 访问日志 + 耗时统计。"""

from __future__ import annotations

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.logging_config import get_logger, log_fields, request_id_var

logger = get_logger("app.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = uuid.uuid4().hex[:12]
        token = request_id_var.set(request_id)
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
