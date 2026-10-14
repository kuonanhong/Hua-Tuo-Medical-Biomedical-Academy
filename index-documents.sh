#!/usr/bin/env bash
# 把 local-documents/ 內的教材（PDF/DOCX/PPTX/TXT/MD/CSV/JSON）建成 AI 師傅的本地索引。
# bash index-documents.sh [--source 資料夾] [--output portable/data/knowledge.json]
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
PYTHON_EXE="${HT_PYTHON:-python3}"
if [[ -n "${CONDA_PREFIX:-}" && -x "$CONDA_PREFIX/bin/python" && -z "${HT_PYTHON:-}" ]]; then PYTHON_EXE="$CONDA_PREFIX/bin/python"; fi
exec "$PYTHON_EXE" "$TASK_ROOT/tools/index_documents.py" "$@"
