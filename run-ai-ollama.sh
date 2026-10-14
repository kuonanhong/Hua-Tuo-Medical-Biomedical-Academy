#!/usr/bin/env bash
# 以 Ollama 提供本機生成式 AI（預設 qwen3:4b）。只有加上 --download 才會下載模型。
# HT_OLLAMA_MODEL=qwen3:8b bash run-ai-ollama.sh --download
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DOWNLOAD=0; SERVER_ARGS=()
while (($#)); do
  case "$1" in
    --download) DOWNLOAD=1;;
    -h|--help) echo 'Usage: [HT_OLLAMA_MODEL=qwen3:4b] bash run-ai-ollama.sh [--download] [server args]'; exit 0;;
    *) SERVER_ARGS+=("$1");;
  esac; shift
done
command -v ollama >/dev/null 2>&1 || { echo '請先安裝 Ollama：https://ollama.com/download' >&2; exit 1; }
ollama list >/dev/null 2>&1 || { echo '請先開啟 Ollama 應用程式或執行 ollama serve。' >&2; exit 1; }
export OLLAMA_BASE_URL='http://127.0.0.1:11434'
export OLLAMA_TEXT_MODEL="${HT_OLLAMA_MODEL:-qwen3:4b}"
[[ "$OLLAMA_TEXT_MODEL" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$ ]] || { echo '模型名稱無效。' >&2; exit 2; }
if [[ "$DOWNLOAD" == 1 ]]; then ollama pull "$OLLAMA_TEXT_MODEL";
elif ! ollama show "$OLLAMA_TEXT_MODEL" >/dev/null 2>&1; then echo "尚未安裝 $OLLAMA_TEXT_MODEL；同意下載請加 --download。" >&2; exit 1; fi
echo "Ollama 路線已設定（$OLLAMA_TEXT_MODEL）；AI 師傅會以此模型回答。"
exec bash "$TASK_ROOT/run-local.sh" "${SERVER_ARGS[@]}"
