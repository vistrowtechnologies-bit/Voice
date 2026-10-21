"""The Overview's date filter: an exact start/end range, counted in the
viewer's local calendar days, compared with the same number of days before it.

calls.started_at is UTC text. A call at 20:00 UTC on 1 Oct is 01:30 on 2 Oct
in India, so it belongs to 2 Oct for an Indian viewer and to 1 Oct in UTC.
The DB half runs against a real Postgres (TEST_DATABASE_URL): the point is the SQL."""
import datetime
import os
import unittest

import calls_db

TEST_DB = os.environ.get("TEST_DATABASE_URL")


class WindowValidation(unittest.TestCase):
    def test_no_range_keeps_the_rolling_window(self):
        self.assertIsNone(calls_db._dashboard_window(None, None, "Asia/Kolkata"))

    def test_one_day(self):
        d = datetime.date(2026, 10, 2)
        self.assertEqual(calls_db._dashboard_window("2026-10-02", "2026-10-02", "Asia/Kolkata"), (d, d))

    def test_rejects_bad_input(self):
        for start, end, tz in (
            ("2026-10-05", "2026-10-01", "Asia/Kolkata"),  # end before start
            ("2025-01-01", "2026-10-01", "Asia/Kolkata"),  # more than a year
            ("02/10/2026", "2026-10-03", "Asia/Kolkata"),  # not ISO
            ("2026-10-01", "2026-10-02", "Mars/Olympus"),  # unknown zone
            ("2026-10-01", "2026-10-02", "Asia/Kolkata'; DROP TABLE calls;--"),
        ):
            with self.assertRaises(ValueError, msg=(start, end, tz)):
                calls_db._dashboard_window(start, end, tz)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class RangeCounts(unittest.TestCase):
    # (started_at as stored, test run?)  Both stored shapes on purpose.
    SEEDS = (
        ("2026-09-30 10:00:00", False),                  # 30 Sep IST: previous window
        ("2026-10-01T20:00:00+00:00", False),            # 2 Oct 01:30 IST, 1 Oct UTC
        ("2026-10-02T10:00:00.123456+00:00", False),     # 2 Oct
        ("2026-10-02 11:00:00", True),                   # Testing Lab run: never counted
        ("2026-10-03T19:00:00+00:00", False),            # 4 Oct 00:30 IST: outside
    )

    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("R", "R", f"dr-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        try:
            with conn:
                agent_id = conn.execute("SELECT MIN(id) id FROM agents WHERE account_id = ?", (cls.a,)).fetchone()["id"]
                for i, (started, test_run) in enumerate(cls.SEEDS):
                    conn.execute(
                        "INSERT INTO calls (account_id, room_name, visitor_identity, started_at, ended_at, duration_seconds, "
                        "transcript_json, call_type, agent_id, test_run_id) "
                        "VALUES (?, ?, 'v', ?, ?, 120, '[]', 'widget', ?, ?)",
                        (cls.a, f"dr-{stamp}-{i}", started, started, agent_id, "run-1" if test_run else None),
                    )
        finally:
            conn.close()

    def test_trends_use_local_days(self):
        t = calls_db.usage_trends(self.a, start="2026-10-01", end="2026-10-03", tz="Asia/Kolkata")
        self.assertEqual(t["labels"], ["2026-10-02"])
        self.assertEqual(t["calls"], [2])
        self.assertEqual(t["minutes"], [4.0])

    def test_trends_in_utc_split_the_late_call(self):
        t = calls_db.usage_trends(self.a, start="2026-10-01", end="2026-10-03", tz="UTC")
        self.assertEqual(t["labels"], ["2026-10-01", "2026-10-02", "2026-10-03"])
        self.assertEqual(t["calls"], [1, 1, 1])

    def test_comparison_against_the_days_before(self):
        c = calls_db.period_comparison(self.a, start="2026-10-01", end="2026-10-02", tz="Asia/Kolkata")
        self.assertEqual((c["days"], c["previousStart"], c["previousEnd"]), (2, "2026-09-29", "2026-09-30"))
        self.assertEqual(c["current"]["calls"], 2)
        self.assertEqual(c["previous"]["calls"], 1)
        self.assertEqual(c["change"]["calls"], 100.0)
        self.assertEqual(c["current"]["minutes"], 4.0)

    def test_single_day(self):
        c = calls_db.period_comparison(self.a, start="2026-10-04", end="2026-10-04", tz="Asia/Kolkata")
        self.assertEqual((c["current"]["calls"], c["previous"]["calls"]), (1, 0))

    def test_rolling_window_still_works(self):
        self.assertEqual(calls_db.period_comparison(self.a, days=14)["days"], 14)

    def test_speed_to_lead_accepts_a_range(self):
        s = calls_db.speed_to_lead(self.a, start="2026-10-01", end="2026-10-02", tz="Asia/Kolkata")
        self.assertEqual((s["days"], s["received"]), (2, 0))


if __name__ == "__main__":
    unittest.main(verbosity=2)
