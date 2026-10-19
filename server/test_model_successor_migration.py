"""Retired GPT-4 agent models are stored as their GPT-5 successor.

GPT-4 was retired 2026-10-14 and the call runtime already runs each retired
name on its successor (plan_policy.OPENAI_MODEL_SUCCESSORS). Owner, 19 Oct
2026: store the successor too, so the dashboard and billing match what runs.
Against a throwaway Postgres (TEST_DATABASE_URL)."""
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class ModelSuccessorMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        import plan_policy

        cls.db = calls_db
        cls.successors = plan_policy.OPENAI_MODEL_SUCCESSORS
        calls_db.init_tables()

    def sql(self, query, params=()):
        conn = self.db._connect()
        with conn:
            cur = conn.execute(query, params)
            row = cur.fetchone() if ("RETURNING" in query.upper() or query.lstrip().upper().startswith("SELECT")) else None
        conn.close()
        return row

    def test_retired_names_become_successors_and_others_are_untouched(self):
        aid = self.db.create_account_with_owner("A", "A", f"m-{os.urandom(4).hex()}@example.com", "h", email_verified=True)["account_id"]
        ids = {}
        for model in ("gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "sarvam/sarvam-105b-conversations",
                      "gemini-live:gemini-3.8-live", "gpt-5-nano"):
            ids[model] = self.sql("INSERT INTO agents (account_id, name, status, model) VALUES (?, 'x', 'live', ?) RETURNING id",
                                  (aid, model))["id"]
        call = self.sql("INSERT INTO calls (account_id, room_name, started_at, ended_at, duration_seconds, transcript_json, model) VALUES (?, 'r', '2026-10-01T10:00:00', '2026-10-01T10:01:00', 60, '[]', 'gpt-4.1-mini') RETURNING id",
                        (aid,))["id"]
        self.db.init_tables()
        self.db.init_tables()  # idempotent
        for model, agent_id in ids.items():
            got = self.sql("SELECT model FROM agents WHERE id = ?", (agent_id,))["model"]
            self.assertEqual(got, self.successors.get(model, model), model)
        self.assertEqual(self.sql("SELECT model FROM calls WHERE id = ?", (call,))["model"], "gpt-4.1-mini")


if __name__ == "__main__":
    unittest.main()
