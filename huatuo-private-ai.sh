#!/usr/bin/env bash
# 伺服器／本機用：從 PRIVATE-MODELS 經 SSH 取得有變更的模型分塊，再啟動 CPU AI。
# 不要把 SSH 私鑰、GitHub token 或私人模型放進 GitHub Pages。
set -euo pipefail
TASK_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
source "$TASK_DIR/tools/python-runtime.sh"
huatuo_exec_python "$TASK_DIR/tools/private_models.py" --default-source "$TASK_DIR" "$@"
