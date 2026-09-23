"""后端启动入口（Spec §4.1 / §12.3）：单实例保护 + 稳定端口 + 写就绪标记 + 自动打开浏览器。

要求 Python 3.12.x：启动时先校验解释器版本（在任何第三方依赖导入之前），
不符则打印**实际版本号**并报错退出（Spec §4.2：3.13+/free-threaded 与 sqlite-vec 组合未验证，M1 不支持）。

单实例保护（风险项 TC-02）：启动即抢 `data/instance.lock`。已有存活实例时打印中文提示
并以非零退出码退出（绝不触碰 `books/`）；持有者进程已死则自动接管陈旧锁。逻辑见
`app.services.instance_lock`，本入口只做装配。

端口选择（`_pick_port`）：**优先稳定默认端口**（`_DEFAULT_PORT`），只有它被占用时
才回落到自选空闲端口。原因：纯随机端口会让任何写死在脚本 / 书签 / 文档 / 快捷方式里的
地址在每次重启后失效（团队实测：同一项目一天内出现过 2874 → 5273 → 10514 三个不同端口）。
"被占用时自选"的行为**保留**，用于多实例共存场景。

冻结防护（Windows QuickEdit 高危坑）：本入口**先把日志切成"只写文件"**（见
`app.logging_config`）再交给 uvicorn，并从 uvicorn 的日志配置里剔除 stdout handler，
确保启动横幅 / access log 都不会写到控制台 —— 否则用户在控制台点一下就可能冻结
整个进程（端口在听、应用层却永不响应）。就绪/错误标记文件供 `start.bat` 读取。

用法：
    python -m app            # 从 backend/ 目录启动（默认监听 5210）
环境变量：
    AINOVEL_PORT=xxxxx       指定端口（默认 0 = 先用默认端口 5210，被占用才自动选空闲端口）
    AINOVEL_NO_BROWSER=1     不自动打开浏览器（用于无头/测试）
    AINOVEL_LOG_STDOUT=1     额外把日志写到 stdout（默认只写 data/logs/app.log）
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

from app.logging_config import get_logger, log_fields, setup_logging, uvicorn_log_config

_REQUIRED_PY = (3, 12)

# 稳定默认端口：让脚本 / 书签 / 文档里的地址在重启后依然有效。
# 取值原则：5000~9999 之间、避开 5000/5432/6379/8000/8080/8888 等常见占用。
_DEFAULT_PORT = 5210

# 供 start.bat 读取的标记文件名（位于 <项目根>/data/logs/ 下）
_READY_FILE = "last_start.txt"  # 内容 = 已就绪端口
_ERROR_FILE = "last_start_error.txt"  # 内容 = 中文错误说明（如"已有实例在运行"）


def _check_python_version() -> None:
    """启动前校验解释器版本，必须在导入第三方依赖之前调用。"""
    if sys.version_info[:2] != _REQUIRED_PY:
        actual = ".".join(str(v) for v in sys.version_info[:3])
        raise SystemExit(
            f"[错误] 需要 Python {_REQUIRED_PY[0]}.{_REQUIRED_PY[1]}.x，当前解释器为 {actual}。\n"
            "        3.13+/free-threaded 与 sqlite-vec 的组合尚未验证，M1 不支持。\n"
            "        请使用项目虚拟环境启动（初始化步骤见 backend/README.md）。"
        )


def _port_in_use(host: str, port: int) -> bool:
    """端口是否已被占用。

    注意**不能**用 `SO_REUSEADDR` 探测：该选项在 Windows 上允许重复绑定，
    会把"已被占用"误判成"空闲"（那正是本函数要避免的错误结论）。
    故这里用默认的独占绑定语义试一次，谁在听就绑不上。
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        try:
            sock.bind((host, port))
        except OSError:
            return True
        return False


def _pick_port(host: str, port: int) -> int:
    """选择监听端口：显式指定 > 稳定默认端口 > 自选空闲端口。"""
    if port:
        return port
    if not _port_in_use(host, _DEFAULT_PORT):
        return _DEFAULT_PORT
    # 默认端口被占用（例如已开了第二个实例）→ 回落自选空闲端口，多实例共存
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def _write_marker(log_dir: Path, name: str, text: str) -> None:
    """写就绪 / 错误标记文件供 start.bat 读取；失败不影响服务。"""
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        (log_dir / name).write_text(text, encoding="utf-8")
    except Exception:  # noqa: BLE001 - 标记失败只是少一条给 bat 的提示
        pass


