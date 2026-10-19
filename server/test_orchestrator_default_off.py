"""New accounts are not put on the orchestrator pipeline (owner, 19 Oct 2026).

orchestrator/llm.py sends every non-"gemini" model to OpenAI, so the default
agent model (sarvam/, Vistrow Bharat) got a 400 there and the caller heard the
greeting, then silence. New accounts use the LiveKit path; accounts the old
default flagged are moved back. Against a throwaway Postgres (TEST_DATABASE_URL)."""
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class OrchestratorDefaultOffTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db

        cls.db = calls_db
        calls_db.init_tables()

    def new_account(self):
        return self.db.create_account_with_owner(
            "A", "A", f"o-{os.urandom(4).hex()}@example.com", "h", email_verified=True)["account_id"]

    def test_new_account_is_not_on_the_orchestrator(self):
        self.assertFalse(self.db.is_on_orchestrator_pipeline(self.new_account()))

    def test_accounts_flagged_by_the_old_default_go_back_to_livekit(self):
        aid = self.new_account()
        self.db.set_orchestrator_pipeline(aid, True)
        self.assertTrue(self.db.is_on_orchestrator_pipeline(aid))
        self.db.init_tables()
        self.assertFalse(self.db.is_on_orchestrator_pipeline(aid))


if __name__ == "__main__":
    unittest.main()
