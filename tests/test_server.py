"""End-to-end tests for portable/server.py: accounts, progress, paywall, static files, AI routes."""
import json
import subprocess
import sys
import time

from conftest import Client, MockAIHandler, ROOT


def test_static_and_api_discovery(academy):
    base, app = academy(BILLING_MODE="transfer")
    c = Client(base)
    status, page = c.call("/")
    assert status == 200 and b"<title>" in page and b"bootstrap.js" in page
    assert c.call("/data/catalog.json")[0] == 200
    assert c.call("/public/academy/style.css")[0] == 200
    assert c.call("/manifest.webmanifest")[0] == 200
    assert c.call("/../portable/server.py")[0] == 404
    assert c.call("/%2e%2e/portable/server.py")[0] == 404
    status, me = c.call("/api/me")
    assert status == 200 and me["user"] is None and me["authMode"] == "server"
    status, cfg = c.call("/api/config")
    assert cfg["verification"] == "dev" and cfg["billing"]["paywall"] is True


def test_registration_requires_four_fields_and_both_codes(academy):
    base, _ = academy(BILLING_MODE="transfer")
    c = Client(base)
    assert c.call("/api/register", {"username": "abc", "password": "Secret12345", "email": "a@example.com", "phone": "+886912345678"})[0] == 400
    assert c.call("/api/register", {"username": "apprentice", "password": "short", "email": "a@example.com", "phone": "+886912345678"})[0] == 400
    assert c.call("/api/register", {"username": "apprentice", "password": "Secret12345", "email": "not-an-email", "phone": "+886912345678"})[0] == 400
    assert c.call("/api/register", {"username": "apprentice", "password": "Secret12345", "email": "a@example.com", "phone": "12"})[0] == 400
    status, d = c.call("/api/register", {"username": "apprentice", "password": "Secret12345", "email": "a@example.com", "phone": "+886912345678"})
    assert status == 200 and set(d["devCodes"]) == {"email", "sms"}
    assert c.call("/api/verify", {"pendingId": d["pendingId"], "emailCode": d["devCodes"]["email"], "smsCode": "000000"})[0] == 400
    assert c.call("/api/verify", {"pendingId": d["pendingId"], "emailCode": "000000", "smsCode": d["devCodes"]["sms"]})[0] == 400
    status, v = c.call("/api/verify", {"pendingId": d["pendingId"], "emailCode": d["devCodes"]["email"], "smsCode": d["devCodes"]["sms"]})
    assert status == 200 and v["user"]["username"] == "apprentice" and v["user"]["emailVerified"] and v["user"]["phoneVerified"]
    assert c.call("/api/me")[1]["user"]["email"] == "a@example.com"
    # duplicates are refused for username, e-mail and phone
    assert c.call("/api/register", {"username": "APPRENTICE", "password": "Secret12345", "email": "b@example.com", "phone": "+886900000000"})[0] == 409
    assert c.call("/api/register", {"username": "other", "password": "Secret12345", "email": "a@example.com", "phone": "+886900000000"})[0] == 409
    assert c.call("/api/register", {"username": "other", "password": "Secret12345", "email": "b@example.com", "phone": "+886912345678"})[0] == 409
    # logout, login by e-mail and by username
    assert c.call("/api/logout", {})[0] == 200
    assert c.call("/api/me")[1]["user"] is None
    assert c.call("/api/login", {"login": "a@example.com", "password": "wrong-password1"})[0] == 401
    assert c.call("/api/login", {"login": "a@example.com", "password": "Secret12345"})[0] == 200
    assert c.call("/api/login", {"login": "apprentice", "password": "Secret12345"})[0] == 200


def test_progress_roundtrip(academy):
    base, _ = academy(BILLING_MODE="disabled")
    c = Client(base)
    assert c.call("/api/progress")[0] == 401
    c.register_and_verify()
    status, saved = c.call("/api/progress", {"courseId": "cardiology-pci", "completed": ["cardiology-pci-s1-1", "cardiology-pci-s1-2"], "notes": "note"}, "PUT")
    assert status == 200 and saved["updatedAt"] > 0
    assert c.call("/api/progress", {"courseId": "../x", "completed": []}, "PUT")[0] == 400
    status, got = c.call("/api/progress")
    assert got["courses"]["cardiology-pci"]["completed"] == ["cardiology-pci-s1-1", "cardiology-pci-s1-2"]
    # disabled billing = owner edition: an entitlement is always present
    assert c.call("/api/me")[1]["billing"]["entitlement"]["orderId"] == "owner-edition"


