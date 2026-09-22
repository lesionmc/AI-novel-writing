"""日志配置测试：默认只写文件（规避 stdout 冻结）、仅 STDOUT=1 才写 stdout、
handler 创建失败不得影响服务。
"""

from __future__ import annotations

import logging
import logging.handlers

import pytest

from app import logging_config


@pytest.fixture
def clean_logging():
    """隔离并还原根 logger 全局状态，避免测试间互相污染。"""
    root = logging.getLogger()
    saved_handlers = list(root.handlers)
    saved_level = root.level
    saved_configured = logging_config._CONFIGURED
    saved_raise = logging.raiseExceptions
    root.handlers.clear()
    logging_config._CONFIGURED = False
    try:
        yield root
    finally:
        root.handlers.clear()
        root.handlers.extend(saved_handlers)
        root.setLevel(saved_level)
        logging_config._CONFIGURED = saved_configured
        logging.raiseExceptions = saved_raise


def _file_handlers(root: logging.Logger) -> list[logging.Handler]:
    return [h for h in root.handlers if isinstance(h, logging.FileHandler)]


def _stdout_handlers(root: logging.Logger) -> list[logging.Handler]:
    return [
        h
        for h in root.handlers
        if isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler)
    ]


def test_setup_logging_default_writes_file_no_stdout(tmp_path, monkeypatch, clean_logging):
    monkeypatch.delenv("AINOVEL_LOG_STDOUT", raising=False)
    log_dir = tmp_path / "logs"
    logging_config.setup_logging("INFO", log_dir)

    assert len(_file_handlers(clean_logging)) == 1
    assert _stdout_handlers(clean_logging) == []

    logging.getLogger("t.file").info("hello-file")
    assert (log_dir / "app.log").exists()
    assert "hello-file" in (log_dir / "app.log").read_text(encoding="utf-8")


def test_setup_logging_stdout_only_when_enabled(tmp_path, monkeypatch, clean_logging):
    monkeypatch.setenv("AINOVEL_LOG_STDOUT", "1")
    logging_config.setup_logging("INFO", tmp_path / "logs")
    assert len(_stdout_handlers(clean_logging)) == 1


def test_setup_logging_is_idempotent(tmp_path, monkeypatch, clean_logging):
    monkeypatch.delenv("AINOVEL_LOG_STDOUT", raising=False)
    logging_config.setup_logging("INFO", tmp_path / "a")
    logging_config.setup_logging("INFO", tmp_path / "b")
    assert len(clean_logging.handlers) == 1


def test_setup_logging_survives_unwritable_dir(tmp_path, monkeypatch, clean_logging):
    monkeypatch.delenv("AINOVEL_LOG_STDOUT", raising=False)
    blocker = tmp_path / "afile"
    blocker.write_text("x", encoding="utf-8")
    # blocker 是文件 → blocker/"logs" 无法创建；不得抛异常，退回 NullHandler
    logging_config.setup_logging("INFO", blocker / "logs")
    assert logging.raiseExceptions is False
    assert all(isinstance(h, logging.NullHandler) for h in clean_logging.handlers)


def test_uvicorn_log_config_routes_to_root_without_stdout():
    cfg = logging_config.uvicorn_log_config()
    assert cfg["handlers"]["null"]["class"] == "logging.NullHandler"
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        assert cfg["loggers"][name]["propagate"] is True
        assert cfg["loggers"][name]["handlers"] == ["null"]
