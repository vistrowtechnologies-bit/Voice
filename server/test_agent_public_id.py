"""The 10-digit public Agent ID customers copy into ArthaLeads and other
platforms: every agent gets its own, it is exposed on the agent, and it rides
along with pushed leads (dropped with the agent field when that is unticked).
DB tests run against a throwaway Postgres (TEST_DATABASE_URL)."""

import os
import unittest

import calls_db
import integrations_dispatch

TEST_DB = os.environ.get("TEST_DATABASE_URL")


class FieldChoiceTests(unittest.TestCase):
    def test_agent_id_goes_with_the_agent_field(self):
        lead = {"name": "Asha", "agent_name": "Riya", "agent_id": "4829301756"}
        key = next(iter(calls_db.FIELD_CONFIGURABLE_KEYS))
        kept = integrations_dispatch.apply_field_choice(key, {"fields": ["name", "agent"]}, lead)
        self.assertEqual(kept["agent_id"], "4829301756")
        dropped = integrations_dispatch.apply_field_choice(key, {"fields": ["name"]}, lead)
        self.assertNotIn("agent_id", dropped)
        self.assertNotIn("agent_name", dropped)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class PublicIdDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.account = calls_db.create_account_with_owner(
            "P", "P", f"pid-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'scale' WHERE id = ?", (cls.account,))
        conn.close()

    def test_every_agent_gets_its_own_ten_digit_id(self):
        first = calls_db.create_agent({"name": "One"}, self.account)
        second = calls_db.create_agent({"name": "Two"}, self.account)
        for agent in (first, second):
            self.assertRegex(agent["publicId"], r"^[1-9]\d{9}$")
        self.assertNotEqual(first["publicId"], second["publicId"])
        self.assertEqual(calls_db.agent_public_id(first["id"]), first["publicId"])
        listed = {a["id"]: a["publicId"] for a in calls_db.list_agents(self.account)}
        self.assertEqual(listed[second["id"]], second["publicId"])

    def test_unknown_agent_has_no_public_id(self):
        self.assertEqual(calls_db.agent_public_id(None), "")
        self.assertEqual(calls_db.agent_public_id(987654321), "")


if __name__ == "__main__":
    unittest.main()
