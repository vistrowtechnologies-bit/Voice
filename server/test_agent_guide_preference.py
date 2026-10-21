"""The agent editor's first-time guide: Skip is stored per user and comes back
as a boolean (TEST_DATABASE_URL: a throwaway Postgres)."""
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class AgentGuidePreferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()

    def user(self):
        account = self.db.create_account_with_owner("G", "G", f"guide-{os.urandom(4).hex()}@example.com", "h", email_verified=True)
        return account["user_id"]

    def test_new_user_sees_the_guide(self):
        self.assertIs(self.db.get_user_preferences(self.user())["agent_guide_dismissed"], False)

    def test_skip_is_remembered_and_only_for_that_user(self):
        skipped, other = self.user(), self.user()
        self.assertIs(self.db.update_user_preferences(skipped, {"agent_guide_dismissed": True})["agent_guide_dismissed"], True)
        self.assertIs(self.db.get_user_preferences(skipped)["agent_guide_dismissed"], True)
        self.assertIs(self.db.get_user_preferences(other)["agent_guide_dismissed"], False)


if __name__ == "__main__":
    unittest.main()
