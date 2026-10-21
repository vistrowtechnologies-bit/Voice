"""Admin audit 2026-10-15 fixes and the IP blocklist.

- Suspend locks the workspace out of sessions (not only calls).
- Internal accounts (INTERNAL_ACCOUNT_IDS) are left out of customer numbers.
- Credits in admin lists come from billing, not a flat 1x/1.5x formula.
- Trials and internal accounts raise no low/zero-credit alerts.
- Plan labels come from the account's real commercial state.
- IP blocklist: normalisation, matching, expiry, visitor IPs, middleware.
DB tests run against a throwaway Postgres (TEST_DATABASE_URL)."""
import ast
import asyncio
import datetime
import logging
import os
import pathlib
import types
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TOKEN_API = pathlib.Path(__file__).with_name("token_api.py")
TREE = ast.parse(TOKEN_API.read_text(encoding="utf-8"))


def load(*names, **globs):
    """Exec the named top-level functions/assignments of token_api.py."""
    nodes = []
    for node in TREE.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names:
            node.decorator_list = []
            nodes.append(node)
        elif isinstance(node, ast.Assign) and any(getattr(t, "id", None) in names for t in node.targets):
            nodes.append(node)
    namespace = dict(globs)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(TOKEN_API), "exec"), namespace)
    return namespace


def utc(**delta) -> str:
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(**delta)).strftime("%Y-%m-%d %H:%M:%S")


class NormalizeTests(unittest.TestCase):
    def test_addresses_and_ranges(self):
        import ip_blocklist as ipb

        self.assertEqual(ipb.normalize(" 203.0.113.7 "), "203.0.113.7/32")
        self.assertEqual(ipb.normalize("203.0.113.9/24"), "203.0.113.0/24")
        self.assertEqual(ipb.normalize("2401:4900:1c2a:5b1e::1/64"), "2401:4900:1c2a:5b1e::/64")
        for bad in ("", "hello", "300.1.1.1", "10.0.0.0/8", "2401::/16"):
            with self.assertRaises(ipb.InvalidIp, msg=bad):
                ipb.normalize(bad)


