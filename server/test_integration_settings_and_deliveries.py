"""Integration detail page backend: per-integration settings are merged
without touching saved tokens, survive a URL edit, and are validated; the
Activity log is account-scoped, filterable, counts 7 days without tests, and
keeps 30 days. Runs against a real Postgres (TEST_DATABASE_URL), since the
point is the SQL."""
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class IntegrationSettingsAndDeliveries(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("A", "A", f"a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.b = calls_db.create_account_with_owner("B", "B", f"b-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id IN (?, ?)", (cls.a, cls.b))
        conn.close()

    def config(self, account, key):
        return next(i["config"] for i in self.db.list_integrations(account) if i["key"] == key)

    def test_settings_merge_keeps_tokens_and_survive_url_edit(self):
        db = self.db
        db.update_integration("webhook", "connected", {"url": "https://x.test/a", "token": "secret"}, self.a)
        self.assertEqual(db.update_integration_settings(self.a, "webhook", events=["lead_update", "call_completed", "bogus"]),
                         {"events": ["call_completed", "lead_update"]})
        self.assertEqual(self.config(self.a, "webhook")["token"], "secret")
        db.update_integration("webhook", "connected", {"url": "https://x.test/b"}, self.a)
        self.assertEqual(self.config(self.a, "webhook"), {"url": "https://x.test/b", "events": ["call_completed", "lead_update"]})
        db.update_integration("webhook", "not_connected", {}, self.a)
        self.assertEqual(self.config(self.a, "webhook"), {}, "disconnect forgets everything")

    def test_settings_validation(self):
        db = self.db
        db.update_integration("whatsapp", "connected", {"url": "https://w.test"}, self.a)
        with self.assertRaises(ValueError):
            db.update_integration_settings(self.a, "whatsapp", events=[])
        with self.assertRaises(ValueError):
            db.update_integration_settings(self.a, "zoho_crm", events=["call_completed"])
        with self.assertRaises(ValueError):
            db.update_integration_settings(self.a, "webhook", template="hi")
        with self.assertRaises(ValueError):
            db.update_integration_settings(self.a, "whatsapp", template="x" * 1001)
        db.update_integration("sheets", "connected", {"mode": "oauth", "refresh_token": "r"}, self.a)
        with self.assertRaises(ValueError):
            db.update_integration_settings(self.a, "sheets", events=["lead_update"])
        self.assertEqual(db.update_integration_settings(self.a, "whatsapp", template=" Hi {name} "), {"template": "Hi {name}"})
        self.assertEqual(db.update_integration_settings(self.a, "whatsapp", template=""), {})
        self.assertEqual(db.default_integration_events("whatsapp"), ["call_completed"])

    def test_field_choice(self):
        db = self.db
        db.update_integration("slack", "connected", {"url": "https://hooks.slack.test/x"}, self.a)
        self.assertEqual(db.update_integration_settings(self.a, "slack", fields=["recording", "name", "nope"]),
                         {"fields": ["name", "recording"]})
        with self.assertRaises(ValueError):
            db.update_integration_settings(self.a, "slack", fields=["recording"])  # nothing identifies the lead
        with self.assertRaises(ValueError):
            db.update_integration_settings(self.a, "zoho_crm", fields=["name"])
        self.assertEqual(db.update_integration_settings(self.a, "slack", fields=list(db.INTEGRATION_FIELDS)), {},
                         "everything ticked = no restriction stored")

    def test_deliveries_scoped_filtered_counted_and_pruned(self):
        db = self.db
        db.record_integration_delivery(self.a, "slack", "call_completed", "sent", "", "Asha", 9)
        db.record_integration_delivery(self.a, "slack", "lead_update", "failed", "HTTP 500: x", "Asha", None)
        db.record_integration_delivery(self.a, "slack", "test", "sent", "", "Test Lead")
        db.record_integration_delivery(self.b, "slack", "call_completed", "sent", "", "Other tenant")
        conn = db._connect()
        with conn:
            conn.execute(
                "INSERT INTO integration_deliveries (account_id, key, event_type, status, created_at) "
                "VALUES (?, 'slack', 'call_completed', 'sent', '2000-01-01 00:00:00')", (self.a,))
        conn.close()
        out = db.list_integration_deliveries(self.a, "slack")
        self.assertEqual([d["leadName"] for d in out["items"]], ["Test Lead", "Asha", "Asha"])
        self.assertEqual(out["stats"], {"sent7d": 1, "failed7d": 1, "skipped7d": 0}, "tests are not counted")
        self.assertEqual([d["status"] for d in db.list_integration_deliveries(self.a, "slack", status="failed")["items"]], ["failed"])
        self.assertNotIn("Other tenant", str(out))
        conn = db._connect()
        old = conn.execute("SELECT COUNT(*) AS n FROM integration_deliveries WHERE account_id = ? AND created_at < '2001-01-01'", (self.a,)).fetchone()["n"]
        conn.close()
        self.assertEqual(old, 0, "rows older than 30 days are dropped")


if __name__ == "__main__":
    unittest.main()
