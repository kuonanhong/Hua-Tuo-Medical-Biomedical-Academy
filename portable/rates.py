"""Exchange rates for locale-based pricing. Base currency TWD (NT$299 / 30 days, NT$2,490 / 365 days).

Live rates come from the open ExchangeRate API (https://open.er-api.com, no key required) and are
cached on disk for twelve hours. When the network is unavailable the bundled table (captured
2026-10-12) is used, so prices are always shown. Rounding mirrors membership.js in the browser so
the amount the learner sees equals the amount charged.
"""
import json
import math
import os
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE = "TWD"
FALLBACK_DATE = "2026-10-12"
FALLBACK = {
    "TWD": 1, "USD": 0.03129, "EUR": 0.027984, "GBP": 0.02366, "JPY": 4.962885, "KRW": 41.750206, "CNY": 0.2098,
    "HKD": 0.245723, "MOP": 0.253077, "SGD": 0.0401, "MYR": 0.127983, "THB": 1.052449, "VND": 810.794342,
    "IDR": 560.518526, "PHP": 1.96525, "INR": 3.000829, "AUD": 0.044948, "NZD": 0.055955, "CAD": 0.044661,
    "MXN": 0.572799, "BRL": 0.156178, "ARS": 47.429634, "CLP": 30.605636, "COP": 100.174289, "PEN": 0.107575,
    "CHF": 0.026081, "SEK": 0.313408, "NOK": 0.299615, "DKK": 0.209179, "PLN": 0.122757, "CZK": 0.682434,
    "HUF": 10.230779, "RON": 0.149407, "TRY": 1.544998, "RUB": 2.632537, "UAH": 1.408971, "AED": 0.114907,
    "SAR": 0.117332, "QAR": 0.11389, "ILS": 0.096251, "EGP": 1.64866, "ZAR": 0.517978, "NGN": 42.003789,
    "KES": 4.062955, "PKR": 8.670792, "BDT": 3.85752, "LKR": 10.362657, "NPR": 4.80165, "KZT": 14.133103,
    "MNT": 112.83559, "KHR": 127.00562, "LAK": 695.961364, "MMK": 65.73374, "BGN": 0.054809, "RSD": 3.286048,
    "ISK": 3.822242, "GEL": 0.081198, "AMD": 11.339698, "AZN": 0.053243, "UZS": 371.168598, "MAD": 0.304262,
    "TND": 0.094038, "GHS": 0.368696, "ETB": 5.06039, "TZS": 82.628892, "UGX": 128.98468,
}
# Currencies displayed and charged without decimals (same set as membership.js).
ZERO_DECIMAL = {"JPY", "KRW", "VND", "IDR", "CLP", "HUF", "TWD", "ISK", "UGX", "KHR", "LAK", "MMK", "MNT", "COP",
                "PKR", "KZT", "LKR", "NPR", "BDT", "TZS", "KES", "NGN", "RSD", "UZS", "ARS", "PHP", "THB", "INR",
                "RUB", "UAH", "EGP", "AMD", "CZK"}
CACHE_SECONDS = 12 * 3600


def convert(twd, currency, rates):
    """Charm rounding identical to membership.js convert()."""
    rate = rates.get(currency) or 1
    value = twd * rate
    if currency in ZERO_DECIMAL:
        mag = 1000 if value >= 100000 else 100 if value >= 10000 else 10 if value >= 1000 else 1
        return int(math.ceil(value / mag) * mag)
    if value >= 100:
        return int(math.ceil(value))
    half_up = math.ceil(value * 2) / 2 - 0.01
    if value >= 10:
        return math.floor(half_up * 100 + 0.5) / 100 if half_up > 0 else value
    return math.floor(half_up * 100 + 0.5) / 100


class Rates:
    def __init__(self, cache_path, environ=None):
        self.path = Path(cache_path)
        self.env = environ if environ is not None else os.environ
        self.lock = threading.Lock()
        self.table, self.updated, self.source = dict(FALLBACK), FALLBACK_DATE, "bundled"
        self.fetched_at = 0
        self._load_cache()

    def _load_cache(self):
        try:
            if self.path.is_file():
                doc = json.loads(self.path.read_text(encoding="utf-8"))
                table = doc.get("rates")
                if isinstance(table, dict) and table.get("TWD") == 1 and all(isinstance(v, (int, float)) and v > 0 for v in table.values()):
                    self.table = {k: float(v) for k, v in table.items() if k in FALLBACK}
                    self.table["TWD"] = 1
                    self.updated = str(doc.get("updated", self.updated))[:10]
                    self.fetched_at = int(doc.get("fetchedAt", 0))
                    self.source = "cache"
        except (OSError, ValueError, TypeError):
            pass

    def refresh(self, force=False):
        """Fetch live rates when the cache is stale. Failures keep the previous table."""
        if self.env.get("RATES_OFFLINE") == "1":
            return False
        with self.lock:
            if not force and time.time() - self.fetched_at < CACHE_SECONDS:
                return False
            url = self.env.get("RATES_URL", "https://open.er-api.com/v6/latest/TWD")
            try:
                with urlopen(Request(url, headers={"User-Agent": "HuaTuoAcademy/1.0"}), timeout=12) as response:
                    doc = json.loads(response.read(400_000))
                table = doc.get("rates")
                if doc.get("result") != "success" or not isinstance(table, dict) or table.get("TWD") != 1:
                    raise ValueError("unexpected rates document")
                clean = {k: float(table[k]) for k in FALLBACK if isinstance(table.get(k), (int, float)) and table[k] > 0}
                clean["TWD"] = 1
                if len(clean) < 20:
                    raise ValueError("too few currencies")
                self.table = clean
                self.updated = time.strftime("%Y-%m-%d", time.gmtime(int(doc.get("time_last_update_unix", time.time()))))
                self.fetched_at = int(time.time())
                self.source = "live"
                self.path.parent.mkdir(parents=True, exist_ok=True)
                self.path.write_text(json.dumps({"base": BASE, "rates": self.table, "updated": self.updated, "fetchedAt": self.fetched_at}), encoding="utf-8")
                return True
            except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError):
                self.fetched_at = int(time.time()) - CACHE_SECONDS + 900  # retry in 15 minutes
                return False

    def snapshot(self):
        self.refresh()
        return {"base": BASE, "rates": dict(self.table), "ratesUpdated": self.updated, "source": self.source}

    def amount(self, twd, currency):
        currency = (currency or "TWD").upper()
        if currency not in self.table:
            currency = "USD" if "USD" in self.table else "TWD"
        return convert(twd, currency, self.table), currency