class MiddlewareTests(unittest.TestCase):
    def run_guard(self, path, blocked, method="GET"):
        from starlette.requests import Request
        from starlette.responses import JSONResponse, Response

        ns = load("ip_block_guard", "_IP_BLOCK_EXEMPT_PATHS", "_IP_BLOCK_EXEMPT_PREFIXES", "IP_BLOCKED_MESSAGE",
                  JSONResponse=JSONResponse, Request=Request, logger=logging.getLogger("test"),
                  _client_ip=lambda request: "203.0.113.9",
                  ip_blocklist=types.SimpleNamespace(blocked_by=lambda ip: 5 if blocked else None))
        request = Request({"type": "http", "method": method, "path": path, "query_string": b"", "headers": []})

        async def call_next(_request):
            return Response("ok")

        return asyncio.run(ns["ip_block_guard"](request, call_next))

    def test_blocked_visitor_gets_403_on_public_routes(self):
        for path in ("/token", "/widget/token", "/widget.js", "/auth/signup", "/public/contact", "/agents"):
            response = self.run_guard(path, blocked=True, method="POST")
            self.assertEqual(response.status_code, 403, path)
            self.assertIn(b"ip_blocked", response.body)

    def test_owner_can_always_reach_sign_in_and_admin(self):
        for path in ("/healthz", "/auth/login", "/auth/login/mfa", "/auth/me", "/admin/ip-blocks", "/auth/oauth/google/start"):
            self.assertEqual(self.run_guard(path, blocked=True).status_code, 200, path)

    def test_unblocked_visitor_passes(self):
        self.assertEqual(self.run_guard("/token", blocked=False, method="POST").status_code, 200)

    def test_session_of_suspended_workspace_is_refused(self):
        from starlette.requests import Request
        from starlette.responses import JSONResponse, Response

        def run(status, imp=None):
            session = {"uid": 3, "aid": 9, "sv": 1, "sid": "s", "imp": imp}
            ns = load("require_session", "ACCOUNT_SUSPENDED_MESSAGE",
                      JSONResponse=JSONResponse, Request=Request, os=os, logger=logging.getLogger("test"),
                      _PUBLIC_PATHS=set(), _PUBLIC_PREFIXES=(), _origin_allowed=lambda request: True,
                      _support_admin_still_signed_in=lambda session: True,
                      auth=types.SimpleNamespace(COOKIE_NAME="vv", read_session_token=lambda token: session),
                      calls_db=types.SimpleNamespace(
                          get_user_by_id=lambda uid: {"session_version": 1, "account_status": status},
                          validate_user_session=lambda sid, uid: True))
            request = Request({"type": "http", "method": "GET", "path": "/agents", "query_string": b"",
                               "headers": [(b"cookie", b"vv=x")]})

            async def call_next(_request):
                return Response("ok")

            return asyncio.run(ns["require_session"](request, call_next)).status_code

        self.assertEqual(run("suspended"), 403)
        self.assertEqual(run("active"), 200)
        self.assertEqual(run("suspended", imp=1), 200, "View as still works on a suspended workspace")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class DbTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import admin_db
        import calls_db
        import ip_blocklist

        cls.db, cls.admin, cls.ipb = calls_db, admin_db, ip_blocklist
        calls_db.init_tables()

    def account(self) -> int:
        stamp = os.urandom(4).hex()
        return self.db.create_account_with_owner("R", "R", f"r-{stamp}@example.com", "h", email_verified=True)["account_id"]

    def sql(self, query, params=()):
        conn = self.db._connect()
        with conn:
            cur = conn.execute(query, params)
            row = cur.fetchone() if "RETURNING" in query.upper() else None
        conn.close()
        return row

    def call(self, aid, minutes, model="sarvam/sarvam-105b-conversations", voice="google:chirp3:Aoede", call_type="browser"):
        self.sql("INSERT INTO calls (account_id, room_name, started_at, ended_at, duration_seconds, call_type, model, voice, "
                 "transcript_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]')",
                 (aid, f"room-{os.urandom(4).hex()}", utc(minutes=-5), utc(), int(minutes * 60), call_type, model, voice))

    # ---------------------------------------------------------------- IP blocklist

    def test_block_match_expiry_and_remove(self):
        ipb = self.ipb
        net = f"198.51.{os.urandom(1)[0]}.0/24"
        added = ipb.add_block(net, "time waster", "owner@example.com")
        inside = net.replace(".0/24", ".77")
        self.assertEqual(ipb.blocked_by(inside), added["id"])
        self.assertIsNone(ipb.blocked_by("192.0.2.1"))
        with self.assertRaises(ipb.InvalidIp):
            ipb.add_block(net, "again", "owner@example.com")
        self.assertIsNotNone(ipb.remove_block(added["id"]))
        self.assertIsNone(ipb.blocked_by(inside))

        expired = ipb.add_block(inside, "short", "owner@example.com", expires_days=1)
        self.sql("UPDATE blocked_ips SET expires_at = ? WHERE id = ?", (utc(days=-1), expired["id"]))
        ipb.invalidate_cache()
        self.assertIsNone(ipb.blocked_by(inside), "an expired block no longer applies")
        self.assertFalse(next(b for b in ipb.list_blocks() if b["id"] == expired["id"])["active"])
        ipb.remove_block(expired["id"])

    def test_visitor_ip_recorded_and_purged(self):
        ipb = self.ipb
        room = f"widget-1-{os.urandom(4).hex()}"
        ipb.record_visitor(room, "203.0.113.50", "Mozilla/5.0", "widget")
        ipb.record_visitor(room, "203.0.113.51", "x", "widget")  # first one wins
        seen = ipb.visitor_for_room(room)
        self.assertEqual((seen["ip"], seen["source"]), ("203.0.113.50", "widget"))
        self.assertGreaterEqual(seen["callsFromIp30d"], 1)
        ipb.record_visitor("room-x", "not-an-ip")  # ignored, never raises
        self.assertIsNone(ipb.visitor_for_room("room-x"))
        self.sql("UPDATE visitor_ips SET created_at = ? WHERE room_name = ?", (utc(days=-100), room))
        self.assertGreaterEqual(ipb.purge_old_visitor_ips(), 1)
        self.assertIsNone(ipb.visitor_for_room(room))

    # ---------------------------------------------------------------- admin numbers

    def test_internal_accounts_are_not_customers(self):
        from unittest import mock

        with mock.patch.dict(os.environ):
            os.environ.pop("INTERNAL_ACCOUNT_IDS", None)
            self.assertEqual(self.admin._internal_account_ids(), (1, 2, 3, 4, 5, 6, 8), "production default")
        internal, customer = self.account(), self.account()
        with mock.patch.object(self.admin, "INTERNAL_ACCOUNT_IDS", (internal,)):
            self.assertIn(f"NOT IN ({internal})", self.admin._external("a.id"))
            before = self.admin.platform_overview(30)["kpis"]
            self.call(internal, 3)
            self.call(customer, 3)
            after = self.admin.platform_overview(30)["kpis"]
            self.assertEqual(after["callsWindow"] - before["callsWindow"], 1, "only the customer's call counts")
            self.assertNotIn(internal, {p["accountId"] for p in self.admin.credit_positions()})
            listed = {a["id"]: a for a in self.admin.list_accounts(limit=200)["accounts"]}
            self.assertTrue(listed[internal]["internal"], "still listed, flagged internal")

    def test_admin_credits_match_billing(self):
        aid = self.account()
        self.db.end_trial(aid)
        self.call(aid, 10, model="gemini-live")  # Vistrow Live: 3 credits (standard minutes) per minute
        used = self.db.billing_summary(aid)["creditsUsed"]
        listed = next(a for a in self.admin.list_accounts(search="", limit=200)["accounts"] if a["id"] == aid)
        self.assertEqual(listed["credits_used"], round(used, 1))
        row = next(c for c in self.admin.list_all_calls(account_id=aid)["calls"])
        self.assertAlmostEqual(row["credits"], used, places=1)
        self.assertNotAlmostEqual(row["credits"], 10.0, places=1, msg="not the old flat 1x formula")
        # The admin call page formats credits; call_detail used to omit them
        # and the page crashed on every call.
        self.assertAlmostEqual(self.admin.call_detail(row["id"])["credits"], row["credits"], places=2)

    def test_trials_raise_no_low_credit_alert_and_get_a_trial_label(self):
        trial = self.account()  # signup starts a trial with a small grant
        self.sql("INSERT INTO settings (account_id, key, value) VALUES (?, 'trial_started_at', ?) "
                 "ON CONFLICT (account_id, key) DO NOTHING", (trial, utc()))
        self.sql("INSERT INTO agents (account_id, name, status) VALUES (?, 'A', 'live')", (trial,))
        low_ids = {p["accountId"] for p in self.admin.low_credit_accounts()}
        self.assertNotIn(trial, low_ids)
        positions = {p["accountId"]: p for p in self.admin.credit_positions()}
        self.assertTrue(positions[trial]["onTrial"])
        self.assertFalse(set(positions) & set(self.admin.INTERNAL_ACCOUNT_IDS))
        detail = self.admin.account_detail(trial)["account"]
        self.assertEqual(detail["effective_plan"], "trial")
        self.assertNotIn("consent_ip", detail)
        # accounts.plan is 'starter' for every signup; the trial shows as a trial.
        by_plan = {p["plan"]: p["accounts"] for p in self.admin.billing_overview()["byPlan"]}
        self.assertGreaterEqual(by_plan.get("trial", 0), 1)


if __name__ == "__main__":
    unittest.main()
