import http.cookiejar
import json
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    import pytest
except ImportError:  # python3 tests/run_tests.py without pytest
    import _pytest_shim as pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from portable import server as srv  # noqa: E402

PUBLIC = ROOT / "public" / "academy"


class Client:
    """Minimal cookie-aware JSON client bound to a running test server."""

    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, path, body=None, method=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        hdrs = {"Origin": self.base}
        if raw is None and data is not None:
            hdrs["Content-Type"] = "application/json"
        hdrs.update(headers or {})
        request = urllib.request.Request(self.base + path, data=data, method=method or ("POST" if data is not None else "GET"), headers=hdrs)
        try:
            with self.opener.open(request, timeout=30) as response:
                payload = response.read()
                ctype = response.headers.get("Content-Type", "")
                return response.status, (json.loads(payload) if "json" in ctype else payload)
        except urllib.error.HTTPError as error:
            payload = error.read()
            try:
                return error.code, json.loads(payload)
            except ValueError:
                return error.code, payload

    def register_and_verify(self, username="apprentice", email="a@example.com", phone="+886912345678", password="Secret12345"):
        status, d = self.call("/api/register", {"username": username, "password": password, "email": email, "phone": phone, "language": "zh-TW"})
        assert status == 200, d
        status, v = self.call("/api/verify", {"pendingId": d["pendingId"], "emailCode": d["devCodes"]["email"], "smsCode": d["devCodes"]["sms"]})
        assert status == 200, v
        return v


@pytest.fixture
def academy(tmp_path, monkeypatch):
    """Start the portable server on an ephemeral loopback port with a temporary database."""
    def factory(**env):
        for key in list(os.environ):
            if key.startswith(("BILLING_", "STRIPE_", "ECPAY_", "AI_", "OLLAMA_", "OPENAI_", "ANTHROPIC_", "GEMINI_", "SMTP_", "SMS_", "VERIFY_", "PAYOUT_", "RATES_")):
                monkeypatch.delenv(key, raising=False)
        monkeypatch.setenv("RATES_OFFLINE", "1")
        for key, value in env.items():
            monkeypatch.setenv(key, value)
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)
        httpd.daemon_threads = True
        origin = f"http://127.0.0.1:{httpd.server_address[1]}"
        httpd.app = srv.Application(tmp_path / "data" / "test.sqlite3", PUBLIC, origin)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        factory.servers.append(httpd)
        return origin, httpd.app
    factory.servers = []
    yield factory
    for httpd in factory.servers:
        httpd.shutdown()
        httpd.server_close()


class MockAIHandler(BaseHTTPRequestHandler):
    """OpenAI-compatible chat endpoint that echoes a deterministic answer (used for llama.cpp/Ollama/OpenAI routes)."""
    received = []

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))
        MockAIHandler.received.append((self.path, self.headers.get("Authorization", ""), body))
        user = body["messages"][-1]["content"]
        if body.get("response_format", {}).get("type") == "json_object":
            texts = json.loads(user.split("Question: ")[-1] if "Question: " in user else user)["texts"]
            content = json.dumps({"translations": ["[" + body["messages"][0]["content"][:0] + "ja] " + t for t in texts]})
        else:
            content = "MOCK ANSWER about: " + user[-80:]
        data = json.dumps({"choices": [{"message": {"role": "assistant", "content": content}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


@pytest.fixture
def mock_ai():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), MockAIHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    MockAIHandler.received.clear()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/v1"
    httpd.shutdown()
    httpd.server_close()
