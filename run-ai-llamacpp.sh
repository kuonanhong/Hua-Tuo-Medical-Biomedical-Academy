#!/usr/bin/env bash
# 本機 CPU／GPU 生成式 AI：以 llama.cpp 的 llama-server 載入 models/ 內的 GGUF，再啟動學院伺服器。
# 先執行 bash install-ai-models.sh --model qwen3-17b --download
# 環境變數：HT_GGUF（模型檔）、HT_AI_PORT（預設 8383）、HT_CPU_THREADS（預設 8）、HT_GPU_LAYERS（預設 0）
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
MODEL_FILE="${HT_GGUF:-$TASK_ROOT/models/Qwen3-1.7B-Q8_0.gguf}"
MODEL_PORT="${HT_AI_PORT:-8383}"
THREADS="${HT_CPU_THREADS:-8}"
GPU_LAYERS="${HT_GPU_LAYERS:-0}"
[[ -f "$MODEL_FILE" ]] || { echo "找不到模型 $MODEL_FILE；先執行 bash install-ai-models.sh --model qwen3-17b --download" >&2; exit 1; }
command -v llama-server >/dev/null 2>&1 || { echo '需要 llama.cpp 的 llama-server：macOS brew install llama.cpp；其他平台見 docs/AI_ROUTES_ZH.md。' >&2; exit 1; }
[[ "$MODEL_PORT" =~ ^[0-9]+$ && "$THREADS" =~ ^[0-9]+$ && "$GPU_LAYERS" =~ ^[0-9]+$ ]] || { echo '埠、執行緒與 GPU 層數必須是整數。' >&2; exit 2; }
PY=''
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys;sys.exit(sys.version_info<(3,10))' 2>/dev/null; then PY="$candidate"; break; fi
done
[[ -n "$PY" ]] || { echo '需要 Python 3.10+。' >&2; exit 1; }
"$PY" - "$MODEL_PORT" <<'PY'
import socket, sys
port = int(sys.argv[1])
if not 1024 <= port <= 65535: sys.exit('Choose a port from 1024 to 65535.')
with socket.socket() as s:
    try: s.bind(('127.0.0.1', port))
    except OSError: sys.exit('AI port is occupied. Set HT_AI_PORT to another port; no existing process was stopped.')
PY
export AI_BASE_URL="http://127.0.0.1:$MODEL_PORT/v1"
export AI_API_KEY="$("$PY" -c 'import secrets;print(secrets.token_urlsafe(32))')"
export AI_MODEL='huatuo-local'
export AI_LABEL="本機 llama.cpp · $(basename "$MODEL_FILE")"
mkdir -p "$TASK_ROOT/logs"
llama-server --model "$MODEL_FILE" --alias "$AI_MODEL" --host 127.0.0.1 --port "$MODEL_PORT" --api-key "$AI_API_KEY" --n-gpu-layers "$GPU_LAYERS" --threads "$THREADS" --ctx-size 16384 --jinja >"$TASK_ROOT/logs/llama-server.log" 2>&1 &
AI_CHILD=$!
cleanup(){ kill "$AI_CHILD" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
"$PY" - "$MODEL_PORT" "$AI_CHILD" <<'PY'
import os, sys, time, urllib.request
for _ in range(360):
    try:
        req = urllib.request.Request('http://127.0.0.1:' + sys.argv[1] + '/health', headers={'Authorization': 'Bearer ' + os.environ['AI_API_KEY']})
        with urllib.request.urlopen(req, timeout=2) as r:
            if r.status == 200: break
    except Exception: pass
    try: os.kill(int(sys.argv[2]), 0)
    except OSError: sys.exit('llama-server exited; see logs/llama-server.log.')
    time.sleep(.5)
else: sys.exit('Model did not become ready within 180 seconds.')
PY
echo "本機模型已就緒（$MODEL_FILE）；AI 師傅會以此模型回答學徒問題。"
bash "$TASK_ROOT/run-local.sh" "$@"
