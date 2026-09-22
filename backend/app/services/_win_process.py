"""Windows 进程存活 / 创建时间查询（平台适配工具，无业务逻辑、无副作用）。

从 `instance_lock` 抽出，避免单文件顶在上限（≤300 行）。这里只做两件事：

- `is_process_alive(pid)`：判断进程是否存活。Windows 用 `OpenProcess` +
  `GetExitCodeProcess`（不依赖 `os.kill(pid, 0)`——该语义在 Windows 上不同）；
  其它平台回退 `os.kill(pid, 0)`。
- `process_creation_time(pid)`：返回进程创建时间（Unix 秒），仅 Windows 支持。

句柄返回类型显式声明为 `void*`，避免 64 位下指针截断。所有函数都是纯查询，
不写文件、不发网络请求。
"""

from __future__ import annotations

import ctypes
import os
from typing import Any

_WIN_PROCESS_QUERY_LIMITED_INFORMATION = 0x1000  # 最小权限：仅查询受限信息
_WIN_STILL_ACTIVE = 259
_WIN_ERROR_ACCESS_DENIED = 5

# FILETIME 以 100ns 为单位、自 1601-01-01 起算；该常量使其换算为 Unix 秒。
_WIN_EPOCH_OFFSET_SECONDS = 11_644_473_600

_kernel32: Any = None


def _get_kernel32() -> Any:
    """惰性获取并配置 kernel32（正确声明 64 位句柄返回类型，避免指针截断）。"""
    global _kernel32
    if _kernel32 is None:
        k = ctypes.WinDLL("kernel32", use_last_error=True)
        k.OpenProcess.restype = ctypes.c_void_p
        k.OpenProcess.argtypes = [ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32]
        k.GetExitCodeProcess.restype = ctypes.c_int
        k.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
        k.GetProcessTimes.restype = ctypes.c_int
        k.GetProcessTimes.argtypes = [ctypes.c_void_p, *([ctypes.POINTER(ctypes.c_uint64)] * 4)]
        k.CloseHandle.restype = ctypes.c_int
        k.CloseHandle.argtypes = [ctypes.c_void_p]
        _kernel32 = k
    return _kernel32


def _win_process_alive(pid: int) -> bool:
    """Windows 下判断进程是否存活（OpenProcess + 退出码）。"""
    kernel32 = _get_kernel32()
    handle = kernel32.OpenProcess(_WIN_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        # 打不开句柄：进程不存在，或存在但无权访问（后者保守视为存活）
        return ctypes.get_last_error() == _WIN_ERROR_ACCESS_DENIED
    try:
        code = ctypes.c_uint32()
        if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
            return True  # 查询失败，保守视为存活，避免误接管
        return code.value == _WIN_STILL_ACTIVE
    finally:
        kernel32.CloseHandle(handle)


def process_creation_time(pid: int) -> float | None:
    """返回指定进程的创建时间（Unix 秒）。仅 Windows 支持，其它平台返回 None。"""
    if os.name != "nt":
        return None
    kernel32 = _get_kernel32()
    handle = kernel32.OpenProcess(_WIN_PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if not handle:
        return None
    try:
        creation, exited, kernel, user = (ctypes.c_uint64() for _ in range(4))
        ok = kernel32.GetProcessTimes(
            handle,
            ctypes.byref(creation),
            ctypes.byref(exited),
            ctypes.byref(kernel),
            ctypes.byref(user),
        )
        if not ok:
            return None
        return creation.value / 10_000_000 - _WIN_EPOCH_OFFSET_SECONDS
    finally:
        kernel32.CloseHandle(handle)


def is_process_alive(pid: object) -> bool:
    """判断进程是否存活。Windows 用 OpenProcess，其它平台回退 `os.kill(pid, 0)`。"""
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return False
    if os.name == "nt":
        return _win_process_alive(pid)
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # 存在但无权限，保守视为存活
    except (OSError, OverflowError, ValueError):
        return False
    return True
