"""A call is "Qualified" only when it captured a real name AND a way to reach
the person (phone or email). Website-widget calls used to show "Qualified"
for a lead named "Website visitor" with no phone or email (calls 1373-1375,
2026-10-16) because any non-empty lead_name counted, and the dashboard counts
treated any non-NULL name - even '' - as qualified.

The per-call label and every dashboard count must agree, so the DB half runs
against a real Postgres (TEST_DATABASE_URL): the point is the SQL."""
import datetime
import os
import unittest

import calls_db

TEST_DB = os.environ.get("TEST_DATABASE_URL")


def _row(name=None, phone=None, email=None, visit=None):
    return {"lead_name": name, "lead_phone": phone, "lead_email": email, "site_visit_json": visit}


class LeadStatusLabel(unittest.TestCase):
    def test_placeholder_name_without_contact_is_not_qualified(self):
        self.assertEqual(calls_db._lead_status(_row("Website visitor")), "New")

    def test_placeholder_name_with_phone_is_not_qualified(self):
        for name in ("Website visitor", "  website VISITOR ", "Visitor", "Unknown", "Caller", "", "n/a"):
            self.assertEqual(calls_db._lead_status(_row(name, phone="+919812345678")), "New", name)

    def test_real_name_with_phone_is_qualified(self):
        self.assertEqual(calls_db._lead_status(_row("Asha Rao", phone="+919812345678")), "Qualified")

    def test_real_name_with_email_is_qualified(self):
        self.assertEqual(calls_db._lead_status(_row("Asha Rao", email="asha@example.com")), "Qualified")

    def test_real_name_without_contact_is_not_qualified(self):
        self.assertEqual(calls_db._lead_status(_row("Asha Rao")), "New")
        self.assertEqual(calls_db._lead_status(_row("Asha Rao", phone="  ", email="")), "New")

    def test_booking_still_wins(self):
        self.assertEqual(calls_db._lead_status(_row("Website visitor", visit='{"date": "x"}')), "Appointment Booked")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class QualifiedCounts(unittest.TestCase):
    # (name, phone, email, qualified?)
    SEEDS = (
        ("Website visitor", None, None, False),
        ("Asha", "+919812345601", None, True),
        ("Ravi", None, "ravi@example.com", True),
        ("Meera", None, None, False),
        ("", "+919812345602", None, False),
        ("  website VISITOR ", "+919812345603", None, False),
        (None, "+919812345604", None, False),
        ("Kiran", "", "", False),
    )

    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("Q", "Q", f"lq-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        try:
            with conn:
                agent_id = conn.execute("SELECT MIN(id) id FROM agents WHERE account_id = ?", (cls.a,)).fetchone()["id"]
                now = datetime.datetime.now(datetime.timezone.utc)
                for i, (name, phone, email, _) in enumerate(cls.SEEDS):
                    conn.execute(
                        "INSERT INTO calls (account_id, room_name, visitor_identity, started_at, ended_at, duration_seconds, "
                        "transcript_json, call_type, agent_id, lead_name, lead_phone, lead_email) "
                        "VALUES (?, ?, 'v', ?, ?, 60, '[]', 'widget', ?, ?, ?, ?)",
                        (cls.a, f"lq-{stamp}-{i}", now.isoformat(), (now + datetime.timedelta(seconds=60)).isoformat(),
                         agent_id, name, phone, email),
                    )
        finally:
            conn.close()
        cls.expected = sum(1 for s in cls.SEEDS if s[3])

    def test_summary(self):
        s = calls_db.summary(self.a)
        self.assertEqual(s["totalCalls"], len(self.SEEDS))
        self.assertEqual(s["qualifiedCalls"], self.expected)

    def test_usage_trends(self):
        self.assertEqual(sum(calls_db.usage_trends(self.a)["qualified"]), self.expected)

    def test_period_comparison(self):
        self.assertEqual(calls_db.period_comparison(self.a)["current"]["qualified"], self.expected)

    def test_analytics_by_channel_agent_and_funnel(self):
        a = calls_db.analytics(self.a)
        self.assertEqual(sum(r["qualified"] for r in a["byChannel"]), self.expected)
        self.assertEqual(sum(r["qualified"] for r in a["byAgent"]), self.expected)
        self.assertEqual(a["funnel"]["qualified"], self.expected)

    def test_count_matches_per_call_labels(self):
        conn = calls_db._connect()
        try:
            rows = conn.execute("SELECT * FROM calls WHERE account_id = ?", (self.a,)).fetchall()
        finally:
            conn.close()
        labelled = sum(1 for r in rows if calls_db._lead_status(r) == "Qualified")
        self.assertEqual(labelled, calls_db.summary(self.a)["qualifiedCalls"])


if __name__ == "__main__":
    unittest.main()
