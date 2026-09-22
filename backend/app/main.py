"""FastAPI 应用入口：只做装配（中间件 + 路由 + 启动自检），不写业务逻辑。"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.connection import probe_capabilities
from app.exception_handlers import register_exception_handlers
from app.logging_config import get_logger, log_fields, setup_logging
from app.middlewares import RequestContextMiddleware
from app.routers import (
    ai_setup,
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
from app.services import provider_migration
from app.services import fts_migration

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
    # 一次性把老书库里的模型配置搬到全局库（幂等、失败非致命）
    provider_migration.migrate_providers_to_global()
    # 把老书库的 FTS 索引从 unicode61 重建为 trigram（幂等、失败非致命）
    fts_migration.migrate_all_book_fts()
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
app.include_router(ai_setup.router)
app.include_router(writing_ai.router)


def _mount_frontend(application: FastAPI) -> None:
    dist = settings.frontend_dist
    if dist.is_dir() and (dist / "assets").is_dir():
        application.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @application.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):  # noqa: ANN202
        if full_path.startswith("api/"):
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
