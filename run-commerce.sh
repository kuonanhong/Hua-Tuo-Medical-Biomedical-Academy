#!/usr/bin/env bash
# 以正式收費設定啟動（讀取 .env：SITE_ORIGIN、BILLING_MODE、Stripe／ECPay 金鑰、SMTP／SMS）。
# 需放在 HTTPS 反向代理之後（examples/nginx.conf）。啟動前列出檢查清單。
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
[[ -f "$TASK_ROOT/.env" ]] || { echo '找不到 .env；請複製 .env.example 為 .env 並填入設定。' >&2; exit 1; }
set -a; # shellcheck disable=SC1091
source <(grep -E '^[A-Z][A-Z0-9_]*=' "$TASK_ROOT/.env" | sed 's/\r$//'); set +a
: "${SITE_ORIGIN:?請在 .env 設定 SITE_ORIGIN=https://你的網域}"
: "${BILLING_MODE:=transfer}"
echo "== 收費模式 $BILLING_MODE  站點 $SITE_ORIGIN"
[[ "$SITE_ORIGIN" == https://* ]] || echo '警告：正式收費需要 HTTPS 的 SITE_ORIGIN。' >&2
[[ -n "${STRIPE_SECRET_KEY:-}" ]] && echo '   Stripe: 已設定金鑰（Webhook 網址：'"$SITE_ORIGIN"'/api/billing/stripe/webhook）'
[[ -n "${ECPAY_MERCHANT_ID:-}" ]] && echo '   ECPay: 已設定（ReturnURL：'"$SITE_ORIGIN"'/api/billing/ecpay/notify）'
echo "   郵局撥款帳戶：700 / ${PAYOUT_BRANCH_NO:-0101034} / ${PAYOUT_ACCOUNT_NO:-0187821}（請在金流商後台登記為撥款帳戶）"
[[ -n "${SMTP_HOST:-}" ]] || echo '警告：未設定 SMTP，公開站台無法寄送註冊驗證碼。' >&2
exec bash "$TASK_ROOT/run-local.sh" --host "${HT_HOST:-127.0.0.1}" --port "${HT_PORT:-8020}" "$@"
