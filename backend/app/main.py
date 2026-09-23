"""FastAPI 应用入口：只做装配（中间件 + 路由 + 启动自检），不写业务逻辑。"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Match

from app.config import settings
from app.db.connection import probe_capabilities
from app.exception_handlers import register_exception_handlers
from app.logging_config import get_logger, log_fields, setup_logging
from app.middlewares import RequestContextMiddleware
from app.routers import (
    ai_chat,
    audit,
    books,
    chapters,
    export,
    memory,
    outlines,
    providers,
    system,
    topics,
    writing_ai,
)
from app.routers import settings as settings_router

logger = get_logger("app.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 默认只写 data/logs/app.log（不碰 stdout）；由后端入口更早完成配置时为幂等空操作
    setup_logging(settings.log_level, settings.data_dir / "logs")
    settings.books_dir.mkdir(parents=True, exist_ok=True)
    settings.recycle_dir.mkdir(parents=True, exist_ok=True)
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    caps = probe_capabilities()
    logger.info("startup self-check done", **log_fields(**caps.as_dict()))
    yield


app = FastAPI(title="AI 小说创作工具", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)
app.add_middleware(RequestContextMiddleware)
register_exception_handlers(app)

app.include_router(books.router)
app.include_router(settings_router.router)
app.include_router(chapters.router)
app.include_router(audit.router)
app.include_router(outlines.router)
app.include_router(memory.router)
app.include_router(providers.router)
app.include_router(export.router)
app.include_router(system.router)
app.include_router(topics.router)
app.include_router(ai_chat.router)
app.include_router(writing_ai.router)


def _api_path_method_mismatch(application: FastAPI, scope) -> bool:
    """该请求路径是否命中某个 API 路由、只是 HTTP 方法不对。

    为什么需要它：本函数注册了一条 `GET /{full_path:path}` 兜底（见 `_mount_frontend`），
    Starlette 按顺序匹配，于是**任何 GET 请求**——包括「路径存在但只支持 POST」的
    `/api/...`——都会被兜底接走。若不特判，调用方会收到 404「接口不存在」，
    而正确语义是 **405 METHOD_NOT_ALLOWED**。

    判定用 Starlette 的三态匹配结果：
      FULL    → 路径与方法都匹配（正常流程不会走到兜底里来）
      PARTIAL → **路径匹配、方法不匹配** —— 就是我们要找的情形
      NONE    → 完全不匹配 → 确实是 404
    """
    for route in application.routes:
        try:
            match, _child = route.matches(scope)
        except Exception:  # noqa: BLE001 —— 个别 route 类型不实现 matches，跳过即可
            continue
        if match is Match.PARTIAL:
            return True
    return False


def _mount_frontend(application: FastAPI) -> None:
    dist = settings.frontend_dist
    if dist.is_dir() and (dist / "assets").is_dir():
        application.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @application.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str, request: Request):  # noqa: ANN202
        # `full_path` 不带前导斜杠。判据必须同时覆盖裸 `api` 与 `api/...`：
        # 漏掉裸 `api` 会让 `GET /api` 返回 200 + 前端 HTML（而不是 404）。
        if full_path == "api" or full_path.startswith("api/"):
            if _api_path_method_mismatch(application, request.scope):
                return JSONResponse(
                    status_code=405,
                    content={
                        "error": {
                            "code": "METHOD_NOT_ALLOWED",
                            "message": "请求方法不被允许",
                            "detail": None,
                        }
                    },
                )
            return JSONResponse(
                status_code=404,
                content={"error": {"code": "NOT_FOUND", "message": "接口不存在", "detail": None}},
            )
        index = dist / "index.html"
        if index.is_file():
            return FileResponse(index)
        return JSONResponse(
            status_code=200,
            content={"message": "后端已就绪；前端尚未构建（frontend/dist 不存在）"},
        )


_mount_frontend(app)
