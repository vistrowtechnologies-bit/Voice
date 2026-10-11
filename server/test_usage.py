"""Usage page backend: the report prices calls with the same formula as
billing_summary, stays inside one account, clamps the range, cuts days in the
caller's timezone, and exports CSV. Runs against a real Postgres
(TEST_DATABASE_URL), since the point is the SQL and the day boundaries."""
import datetime
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class UsageReport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("A", "A", f"ua-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.b = calls_db.create_account_with_owner("B", "B", f"ub-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        with conn:
            cls.agent = conn.execute(
                "UPDATE agents SET name = 'Riya' WHERE id = (SELECT MIN(id) FROM agents WHERE account_id = ?) RETURNING id",
                (cls.a,),
            ).fetchone()["id"]
        conn.close()
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        # A fixed cycle start well inside the range, so "this cycle" and the
        # report window both contain every seeded call.
        calls_db.set_setting(calls_db.TRIAL_STARTED_SETTING, (now_utc - datetime.timedelta(days=10)).strftime("%Y-%m-%d %H:%M:%S"), cls.a)
        # Day D = three local days ago. 23:30 IST on D and 00:30 IST on D+1
        # are 18:00Z and 19:00Z on D: both fall on D in UTC, only the first
        # falls on D in IST.
        cls.day_d = (now_utc.astimezone(IST) - datetime.timedelta(days=3)).date()
        late_d = datetime.datetime.combine(cls.day_d, datetime.time(23, 30), tzinfo=IST)
        early_d1 = late_d + datetime.timedelta(hours=1)
        cls.seed(cls.a, "phone-1", late_d, 120, "phone", "elevenlabs:x", "gpt-4.1-mini", "inbound", "Asha", "+919999900001")
        cls.seed(cls.a, "widget-2", early_d1, 60, "widget", None, None, None, None, None)
        cls.seed(cls.a, "test-agent-3", early_d1, 6000, "browser", None, None, None, None, None)  # dashboard test, not billed
        cls.seed(cls.b, "phone-4", late_d, 300, "phone", None, None, "outbound", "Other", "+919999900002")

    @classmethod
    def seed(cls, account, room, started, seconds, call_type, voice, model, direction, name, phone):
        conn = cls.db._connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO calls (account_id, room_name, visitor_identity, started_at, ended_at, duration_seconds, "
                    "transcript_json, call_type, agent_id, voice, model, direction, lead_name, lead_phone) "
                    "VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?)",
                    (account, room, "v", started.astimezone(datetime.timezone.utc).isoformat(),
                     (started + datetime.timedelta(seconds=seconds)).astimezone(datetime.timezone.utc).isoformat(),
                     seconds, call_type, cls.agent if account == cls.a else None, voice, model, direction, name, phone),
                )
        finally:
            conn.close()

    def report(self, account=None, **kw):
        kw.setdefault("timezone_name", "Asia/Kolkata")
        return self.db.usage_report(account or self.a, kw.get("from_date"), kw.get("to_date"), kw["timezone_name"])

    def test_cycle_totals_match_billing_summary(self):
        r = self.report()
        r = self.report(from_date=r["cycle"]["start"])
        billing = self.db.billing_summary(self.a)
        self.assertEqual(r["totals"]["credits"], billing["creditsUsed"])
        self.assertEqual(r["balance"]["creditsUsedCycle"], billing["creditsUsed"])
        self.assertEqual(r["balance"]["creditsRemaining"], billing["creditsRemaining"])
        self.assertEqual(r["totals"]["calls"], 2, "the dashboard test call is not billed")
        # 2 min phone premium voice x premium model (1 x 2 x 2) + 1 min widget
        # standard, plus the 100-minute dashboard test: 70 min past the free 30.
        self.assertEqual(r["totals"]["credits"], 79.0)
        self.assertEqual(r["totals"]["testOverageCredits"], 70.0)
        self.assertEqual(r["totals"]["minutes"], 3.0)
        self.assertEqual(r["totals"]["avgCreditsPerMinute"], 3.0)
        self.assertEqual(r["topCalls"][0]["agentName"], "Riya")
        self.assertEqual(r["topCalls"][0]["callerName"], "Asha")
        self.assertEqual([b["key"] for b in r["byVoiceTier"]], ["premium", "standard"])
        self.assertEqual(r["byModelTier"][0], {"key": "premium", "label": "Premium", "minutes": 2.0, "calls": 1, "credits": 8.0})
        self.assertEqual([b["key"] for b in r["byDirection"]], ["inbound", "web"])

    def test_account_scoping(self):
        a, b = self.report(), self.report(self.b)
        self.assertEqual({c["id"] for c in a["topCalls"]} & {c["id"] for c in b["topCalls"]}, set())
        self.assertEqual(b["totals"]["calls"], 1)
        self.assertEqual(b["totals"]["minutes"], 5.0)
        self.assertEqual(b["byAgent"][0]["label"], "Unknown agent")

    def test_range_is_clamped_to_a_year(self):
        r = self.report(from_date="2020-01-01", to_date=self.day_d.isoformat())
        self.assertEqual(r["range"]["to"], self.day_d.isoformat())
        self.assertEqual(r["range"]["from"], (self.day_d - datetime.timedelta(days=365)).isoformat())
        self.assertEqual(len(r["daily"]), 366)
        with self.assertRaises(ValueError):
            self.report(from_date="2026-02-02", to_date="2026-02-01")
        with self.assertRaises(ValueError):
            self.report(timezone_name="Mars/Olympus")

    def test_days_follow_the_callers_timezone(self):
        d, d1 = self.day_d.isoformat(), (self.day_d + datetime.timedelta(days=1)).isoformat()
        ist = {x["date"]: x["calls"] for x in self.report(from_date=d, to_date=d1)["daily"]}
        self.assertEqual(ist, {d: 1, d1: 1}, "23:30 IST stays on its own day; 00:30 IST is the next day")
        utc = {x["date"]: x["calls"] for x in self.report(from_date=d, to_date=d1, timezone_name="UTC")["daily"]}
        self.assertEqual(utc, {d: 2, d1: 0})
        self.assertEqual(self.report(from_date=d1, to_date=d1)["totals"]["calls"], 1)

    def test_csv(self):
        lines = self.db.usage_csv(self.a, self.day_d.isoformat(), self.day_d.isoformat(), "Asia/Kolkata").splitlines()
        self.assertEqual(lines[0], "id,started_at,agent,channel,direction,number,caller,minutes,voice_tier,model_tier,credits")
        self.assertEqual(len(lines), 2)
        self.assertTrue(lines[1].endswith(",Riya,Phone,inbound,+919999900001,Asha,2.0,premium,premium,8.0"), lines[1])


if __name__ == "__main__":
    unittest.main()
