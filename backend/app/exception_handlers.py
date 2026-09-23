"""全局异常处理器：统一 {error:{code,message,detail}}，绝不外泄堆栈。"""

from __future__ import annotations

import sqlite3

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db.connection import is_busy_error
from app.errors import AppError, DatabaseBusyError
from app.logging_config import get_logger, log_fields

logger = get_logger("app.errors")


def _first_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "请求参数不合法"
    first = errors[0]
    loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    msg = first.get("msg", "取值不合法")
    return f"参数 {loc or 'body'} 不合法：{msg}"


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request, exc: AppError) -> JSONResponse:
        logger.info(
            "app error",
            **log_fields(code=exc.code, path=request.url.path),
        )
        return JSONResponse(status_code=exc.http_status, content=exc.to_payload())

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": _first_message(exc),
                    "detail": None,
                }
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 404:
            code, message = "NOT_FOUND", "请求的资源不存在"
        elif exc.status_code == 405:
            code, message = "METHOD_NOT_ALLOWED", "请求方法不被允许"
        else:
            code, message = "HTTP_ERROR", "请求处理失败"
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": code, "message": message, "detail": None}},
        )

    @app.exception_handler(sqlite3.OperationalError)
    async def handle_sqlite_operational(request, exc: sqlite3.OperationalError) -> JSONResponse:
        """SQLite 忙锁 → 可重试的 `DB_BUSY`（503），而不是不可重试的 500（A-06）。

        `transaction()` 内的忙锁已被翻译成 `AppError`（走上面的处理器）；
        这里兜住那些**未被事务包装**的裸读/裸写路径抛出的忙锁，
        避免它们退化成「服务器内部错误」把用户引向错误的排查方向。
        """
        if is_busy_error(exc):
            logger.warning("db busy", **log_fields(path=request.url.path))
            return JSONResponse(
                status_code=DatabaseBusyError.http_status,
                content=DatabaseBusyError().to_payload(),
                headers={"Retry-After": "1"},
            )
        logger.error(
            "unhandled error",
            **log_fields(path=request.url.path, error=exc.__class__.__name__),
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "服务器内部错误，请稍后重试",
                    "detail": None,
                }
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request, exc: Exception) -> JSONResponse:
        logger.error(
            "unhandled error",
            **log_fields(path=request.url.path, error=exc.__class__.__name__),
        )
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "服务器内部错误，请稍后重试",
                    "detail": None,
                }
            },
        )
