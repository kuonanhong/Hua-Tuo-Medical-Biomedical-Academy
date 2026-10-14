#!/usr/bin/env bash
# 以雲端生成式 AI 回答學徒問題：讀取 .env 中的 OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY
# 或任何 OpenAI 相容服務（AI_BASE_URL + AI_API_KEY + AI_MODEL）。學徒每次提問需勾選同意送出雲端。
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
[[ -f "$TASK_ROOT/.env" ]] || { echo '找不到 .env；請複製 .env.example 並填入至少一組 AI 金鑰。' >&2; exit 1; }
set -a; # shellcheck disable=SC1091
source <(grep -E '^[A-Z][A-Z0-9_]*=' "$TASK_ROOT/.env" | sed 's/\r$//'); set +a
FOUND=0
[[ -n "${OPENAI_API_KEY:-}" ]] && { echo "   OpenAI：${OPENAI_MODEL:-gpt-4.1-mini}"; FOUND=1; }
[[ -n "${ANTHROPIC_API_KEY:-}" ]] && { echo "   Anthropic：${ANTHROPIC_MODEL:-claude-sonnet-5-5}"; FOUND=1; }
[[ -n "${GEMINI_API_KEY:-}" ]] && { echo "   Gemini：${GEMINI_MODEL:-gemini-2.5-flash}"; FOUND=1; }
[[ -n "${AI_BASE_URL:-}" && -n "${AI_API_KEY:-}" && -n "${AI_MODEL:-}" ]] && { echo "   OpenAI 相容：${AI_MODEL} @ ${AI_BASE_URL}"; FOUND=1; }
[[ "$FOUND" == 1 ]] || { echo '.env 內沒有任何 AI 金鑰。' >&2; exit 1; }
exec bash "$TASK_ROOT/run-local.sh" "$@"
