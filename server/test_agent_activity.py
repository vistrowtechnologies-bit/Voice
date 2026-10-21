"""Per-agent activity for the Agents page, against a throwaway Postgres
(TEST_DATABASE_URL): calls today, 7-day daily calls, bookings, last call."""
import json
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class AgentActivityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("A", "A", f"aa-a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.other = calls_db.create_account_with_owner("B", "B", f"aa-b-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.agent = cls.new_agent(cls.a, "Artha")
        cls.quiet = cls.new_agent(cls.a, "Quiet")
        cls.foreign = cls.new_agent(cls.other, "Other")
        call = cls.call
        call(cls.a, cls.agent, days_ago=0)
        call(cls.a, cls.agent, days_ago=0, booked=True)
        call(cls.a, cls.agent, days_ago=2)
        call(cls.a, cls.agent, days_ago=6, booked=True)
        call(cls.a, cls.agent, days_ago=7)  # outside the 7 days, still the "last call" pool
        call(cls.a, cls.agent, days_ago=0, test_run="lab-1")  # Testing Lab: never counted
        call(cls.other, cls.foreign, days_ago=0)

    @classmethod
    def new_agent(cls, account, name):
        # Straight into the table: the plan's agent limit is not under test.
        conn = cls.db._connect()
        try:
            with conn:
                return conn.execute("INSERT INTO agents (account_id, name) VALUES (?, ?) RETURNING id", (account, name)).fetchone()["id"]
        finally:
            conn.close()

    @classmethod
    def call(cls, account, agent, *, days_ago, booked=False, test_run=""):
        conn = cls.db._connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO calls (account_id, agent_id, room_name, started_at, ended_at, call_type, duration_seconds, "
                    "transcript_json, site_visit_json, test_run_id) VALUES (?, ?, ?, "
                    "((CURRENT_DATE - ?)::timestamp + interval '12 hours')::text, "
                    "((CURRENT_DATE - ?)::timestamp + interval '12 hours 1 minute')::text, 'phone', 60, '[]', ?, ?) RETURNING id",
                    (account, agent, f"aa-{os.urandom(4).hex()}", days_ago, days_ago,
                     json.dumps({"date": "2026-10-25"}) if booked else None, test_run),
                )
        finally:
            conn.close()

    def activity(self, account):
        return {row["agentId"]: row for row in self.db.agent_activity(account)}

    def test_counts_today_week_and_bookings(self):
        row = self.activity(self.a)[self.agent]
        self.assertEqual(row["today"], 2)
        self.assertEqual(row["daily"], [1, 0, 0, 0, 1, 0, 2])  # oldest first, today last
        self.assertEqual(row["booked7"], 2)
        self.assertIsNotNone(row["lastCallAt"])

    def test_agent_without_calls_is_absent_and_other_accounts_stay_out(self):
        rows = self.activity(self.a)
        self.assertNotIn(self.quiet, rows)
        self.assertNotIn(self.foreign, rows)

    def test_last_call_counts_calls_older_than_the_week(self):
        account = self.db.create_account_with_owner("C", "C", f"aa-c-{os.urandom(4).hex()}@example.com", "h", email_verified=True)["account_id"]
        agent = self.new_agent(account, "Old")
        self.call(account, agent, days_ago=20)
        row = self.activity(account)[agent]
        self.assertEqual((row["today"], row["daily"], row["booked7"]), (0, [0] * 7, 0))
        self.assertIsNotNone(row["lastCallAt"])


if __name__ == "__main__":
    unittest.main()
