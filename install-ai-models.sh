#!/usr/bin/env bash
# 列出可用的開放權重模型；只有加上 --download 才會真的下載（含 SHA-256 校驗與續傳）。
# bash install-ai-models.sh                         列表
# bash install-ai-models.sh --model qwen3-17b --download
# bash install-ai-models.sh --verify                校驗 models/ 內的檔案
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys;sys.exit(sys.version_info<(3,10))' 2>/dev/null; then
    exec "$candidate" "$TASK_ROOT/tools/download_ai_model.py" "$@"
  fi
done
if command -v py >/dev/null 2>&1; then exec py -3 "$TASK_ROOT/tools/download_ai_model.py" "$@"; fi
echo '需要 Python 3.10+。' >&2; exit 1
