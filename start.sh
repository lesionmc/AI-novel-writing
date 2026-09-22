#!/usr/bin/env bash
# ============================================================================
#  一键启动（macOS / Linux）—— 换电脑也能直接用
# ----------------------------------------------------------------------------
#  与 start.bat 完全对称：本脚本只负责**找到一个 Python 3.12**，
#  剩下的（建虚拟环境 / 装依赖 / 校验前端产物 / 启动服务）全部交给
#  bootstrap.py，保证两个平台行为一致。
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PROBE='import sys;raise SystemExit(0 if sys.version_info[:2]==(3,12) else 1)'

PY=""
for cand in python3.12 python3 python; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "$PROBE" 2>/dev/null; then
    PY="$cand"
    break
  fi
done

if [ -z "$PY" ]; then
  cat >&2 <<'EOF'

  [错误] 没有找到 Python 3.12。

  本项目需要 Python 3.12（3.13 及以上与向量扩展 sqlite-vec 的组合尚未验证）。
  请先安装，然后重新执行本脚本：

      macOS  : brew install python@3.12
      Ubuntu : sudo apt install python3.12 python3.12-venv
      Fedora : sudo dnf install python3.12

  装好后重新执行 ./start.sh 即可，其余步骤会自动完成。

EOF
  exit 3
fi

exec "$PY" "$ROOT/bootstrap.py" "$@"
