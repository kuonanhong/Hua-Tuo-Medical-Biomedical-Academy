#!/usr/bin/env bash
# macOS：在 Finder 雙擊即可啟動（第一次請在「系統設定 → 隱私權與安全性」允許）。
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
bash "$TASK_ROOT/run-local.sh" "$@"
