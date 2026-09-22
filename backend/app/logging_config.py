"""结构化日志（JSON 行 + request_id）。

## 为什么默认**不写 stdout**（Windows 高危坑）
Windows 控制台开启「快速编辑模式」(QuickEdit) 时，只要用户在控制台窗口里点一下
（产生选区），系统就会**冻结该进程对 stdout 的写入**，直到用户按 Esc / 回车解除。
uvicorn 在**绑定端口之后、开始 accept 之前**要往 stdout 打启动横幅；一旦这行写入被冻结，
事件循环就永远卡在那里 —— 端口在监听、TCP 能连上，但应用层永不响应（浏览器无限"正在加载"）。

因此本模块的默认口径是：**只写文件 `data/logs/app.log`（滚动），完全不碰 stdout**。
需要看输出时（开发 / CI）设环境变量 `AINOVEL_LOG_STDOUT=1`，才会额外写 stdout。

## 容错（硬要求）
任何 handler 的**创建或写入失败都不得影响服务启动与请求处理**：
`logging.raiseExceptions = False`，且 handler 构造 / 挂载全部包在 `try` 里。

禁止记录：API Key、章节正文全文、隐私数据（Spec 第 10 章）。
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import os
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from pathlib import Path

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_CONFIGURED = False

# 默认日志目录：<项目根>/data/logs（项目根 = backend/ 的父目录）
_DEFAULT_LOG_DIR = Path(__file__).resolve().parents[2] / "data" / "logs"
_LOG_FILE_NAME = "app.log"
_MAX_BYTES = 2 * 1024 * 1024  # 单文件约 2MB
_BACKUP_COUNT = 3  # 保留 3 份滚动备份，不过度设计


class JsonLineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": request_id_var.get(),
            "message": record.getMessage(),
        }
        # 业务字段通过 extra={"fields": {...}} 传入
        fields = getattr(record, "fields", None)
        if isinstance(fields, dict):
            payload.update(fields)
        if record.exc_info:
            payload["exc_type"] = getattr(record.exc_info[0], "__name__", "Exception")
            payload["exc_message"] = str(record.exc_info[1])
        return json.dumps(payload, ensure_ascii=False)


def _build_file_handler(log_dir: Path, level: str) -> logging.Handler | None:
    """尽力创建滚动文件 handler；失败返回 None（绝不影响服务）。"""
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        handler = logging.handlers.RotatingFileHandler(
            log_dir / _LOG_FILE_NAME,
            maxBytes=_MAX_BYTES,
            backupCount=_BACKUP_COUNT,
            encoding="utf-8",
        )
    except Exception:  # noqa: BLE001 - 日志设施失败不得拖垮服务
        return None
    handler.setFormatter(JsonLineFormatter())
    handler.setLevel(level.upper())
    return handler


def _build_stdout_handler(level: str) -> logging.Handler | None:
    """仅当 AINOVEL_LOG_STDOUT=1 时创建；失败返回 None。"""
    try:
        handler: logging.Handler = logging.StreamHandler(sys.stdout)
    except Exception:  # noqa: BLE001
        return None
    handler.setFormatter(JsonLineFormatter())
    handler.setLevel(level.upper())
    return handler


def setup_logging(level: str = "INFO", log_dir: str | Path | None = None) -> None:
    """配置根 logger。

    默认只挂滚动文件 handler（`<log_dir>/app.log`）；
    仅当 `AINOVEL_LOG_STDOUT=1` 时**额外**挂一个 stdout handler（保留原开发/CI 行为）。
    任何一步失败都只意味着少一个 sink，不抛异常、不影响服务启动。
    """
    global _CONFIGURED
    if _CONFIGURED:
        return
    logging.raiseExceptions = False  # 日志写入异常不外抛

    directory = Path(log_dir) if log_dir is not None else _DEFAULT_LOG_DIR

    handlers: list[logging.Handler] = []
    file_handler = _build_file_handler(directory, level)
    if file_handler is not None:
        handlers.append(file_handler)
    if os.environ.get("AINOVEL_LOG_STDOUT") == "1":
        stdout_handler = _build_stdout_handler(level)
        if stdout_handler is not None:
            handlers.append(stdout_handler)
    if not handlers:
        # 兜底：既不写文件也不写 stdout 时，至少别让 root 无 handler 产生噪声
        handlers.append(logging.NullHandler())

    try:
        root = logging.getLogger()
        root.setLevel(level.upper())
        root.handlers.clear()
        for handler in handlers:
            root.addHandler(handler)
    except Exception:  # noqa: BLE001 - 同上，绝不影响服务
        pass
    _CONFIGURED = True


def uvicorn_log_config() -> dict:
    """给 `uvicorn.run(..., log_config=...)` 用的日志配置：**不写 stdout**。

    uvicorn 默认会在启动时 dictConfig 出一套写 stdout 的 handler（启动横幅 + access log），
    那正是冻结面。这里让它的三个 logger 只挂 NullHandler 并 propagate，
    日志统一冒泡到根 logger（本模块的文件 handler）。
    """
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {"json": {"()": "app.logging_config.JsonLineFormatter"}},
        "handlers": {"null": {"class": "logging.NullHandler"}},
        "loggers": {
            "uvicorn": {"handlers": ["null"], "level": "INFO", "propagate": True},
            "uvicorn.error": {"handlers": ["null"], "level": "INFO", "propagate": True},
            "uvicorn.access": {"handlers": ["null"], "level": "INFO", "propagate": True},
        },
    }


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


def log_fields(**fields: object):
    """便捷构造 extra，避免调用方写 extra={"fields": ...}。"""
    return {"extra": {"fields": fields}}
