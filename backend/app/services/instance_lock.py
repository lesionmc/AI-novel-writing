"""单实例检测：防止同一时间有多个后端进程同时写同一个 `books/` 目录。

背景（风险项 TC-02）：后端启动端口为随机可用端口（`port=0`），两个实例不会因为端口
冲突而失败；而 `books/<slug>/novel.db` 使用 SQLite WAL，没有跨进程写协调——两个进程
并发写会后写覆盖先写，最坏交错提交导致库文件损坏、丢稿。因此必须在进程启动阶段做单实例
保护，与端口无关。

实现方式：在 `settings.data_dir`（即 `ai-novel/data/`）下放一个 JSON 锁文件
（`instance.lock`），内容含持有者 PID、启动时间、端口。规则：

- 启动时抢锁：锁被**存活**实例持有 -> 抛 `AlreadyRunningError`（调用方打印中文提示并退出）；
- 持有者进程已死（例如被 `taskkill /F` 强杀）-> 判定为**陈旧锁** -> 原子接管，自愈；
- 正常退出（Ctrl+C / 优雅关闭）-> 主动释放锁（删除锁文件）。

约束：
- 锁文件只放 `data/`，**绝不放入 `books/`**（用户数据目录）；本模块不做任何 `books/` 相关 I/O。
- 进程存活判断为 **Windows 安全**实现：不依赖 `os.kill(pid, 0)`（Windows 上语义不同），
  而是用 `OpenProcess` + `GetExitCodeProcess`；并额外比对进程创建时间以容忍 PID 复用。
- 本模块只在被显式调用时产生副作用，import 时零副作用（测试 import `app.main` 不会抢锁）。
"""

from __future__ import annotations

import json
import os
import signal
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.services._win_process import is_process_alive, process_creation_time

LOCK_FILENAME = "instance.lock"

_CREATE_TIME_TOLERANCE = 1.0  # 创建时间差超过该值（秒）即视为不同进程（识别 PID 复用）
_UNREADABLE_RETRY_SECONDS = 0.05  # 内容不可解析时的短暂重试，容忍并发写入的极小窗口


class InstanceLockError(Exception):
    """单实例锁相关错误的基类；`reason` 用于区分不同失败原因。"""

    reason = "lock_error"

    def __init__(self, message: str, *, holder: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.holder = holder


class AlreadyRunningError(InstanceLockError):
    """已有存活实例持有锁，本次启动必须退出。"""

    reason = "already_running"


class LockUnreadableError(InstanceLockError):
    """锁文件存在但内容不可解析，保守判定为被占用。"""

    reason = "lock_unreadable"


@dataclass
class InstanceLock:
    """已持有的单实例锁句柄。"""

    path: Path
    info: dict[str, Any]

    def release(self) -> None:
        release_lock(self)

    def __enter__(self) -> InstanceLock:
        return self

    def __exit__(self, *exc_info: object) -> bool:
        self.release()
        return False


def _holder_alive(holder: dict[str, Any]) -> bool:
    """判断锁持有者是否仍存活；额外比对创建时间以容忍 PID 复用。"""
    pid = holder.get("pid")
    if not is_process_alive(pid):
        return False
    recorded = holder.get("process_started_at")
    actual = process_creation_time(pid) if isinstance(pid, int) else None
    if isinstance(recorded, int | float) and actual is not None:
        return abs(actual - recorded) <= _CREATE_TIME_TOLERANCE
    return True


# --------------------------------------------------------------------------- #
# 锁文件读写
# --------------------------------------------------------------------------- #
def _load_lock(path: Path) -> dict[str, Any] | None:
    """读取锁文件；文件缺失或内容不可解析时返回 None。"""
    try:
        obj = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError):
        return None
    if not isinstance(obj, dict) or not isinstance(obj.get("pid"), int):
        return None
    return obj


def _build_info(port: int | None, host: str | None, started_at: str | None) -> dict[str, Any]:
    return {
        "version": 1,
        "pid": os.getpid(),
        "port": port,
        "host": host,
        "started_at": started_at or datetime.now(UTC).astimezone().isoformat(timespec="seconds"),
        "process_started_at": process_creation_time(os.getpid()) or time.time(),
    }


