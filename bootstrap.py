#!/usr/bin/env python3
"""一键自举启动器（跨平台）。

设计目标：**换一台电脑，双击即用，无需手工配环境。**

职责链（全部幂等，重复运行只做必要的部分）：
    1. 找到可用的 Python 3.12（Windows 用 py 启动器 / 常见安装路径兜底）
    2. 建立或修复 `.venv` 虚拟环境（不需要时的检查成本 < 50ms）
    3. 安装后端依赖（用 requirements.txt 的哈希做标记，未变化就跳过）
    4. 校验前端产物 frontend/dist 是否存在（运行时不需要 Node.js）
    5. 拉起后端服务，等它就绪，打印访问地址，然后守候

为什么要有这个东西：
    原来 `start.bat` / `start.sh` 只负责「启动」，**未找到虚拟环境就直接报错退出**，
    要求用户先手工执行 `python -m venv` + `pip install`。换一台电脑就等于重新装一遍。
    本脚本把「装」和「启」合成一步，且失败时给的是人话而不是堆栈。

只用标准库：它必须在**虚拟环境还不存在**的时候就能跑。

用法：
    python bootstrap.py                 # 自举并启动
    python bootstrap.py --check         # 只体检，不启动
    python bootstrap.py --reinstall     # 强制重装依赖
    python bootstrap.py --no-browser    # 启动但不打开浏览器
"""

from __future__ import annotations

import argparse
import hashlib
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND_DIR = ROOT / "backend"
VENV_DIR = ROOT / ".venv"
REQUIREMENTS = BACKEND_DIR / "requirements.txt"
DIST_INDEX = ROOT / "frontend" / "dist" / "index.html"
LOG_DIR = ROOT / "data" / "logs"
READY_MARKER = LOG_DIR / "last_start.txt"
ERROR_MARKER = LOG_DIR / "last_start_error.txt"
# 依赖装好后的标记：内容 = requirements.txt 的 sha256 前缀 + 解释器版本
READY_STAMP = VENV_DIR / ".ainovel-env-ready"

REQUIRED_PY = (3, 12)
IS_WINDOWS = os.name == "nt"

# 官方源失败时依次尝试的镜像（国内网络下首次安装体验差别很大）
PIP_INDEXES = (
    None,  # 先试默认（可能是用户已配置的镜像）
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "https://mirrors.aliyun.com/pypi/simple",
)


# --------------------------------------------------------------------------
# 输出（Windows 控制台默认 cp936，中文会乱码，这里强制 UTF-8）
# --------------------------------------------------------------------------
def _setup_console() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001 - 老解释器/重定向场景忽略
            pass


def say(text: str = "") -> None:
    print(text, flush=True)


def ok(text: str) -> None:
    say(f"  [OK] {text}")


def info(text: str) -> None:
    say(f"  ..   {text}")


def warn(text: str) -> None:
    say(f"  [!!] {text}")


def fail(text: str) -> None:
    say(f"  [XX] {text}")


def die(text: str, code: int = 1) -> "None":
    fail(text)
    say()
    say("按回车键关闭本窗口…")
    try:
        input()
    except EOFError:
        pass
    raise SystemExit(code)


# --------------------------------------------------------------------------
# 1. 找 Python 3.12
# --------------------------------------------------------------------------
def _version_of(exe: str) -> tuple[int, int] | None:
    """跑一次拿到版本号；跑不起来返回 None。"""
    try:
        out = subprocess.run(
            [exe, "-c", "import sys;print('%d.%d' % sys.version_info[:2])"],
            capture_output=True,
            text=True,
            timeout=25,
        )
    except Exception:  # noqa: BLE001 - 路径不存在 / 无权限 / 超时
        return None
    if out.returncode != 0:
        return None
    try:
        major, minor = out.stdout.strip().split(".")
        return int(major), int(minor)
    except ValueError:
        return None


