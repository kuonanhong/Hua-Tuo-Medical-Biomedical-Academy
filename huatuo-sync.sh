#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/tools/python-runtime.sh"
huatuo_exec_python "$SCRIPT_DIR/tools/sync_github.py" "$@"
