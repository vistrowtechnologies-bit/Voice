"""Admin reporting P0: honest MRR / paying / revenue this month, the overview
ops counters, the calls outcome/hours filters, secrets stripped from call
detail, and worker heartbeat status. Against a throwaway Postgres
(TEST_DATABASE_URL); platform-wide numbers are checked as deltas because
other tests share the database."""
import datetime
import json
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


def utc(**delta) -> str:
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(**delta)).strftime("%Y-%m-%d %H:%M:%S")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class AdminReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import admin_db
        import calls_db
        cls.db, cls.admin = calls_db, admin_db
        calls_db.init_tables()

    def account(self, plan="starter") -> int:
        stamp = os.urandom(4).hex()
        aid = self.db.create_account_with_owner("R", "R", f"r-{stamp}@example.com", "h", email_verified=True)["account_id"]
        self.sql("UPDATE accounts SET plan = ? WHERE id = ?", (plan, aid))
        return aid

    def sql(self, query, params=()):
        conn = self.db._connect()
        with conn:
            cur = conn.execute(query, params)
            row = cur.fetchone() if "RETURNING" in query.upper() else None
        conn.close()
        return row

    def call(self, aid, started, duration=60, failure="", disconnect="", **extra) -> int:
        cols = {"room_name": f"room-{os.urandom(3).hex()}", "started_at": started, "ended_at": started,
                "duration_seconds": duration, "transcript_json": "[]", "account_id": aid,
                "failure_reason": failure, "disconnect_reason": disconnect, **extra}
        names = ", ".join(cols)
        return self.sql(f"INSERT INTO calls ({names}) VALUES ({', '.join('?' for _ in cols)}) RETURNING id",
                        tuple(cols.values()))["id"]

    # ------------------------------------------------------------ money

    def test_mrr_and_paying_count_only_subscriptions_and_paid_invoices(self):
        before = self.admin.platform_overview(30)["kpis"]["mrr"]
        paying_before = self.admin.analytics(30)["funnel"][-1]["count"]
        free = self.account("starter")  # a signup: plan label only, never paid
        subscribed = self.account("growth")
        self.sql("INSERT INTO subscriptions (account_id, plan, status) VALUES (?, 'growth', 'active')", (subscribed,))
        topped_up = self.account("starter")
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status, paid_at) VALUES (?, 'topup', 590, 'paid', ?)",
                 (topped_up, utc(days=-3)))
        lapsed = self.account("scale")
        self.sql("INSERT INTO subscriptions (account_id, plan, status) VALUES (?, 'scale', 'cancelled')", (lapsed,))

        self.assertEqual(self.admin.platform_overview(30)["kpis"]["mrr"] - before, 5999)
        self.assertEqual(self.admin.analytics(30)["funnel"][-1]["count"] - paying_before, 2)
        mrr_by_id = {a["id"]: a["mrr"] for a in self.admin.list_accounts(limit=10)["accounts"]}
        self.assertEqual((mrr_by_id[free], mrr_by_id[subscribed], mrr_by_id[topped_up], mrr_by_id[lapsed]), (0, 5999, 0, 0))
        self.assertEqual(self.admin.account_detail(free)["mrr"], 0)
        billing = self.admin.billing_overview()
        self.assertEqual(billing["mrr"], self.admin.analytics(30)["mrr"])
        self.assertEqual(sum(p["mrr"] for p in billing["byPlan"]), billing["mrr"])

    def test_revenue_this_month(self):
        before = self.admin.platform_overview(30)["revenueMtd"]
        aid = self.account()
        now = utc()
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status, paid_at) VALUES (?, 'topup', 1180, 'paid', ?)", (aid, now))
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status, paid_at) VALUES (?, 'subscription', 2999, 'paid', ?)", (aid, now))
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status, paid_at, refunded_at) "
                 "VALUES (?, 'topup', 500, 'refunded', ?, ?)", (aid, now, now))
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status) VALUES (?, 'topup', 999, 'failed')", (aid,))
        self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status, paid_at) VALUES (?, 'topup', 700, 'paid', ?)",
                 (aid, utc(days=-70)))
        after = self.admin.platform_overview(30)["revenueMtd"]
        delta = {k: round(after[k] - before[k], 2) for k in after}
        self.assertEqual(delta, {"capturedInr": 4679.0, "topupsInr": 1680.0, "refundsInr": 500.0, "netInr": 4179.0})

    # ------------------------------------------------------------ ops

    def test_ops_counters(self):
        before = self.admin.platform_overview(30)["ops"]
        aid = self.account()
        self.call(aid, utc(minutes=-10), failure="sip 503")
        self.call(aid, utc(hours=-3), disconnect="sip_trunk_failure")
        self.call(aid, utc(minutes=-5), disconnect="client_initiated")
        self.call(aid, utc(hours=-30), failure="old")
        self.sql("INSERT INTO subscriptions (account_id, plan, status, cancel_at_period_end) VALUES (?, 'starter', 'active', 1)", (aid,))
        new = self.sql("INSERT INTO support_tickets (account_id, subject, detail, status) VALUES (?, 's', 'd', 'open') RETURNING id", (aid,))
        answered = self.sql("INSERT INTO support_tickets (account_id, subject, detail, status) VALUES (?, 's', 'd', 'in_progress') RETURNING id", (aid,))
        self.sql("INSERT INTO support_ticket_messages (ticket_id, account_id, author_type, body) VALUES (?, ?, 'support', 'hi')", (answered["id"], aid))
        self.sql("INSERT INTO support_ticket_messages (ticket_id, account_id, author_type, body) VALUES (?, ?, 'note', 'n')", (answered["id"], aid))
        self.sql("INSERT INTO support_ticket_messages (ticket_id, account_id, author_type, body) VALUES (?, ?, 'support', 'x')", (new["id"], aid))
        self.sql("INSERT INTO support_ticket_messages (ticket_id, account_id, author_type, body) VALUES (?, ?, 'customer', 'y')", (new["id"], aid))
        self.sql("INSERT INTO support_tickets (account_id, subject, detail, status) VALUES (?, 's', 'd', 'resolved')", (aid,))
        self.sql("INSERT INTO integration_deliveries (account_id, key, status) VALUES (?, 'webhook', 'failed')", (aid,))
        self.sql("INSERT INTO integration_deliveries (account_id, key, status, created_at) VALUES (?, 'webhook', 'failed', ?)", (aid, utc(days=-2)))
        self.sql("INSERT INTO integration_deliveries (account_id, key, status) VALUES (?, 'webhook', 'sent')", (aid,))

        low = self.account()
        self.db.end_trial(low)
        self.sql("INSERT INTO settings (account_id, key, value) VALUES (?, 'credits_total', '10') ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value", (low,))
        self.call(low, utc(), duration=9 * 60)  # 9 of 10 credits used
        empty = self.account()
        self.db.end_trial(empty)
        self.sql("INSERT INTO settings (account_id, key, value) VALUES (?, 'credits_total', '5') ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value", (empty,))
        self.call(empty, utc(), duration=10 * 60)
        self.sql("INSERT INTO agents (account_id, name, status) VALUES (?, 'A', 'live')", (empty,))

        after = self.admin.platform_overview(30)["ops"]
        delta = {k: (after[k] - before[k]) if isinstance(after[k], int) else after[k] for k in after}
        self.assertEqual(delta["failedCalls1h"], 1)
        self.assertEqual(delta["failedCalls24h"], 2)
        self.assertIsNone(delta["trialsEnding7d"])
        self.assertEqual(delta["cancellationsPending"], 1)
        self.assertEqual((delta["openTickets"], delta["awaitingUs"]), (2, 1))
        self.assertEqual((delta["creditsLowAccounts"], delta["zeroBalanceLiveAccounts"]), (2, 1))
        self.assertEqual(delta["integrationFailures24h"], 1)
        self.assertEqual(after["workersExpected"], 2)

    def test_recent_signups_show_calls_and_first_call(self):
        aid = self.account()
        self.call(aid, "2026-10-08T18:00:00+00:00")
        self.call(aid, "2026-10-09 18:00:00")
        signup = next(s for s in self.admin.platform_overview(30)["recentSignups"] if s["id"] == aid)
        self.assertEqual((signup["calls"], signup["firstCallAt"]), (2, "2026-10-08T18:00:00+00:00"))
        fresh = self.account()
        signup = next(s for s in self.admin.platform_overview(30)["recentSignups"] if s["id"] == fresh)
        self.assertEqual((signup["calls"], signup["firstCallAt"]), (0, None))

    # ------------------------------------------------------------ calls

    def test_calls_outcome_and_hours_filters(self):
        aid = self.account()
        failed = self.call(aid, utc(minutes=-20), failure="no media")
        dropped = self.call(aid, utc(hours=-5), disconnect="USER_UNAVAILABLE")
        ok = self.call(aid, utc(minutes=-30), disconnect="client_initiated")
        ids = lambda **kw: {c["id"] for c in self.admin.list_all_calls(account_id=aid, **kw)["calls"]}  # noqa: E731
        self.assertEqual(ids(outcome="failed"), {failed, dropped})
        self.assertEqual(ids(outcome="ok"), {ok})
        self.assertEqual(ids(hours=1), {failed, ok})
        self.assertEqual(ids(outcome="failed", hours=1, days=30), {failed}, "hours overrides days")
        row = next(c for c in self.admin.list_all_calls(account_id=aid)["calls"] if c["id"] == failed)
        self.assertEqual((row["failureReason"], row["disconnectReason"]), ("no media", None))
        self.assertTrue(row["startedAtIso"].endswith("Z") and "T" in row["startedAtIso"])
        offset = self.call(aid, "2026-10-08T23:30:00+05:30")
        row = next(c for c in self.admin.list_all_calls(account_id=aid)["calls"] if c["id"] == offset)
        self.assertEqual(row["startedAtIso"], "2026-10-08T18:00:00Z")

    def test_call_detail_has_no_recording_secrets(self):
        aid = self.account()
        with_rec = self.call(aid, utc(), recording_key="recordings/x.wav", recording_share_token="tok-secret")
        detail = self.admin.call_detail(with_rec)
        self.assertNotIn("recording_key", detail)
        self.assertNotIn("recording_share_token", detail)
        self.assertNotIn("tok-secret", json.dumps(detail, default=str))
        self.assertTrue(detail["hasRecording"])
        self.assertFalse(self.admin.call_detail(self.call(aid, utc()))["hasRecording"])

    # ------------------------------------------------------------ workers

    def test_worker_status_ok_stale_unknown(self):
        self.sql("DELETE FROM settings WHERE account_id = 0 AND starts_with(key, 'worker_heartbeat.')")
        seen = datetime.datetime(2026, 10, 11, 13, 20, 5, tzinfo=datetime.timezone.utc)
        self.db.set_setting("worker_heartbeat.tenant", json.dumps(
            {"seenAt": "2026-10-11 13:20:05", "version": "diFo98U8pV2u", "host": "pod-1"}), 0)
        workers = {w["name"]: w for w in self.admin.worker_statuses(now=seen.timestamp() + 41)}
        self.assertEqual(workers["tenant"], {
            "name": "tenant", "agentId": "CA_TGdpVhSdxDyS", "lastSeenAt": "2026-10-11 13:20:05", "ageSeconds": 41,
            "status": "ok", "version": "diFo98U8pV2u", "host": "pod-1"})
        self.assertEqual(workers["platform-demo"]["status"], "unknown")
        self.assertIsNone(workers["platform-demo"]["ageSeconds"])
        self.assertEqual(self.admin.worker_statuses(now=seen.timestamp() + 181)[0]["status"], "stale")
        health = self.admin.system_health()
        self.assertEqual([w["name"] for w in health["workers"]], ["tenant", "platform-demo"])
        self.assertTrue(health["api"]["ok"])
        self.assertIsInstance(health["api"]["dbLatencyMs"], int)
        self.sql("DELETE FROM settings WHERE account_id = 0 AND starts_with(key, 'worker_heartbeat.')")


if __name__ == "__main__":
    unittest.main()
