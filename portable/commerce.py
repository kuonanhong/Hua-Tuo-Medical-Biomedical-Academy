"""Learning-pass commerce: Stripe Checkout, ECPay (綠界) and post-office transfer claims.

Standard library only. The browser never touches card numbers: card payments happen on the
gateway's hosted, 3-D Secure verified page, the gateway notifies this server with a signed
message, and the server independently queries the gateway before an entitlement is written.
Funds settle to the operator's payout account registered at the gateway (for this academy the
Chunghwa Post account: bank code 700, 局號 0101034, 帳號 0187821). Manual transfers to that
same account are claimed by the learner and confirmed by the operator with commerce_admin.py.

Billing modes (BILLING_MODE, default "transfer"):
  disabled  owner/demo edition – every section open, no checkout.
  transfer  paywall on; only manual transfer claims (no gateway keys needed).
  sandbox   Stripe test keys / ECPay staging credentials; entitlements are sandbox-only.
  live      real payments; requires HTTPS SITE_ORIGIN, BILLING_LIVE_CONFIRMED=1 and
            COMMERCE_LEGAL_READY=1 (terms, refunds and support finalised).
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote_plus, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

try:
    from .rates import Rates, ZERO_DECIMAL
except ImportError:  # pragma: no cover - script execution
    from rates import Rates, ZERO_DECIMAL

TERMS_VERSION = "v1-2026-10"
PLANS = (
    {"id": "pass-30", "title": "學習通行證 30 天", "titleEn": "Learning pass · 30 days", "amountTwd": 299, "days": 30},
    {"id": "pass-365", "title": "學習通行證 365 天", "titleEn": "Learning pass · 365 days", "amountTwd": 2490, "days": 365},
)
ORDER_RE = re.compile(r"^HT[A-F0-9]{18}$")
STRIPE_ZERO_DECIMAL = {"BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"}
STRIPE_THREE_DECIMAL = {"BHD", "JOD", "KWD", "OMR", "TND"}
STRIPE_HUNDRED_MULTIPLE = {"TWD", "HUF", "ISK", "UGX"}
SCHEMA = """
CREATE TABLE IF NOT EXISTS commerce_orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), plan_id TEXT NOT NULL,
 amount_twd INTEGER NOT NULL, currency TEXT NOT NULL, amount_local REAL NOT NULL,
 days INTEGER NOT NULL, mode TEXT NOT NULL, method TEXT NOT NULL, status TEXT NOT NULL,
 created_at INTEGER NOT NULL, trade_date TEXT NOT NULL, terms_version TEXT NOT NULL,
 request_key TEXT NOT NULL, provider_ref TEXT UNIQUE, paid_at INTEGER, last_code TEXT,
 claim_last5 TEXT, claim_at TEXT, claimed_at INTEGER, confirmed_by TEXT,
 UNIQUE(user_id, request_key)
);
CREATE TABLE IF NOT EXISTS commerce_events (
 digest TEXT PRIMARY KEY, order_id TEXT NOT NULL, event_at INTEGER NOT NULL, result TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS commerce_entitlements (
 order_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, mode TEXT NOT NULL,
 starts_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, revoked_at INTEGER, method TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS commerce_entitlements_user ON commerce_entitlements(user_id, mode, expires_at);
CREATE TABLE IF NOT EXISTS commerce_admin_audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL
);
"""


def check_mac(fields, key, iv):
    """ECPay AIO SHA-256 CheckMacValue (.NET URL encoding rules)."""
    raw = "&".join(f"{k}={fields[k]}" for k in sorted(fields, key=str.lower) if k != "CheckMacValue")
    encoded = quote_plus(f"HashKey={key}&{raw}&HashIV={iv}", safe="-_.!*()")
    encoded = encoded.replace("~", "%7e").lower()
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest().upper()


def parse_form(raw, error):
    try:
        if len(raw) > 32768:
            raise ValueError()
        pairs = parse_qsl(raw.decode("utf-8", errors="strict"), keep_blank_values=True, strict_parsing=True, max_num_fields=120, errors="strict")
        fields = dict(pairs)
        if not fields or len(fields) != len(pairs) or any(not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,60}", k) or len(v) > 2000 for k, v in pairs):
            raise ValueError()
        return fields
    except (ValueError, UnicodeError):
        raise error(400, "Invalid payment notification.") from None


def stripe_minor_amount(amount, currency):
    """Convert a major-unit amount into Stripe's unit_amount with the currency's rules."""
    currency = currency.upper()
    if currency in STRIPE_ZERO_DECIMAL:
        return int(round(amount))
    if currency in STRIPE_THREE_DECIMAL:
        minor = int(round(amount * 1000))
        return minor - (minor % 10)
    minor = int(round(amount * 100))
    if currency in STRIPE_HUNDRED_MULTIPLE:
        minor = int(round(amount)) * 100
    return minor


def verify_stripe_signature(payload, header, secret, tolerance=300, now=None):
    """Validate a Stripe-Signature header (t=...,v1=...). Returns True on success."""
    if not header or not secret:
        return False
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    timestamp, signature = parts.get("t"), parts.get("v1")
    if not timestamp or not signature or not re.fullmatch(r"[0-9]{1,12}", timestamp):
        return False
    now = int(time.time()) if now is None else now
    if abs(now - int(timestamp)) > tolerance:
        return False
    expected = hmac.new(secret.encode("utf-8"), f"{timestamp}.".encode("utf-8") + payload, hashlib.sha256).hexdigest()
    candidates = [p.split("=", 1)[1] for p in header.split(",") if p.startswith("v1=")]
    return any(hmac.compare_digest(expected, c) for c in candidates)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Commerce:
    def __init__(self, app, error, environ=None):
        self.app, self.error = app, error
        self.env = environ if environ is not None else os.environ
        self.mode = self.env.get("BILLING_MODE", "transfer")
        if self.mode not in ("disabled", "transfer", "sandbox", "live"):
            raise ValueError("BILLING_MODE must be disabled, transfer, sandbox or live.")
        self.rates = Rates(app.database.parent / "rates.json", self.env)
        origin = urlsplit(app.origin)
        self.loopback = origin.hostname in ("127.0.0.1", "localhost", "::1")
        self.https_public = origin.scheme == "https" and not self.loopback
        # Stripe
        self.stripe_key = self.env.get("STRIPE_SECRET_KEY", "")
        self.stripe_webhook_secret = self.env.get("STRIPE_WEBHOOK_SECRET", "")
        stripe_ok = bool(re.fullmatch(r"(sk|rk)_(test|live)_[A-Za-z0-9]{10,}", self.stripe_key))
        if self.mode == "live" and stripe_ok and "_test_" in self.stripe_key:
            raise ValueError("BILLING_MODE=live needs a live Stripe key, not a test key.")
        if self.mode == "sandbox" and stripe_ok and "_live_" in self.stripe_key:
            raise ValueError("BILLING_MODE=sandbox must use a Stripe test key.")
        # ECPay
        self.ecpay_merchant = self.env.get("ECPAY_MERCHANT_ID", "")
        self.ecpay_key = self.env.get("ECPAY_HASH_KEY", "")
        self.ecpay_iv = self.env.get("ECPAY_HASH_IV", "")
        ecpay_ok = bool(re.fullmatch(r"[0-9]{5,10}", self.ecpay_merchant) and len(self.ecpay_key) >= 8 and len(self.ecpay_iv) >= 8)
        if self.mode == "live" and self.ecpay_merchant in ("2000132", "3002607", "3002599", "3365120"):
            ecpay_ok = False
        self.methods = []
        self.reason = ""
        if self.mode in ("sandbox", "live"):
            live_ready = self.mode != "live" or (self.https_public and self.env.get("BILLING_LIVE_CONFIRMED") == "1" and self.env.get("COMMERCE_LEGAL_READY") == "1")
            if stripe_ok and live_ready:
                self.methods.append("stripe")
            if ecpay_ok and live_ready and (self.https_public or self.mode == "sandbox"):
                self.methods.append("ecpay")
            if not live_ready:
                self.reason = "正式刷卡需要 HTTPS 的 SITE_ORIGIN，並設定 BILLING_LIVE_CONFIRMED=1 與 COMMERCE_LEGAL_READY=1。/ Live checkout needs an HTTPS SITE_ORIGIN plus BILLING_LIVE_CONFIRMED=1 and COMMERCE_LEGAL_READY=1."
            elif not self.methods:
                self.reason = "尚未設定金流商金鑰；可使用郵局轉帳。/ No gateway credentials configured; transfer remains available."
            elif self.mode == "sandbox":
                self.reason = "測試金流：僅限測試卡；權限與正式模式分開。/ Sandbox: test cards only; entitlements are isolated from live mode."
        elif self.mode == "transfer":
            self.reason = "尚未啟用線上刷卡；請轉帳至郵局帳戶後填寫回報表，站長核對後開通。/ Card checkout is not enabled; transfer to the post-office account and submit the claim form."
        else:
            self.reason = "收費已停用：站長／展示版，所有章節開放。/ Billing disabled: owner edition with every section open."
        self.transfer = {
            "bankName": self.env.get("PAYOUT_BANK_NAME", "中華郵政（郵局）/ Chunghwa Post"),
            "bankCode": self.env.get("PAYOUT_BANK_CODE", "700"),
            "branchNo": self.env.get("PAYOUT_BRANCH_NO", "0101034"),
            "accountNo": self.env.get("PAYOUT_ACCOUNT_NO", "0187821"),
            "accountName": self.env.get("PAYOUT_ACCOUNT_NAME", ""),
            "note": self.env.get("PAYOUT_NOTE", "轉帳後請在會員頁填寫轉帳時間與帳號末五碼，站長核對後開通。/ After transferring, submit the time and the last five digits of your account; access opens once confirmed."),
        }
        with app.db() as db:
            db.executescript(SCHEMA)

    # ------------------------------------------------------------------ public config
    @property
    def paywall(self):
        return self.mode != "disabled"

    @property
    def checkout_available(self):
        return bool(self.methods)

    def config(self):
        snap = self.rates.snapshot()
        return {"mode": self.mode, "paywall": self.paywall, "checkoutAvailable": self.checkout_available, "methods": list(self.methods),
                "plans": [dict(p) for p in PLANS], "transfer": dict(self.transfer), "rates": snap["rates"], "ratesUpdated": snap["ratesUpdated"],
                "ratesSource": snap["source"], "termsVersion": TERMS_VERSION, "termsUrl": "terms.html", "reason": self.reason,
                "settlement": "Gateway payouts and manual transfers settle to the operator's registered post-office account."}

    # ------------------------------------------------------------------ entitlements
    def entitlement(self, user_id, db=None):
        if not user_id:
            return None
        if not self.paywall:
            return {"orderId": "owner-edition", "mode": "disabled", "method": "owner", "startsAt": 0, "expiresAt": 4102444800}
        if db is None:
            with self.app.db() as connection:
                return self.entitlement(user_id, connection)
        now = int(time.time())
        row = db.execute("SELECT * FROM commerce_entitlements WHERE user_id=? AND mode=? AND revoked_at IS NULL AND starts_at<=? AND expires_at>? ORDER BY expires_at DESC LIMIT 1", (user_id, self.mode, now, now)).fetchone()
        if not row:
            return None
        # Passes stack back-to-back, so the covered period ends at the latest non-revoked expiry.
        coverage_end = db.execute("SELECT max(expires_at) FROM commerce_entitlements WHERE user_id=? AND mode=? AND revoked_at IS NULL AND expires_at>?", (user_id, self.mode, now)).fetchone()[0] or row["expires_at"]
        return {"orderId": row["order_id"], "mode": row["mode"], "method": row["method"], "startsAt": row["starts_at"], "expiresAt": coverage_end, "currentPassExpiresAt": row["expires_at"]}

    def billing(self, user_id):
        return {"entitlement": self.entitlement(user_id), "mode": self.mode, "paywall": self.paywall}

    def account(self, user_id):
        with self.app.db() as db:
            orders = [dict(r) for r in db.execute("SELECT id AS orderId, plan_id AS planId, amount_twd AS amountTwd, currency, amount_local AS amountLocal, days, mode, method, status, created_at AS createdAt, paid_at AS paidAt FROM commerce_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 50", (user_id,))]
            ents = [dict(r) for r in db.execute("SELECT order_id AS orderId, mode, method, starts_at AS startsAt, expires_at AS expiresAt, revoked_at AS revokedAt FROM commerce_entitlements WHERE user_id=? ORDER BY expires_at DESC LIMIT 50", (user_id,))]
        return {"orders": orders, "entitlements": ents, "entitlement": self.entitlement(user_id)}

    def grant(self, db, row, method, provider_ref=None, confirmed_by=None):
        """Idempotently mark an order paid and extend the user's entitlement (stacks after the current expiry)."""
        now = int(time.time())
        if row["status"] == "paid":
            return False
        if row["status"] in ("revoked", "refunded"):
            return False
        future = db.execute("SELECT max(expires_at) FROM commerce_entitlements WHERE user_id=? AND mode=? AND revoked_at IS NULL", (row["user_id"], row["mode"])).fetchone()[0] or now
        starts = max(now, future)
        db.execute("INSERT OR REPLACE INTO commerce_entitlements VALUES(?,?,?,?,?,NULL,?)", (row["id"], row["user_id"], row["mode"], starts, starts + row["days"] * 86400, method))
        db.execute("UPDATE commerce_orders SET status='paid', provider_ref=COALESCE(?, provider_ref), paid_at=?, confirmed_by=? WHERE id=?", (provider_ref, now, confirmed_by, row["id"]))
        return True

    # ------------------------------------------------------------------ checkout
    def plan(self, plan_id):
        return next((p for p in PLANS if p["id"] == plan_id), None)

    def create_order(self, user_id, payload):
        if not self.paywall:
            raise self.error(409, "Billing is disabled on this server: every section is already open.")
        plan = self.plan(payload.get("planId"))
        method = payload.get("method")
        if not plan or payload.get("termsAccepted") is not True:
            raise self.error(400, "Select a valid plan and accept the current terms.")
        if payload.get("termsVersion") not in (TERMS_VERSION, "v1"):
            raise self.error(400, "The terms changed; reload the membership page and accept the current terms.")
        if method not in ("stripe", "ecpay", "transfer"):
            raise self.error(400, "Unknown payment method.")
        if method != "transfer" and method not in self.methods:
            raise self.error(503, self.reason or "This payment method is not configured.")
        request_key = payload.get("requestId")
        if not isinstance(request_key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{16,80}", request_key):
            raise self.error(400, "Provide a unique requestId of 16–80 letters, digits, underscores or hyphens.")
        currency = str(payload.get("currency") or "TWD").upper()
        if not re.fullmatch(r"[A-Z]{3}", currency):
            raise self.error(400, "Invalid currency code.")
        if method == "ecpay":
            currency = "TWD"  # ECPay settles in TWD only
        amount_local, currency = self.rates.amount(plan["amountTwd"], currency)
        now = int(time.time())
        with self.app.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM commerce_orders WHERE user_id=? AND request_key=?", (user_id, request_key)).fetchone()
            if row:
                if row["plan_id"] != plan["id"] or row["mode"] != self.mode or row["status"] not in ("pending", "awaiting-transfer") or row["created_at"] < now - 3600:
                    raise self.error(409, "This checkout request was already used or has expired; start again.")
            else:
                if db.execute("SELECT count(*) FROM commerce_orders WHERE user_id=? AND created_at>?", (user_id, now - 3600)).fetchone()[0] >= 12:
                    raise self.error(429, "Too many checkout attempts; try again later.")
                order_id = "HT" + secrets.token_hex(9).upper()
                trade_date = datetime.fromtimestamp(now, timezone(timedelta(hours=8))).strftime("%Y/%m/%d %H:%M:%S")
                status = "awaiting-transfer" if method == "transfer" else "pending"
                db.execute("INSERT INTO commerce_orders(id,user_id,plan_id,amount_twd,currency,amount_local,days,mode,method,status,created_at,trade_date,terms_version,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                           (order_id, user_id, plan["id"], plan["amountTwd"], currency, amount_local, plan["days"], self.mode, method, status, now, trade_date, TERMS_VERSION, request_key))
                row = db.execute("SELECT * FROM commerce_orders WHERE id=?", (order_id,)).fetchone()
        return dict(row)

    def checkout(self, user, payload):
        order = self.create_order(user["id"], payload)
        method = order["method"]
        if method == "transfer":
            return {"transfer": {"orderId": order["id"], "amount": order["amount_twd"], "currency": "TWD", "amountLocal": order["amount_local"], "currencyLocal": order["currency"], "account": dict(self.transfer), "status": order["status"]}, "orderId": order["id"]}
        if method == "stripe":
            return self.stripe_session(user, order)
        return self.ecpay_form(order)

    # ------------------------------------------------------------------ Stripe
    def stripe_request(self, path, data=None, method=None):
        request = Request("https://api.stripe.com" + path, data=urlencode(data, doseq=True).encode() if data is not None else None, method=method or ("POST" if data is not None else "GET"),
                          headers={"Authorization": "Bearer " + self.stripe_key, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2024-06-20"})
        try:
            with build_opener(NoRedirect()).open(request, timeout=25) as response:
                raw = response.read(1_000_001)
                if len(raw) > 1_000_000:
                    raise self.error(502, "Stripe response too large.")
                return json.loads(raw)
        except HTTPError as error:
            try:
                detail = json.loads(error.read(20000)).get("error", {}).get("message", "")
            except Exception:
                detail = ""
            raise self.error(502, "Stripe rejected the request." + (f" ({detail[:160]})" if detail else "")) from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise self.error(503, "Stripe is unreachable from this server; try again later.") from None

    def stripe_session(self, user, order):
        plan = self.plan(order["plan_id"])
        unit = stripe_minor_amount(order["amount_local"], order["currency"])
        fields = {
            "mode": "payment",
            "client_reference_id": order["id"],
            "success_url": self.app.origin + "/api/billing/stripe/return?session_id={CHECKOUT_SESSION_ID}",
            "cancel_url": self.app.origin + "/#membership",
            "customer_email": user.get("email") or "",
            "line_items[0][quantity]": "1",
            "line_items[0][price_data][currency]": order["currency"].lower(),
            "line_items[0][price_data][unit_amount]": str(unit),
            "line_items[0][price_data][product_data][name]": f"Hua Tuo Medical Academy – {plan['titleEn']}",
            "line_items[0][price_data][product_data][description]": f"{plan['title']} (NT${plan['amountTwd']})",
            "payment_method_types[0]": "card",
            "payment_method_options[card][request_three_d_secure]": self.env.get("STRIPE_3DS", "any"),
            "payment_intent_data[description]": f"Hua Tuo Academy pass {order['days']} days · {order['id']}",
            "metadata[orderId]": order["id"],
            "metadata[userId]": order["user_id"],
            "expires_at": str(int(time.time()) + 1800),
        }
        session = self.stripe_request("/v1/checkout/sessions", fields)
        url, sid = session.get("url"), session.get("id", "")
        if not isinstance(url, str) or not url.startswith("https://checkout.stripe.com/") or not re.fullmatch(r"cs_(test|live)_[A-Za-z0-9]{10,}", sid):
            raise self.error(502, "Stripe did not return a checkout URL.")
        with self.app.db() as db:
            db.execute("UPDATE commerce_orders SET provider_ref=? WHERE id=? AND status='pending'", (sid, order["id"]))
        return {"url": url, "orderId": order["id"], "mode": self.mode}

    def stripe_verify_session(self, session_id):
        """Independently fetch the session and grant on verified payment. Returns (order_id, granted, status)."""
        if not isinstance(session_id, str) or not re.fullmatch(r"cs_(test|live)_[A-Za-z0-9]{10,}", session_id):
            raise self.error(400, "Invalid session id.")
        session = self.stripe_request("/v1/checkout/sessions/" + session_id)
        order_id = session.get("client_reference_id") or (session.get("metadata") or {}).get("orderId")
        if not isinstance(order_id, str) or not ORDER_RE.fullmatch(order_id):
            raise self.error(400, "Session does not reference an order.")
        paid = session.get("payment_status") == "paid" and session.get("status") == "complete"
        with self.app.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM commerce_orders WHERE id=?", (order_id,)).fetchone()
            if not row or row["mode"] != self.mode or row["method"] != "stripe":
                raise self.error(404, "Order not found in this billing mode.")
            expected = stripe_minor_amount(row["amount_local"], row["currency"])
            if paid and (session.get("amount_total") != expected or str(session.get("currency", "")).upper() != row["currency"]):
                db.execute("INSERT OR IGNORE INTO commerce_events VALUES(?,?,?,?)", (hashlib.sha256(("mismatch:" + session_id).encode()).hexdigest(), order_id, int(time.time()), "amount-mismatch"))
                raise self.error(409, "Paid amount does not match the order; contact support.")
            granted = False
            if paid:
                granted = self.grant(db, row, "stripe", provider_ref=session_id)
                db.execute("INSERT OR IGNORE INTO commerce_events VALUES(?,?,?,?)", (hashlib.sha256(("session:" + session_id).encode()).hexdigest(), order_id, int(time.time()), "paid" if granted else "already-paid"))
            elif session.get("status") == "expired" and row["status"] == "pending":
                db.execute("UPDATE commerce_orders SET status='expired', last_code='expired' WHERE id=?", (order_id,))
            status = db.execute("SELECT status FROM commerce_orders WHERE id=?", (order_id,)).fetchone()[0]
        return order_id, granted, status

    def stripe_webhook(self, raw, signature_header):
        if "stripe" not in self.methods or not self.stripe_webhook_secret:
            raise self.error(503, "Stripe webhook is not configured.")
        if not verify_stripe_signature(raw, signature_header, self.stripe_webhook_secret):
            raise self.error(400, "Invalid Stripe signature.")
        try:
            event = json.loads(raw)
        except ValueError:
            raise self.error(400, "Invalid JSON.") from None
        event_id, kind = str(event.get("id", "")), str(event.get("type", ""))
        if not re.fullmatch(r"evt_[A-Za-z0-9]{10,}", event_id):
            raise self.error(400, "Invalid event.")
        digest = hashlib.sha256(("event:" + event_id).encode()).hexdigest()
        with self.app.db() as db:
            if db.execute("SELECT 1 FROM commerce_events WHERE digest=?", (digest,)).fetchone():
                return {"received": True, "duplicate": True}
        result = "ignored"
        if kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            session = (event.get("data") or {}).get("object") or {}
            if (self.mode == "live") != bool(event.get("livemode")):
                raise self.error(400, "Event livemode does not match the billing mode.")
            # Never trust the webhook body alone: query the session from Stripe before granting.
            _, granted, status = self.stripe_verify_session(session.get("id"))
            result = "paid" if granted else status
        with self.app.db() as db:
            db.execute("INSERT OR IGNORE INTO commerce_events VALUES(?,?,?,?)", (digest, "-", int(time.time()), kind + ":" + result))
        return {"received": True, "result": result}

    # ------------------------------------------------------------------ ECPay
    def ecpay_host(self):
        return "payment-stage.ecpay.com.tw" if self.mode == "sandbox" else "payment.ecpay.com.tw"

    def ecpay_form(self, order):
        fields = {"MerchantID": self.ecpay_merchant, "MerchantTradeNo": order["id"], "MerchantTradeDate": order["trade_date"], "PaymentType": "aio",
                  "TotalAmount": str(order["amount_twd"]), "TradeDesc": "Hua Tuo Medical Academy learning pass", "ItemName": f"Hua Tuo Academy pass {order['days']} days",
                  "ReturnURL": self.app.origin + "/api/billing/ecpay/notify", "ClientBackURL": self.app.origin + "/#membership", "ChoosePayment": "Credit", "EncryptType": "1", "NeedExtraPaidInfo": "N"}
        fields["CheckMacValue"] = check_mac(fields, self.ecpay_key, self.ecpay_iv)
        return {"action": f"https://{self.ecpay_host()}/Cashier/AioCheckOut/V5", "fields": fields, "orderId": order["id"], "mode": self.mode}

    def ecpay_query(self, order_id):
        if "ecpay" not in self.methods or not ORDER_RE.fullmatch(order_id):
            raise self.error(503, "ECPay order verification is unavailable.")
        fields = {"MerchantID": self.ecpay_merchant, "MerchantTradeNo": order_id, "TimeStamp": str(int(time.time()))}
        fields["CheckMacValue"] = check_mac(fields, self.ecpay_key, self.ecpay_iv)
        request = Request(f"https://{self.ecpay_host()}/Cashier/QueryTradeInfo/V5", data=urlencode(fields).encode(), method="POST", headers={"Content-Type": "application/x-www-form-urlencoded"})
        try:
            with build_opener(NoRedirect()).open(request, timeout=15) as response:
                raw = response.read(32769)
        except (HTTPError, URLError, TimeoutError, OSError):
            raise self.error(503, "ECPay verification is temporarily unavailable; no access granted.") from None
        result = parse_form(raw, self.error)
        signature = result.get("CheckMacValue", "")
        if not re.fullmatch(r"[A-Fa-f0-9]{64}", signature) or not hmac.compare_digest(signature.upper(), check_mac(result, self.ecpay_key, self.ecpay_iv)):
            raise self.error(502, "ECPay verification signature failed.")
        if result.get("MerchantID") != self.ecpay_merchant or result.get("MerchantTradeNo") != order_id:
            raise self.error(502, "ECPay verification identity mismatch.")
        return result

    def ecpay_notify(self, raw, verified_query=None):
        if "ecpay" not in self.methods:
            raise self.error(503, "ECPay notification endpoint is not configured.")
        fields = parse_form(raw, self.error)
        supplied = fields.get("CheckMacValue", "")
        if not re.fullmatch(r"[A-Fa-f0-9]{64}", supplied) or not hmac.compare_digest(supplied.upper(), check_mac(fields, self.ecpay_key, self.ecpay_iv)):
            raise self.error(400, "Invalid payment signature.")
        order_id = fields.get("MerchantTradeNo", "")
        if fields.get("MerchantID") != self.ecpay_merchant or not ORDER_RE.fullmatch(order_id) or not re.fullmatch(r"[1-9][0-9]{0,8}", fields.get("TradeAmt", "")):
            raise self.error(400, "Invalid payment merchant, order or amount.")
        digest = hashlib.sha256(json.dumps(fields, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        with self.app.db() as db:
            stored = db.execute("SELECT * FROM commerce_orders WHERE id=?", (order_id,)).fetchone()
            if not stored or stored["mode"] != self.mode or stored["method"] != "ecpay" or stored["amount_twd"] != int(fields["TradeAmt"]):
                raise self.error(400, "Payment does not match the stored order.")
            if db.execute("SELECT 1 FROM commerce_events WHERE digest=?", (digest,)).fetchone():
                return "1|OK"
        success, simulated = fields.get("RtnCode") == "1", fields.get("SimulatePaid") != "0"
        if success and not simulated and stored["status"] == "pending":
            query = verified_query or self.ecpay_query(order_id)
            if query.get("TradeStatus") != "1" or any(query.get(k) != fields.get(k) for k in ("MerchantID", "MerchantTradeNo", "TradeAmt", "TradeNo")):
                raise self.error(503, "ECPay has not independently confirmed this payment; no access granted.")
        with self.app.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM commerce_orders WHERE id=?", (order_id,)).fetchone()
            if db.execute("SELECT 1 FROM commerce_events WHERE digest=?", (digest,)).fetchone():
                return "1|OK"
            result = "simulated-ignored" if simulated else "paid" if success else "not-paid"
            if success and not simulated:
                trade = fields.get("TradeNo", "")
                if not re.fullmatch(r"[A-Za-z0-9]{1,20}", trade) or not fields.get("PaymentType", "").startswith("Credit"):
                    raise self.error(400, "Invalid trade number or payment method.")
                duplicate = db.execute("SELECT id FROM commerce_orders WHERE provider_ref=? AND id<>?", (trade, row["id"])).fetchone()
                if duplicate:
                    raise self.error(409, "Trade number conflicts with another order.")
                if not self.grant(db, row, "ecpay", provider_ref=trade):
                    result = "already-paid" if row["status"] == "paid" else "revoked-no-grant"
            elif not simulated and row["status"] == "pending":
                db.execute("UPDATE commerce_orders SET last_code=? WHERE id=?", (fields.get("RtnCode", "")[:30], row["id"]))
            db.execute("INSERT INTO commerce_events VALUES(?,?,?,?)", (digest, row["id"], int(time.time()), result))
        return "1|OK"

    # ------------------------------------------------------------------ transfer claims
    def transfer_claim(self, user_id, payload):
        order_id = payload.get("orderId")
        last5 = str(payload.get("last5", "")).strip()
        at = str(payload.get("transferredAt", "")).strip()
        if not isinstance(order_id, str) or not ORDER_RE.fullmatch(order_id):
            raise self.error(400, "Invalid order id.")
        if not re.fullmatch(r"[0-9]{5}", last5):
            raise self.error(400, "Enter the last five digits of the transferring account.")
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}(T[0-9]{2}:[0-9]{2}(:[0-9]{2})?)?", at):
            raise self.error(400, "Enter the transfer time.")
        with self.app.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM commerce_orders WHERE id=? AND user_id=?", (order_id, user_id)).fetchone()
            if not row or row["method"] != "transfer":
                raise self.error(404, "Transfer order not found.")
            if row["status"] == "paid":
                return {"orderId": order_id, "status": "paid"}
            if row["status"] not in ("awaiting-transfer", "claimed"):
                raise self.error(409, "This order can no longer be claimed.")
            db.execute("UPDATE commerce_orders SET status='claimed', claim_last5=?, claim_at=?, claimed_at=? WHERE id=?", (last5, at, int(time.time()), order_id))
        return {"orderId": order_id, "status": "claimed", "message": "Submitted; the operator confirms the transfer before access opens."}

    # ------------------------------------------------------------------ administrator actions (local CLI only)
    def confirm_transfer(self, order_id, reason):
        with self.app.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM commerce_orders WHERE id=?", (order_id,)).fetchone()
            if not row or row["method"] != "transfer":
                raise self.error(404, "Transfer order not found.")
            if row["mode"] != self.mode:
                raise self.error(409, f"Order belongs to billing mode '{row['mode']}', server runs '{self.mode}'.")
            granted = self.grant(db, row, "transfer", provider_ref="transfer:" + order_id, confirmed_by="operator")
            db.execute("INSERT INTO commerce_admin_audit(order_id,action,reason,at) VALUES(?,?,?,?)", (order_id, "confirm-transfer", reason, int(time.time())))
            ent = self.entitlement(row["user_id"], db)
        return {"orderId": order_id, "granted": granted, "entitlement": ent}

    def revoke(self, order_id, reason):
        with self.app.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM commerce_orders WHERE id=?", (order_id,)).fetchone()
            if not row:
                raise self.error(404, "Order not found.")
            db.execute("UPDATE commerce_entitlements SET revoked_at=? WHERE order_id=? AND revoked_at IS NULL", (int(time.time()), order_id))
            db.execute("UPDATE commerce_orders SET status='revoked' WHERE id=?", (order_id,))
            db.execute("INSERT INTO commerce_admin_audit(order_id,action,reason,at) VALUES(?,?,?,?)", (order_id, "revoke", reason, int(time.time())))
        return {"orderId": order_id, "status": "revoked", "note": "Access revoked. Money refunds are issued in the gateway dashboard or by bank transfer, not here."}

    def grant_manual(self, user_id, days, reason):
        if not 1 <= int(days) <= 3660:
            raise self.error(400, "days must be 1–3660.")
        now = int(time.time())
        order_id = "HT" + secrets.token_hex(9).upper()
        with self.app.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM users WHERE id=?", (user_id,)).fetchone():
                raise self.error(404, "User not found.")
            trade_date = datetime.fromtimestamp(now, timezone(timedelta(hours=8))).strftime("%Y/%m/%d %H:%M:%S")
            db.execute("INSERT INTO commerce_orders(id,user_id,plan_id,amount_twd,currency,amount_local,days,mode,method,status,created_at,trade_date,terms_version,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       (order_id, user_id, "manual", 0, "TWD", 0, int(days), self.mode, "manual", "pending", now, trade_date, TERMS_VERSION, "manual-" + secrets.token_hex(8)))
            row = db.execute("SELECT * FROM commerce_orders WHERE id=?", (order_id,)).fetchone()
            self.grant(db, row, "manual", provider_ref="manual:" + order_id, confirmed_by="operator")
            db.execute("INSERT INTO commerce_admin_audit(order_id,action,reason,at) VALUES(?,?,?,?)", (order_id, "grant-manual", reason, now))
            ent = self.entitlement(user_id, db)
        return {"orderId": order_id, "entitlement": ent}

    def reconcile(self, order_id):
        with self.app.db() as db:
            row = db.execute("SELECT * FROM commerce_orders WHERE id=?", (order_id,)).fetchone()
        if not row or row["mode"] != self.mode:
            raise self.error(404, "Order not found in this billing mode.")
        if row["method"] == "stripe":
            if not row["provider_ref"]:
                raise self.error(409, "No Stripe session recorded for this order.")
            _, granted, status = self.stripe_verify_session(row["provider_ref"])
            return {"orderId": order_id, "granted": granted, "status": status}
        if row["method"] == "ecpay":
            query = self.ecpay_query(order_id)
            if query.get("TradeStatus") != "1":
                return {"orderId": order_id, "providerStatus": query.get("TradeStatus"), "granted": False}
            fields = {k: query[k] for k in ("MerchantID", "MerchantTradeNo", "TradeAmt", "TradeNo", "PaymentType") if k in query}
            fields.update({"RtnCode": "1", "SimulatePaid": "0", "PaymentDate": query.get("PaymentDate", "")})
            fields["CheckMacValue"] = check_mac(fields, self.ecpay_key, self.ecpay_iv)
            self.ecpay_notify(urlencode(fields).encode(), verified_query=query)
            with self.app.db() as db:
                status = db.execute("SELECT status FROM commerce_orders WHERE id=?", (order_id,)).fetchone()[0]
            return {"orderId": order_id, "status": status, "granted": status == "paid"}
        raise self.error(409, "Transfer orders are confirmed with the confirm-transfer command.")
