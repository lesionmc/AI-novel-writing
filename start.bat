@echo off
rem ============================================================================
rem  一键启动（Windows）—— 换电脑也能直接用
rem ----------------------------------------------------------------------------
rem  本脚本只做一件事：**找到一个 Python 3.12**，然后把剩下的全部交给
rem  bootstrap.py（建虚拟环境 / 装依赖 / 校验前端产物 / 启动服务）。
rem  这样 Windows 与 macOS/Linux 共用同一套自举逻辑，不会出现两边行为不一致。
rem
rem  为什么不再自己判虚拟环境：原版要求用户先手工 `python -m venv` + `pip install`，
rem  换一台电脑就等于重新装一遍，与「开箱即用」相悖。
rem ============================================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
cd /d "%ROOT%"

set "PY="

rem ① py 启动器（官方安装器默认会装，能精确指定 3.12）
py -3.12 -c "import sys" >nul 2>&1
if not errorlevel 1 set "PY=py -3.12"

rem ② PATH 里的 python / python3
if not defined PY (
  python -c "import sys;raise SystemExit(0 if sys.version_info[:2]==(3,12) else 1)" >nul 2>&1
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  python3 -c "import sys;raise SystemExit(0 if sys.version_info[:2]==(3,12) else 1)" >nul 2>&1
  if not errorlevel 1 set "PY=python3"
)

rem ③ 常见安装位置兜底（用户没勾 "Add to PATH" 也不会卡住）
if not defined PY (
  for %%P in (
    "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
    "%ProgramFiles%\Python312\python.exe"
    "%ProgramFiles(x86)%\Python312\python.exe"
    "C:\Python312\python.exe"
  ) do (
    if not defined PY if exist %%P (
      %%P -c "import sys;raise SystemExit(0 if sys.version_info[:2]==(3,12) else 1)" >nul 2>&1
      if not errorlevel 1 set "PY=%%P"
    )
  )
)

if not defined PY goto :nopython

%PY% "%ROOT%bootstrap.py" %*
goto :done

:nopython
echo.
echo   [错误] 没有找到 Python 3.12。
echo.
echo   本项目需要 Python 3.12（3.13 及以上与向量扩展 sqlite-vec 的组合尚未验证）。
echo   请任选一种方式安装后重新双击本文件：
echo.
echo     方式一（推荐，命令行执行一次）：
echo         winget install -e --id Python.Python.3.12
echo.
echo     方式二（官网下载安装包）：
echo         https://www.python.org/downloads/release/python-31210/
echo         安装时请勾选 "Add python.exe to PATH"
echo.
echo   装好后重新双击本文件即可，其余步骤会自动完成。
echo.
pause
goto :done

:done
endlocal