def test_transfer_paywall_flow_and_operator_confirmation(academy, tmp_path):
    base, app = academy(BILLING_MODE="transfer")
    c = Client(base)
    assert c.call("/api/billing/checkout", {"planId": "pass-30"})[0] == 401
    c.register_and_verify()
    status, cfg = c.call("/api/billing/config")
    assert status == 200 and cfg["mode"] == "transfer" and cfg["methods"] == [] and cfg["transfer"]["branchNo"] == "0101034" and cfg["transfer"]["accountNo"] == "0187821"
    assert cfg["plans"][0]["amountTwd"] == 299 and cfg["plans"][1]["amountTwd"] == 2490 and cfg["rates"]["TWD"] == 1
    assert c.call("/api/me")[1]["billing"]["entitlement"] is None
    body = {"planId": "pass-30", "currency": "JPY", "method": "transfer", "requestId": "req-0123456789abcdef", "termsAccepted": True, "termsVersion": cfg["termsVersion"]}
    assert c.call("/api/billing/checkout", dict(body, termsAccepted=False))[0] == 400
    assert c.call("/api/billing/checkout", dict(body, method="stripe"))[0] == 503
    status, co = c.call("/api/billing/checkout", body)
    assert status == 200 and co["transfer"]["amount"] == 299 and co["transfer"]["currencyLocal"] == "JPY" and co["transfer"]["amountLocal"] == 1490
    order_id = co["transfer"]["orderId"]
    # the same requestId is idempotent
    assert c.call("/api/billing/checkout", body)[1]["transfer"]["orderId"] == order_id
    assert c.call("/api/billing/transfer/claim", {"orderId": order_id, "last5": "12", "transferredAt": "2026-10-14T10:30"})[0] == 400
    status, claim = c.call("/api/billing/transfer/claim", {"orderId": order_id, "last5": "12345", "transferredAt": "2026-10-14T10:30"})
    assert status == 200 and claim["status"] == "claimed"
    assert c.call("/api/me")[1]["billing"]["entitlement"] is None
    # operator confirms with the CLI against the same database
    out = subprocess.run([sys.executable, "-m", "portable.commerce_admin", "--database", str(app.database), "--origin", base, "confirm-transfer", order_id, "--reason", "statement 10/14"],
                         capture_output=True, text=True, cwd=ROOT, env={"BILLING_MODE": "transfer", "RATES_OFFLINE": "1", "PATH": "/usr/bin:/bin"})
    assert out.returncode == 0, out.stderr
    result = json.loads(out.stdout)
    assert result["granted"] is True and result["entitlement"]["expiresAt"] - result["entitlement"]["startsAt"] == 30 * 86400
    ent = c.call("/api/me")[1]["billing"]["entitlement"]
    assert ent and ent["orderId"] == order_id and ent["method"] == "transfer"
    # a second pass stacks after the first expiry
    status, co2 = c.call("/api/billing/checkout", dict(body, planId="pass-365", requestId="req-0123456789abcdeg"))
    out = subprocess.run([sys.executable, "-m", "portable.commerce_admin", "--database", str(app.database), "--origin", base, "confirm-transfer", co2["transfer"]["orderId"], "--reason", "x"],
                         capture_output=True, text=True, cwd=ROOT, env={"BILLING_MODE": "transfer", "RATES_OFFLINE": "1", "PATH": "/usr/bin:/bin"})
    ent2 = json.loads(out.stdout)["entitlement"]
    assert ent2["expiresAt"] >= ent["expiresAt"] + 365 * 86400 - 5
    status, account = c.call("/api/billing/account")
    assert status == 200 and len(account["orders"]) == 2 and {o["status"] for o in account["orders"]} == {"paid"}
    # revoke removes access
    out = subprocess.run([sys.executable, "-m", "portable.commerce_admin", "--database", str(app.database), "--origin", base, "revoke", co2["transfer"]["orderId"], "--reason", "refund"],
                         capture_output=True, text=True, cwd=ROOT, env={"BILLING_MODE": "transfer", "RATES_OFFLINE": "1", "PATH": "/usr/bin:/bin"})
    assert json.loads(out.stdout)["status"] == "revoked"
    assert c.call("/api/me")[1]["billing"]["entitlement"]["orderId"] == order_id