def _candidate_commands() -> list[list[str]]:
    """候选解释器「命令前缀」列表。

    用前缀而不是路径，是为了把 `py -3.12` 这类**启动器 + 参数**的调用方式
    和 `python.exe` 这类直接路径统一成一种探测方式。
    """
    cands: list[list[str]] = []
    if sys.executable:
        cands.append([sys.executable])

    if IS_WINDOWS:
        # `py` 启动器最稳 —— 官方安装器默认会装它，且能精确指定 3.12
        cands.append(["py", "-3.12"])
        cands.append(["py"])
        cands.append(["python"])
        cands.append(["python3"])
        for base in (
            os.environ.get("LOCALAPPDATA", ""),
            os.environ.get("ProgramFiles", ""),
            os.environ.get("ProgramFiles(x86)", ""),
            "C:\\",
        ):
            if not base:
                continue
            cands.append([str(Path(base) / "Programs" / "Python" / "Python312" / "python.exe")])
            cands.append([str(Path(base) / "Python312" / "python.exe")])
    else:
        for name in ("python3.12", "python3", "python"):
            cands.append([name])
        cands.append(["/usr/bin/python3.12"])
        cands.append(["/usr/local/bin/python3.12"])
    return cands


_PROBE = "import sys;print(sys.version_info[0],sys.version_info[1]);print(sys.executable)"


def find_python312() -> str:
    """找到能用的 Python 3.12，返回它的**真实可执行文件路径**。

    找不到就给人话提示（含各平台安装命令），绝不静默降级到其它版本 ——
    版本不符会在启动阶段被后端拒绝，那种错误对用户毫无意义。
    """
    tried: list[str] = []
    for cmd in _candidate_commands():
        head = cmd[0]
        if (os.sep in head or head.endswith(".exe")) and not Path(head).exists():
            continue
        if os.sep not in head and not shutil.which(head):
            continue
        tried.append(" ".join(cmd))
        try:
            probe = subprocess.run(
                [*cmd, "-c", _PROBE], capture_output=True, text=True, timeout=25
            )
        except Exception:  # noqa: BLE001 - 路径失效 / 无权限 / 超时
            continue
        if probe.returncode != 0:
            continue
        lines = [ln.strip() for ln in probe.stdout.strip().splitlines() if ln.strip()]
        if len(lines) < 2:
            continue
        try:
            major, minor = (int(v) for v in lines[0].split())
        except ValueError:
            continue
        if (major, minor) == REQUIRED_PY and Path(lines[1]).exists():
            return lines[1]

    say()
    fail(f"没有找到 Python {REQUIRED_PY[0]}.{REQUIRED_PY[1]}.x。")
    say()
    say("  本项目需要 Python 3.12（3.13 及以上与向量扩展 sqlite-vec 的组合尚未验证）。")
    say("  请先安装 Python 3.12，然后重新双击启动脚本：")
    say()
    say("    Windows : https://www.python.org/downloads/release/python-31210/")
    say("              安装时请勾选「Add python.exe to PATH」")
    say("              或用命令：winget install -e --id Python.Python.3.12")
    say("    macOS   : brew install python@3.12")
    say("    Ubuntu  : sudo apt install python3.12 python3.12-venv")
    say()
    if tried:
        say("  （已尝试过的解释器：%s）" % "、".join(tried))
    raise SystemExit(3)


# --------------------------------------------------------------------------
# 2/3. 虚拟环境与依赖
# --------------------------------------------------------------------------
def venv_python() -> Path:
    return VENV_DIR / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")


def venv_is_usable() -> bool:
    """pyvenv.cfg 在、解释器能跑、版本是 3.12 —— 三者缺一即视为不可用。"""
    if not (VENV_DIR / "pyvenv.cfg").exists():
        return False
    exe = venv_python()
    if not exe.exists():
        return False
    return _version_of(str(exe)) == REQUIRED_PY


def requirements_fingerprint() -> str:
    digest = hashlib.sha256(REQUIREMENTS.read_bytes()).hexdigest()[:16]
    return f"{digest}-{REQUIRED_PY[0]}.{REQUIRED_PY[1]}"


# 判定「依赖是否真的可用」的最小 import 集合（只挑入口级依赖，几十毫秒）。
DEPS_PROBE = "import fastapi, uvicorn, pydantic, pydantic_settings, keyring, httpx, sqlite_vec"


