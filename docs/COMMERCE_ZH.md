# 收費、付款驗證與結算（docs/COMMERCE_ZH.md）

## 1. 定價與鎖定規則
* 方案：`pass-30` NT$299／30 天、`pass-365` NT$2,490／365 天（`portable/commerce.py` 的 `PLANS`）。
* **每一門課第一節免費**（課程資料 `stages[0].free = true`），其餘章節與「實習級」需有效通行證。不是整個科別免費。
* 前端以 `membership.hasAccess(course, stageIndex)` 判斷：第 1 節永遠開放；其餘以 `/api/me` 回傳的 `billing.entitlement` 判斷。伺服器端 `entitlement()` 只回傳目前模式（sandbox／live／transfer）且未撤銷、未到期的權限；重複購買會接在原到期日之後。

## 2. 幣別與匯率
* 顯示幣別：瀏覽器語言的地區子標籤（`zh-TW`→TWD、`ja-JP`→JPY、`de-DE`→EUR…）或時區；右上角可手動切換。
* 匯率：伺服器每 12 小時向 `https://open.er-api.com/v6/latest/TWD` 更新並快取到 `portable/data/rates.json`；離線或失敗時用內附的 2026-10-12 表（`portable/rates.py`、`public/academy/config.js`）。
* 取整：零小數幣別（JPY、KRW、TWD、VND…）向上取到 10／100／1000；其他幣別取 .x9 的魅力價（USD 9.49、EUR 8.49）。前後端演算法相同，付款金額等於畫面顯示金額。
* ECPay 只收 TWD（依方案原價）；Stripe 以學員所選幣別請款（`unit_amount` 依 Stripe 的幣別最小單位規則換算）。

## 3. 付款流程與驗證
### Stripe Checkout（國際信用卡）
1. `POST /api/billing/checkout {planId, currency, method:'stripe', requestId, termsAccepted, termsVersion}` → 伺服器建立訂單 `HT…`，向 Stripe 建立 Checkout Session（`request_three_d_secure=any`，金額與幣別由伺服器決定），回傳 `{url}`，瀏覽器轉到 Stripe 付款頁。
2. 付款完成後 Stripe 轉回 `/api/billing/stripe/return?session_id=…`：伺服器以 secret key **主動查詢 Session**，確認 `payment_status=paid`、金額與幣別與訂單一致，才寫入權限。
3. Stripe Webhook `POST /api/billing/stripe/webhook`（事件 `checkout.session.completed`、`checkout.session.async_payment_succeeded`）：驗證 `Stripe-Signature`（HMAC-SHA256、5 分鐘容忍）後**同樣再查一次 Session**；事件 id 去重。
4. 設定：`STRIPE_SECRET_KEY`（sandbox 用 `sk_test_`，live 用 `sk_live_`）、`STRIPE_WEBHOOK_SECRET`。在 Stripe Dashboard → Developers → Webhooks 新增端點。

### 綠界 ECPay（台灣信用卡）
1. 伺服器產生 AioCheckOut V5 表單（`CheckMacValue` SHA-256），瀏覽器自動送出到綠界收銀台。
2. 綠界以 `ReturnURL = /api/billing/ecpay/notify` 回傳付款結果；伺服器驗證簽章、金額與訂單，`RtnCode=1 且 SimulatePaid=0` 時再以 `QueryTradeInfo/V5` **主動查單**比對 `TradeStatus=1`、`TradeNo`、`TradeAmt`，一致才寫入權限並回 `1|OK`。
3. 設定：`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`；sandbox 用綠界測試商店（2000132 等），live 禁用測試商店編號。

### 郵局轉帳
1. 學員選「轉帳」→ 伺服器建立 `awaiting-transfer` 訂單並顯示：中華郵政（700）、局號 **0101034**、帳號 **0187821**、金額、訂單編號。
2. 學員填寫轉帳時間與轉出帳號末五碼 → `POST /api/billing/transfer/claim` → 狀態 `claimed`。
3. 站長核對郵局入帳後：
   ```bash
   python3 -m portable.commerce_admin orders --status claimed
   python3 -m portable.commerce_admin confirm-transfer HT0123456789ABCDEF01 --reason "10/14 入帳 NT$299 末五碼 12345"
   ```
   立即開通；學員重新整理即解鎖。

## 4. 結算到郵局帳戶
* 轉帳：直接入帳到上述郵局帳戶。
* 刷卡：Stripe 與綠界會把扣除手續費後的款項撥款到站長在**金流商後台登記的撥款帳戶**；請在 Stripe（Settings → Payouts → Bank account）與綠界（會員中心 → 撥款帳戶）登記同一郵局帳戶（銀行代碼 700、帳號 0101034-0187821 格式依金流商要求）。`.env` 的 `PAYOUT_*` 只用於畫面顯示與轉帳指引，不會、也不能由程式發動撥款。

## 5. 模式與上線檢查
| `BILLING_MODE` | 說明 |
|---|---|
| `disabled` | 站長／展示版，所有章節開放，不建立訂單 |
| `transfer` | 鎖定付費章節，只接受郵局轉帳回報 |
| `sandbox` | Stripe 測試金鑰／綠界測試商店；權限與 live 分開 |
| `live` | 正式收費；需 HTTPS `SITE_ORIGIN`、`BILLING_LIVE_CONFIRMED=1`、`COMMERCE_LEGAL_READY=1` |

上線前：真實小額付款＋退款＋對帳各測一次；`terms.html` 的條款版本（`TERMS_VERSION = v1-2026-10`）變更時學員需重新同意；Webhook／ReturnURL 必須是公開 HTTPS。

## 6. 站長指令（本機 CLI，沒有公開管理 API）
```bash
python3 -m portable.commerce_admin status                 # 設定與能力（不含金鑰）
python3 -m portable.commerce_admin orders --limit 50      # 近期訂單
python3 -m portable.commerce_admin reconcile HT…          # 遺漏通知時重新向 Stripe／綠界查單
python3 -m portable.commerce_admin revoke HT… --reason "退款"   # 撤銷權限（退款在金流商後台或轉帳辦理）
python3 -m portable.commerce_admin grant USERNAME --days 30 --reason "獎學金"
python3 -m portable.commerce_admin users                  # 帳號、驗證與有效通行證數
python3 -m portable.commerce_admin rates --refresh        # 立即更新匯率
```
資料庫：`portable/data/huatuo.sqlite3`（WAL），表 `commerce_orders`、`commerce_entitlements`、`commerce_events`、`commerce_admin_audit`。