def _open_when_ready(url: str, timeout: float = 30.0) -> None:
    """轮询直到服务可连再打开浏览器，避免打开白屏。

    超时**不静默打开浏览器**（那时打开只会是白屏），而是记一条明确的中文提示 ——
    把"用户自己点了一下控制台窗口（QuickEdit 冻结）"这个完全想不到的因果直接讲清楚。
    """
    deadline = time.time() + timeout
    ready = False
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.0):
                ready = True
                break
        except Exception:  # noqa: BLE001 - 未就绪即重试
            time.sleep(0.3)
    if ready:
        webbrowser.open(url)
        return
    get_logger("app.startup").warning(
        "服务在 %d 秒内没有响应，已跳过自动打开浏览器。"
        "如果你刚才点击过这个黑色窗口，请按一下 Esc 或回车释放它，然后重新启动。",
        int(timeout),
    )


def main() -> None:
    _check_python_version()
    # 版本校验通过后再导入第三方依赖，确保错误解释器上报版本而非 ModuleNotFoundError
    import uvicorn

    from app.config import settings
    from app.services import instance_lock

    log_dir = settings.data_dir / "logs"
    # 关键顺序：先把日志切成"只写文件、不碰 stdout"，再交给 uvicorn，
    # 否则启动横幅写 stdout 一旦被控制台冻结，事件循环就卡死。
    setup_logging(settings.log_level, log_dir)
    logger = get_logger("app.startup")

    host = settings.host
    port = _pick_port(host, settings.port)
    # 本工具**没有登录鉴权**：绑到非本机地址等于把稿件与模型配置交给同网段任何人
    if host not in ("127.0.0.1", "localhost", "::1"):
        warning = (
            f"[警告] 正在绑定 {host} —— 本工具无登录鉴权，局域网内任何人都能读写你的稿件"
            "并查看模型配置。不是刻意共享，请改回默认 AINOVEL_HOST=127.0.0.1。"
        )
        print(warning, file=sys.stderr, flush=True)

    # 单实例保护：抢锁失败（已有存活实例）时写错误标记 + 打印中文提示，以非零退出码退出
    try:
        lock = instance_lock.acquire_lock(settings.data_dir, port=port, host=host)
    except instance_lock.InstanceLockError as exc:
        notice = instance_lock.conflict_notice(exc)
        _write_marker(log_dir, _ERROR_FILE, notice)
        print(notice, file=sys.stderr, flush=True)
        raise SystemExit(2) from exc
    # Windows 加固：确保 Ctrl+Break 关闭时也主动释放锁（SIGBREAK 默认处置会跳过 finally）
    instance_lock.install_windows_shutdown_handler(lambda: instance_lock.release_lock(lock))

    url = f"http://{host}:{port}"
    if settings.port:
        logger.info("使用 AINOVEL_PORT 指定的端口 %d", port)
    elif port != _DEFAULT_PORT:
        logger.warning(
            "默认端口 %d 已被占用，已回落到空闲端口 %d（多实例共存）",
            _DEFAULT_PORT,
            port,
        )
    else:
        logger.info("使用默认端口 %d（地址稳定，重启不变）", port)
    # 就绪标记：供 start.bat 读取端口（显示地址 / 写窗口标题）
    _write_marker(log_dir, _READY_FILE, f"{port}")
    logger.info("后端已就绪，端口 %d，地址 %s", port, url, **log_fields(port=port, url=url))

    if os.environ.get("AINOVEL_NO_BROWSER") != "1":
        threading.Thread(target=_open_when_ready, args=(url,), daemon=True).start()
    try:
        uvicorn.run(
            "app.main:app",
            host=host,
            port=port,
            log_level=settings.log_level.lower(),
            log_config=uvicorn_log_config(),
        )
    finally:
        # 正常退出（含 Ctrl+C 优雅关闭）时主动释放锁
        instance_lock.release_lock(lock)


if __name__ == "__main__":
    main()
