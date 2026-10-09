"""Agent IDs shown on the dashboard are random 8-digit numbers, not agents.id.

Needs a real, disposable Postgres (the migration is plpgsql); skipped unless
DATABASE_URL is set. Run from server/:
    DATABASE_URL=postgresql://.../scratch_db python -m unittest test_agent_public_id
"""
import os
import unittest

if os.environ.get("DATABASE_URL"):
    import calls_db
    import dbconn


@unittest.skipUnless(os.environ.get("DATABASE_URL"), "needs a disposable Postgres in DATABASE_URL")
class AgentPublicIdTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        calls_db.init_tables()

    def _insert_agent(self, account_id: int, name: str) -> int:
        conn = dbconn.connect()
        try:
            with conn:
                return conn.execute(
                    "INSERT INTO agents (account_id, name) VALUES (?, ?) RETURNING id", (account_id, name)
                ).fetchone()["id"]
        finally:
            conn.close()

    def _public_id(self, agent_id: int):
        conn = dbconn.connect()
        try:
            return conn.execute("SELECT public_id FROM agents WHERE id = ?", (agent_id,)).fetchone()["public_id"]
        finally:
            conn.close()

    def test_new_agents_get_a_random_unique_8_digit_id(self):
        ids = [self._insert_agent(9101, f"a{i}") for i in range(20)]
        public = [self._public_id(i) for i in ids]
        self.assertTrue(all(10_000_000 <= p <= 99_999_999 for p in public), public)
        self.assertEqual(len(set(public)), len(public))
        # Not just the sequential id in disguise.
        self.assertNotEqual(sorted(public), public)
        self.assertEqual(calls_db.list_agents(9101)[0]["publicId"], public[0])

    def test_existing_agents_are_backfilled_and_rerunning_is_a_no_op(self):
        conn = dbconn.connect()
        try:
            with conn:
                conn.execute("DROP INDEX IF EXISTS agents_public_id_unique")
                conn.execute("ALTER TABLE agents DROP COLUMN public_id")
        finally:
            conn.close()
        agent_id = self._insert_agent(9102, "predates public ids")
        calls_db.init_tables()
        first = self._public_id(agent_id)
        self.assertTrue(10_000_000 <= first <= 99_999_999)
        calls_db.init_tables()
        self.assertEqual(self._public_id(agent_id), first)

    def test_resolver_is_account_scoped_and_accepts_legacy_ids(self):
        agent_id = self._insert_agent(9103, "resolver")
        public = self._public_id(agent_id)
        self.assertEqual(calls_db.resolve_agent_ref(9103, public), agent_id)
        self.assertEqual(calls_db.resolve_agent_ref(9103, f" {public} "), agent_id)
        self.assertEqual(calls_db.resolve_agent_ref(9103, agent_id), agent_id)
        self.assertIsNone(calls_db.resolve_agent_ref(9104, public))
        self.assertIsNone(calls_db.resolve_agent_ref(9104, agent_id))
        for bad in (None, "", "abc", "-1", "0", "1e3", 10**13):
            self.assertIsNone(calls_db.resolve_agent_ref(9103, bad), bad)


if __name__ == "__main__":
    unittest.main()
