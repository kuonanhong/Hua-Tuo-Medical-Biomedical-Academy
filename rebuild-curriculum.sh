#!/usr/bin/env bash
# 由 tools/curriculum/*.py 的主題資料重新產生全部課程 JSON／JS、目錄與圖示描述，並驗證一致性。
# 新增課程：編輯 tools/curriculum/ 內對應學院的檔案（或 authored.py 的手寫核心步驟）後執行本檔。
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PYTHON_EXE="${HT_PYTHON:-python3}"
if [[ -n "${CONDA_PREFIX:-}" && -x "$CONDA_PREFIX/bin/python" && -z "${HT_PYTHON:-}" ]]; then PYTHON_EXE="$CONDA_PREFIX/bin/python"; fi
"$PYTHON_EXE" -c 'import sys; sys.exit(sys.version_info < (3,10))' || { echo '需要 Python 3.10+' >&2; exit 1; }
cd "$TASK_ROOT"
"$PYTHON_EXE" tools/build_curriculum.py "$@"
"$PYTHON_EXE" tools/check_offline.py
echo '課程資料已重建：public/academy/data/'
