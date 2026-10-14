"""One-time verification codes for e-mail and mobile numbers. Standard library only.

Registration needs four fields (username, password, e-mail, mobile). The server e-mails a
6-digit code through SMTP and sends a second code by SMS through one of three transports:

  SMS_PROVIDER=twilio   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM
  SMS_PROVIDER=mitake   MITAKE_USERNAME / MITAKE_PASSWORD           (三竹簡訊, Taiwan)
  SMS_PROVIDER=webhook  SMS_WEBHOOK_URL (+ optional SMS_WEBHOOK_TOKEN) → POST JSON {"to","text"}

Codes are stored hashed (HMAC-SHA256 with the server secret) and expire after ten minutes.
When no transport is configured and the site runs on loopback, VERIFY_MODE=dev returns the
codes to the browser so the whole flow can be exercised on a developer machine. A public
HTTPS deployment refuses dev mode.
"""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

CODE_DIGITS = 6
CODE_LIFETIME = 600
MAX_ATTEMPTS = 5


def new_code():
    return "".join(secrets.choice("0123456789") for _ in range(CODE_DIGITS))


def code_hash(secret, pending_id, kind, code):
    return hmac.new(secret.encode("utf-8"), f"{pending_id}:{kind}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()


def code_matches(secret, pending_id, kind, code, stored):
    if not isinstance(code, str) or not re.fullmatch(r"[0-9]{%d}" % CODE_DIGITS, code):
        return False
    return hmac.compare_digest(code_hash(secret, pending_id, kind, code), stored)


class Transports:
    """Knows which channels are configured; never logs recipients or codes."""

    def __init__(self, environ=None):
        self.env = environ if environ is not None else os.environ

    # ---- e-mail
    @property
    def email_configured(self):
        return bool(self.env.get("SMTP_HOST") and self.env.get("SMTP_FROM"))

    def send_email(self, to, subject, body):
        host = self.env["SMTP_HOST"]
        port = int(self.env.get("SMTP_PORT", "587"))
        user, password = self.env.get("SMTP_USER", ""), self.env.get("SMTP_PASSWORD", "")
        sender = self.env["SMTP_FROM"]
        message = EmailMessage()
        message["From"] = formataddr((self.env.get("SMTP_FROM_NAME", "Hua Tuo Medical Academy"), sender))
        message["To"] = to
        message["Subject"] = subject
        message.set_content(body)
        mode = self.env.get("SMTP_SECURITY", "starttls").lower()
        context = ssl.create_default_context()
        if mode == "ssl":
            with smtplib.SMTP_SSL(host, port, timeout=20, context=context) as smtp:
                if user:
                    smtp.login(user, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=20) as smtp:
                smtp.ehlo()
                if mode != "none":
                    smtp.starttls(context=context)
                    smtp.ehlo()
                if user:
                    smtp.login(user, password)
                smtp.send_message(message)

    # ---- SMS
    @property
    def sms_provider(self):
        provider = self.env.get("SMS_PROVIDER", "").lower()
        if provider == "twilio" and all(self.env.get(k) for k in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM")):
            return "twilio"
        if provider == "mitake" and all(self.env.get(k) for k in ("MITAKE_USERNAME", "MITAKE_PASSWORD")):
            return "mitake"
        if provider == "webhook" and self.env.get("SMS_WEBHOOK_URL", "").startswith("https://"):
            return "webhook"
        return ""

    @property
    def sms_configured(self):
        return bool(self.sms_provider)

    def send_sms(self, to, text):
        provider = self.sms_provider
        if provider == "twilio":
            sid = self.env["TWILIO_ACCOUNT_SID"]
            auth = base64.b64encode(f"{sid}:{self.env['TWILIO_AUTH_TOKEN']}".encode()).decode()
            data = urlencode({"To": to, "From": self.env["TWILIO_FROM"], "Body": text}).encode()
            request = Request(f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", data=data, method="POST",
                              headers={"Authorization": "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded"})
        elif provider == "mitake":
            # Mitake SmSend API (Taiwan). Big5/UTF-8 endpoint with CharsetURL=UTF-8.
            data = urlencode({"username": self.env["MITAKE_USERNAME"], "password": self.env["MITAKE_PASSWORD"], "dstaddr": to.lstrip("+"), "smbody": text, "CharsetURL": "UTF-8"}).encode()
            request = Request(self.env.get("MITAKE_URL", "https://smsapi.mitake.com.tw/api/mtk/SmSend"), data=data, method="POST",
                              headers={"Content-Type": "application/x-www-form-urlencoded"})
        else:
            url = self.env["SMS_WEBHOOK_URL"]
            if urlsplit(url).scheme != "https":
                raise RuntimeError("SMS webhook must use HTTPS.")
            headers = {"Content-Type": "application/json"}
            if self.env.get("SMS_WEBHOOK_TOKEN"):
                headers["Authorization"] = "Bearer " + self.env["SMS_WEBHOOK_TOKEN"]
            request = Request(url, data=json.dumps({"to": to, "text": text}).encode(), method="POST", headers=headers)
        try:
            with urlopen(request, timeout=20) as response:
                response.read(4096)
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            raise RuntimeError("SMS provider rejected the request.") from error


def messages(language, email_code, sms_code, site_name):
    zh = str(language or "").lower().startswith("zh")
    if zh:
        subject = f"{site_name} 註冊驗證碼"
        email_body = (f"您好，\n\n您的 {site_name} 信箱驗證碼為：{email_code}\n十分鐘內有效。若非本人操作，請忽略本信。\n\n"
                      "本站提供醫學教育資訊，不能取代個別診斷與治療。")
        sms_text = f"{site_name} 手機驗證碼：{sms_code}（10 分鐘內有效）"
    else:
        subject = f"{site_name} registration code"
        email_body = (f"Hello,\n\nYour {site_name} e-mail verification code is: {email_code}\nIt is valid for ten minutes. "
                      "If you did not request it, ignore this message.\n\nThis site provides medical education and does not replace individual diagnosis or treatment.")
        sms_text = f"{site_name} mobile verification code: {sms_code} (valid 10 minutes)"
    return subject, email_body, sms_text
