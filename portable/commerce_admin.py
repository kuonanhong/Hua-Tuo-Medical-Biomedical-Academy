#!/usr/bin/env python3
"""Operator commands for the learning-pass commerce. Local CLI only – there is no admin HTTP route.

  python3 -m portable.commerce_admin status
  python3 -m portable.commerce_admin orders [--limit 20] [--status claimed]
  python3 -m portable.commerce_admin confirm-transfer HT0123... --reason "郵局 10/14 入帳 NT$299 末五碼 12345"
  python3 -m portable.commerce_admin reconcile HT0123...          # re-query Stripe / ECPay for a missed callback
  python3 -m portable.commerce_admin revoke HT0123... --reason "退款"
  python3 -m portable.commerce_admin grant USERNAME --days 30 --reason "獎學金"
  python3 -m portable.commerce_admin users
  python3 -m portable.commerce_admin rates [--refresh]
"""
import argparse
import json
import os
import sys
from pathlib import Path

try:
    from .server import ApiError, Application, read_dotenv
except ImportError:  # executed as a script
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from server import ApiError, Application, read_dotenv


def main(argv=None):
    root = Path(__file__).resolve().parent.parent
    read_dotenv(root / ".env")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--database", type=Path, default=Path(os.environ.get("HT_DATABASE", str(root / "portable/data/huatuo.sqlite3"))))
    parser.add_argument("--public", type=Path, default=root / "public/academy")
    parser.add_argument("--origin", default=os.environ.get("SITE_ORIGIN", "http://127.0.0.1:8020"))
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status", help="Capabilities and billing configuration (never credentials)")
    orders = commands.add_parser("orders", help="Recent orders")
    orders.add_argument("--limit", type=int, default=20)
    orders.add_argument("--status", default="")
    confirm = commands.add_parser("confirm-transfer", help="Confirm a post-office transfer claim and open access")
    confirm.add_argument("order_id")
    confirm.add_argument("--reason", required=True, help="e.g. bank statement line, amount and last five digits")
    reconcile = commands.add_parser("reconcile", help="Query the gateway to recover a missed payment notification")
    reconcile.add_argument("order_id")
    revoke = commands.add_parser("revoke", help="Revoke access (does not refund money)")
    revoke.add_argument("order_id")
    revoke.add_argument("--reason", required=True)
    grant = commands.add_parser("grant", help="Grant a manual pass to a username")
    grant.add_argument("username")
    grant.add_argument("--days", type=int, required=True)
    grant.add_argument("--reason", required=True)
    commands.add_parser("users", help="Account counts (no personal data)")
    rates = commands.add_parser("rates", help="Show cached exchange rates")
    rates.add_argument("--refresh", action="store_true")
    args = parser.parse_args(argv)
    if not args.database.is_file():
        parser.error("Database does not exist yet; start the server once (bash run-local.sh).")
    try:
        app = Application(args.database, args.public, args.origin)
        commerce = app.commerce
        if args.command == "status":
            result = app.capabilities()
            result["billing"].update({"reason": commerce.reason, "termsVersion": commerce.config()["termsVersion"], "transfer": commerce.transfer})
        elif args.command == "orders":
            if not 1 <= args.limit <= 500:
                parser.error("--limit must be 1–500.")
            with app.db() as db:
                sql = "SELECT o.id, u.username, o.plan_id, o.amount_twd, o.currency, o.amount_local, o.days, o.mode, o.method, o.status, o.created_at, o.paid_at, o.claim_last5, o.claim_at FROM commerce_orders o JOIN users u ON u.id=o.user_id"
                params = []
                if args.status:
                    sql += " WHERE o.status=?"
                    params.append(args.status)
                sql += " ORDER BY o.created_at DESC LIMIT ?"
                params.append(args.limit)
                result = [dict(row) for row in db.execute(sql, params)]
        elif args.command == "confirm-transfer":
            result = commerce.confirm_transfer(args.order_id, args.reason)
        elif args.command == "reconcile":
            result = commerce.reconcile(args.order_id)
        elif args.command == "revoke":
            result = commerce.revoke(args.order_id, args.reason)
        elif args.command == "grant":
            with app.db() as db:
                row = db.execute("SELECT id FROM users WHERE username_cf=?", (args.username.casefold(),)).fetchone()
            if not row:
                parser.error("Unknown username.")
            result = commerce.grant_manual(row["id"], args.days, args.reason)
        elif args.command == "users":
            with app.db() as db:
                total = db.execute("SELECT count(*) FROM users").fetchone()[0]
                verified = db.execute("SELECT count(*) FROM users WHERE email_verified=1 AND phone_verified=1").fetchone()[0]
                active = db.execute("SELECT count(DISTINCT user_id) FROM commerce_entitlements WHERE revoked_at IS NULL AND expires_at>strftime('%s','now')").fetchone()[0]
                pending = db.execute("SELECT count(*) FROM pending_registrations WHERE expires_at>strftime('%s','now')").fetchone()[0]
            result = {"users": total, "fullyVerified": verified, "activePasses": active, "pendingRegistrations": pending}
        else:
            if args.refresh:
                commerce.rates.refresh(force=True)
            result = commerce.rates.snapshot()
    except (ApiError, ValueError) as error:
        parser.exit(1, (error.message if isinstance(error, ApiError) else str(error)) + "\n")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