def _import_probe() -> bool:
    """真实 import 一次 —— 这是唯一能证明「依赖能用」的证据。"""
    try:
        probe = subprocess.run(
            [str(venv_python()), "-c", DEPS_PROBE],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except Exception:  # noqa: BLE001 - 解释器缺失 / 超时
        return False
    return probe.returncode == 0


def deps_installed() -> bool:
    """依赖是否就绪。

    快路径是标记文件（省掉每次启动 import 全套依赖的 1~2 秒）。但**标记文件缺失
    不等于依赖没装** —— 若直接判定为「未装」并去跑 pip install，无网环境下就会把
    一个本来能启动的项目判死（实测踩到过：依赖齐全、只是标记没落盘）。

    因此：标记缺失 → 用真实 import 探测决定，通过就顺手补写标记（自愈）；
    标记存在但与 requirements.txt 指纹不符 → 仍按「依赖已变更」重装，
    保证版本锁定的语义不被破坏。
    """
    stamp = ""
    if READY_STAMP.exists():
        try:
            stamp = READY_STAMP.read_text(encoding="utf-8").strip()
        except OSError:
            stamp = ""

    if stamp == requirements_fingerprint():
        return True

    if stamp:  # 有标记但对不上 = requirements.txt 变过 → 必须重装
        return False

    if not _import_probe():
        return False

    try:
        READY_STAMP.write_text(requirements_fingerprint(), encoding="utf-8")
    except OSError:
        pass
    return True


def _run(cmd: list[str], *, quiet: bool = False) -> int:
    if quiet:
        return subprocess.run(cmd, capture_output=True, text=True).returncode
    return subprocess.run(cmd).returncode


def ensure_venv(python312: str) -> None:
    if venv_is_usable():
        ok(f"虚拟环境可用（{short_path(VENV_DIR)}）")
        return

    if VENV_DIR.exists():
        # 已存在但不可用（常见原因：从别的电脑拷过来的，pyvenv.cfg 指向不存在的解释器）。
        # 直接删会被安全策略拦，且慢；改名保留可让用户事后自己清理。
        broken = VENV_DIR.with_name(VENV_DIR.name + ".broken")
        n = 1
        while broken.exists():
            n += 1
            broken = VENV_DIR.with_name(f"{VENV_DIR.name}.broken{n}")
        info(f"原有虚拟环境不可用，改名保留为 {broken.name}（可自行删除）")
        try:
            VENV_DIR.rename(broken)
        except OSError as exc:
            die(f"无法重命名旧的虚拟环境：{exc}")

    info(f"正在创建虚拟环境（用 {short_path(Path(python312))}）…")
    code = _run([python312, "-m", "venv", str(VENV_DIR)])
    if code != 0 or not venv_is_usable():
        die("虚拟环境创建失败。请确认 Python 3.12 安装完整（含 venv 模块）。")
    ok("虚拟环境已创建")


def ensure_deps(*, force: bool = False) -> None:
    if not force and deps_installed():
        ok("后端依赖已就绪")
        return

    exe = str(venv_python())
    _run([exe, "-m", "pip", "install", "--disable-pip-version-check", "-q", "--upgrade", "pip"],
         quiet=True)

    info("正在安装后端依赖（首次约 1–3 分钟，需要联网）…")
    last_err = "未知错误"
    for index in PIP_INDEXES:
        cmd = [
            exe, "-m", "pip", "install", "--disable-pip-version-check",
            "--retries", "5", "--timeout", "60",
            "-r", str(REQUIREMENTS),
        ]
        if index:
            cmd += ["-i", index]
            info(f"上一次没装成，改试镜像源：{index}")
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode == 0:
            READY_STAMP.write_text(requirements_fingerprint(), encoding="utf-8")
            ok("后端依赖安装完成")
            return
        lines = [ln.strip() for ln in (proc.stderr or proc.stdout or "").splitlines() if ln.strip()]
        last_err = lines[-1] if lines else "未知错误"

    # 所有源都装不上，但依赖其实已经能用（典型：离线、或镜像全挂）——
    # 这种情况不该阻断启动，否则用户明明能用却打不开。
    if _import_probe():
        warn(f"依赖安装未成功（{last_err}），但检测到现有依赖可用，继续启动。")
        try:
            READY_STAMP.write_text(requirements_fingerprint(), encoding="utf-8")
        except OSError:
            pass
        return

    die(
        f"依赖安装失败：{last_err}\n"
        "       请检查网络连接后重试；也可以先设置 PIP_INDEX_URL 指定可用的镜像源。"
    )


# --------------------------------------------------------------------------
# 4. 前端产物
# --------------------------------------------------------------------------
def short_path(p: Path) -> str:
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


def check_frontend() -> None:
    if DIST_INDEX.exists():
        ok("前端界面已就绪（无需 Node.js）")
        return
    warn("缺少前端构建产物 frontend/dist/index.html")
    say()
    say("  运行阶段不需要 Node.js，但仓库里应当已经带好构建产物。")
    say("  如果这是从源码仓库克隆的，请执行一次构建：")
    say()
    say("      cd frontend")
    say("      npm install")
    say("      npm run build")
    say()


# --------------------------------------------------------------------------
# 5. 启动
# --------------------------------------------------------------------------
def _clear_markers() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    for marker in (READY_MARKER, ERROR_MARKER):
        try:
            marker.unlink()
        except FileNotFoundError:
            pass


def _read_marker_text(path: Path) -> str:
    if not path.exists():
        return ""
    for encoding in ("utf-8", "gbk"):
        try:
            return path.read_text(encoding=encoding).strip()
        except (UnicodeDecodeError, OSError):
            continue
    return ""


def launch(*, browser: bool = True) -> int:
    _clear_markers()
    startup_log = LOG_DIR / "startup.log"

    env = dict(os.environ)
    if not browser:
        env["AINOVEL_NO_BROWSER"] = "1"
    # Windows 控制台的「快速编辑模式」会冻结任何写入 stdout 的进程 ——
    # 后端日志一律落到文件，控制台只留本脚本自己的提示。
    if IS_WINDOWS:
        env.setdefault("AINOVEL_LOG_STDOUT", "0")

    with open(startup_log, "a", encoding="utf-8") as sink:
        proc = subprocess.Popen(
            [str(venv_python()), "-m", "app"],
            cwd=str(BACKEND_DIR),
            stdout=sink,
            stderr=sink,
            env=env,
        )

    say()
    info("正在启动服务…")
    port = ""
    deadline = time.time() + 60
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        port = _read_marker_text(READY_MARKER)
        if port:
            break
        if _read_marker_text(ERROR_MARKER):
            break
        time.sleep(0.4)

    problem = _read_marker_text(ERROR_MARKER)
    if problem:
        say()
        fail(problem)
        say()
        say(f"  详细日志：data/logs/startup.log")
        proc.terminate()
        return 2

    if not port:
        say()
        fail("服务在 60 秒内没有就绪。")
        say()
        say("  可能原因：端口被占用、依赖装了一半、或上一次的实例还在运行。")
        say("  详细日志：data/logs/startup.log")
        if proc.poll() is None:
            proc.terminate()
        return 1

    url = f"http://127.0.0.1:{port}"
    say()
    say("  ============================================================")
    say("    AI 小说创作工具已就绪")
    say(f"    请在浏览器访问：{url}")
    say()
    say("    * 关闭本窗口即结束程序")
    say("    * 请不要用鼠标选中本窗口里的文字（Windows 会因此冻结程序）")
    say("  ============================================================")
    say()

    try:
        proc.wait()
    except KeyboardInterrupt:
        info("正在关闭…")
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
    return proc.returncode or 0


# --------------------------------------------------------------------------
def check_only(python312: str) -> int:
    say()
    say("AI 小说创作工具 · 环境体检")
    say("-" * 60)
    say(f"  项目目录      : {ROOT}")
    say(f"  操作系统      : {platform.system()} {platform.release()}")
    say(f"  Python 3.12   : {short_path(Path(python312))}")
    say(f"  虚拟环境      : {'可用' if venv_is_usable() else '不可用（启动时会自动创建）'}")
    say(f"  后端依赖      : {'已就绪' if venv_is_usable() and deps_installed() else '未就绪（启动时会自动安装）'}")
    say(f"  前端产物      : {'已就绪' if DIST_INDEX.exists() else '缺失 frontend/dist/index.html'}")
    say(f"  作品目录      : {len([p for p in (ROOT / 'books').glob('*') if p.is_dir()]) if (ROOT / 'books').exists() else 0} 部")
    say("-" * 60)
    say("  结论：双击启动脚本即可使用，无需额外配置。")
    say()
    return 0


def main() -> int:
    _setup_console()
    parser = argparse.ArgumentParser(add_help=True, description="AI 小说创作工具 · 一键自举启动器")
    parser.add_argument("--check", action="store_true", help="只体检环境，不启动")
    parser.add_argument("--reinstall", action="store_true", help="强制重装后端依赖")
    parser.add_argument("--no-browser", action="store_true", help="启动但不自动打开浏览器")
    args = parser.parse_args()

    say()
    say("AI 小说创作工具")
    say("=" * 60)

    python312 = find_python312()
    if args.check:
        return check_only(python312)

    ensure_venv(python312)
    ensure_deps(force=args.reinstall)
    check_frontend()
    return launch(browser=not args.no_browser)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except KeyboardInterrupt:
        say()
        raise SystemExit(130)