def _atomic_write(path: Path, payload: str) -> None:
    """原子写入：先写临时文件再 replace，保证读者永远看到完整内容。"""
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


# --------------------------------------------------------------------------- #
# 抢锁 / 释放
# --------------------------------------------------------------------------- #
def _conflict_or_takeover(path: Path, payload: str) -> None:
    """锁文件已存在时的处理：活锁报错，陈旧锁原子接管。"""
    holder = _load_lock(path)
    if holder is None:
        # 可能是另一个实例正在写入的极小窗口，短暂重试一次再判定
        time.sleep(_UNREADABLE_RETRY_SECONDS)
        holder = _load_lock(path)
    if holder is None:
        raise LockUnreadableError("检测到无法解析的实例锁文件，为避免并发写入作品数据，已拒绝启动。")
    if _holder_alive(holder):
        raise AlreadyRunningError("AI 小说创作工具已在运行。", holder=holder)

    # 陈旧锁：原子接管并校验归属，防止并发接管时两个进程同时通过
    _atomic_write(path, payload)
    current = _load_lock(path)
    if current is None or current.get("pid") != os.getpid():
        raise AlreadyRunningError("AI 小说创作工具已在运行。", holder=current)


def acquire_lock(
    data_dir: str | os.PathLike[str],
    *,
    port: int | None = None,
    host: str | None = None,
    started_at: str | None = None,
) -> InstanceLock:
    """尝试抢锁；成功返回 `InstanceLock`，被存活实例占用时抛 `AlreadyRunningError`。"""
    directory = Path(data_dir)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / LOCK_FILENAME
    info = _build_info(port, host, started_at)
    payload = json.dumps(info, ensure_ascii=False, indent=2)

    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        _conflict_or_takeover(path, payload)
        return InstanceLock(path, info)

    try:
        os.write(fd, payload.encode("utf-8"))
    finally:
        os.close(fd)
    return InstanceLock(path, info)


def release_lock(lock: InstanceLock) -> None:
    """释放锁；仅当锁文件仍属于本进程时才删除，避免误删他人接管后的锁。"""
    current = _load_lock(lock.path)
    if current is None or current.get("pid") != os.getpid():
        return
    try:
        lock.path.unlink()
    except OSError:
        pass


def install_windows_shutdown_handler(release: Callable[[], None]) -> bool:
    """Windows 加固：uvicorn 关闭时会重放捕获到的信号，而 SIGBREAK（Ctrl+Break）的默认
    处置是直接终止进程、会跳过 `finally`，导致锁文件残留。注册处理器确保 Ctrl+Break 也
    主动释放锁（释放后直接退出，绝不会出现「无锁却在服务」的窗口）。返回是否已安装。"""
    if os.name != "nt" or not hasattr(signal, "SIGBREAK"):
        return False

    def _on_break(*_: object) -> None:
        release()
        raise SystemExit(0)

    signal.signal(signal.SIGBREAK, _on_break)
    return True


def conflict_notice(error: InstanceLockError) -> str:
    """把抢锁失败转换为给用户看的中文提示（供启动入口打印）。"""
    holder = error.holder
    if isinstance(error, AlreadyRunningError) and holder:
        port = holder.get("port")
        pid = holder.get("pid")
        where = f"，端口 {port}" if port else ""
        return (
            f"[错误] AI 小说创作工具已有一个实例在运行（进程号 {pid}{where}）。\n"
            "        同时打开两个实例会并发写入作品数据、可能导致稿件损坏或丢失，因此已拒绝本次启动。\n"
            "        请切换到已经打开的窗口继续使用；如需重启，请先关闭正在运行的实例。"
        )
    return (
        "[错误] 无法启动：检测到疑似正在运行的实例锁，但无法确认其状态。\n"
        "        为避免并发写入损坏作品数据，已拒绝本次启动。\n"
        "        如确认没有其它实例在运行，可删除 data/instance.lock 后重试。"
    )