def test_tutor_without_ai_returns_curriculum_summary(academy):
    base, _ = academy(BILLING_MODE="transfer")
    c = Client(base)
    assert c.call("/api/tutor", {"question": "LI4"})[0] == 401
    c.register_and_verify()
    status, d = c.call("/api/tutor", {"question": "合谷 LI4 定位與主治", "language": "zh-TW"})
    assert status == 200 and d["generated"] is False and "curriculum:acu-li4" in [r["source"] for r in d["references"]]
    assert "合谷" in d["answer"]
    status, d = c.call("/api/tutor", {"question": "coronary artery bypass grafting steps", "language": "en"})
    assert status == 200 and any("cabg" in r["source"] for r in d["references"])


def test_tutor_and_translate_with_openai_compatible_route(academy, mock_ai):
    base, _ = academy(BILLING_MODE="disabled", AI_BASE_URL=mock_ai, AI_API_KEY="test-key-123", AI_MODEL="mock-model")
    c = Client(base)
    status, me = c.call("/api/me")
    assert me["aiAvailable"] is True and me["aiRoutes"][0]["id"] == "default" and me["aiRoutes"][0]["cloud"] is False
    c.register_and_verify()
    status, d = c.call("/api/tutor", {"question": "What is deep brain stimulation used for?", "context": "Course: DBS", "language": "en", "route": "default", "history": [{"role": "user", "text": "hi"}, {"role": "ai", "text": "hello"}]})
    assert status == 200 and d["generated"] is True and d["answer"].startswith("MOCK ANSWER") and d["model"] == "mock-model"
    path, auth, body = MockAIHandler.received[-1]
    assert path == "/v1/chat/completions" and auth == "Bearer test-key-123"
    assert body["messages"][0]["role"] == "system" and "師傅" in body["messages"][0]["content"]
    assert "Current course" in body["messages"][-1]["content"] and "Curriculum" in body["messages"][-1]["content"]
    assert any(r["source"].startswith("curriculum:neurosurgery-dbs") for r in d["references"])
    status, t = c.call("/api/translate", {"language": "ja", "texts": ["Deep brain stimulation", "Acupuncture"]})
    assert status == 200 and len(t["translations"]) == 2 and t["translations"][0].endswith("Deep brain stimulation")
    assert c.call("/api/translate", {"language": "ja", "texts": []})[0] == 400


def test_cloud_route_requires_consent(academy, monkeypatch):
    base, _ = academy(BILLING_MODE="disabled", OPENAI_API_KEY="sk-test", OPENAI_MODEL="gpt-4.1-mini")
    c = Client(base)
    assert c.call("/api/me")[1]["aiRoutes"][0]["cloud"] is True
    c.register_and_verify()
    status, d = c.call("/api/tutor", {"question": "hello", "route": "openai"})
    assert status == 400 and "Consent" in d["error"]


def test_same_origin_and_host_protection(academy):
    base, _ = academy(BILLING_MODE="transfer")
    c = Client(base)
    status, d = c.call("/api/login", {"login": "x", "password": "y"}, headers={"Origin": "https://evil.example"})
    assert status == 403
    status, d = c.call("/api/me", headers={"Host": "evil.example"})
    assert status == 403
    status, d = c.call("/api/login", raw=b"login=x", headers={"Content-Type": "application/x-www-form-urlencoded"})
    assert status == 415


def test_login_rate_limit(academy):
    base, _ = academy(BILLING_MODE="transfer")
    c = Client(base)
    codes = [c.call("/api/login", {"login": "nobody", "password": "wrong-password1"})[0] for _ in range(14)]
    assert 429 in codes and codes[0] == 401
