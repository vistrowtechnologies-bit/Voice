"""Admin money views: per-account usage and ESTIMATED vendor cost, revenue by
month, invoice list, and the low-credit rule shared by the overview tile and
the owner alert. Pure functions always run; the rest needs a throwaway
Postgres (TEST_DATABASE_URL) and checks deltas or its own accounts only,
because other tests share the database."""
import ast
import datetime
import os
import pathlib
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


def utc(**delta) -> str:
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(**delta)).strftime("%Y-%m-%d %H:%M:%S")


class PureTests(unittest.TestCase):
    def setUp(self):
        import admin_db
        self.admin = admin_db

    def test_vendor_cost_per_minute_by_engine_and_channel(self):
        rates = {k: v["inrPerMin"] for k, v in self.admin.VENDOR_COST_RATES.items()}
        lk, sip = rates["livekit_session"], rates["enablex_sip"]
        cost = self.admin.vendor_cost_per_minute
        self.assertAlmostEqual(cost("gpt-4.1-mini", "browser"), rates["pipeline"] + lk)
        self.assertAlmostEqual(cost(None, "widget"), rates["pipeline"] + lk)
        self.assertAlmostEqual(cost("sarvam/sarvam-105b-conversations", "phone"), rates["pipeline"] + lk + sip)
        self.assertAlmostEqual(cost("gemini-live", "browser"), rates["realtime_25"] + lk)
        self.assertAlmostEqual(cost("gemini-live:gemini-3.1-flash-live-preview", "phone"), rates["realtime_31"] + lk + sip)

    def test_low_credit_threshold_is_three_days_with_a_floor_of_fifty(self):
        t = self.admin.low_credit_threshold
        self.assertEqual(t(0), 50)
        self.assertEqual(t(10), 50)
        self.assertEqual(t(40), 120)
        self.assertEqual(t(-5), 50)
        low = self.admin.is_low_credit
        self.assertTrue(low(49, 0))
        self.assertFalse(low(50, 0))
        self.assertTrue(low(119, 40))
        self.assertFalse(low(120, 40))
        self.assertFalse(low(0, 40), "zero is the separate zero-balance alert")
        self.assertFalse(low(-3, 40))

    def test_every_admin_route_requires_the_platform_owner(self):
        tree = ast.parse(pathlib.Path(__file__).with_name("token_api.py").read_text())
        checked = 0
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for dec in node.decorator_list:
                if (isinstance(dec, ast.Call) and dec.args and isinstance(dec.args[0], ast.Constant)
                        and str(dec.args[0].value).startswith("/admin/")
                        # Runs on the tenant's support cookie by design; it
                        # checks the session's "imp" claim itself.
                        and dec.args[0].value != "/admin/impersonate/exit"):
                    self.assertIn("require_platform_owner", ast.unparse(node.args), node.name)
                    checked += 1
        self.assertGreater(checked, 30)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class DbTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import admin_db
        import calls_db
        cls.db, cls.admin = calls_db, admin_db
        calls_db.init_tables()

    def sql(self, query, params=()):
        conn = self.db._connect()
        with conn:
            cur = conn.execute(query, params)
            row = cur.fetchone() if "RETURNING" in query.upper() else None
        conn.close()
        return row

    def account(self) -> int:
        stamp = os.urandom(4).hex()
        aid = self.db.create_account_with_owner("F", "F", f"f-{stamp}@example.com", "h", email_verified=True)["account_id"]
        self.db.end_trial(aid)
        return aid

    def call(self, aid, started, duration=60, room=None, **extra):
        cols = {"room_name": room or f"room-{os.urandom(3).hex()}", "started_at": started, "ended_at": started,
                "duration_seconds": duration, "transcript_json": "[]", "account_id": aid, **extra}
        self.sql(f"INSERT INTO calls ({', '.join(cols)}) VALUES ({', '.join('?' for _ in cols)})", tuple(cols.values()))

    def credits(self, aid, total):
        self.sql("INSERT INTO settings (account_id, key, value) VALUES (?, 'credits_total', ?) "
                 "ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value", (aid, str(total)))

    def test_usage_cost_matches_the_tenant_usage_report(self):
        aid = self.account()
        self.call(aid, utc(hours=-2), 600, call_type="browser", model="gpt-4.1-mini", voice="elevenlabs:x")
        self.call(aid, utc(hours=-3), 300, call_type="phone", model="gemini-live:gemini-3.1-flash-live-preview")
        self.call(aid, utc(hours=-4), 120, room="test-agent-abc", call_type="browser")  # test call: cost only
        self.call(aid, utc(days=-40), 600, call_type="browser")  # outside the window
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, gst_inr, status, paid_at) VALUES (?, 'topup', 1180, 180, 'paid', ?)",
                 (aid, utc(days=-1)))
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, gst_inr, status, paid_at, refunded_at) "
                 "VALUES (?, 'topup', 590, 90, 'refunded', ?, ?)", (aid, utc(days=-2), utc(days=-1)))
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status) VALUES (?, 'topup', 999, 'failed')", (aid,))

        data = self.admin.usage_cost(days=30, account_id=aid)
        self.assertTrue(data["costEstimated"])
        [row] = data["accounts"]
        report = self.db.usage_report(aid, data["range"]["from"], data["range"]["to"], "Asia/Kolkata")["totals"]
        self.assertEqual((row["calls"], row["minutes"], row["credits"]), (report["calls"], report["minutes"], report["credits"]))
        self.assertEqual(row["testMinutes"], 2.0)
        self.assertEqual(row["revenueInr"], 1000.0, "ex-GST: 1000 + 500 captured - 500 refunded")
        cost = self.admin.vendor_cost_per_minute
        expected = 10 * cost("gpt-4.1-mini", "browser") + 5 * cost("gemini-live:3.1", "phone") + 2 * cost(None, "browser")
        self.assertAlmostEqual(row["estCostInr"], round(expected, 2), places=2)
        self.assertAlmostEqual(row["marginInr"], round(1000 - expected, 2), places=2)
        self.assertEqual(data["totals"]["calls"], 2)

        everyone = self.admin.usage_cost()
        self.assertIn(aid, {r["id"] for r in everyone["accounts"]})
        # Totals are customers only; internal accounts get their own line.
        customers = [r for r in everyone["accounts"] if not r["internal"]]
        self.assertAlmostEqual(everyone["totals"]["estCostInr"], sum(r["estCostInr"] for r in customers), places=1)
        self.assertAlmostEqual(everyone["internalTotals"]["estCostInr"],
                               sum(r["estCostInr"] for r in everyone["accounts"] if r["internal"]), places=1)
        with self.assertRaises(ValueError):
            self.admin.usage_cost("2026-10-10", "2026-10-01")

    def test_revenue_months_and_invoice_list(self):
        before = self.admin.finance_overview()
        aid = self.account()
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status, paid_at) VALUES (?, 'topup', 1180, 'paid', ?)", (aid, utc()))
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status, paid_at, refunded_at) "
                 "VALUES (?, 'subscription', 2999, 'refunded', ?, ?)", (aid, utc(), utc()))
        failed = self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status) VALUES (?, 'topup', 999, 'failed') RETURNING id", (aid,))
        after = self.admin.finance_overview()
        self.assertEqual(len(after["months"]), 6)
        self.assertEqual(after["revenueMtd"]["month"], after["months"][-1]["month"])
        delta = {k: round(after["revenueMtd"][k] - before["revenueMtd"][k], 2) for k in ("capturedInr", "topupsInr", "refundsInr", "netInr")}
        self.assertEqual(delta, {"capturedInr": 4179.0, "topupsInr": 1180.0, "refundsInr": 2999.0, "netInr": 1180.0})
        self.assertEqual(self.admin.platform_overview(30)["revenueMtd"],
                         {k: after["revenueMtd"][k] for k in ("capturedInr", "topupsInr", "refundsInr", "netInr")})
        self.assertIn(failed["id"], {i["id"] for i in after["failedPayments30d"]})
        self.assertTrue(after["costVsRevenueMtd"]["costEstimated"])

        failed_only = self.admin.list_invoices("failed")
        self.assertTrue(all(i["status"] == "failed" for i in failed_only))
        self.assertIn(failed["id"], {i["id"] for i in failed_only})
        mine = [i for i in self.admin.list_invoices() if i["accountId"] == aid]
        self.assertEqual({i["status"] for i in mine}, {"paid", "refunded", "failed"})
        with self.assertRaises(ValueError):
            self.admin.list_invoices("bogus")

    def test_low_credit_accounts_need_a_live_agent_and_use_their_own_burn(self):
        busy = self.account()  # 60 credits/day for 14 days -> threshold 180
        self.credits(busy, 1000)
        self.sql("INSERT INTO agents (account_id, name, status) VALUES (?, 'A', 'live')", (busy,))
        for day in range(14):
            self.call(busy, utc(days=-day, minutes=-1), 60 * 60)
        # Older usage this month would also count toward "used": keep the
        # total so that 150 remain.
        used = self.db.billing_summary(busy)["creditsUsed"]
        self.credits(busy, int(used) + 150)
        quiet = self.account()  # no use, 40 left: under the 50 floor
        self.credits(quiet, 40)
        self.sql("INSERT INTO agents (account_id, name, status) VALUES (?, 'A', 'live')", (quiet,))
        no_agent = self.account()  # low but nothing live
        self.credits(no_agent, 10)
        self.sql("UPDATE agents SET status = 'draft' WHERE account_id = ?", (no_agent,))
        fine = self.account()
        self.credits(fine, 500)
        self.sql("INSERT INTO agents (account_id, name, status) VALUES (?, 'A', 'live')", (fine,))

        low = {p["accountId"]: p for p in self.admin.low_credit_accounts()}
        self.assertIn(busy, low)
        self.assertAlmostEqual(low[busy]["avgDaily"], 60.0, delta=0.1)
        self.assertAlmostEqual(low[busy]["daysLeft"], 2.5, delta=0.1)
        self.assertIn(quiet, low)
        self.assertIsNone(low[quiet]["daysLeft"])
        self.assertNotIn(no_agent, low)
        self.assertNotIn(fine, low)


if __name__ == "__main__":
    unittest.main()
