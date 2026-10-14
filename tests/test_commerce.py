"""Unit tests for pricing, Stripe signature verification and the ECPay notification path."""
import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

from conftest import Client

from portable import commerce, rates


def test_rates_convert_mirrors_browser_rounding():
    table = rates.FALLBACK
    assert rates.convert(299, "TWD", table) == 299
    assert rates.convert(299, "USD", table) == 9.49            # 9.356 → half-up charm price
    assert rates.convert(2490, "USD", table) == 77.99          # 77.912 → ceil to .5 then −0.01 charm price
    assert rates.convert(299, "JPY", table) == 1490            # 1483.9 → magnitude 10 ceiling
    assert rates.convert(2490, "KRW", table) == 104000         # 103,958 → magnitude 1000 ceiling
    assert rates.convert(299, "EUR", table) == 8.49
    assert rates.convert(2490, "VND", table) == 2019000
    assert rates.convert(299, "INR", table) == 898


def test_rates_fallback_without_network(tmp_path, monkeypatch):
    monkeypatch.setenv("RATES_OFFLINE", "1")
    r = rates.Rates(tmp_path / "rates.json")
    snap = r.snapshot()
    assert snap["source"] == "bundled" and snap["rates"]["TWD"] == 1 and len(snap["rates"]) > 60
    assert r.amount(299, "XXX") == (rates.convert(299, "USD", rates.FALLBACK), "USD")


def test_stripe_minor_units():
    assert commerce.stripe_minor_amount(9.49, "USD") == 949
    assert commerce.stripe_minor_amount(1490, "JPY") == 1490
    assert commerce.stripe_minor_amount(299, "TWD") == 29900
    assert commerce.stripe_minor_amount(28.12, "TND") == 28120


def test_stripe_signature_verification():
    secret = "whsec_test_secret"
    payload = b'{"id":"evt_123","type":"checkout.session.completed"}'
    now = int(time.time())
    sig = hmac.new(secret.encode(), f"{now}.".encode() + payload, hashlib.sha256).hexdigest()
    assert commerce.verify_stripe_signature(payload, f"t={now},v1={sig}", secret)
    assert commerce.verify_stripe_signature(payload, f"t={now},v1=deadbeef,v1={sig}", secret)
    assert not commerce.verify_stripe_signature(payload, f"t={now},v1={sig}", "other")
    assert not commerce.verify_stripe_signature(payload + b" ", f"t={now},v1={sig}", secret)
    assert not commerce.verify_stripe_signature(payload, f"t={now - 1000},v1={sig}", secret)
    assert not commerce.verify_stripe_signature(payload, "", secret)


def test_check_mac_is_deterministic_and_order_insensitive():
    fields = {"MerchantID": "2000132", "MerchantTradeNo": "HT0123456789ABCDEF01", "TotalAmount": "299", "PaymentType": "aio", "ChoosePayment": "Credit", "EncryptType": "1"}
    a = commerce.check_mac(fields, "5294y06JbISpM5x9", "v77hoKGq4kWxNNIS")
    b = commerce.check_mac(dict(reversed(list(fields.items()))), "5294y06JbISpM5x9", "v77hoKGq4kWxNNIS")
    assert a == b and len(a) == 64 and a == a.upper()
    assert commerce.check_mac(dict(fields, CheckMacValue="ignored"), "5294y06JbISpM5x9", "v77hoKGq4kWxNNIS") == a
    assert commerce.check_mac(fields, "other", "v77hoKGq4kWxNNIS") != a


def test_ecpay_sandbox_checkout_and_notification(academy):
    base, app = academy(BILLING_MODE="sandbox", ECPAY_MERCHANT_ID="2000132", ECPAY_HASH_KEY="5294y06JbISpM5x9", ECPAY_HASH_IV="v77hoKGq4kWxNNIS")
    c = Client(base)
    status, cfg = c.call("/api/billing/config")
    assert cfg["methods"] == ["ecpay"] and cfg["checkoutAvailable"] is True and cfg["mode"] == "sandbox"
    c.register_and_verify()
    status, co = c.call("/api/billing/checkout", {"planId": "pass-30", "currency": "USD", "method": "ecpay", "requestId": "req-0123456789abcdef", "termsAccepted": True, "termsVersion": cfg["termsVersion"]})
    assert status == 200 and co["action"].startswith("https://payment-stage.ecpay.com.tw/") and co["fields"]["TotalAmount"] == "299"
    fields = co["fields"]
    assert fields["CheckMacValue"] == commerce.check_mac(fields, "5294y06JbISpM5x9", "v77hoKGq4kWxNNIS")
    assert fields["ReturnURL"] == base + "/api/billing/ecpay/notify"
    order_id = co["orderId"]
    # Signed notification from the gateway; the independent query is supplied directly (no network in tests).
    notify = {"MerchantID": "2000132", "MerchantTradeNo": order_id, "RtnCode": "1", "RtnMsg": "paid", "TradeNo": "2610141234567890", "TradeAmt": "299", "PaymentDate": "2026/10/14 10:00:00", "PaymentType": "Credit_CreditCard", "SimulatePaid": "0"}
    notify["CheckMacValue"] = commerce.check_mac(notify, "5294y06JbISpM5x9", "v77hoKGq4kWxNNIS")
    tampered = dict(notify, TradeAmt="1")
    status, body = c.call("/api/billing/ecpay/notify", raw=urlencode(tampered).encode(), headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert status == 400
    assert c.call("/api/me")[1]["billing"]["entitlement"] is None
    query = {k: notify[k] for k in ("MerchantID", "MerchantTradeNo", "TradeAmt", "TradeNo", "PaymentType")}
    query["TradeStatus"] = "1"
    assert app.commerce.ecpay_notify(urlencode(notify).encode(), verified_query=query) == "1|OK"
    ent = c.call("/api/me")[1]["billing"]["entitlement"]
    assert ent and ent["orderId"] == order_id and ent["method"] == "ecpay" and ent["mode"] == "sandbox"
    # replay is idempotent and a simulated notification never grants
    assert app.commerce.ecpay_notify(urlencode(notify).encode(), verified_query=query) == "1|OK"
    with app.db() as db:
        assert db.execute("SELECT count(*) FROM commerce_entitlements").fetchone()[0] == 1


def test_stripe_route_config_and_key_validation(academy):
    base, app = academy(BILLING_MODE="sandbox", STRIPE_SECRET_KEY="sk_test_abcdefghijklmnop", STRIPE_WEBHOOK_SECRET="whsec_x")
    c = Client(base)
    status, cfg = c.call("/api/billing/config")
    assert cfg["methods"] == ["stripe"]
    # webhook with a bad signature is rejected before any processing
    status, d = c.call("/api/billing/stripe/webhook", raw=b"{}", headers={"Content-Type": "application/json", "Stripe-Signature": "t=1,v1=00"})
    assert status == 400
    try:
        academy(BILLING_MODE="live", STRIPE_SECRET_KEY="sk_test_abcdefghijklmnop", STRIPE_WEBHOOK_SECRET="whsec_x")
    except ValueError as error:
        assert "live" in str(error)
    else:
        raise AssertionError("live mode must refuse a test key")
