#!/usr/bin/env bash
# 啟動本機伺服器（帳號驗證、進度、付款、AI 師傅）。只需 Python 3.10+，不需安裝套件。
# Start the local server (verified accounts, progress, checkout, AI mentor). Python 3.10+ only.
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PYTHON_EXE="${HT_PYTHON:-}"
if [[ -z "$PYTHON_EXE" && -n "${CONDA_PREFIX:-}" && -x "$CONDA_PREFIX/bin/python" ]]; then PYTHON_EXE="$CONDA_PREFIX/bin/python"; fi
if [[ -z "$PYTHON_EXE" ]]; then
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(sys.version_info < (3,10))' 2>/dev/null; then PYTHON_EXE="$candidate"; break; fi
  done
fi
if [[ -z "$PYTHON_EXE" ]]; then
  echo '需要 Python 3.10+。macOS: brew install python；Ubuntu: sudo apt install python3；或 Conda: conda create -n huatuo python=3.12 && conda activate huatuo' >&2
  echo 'Windows 請執行 run-local.bat。' >&2
  exit 1
fi
exec "$PYTHON_EXE" "$TASK_ROOT/portable/server.py" "$@"
