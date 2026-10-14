"""Integration configs encrypted at rest (integration_crypto.py): encrypted
and legacy plaintext rows both read, writes encrypt only with a key AND the
write switch, a missing or wrong key never crashes, the boot migration is
idempotent, and the server/agent/orchestrator copies stay identical. The DB
class runs against a throwaway Postgres (TEST_DATABASE_URL)."""
import json
import logging
import os
import unittest
from pathlib import Path
from unittest import mock

from cryptography.fernet import Fernet

import integration_crypto as ic

KEY = Fernet.generate_key().decode()
OTHER_KEY = Fernet.generate_key().decode()
CONFIG = {"access_token": "ya29.secret-token", "refresh_token": "1//refresh", "events": ["call_completed"]}
TEST_DB = os.environ.get("TEST_DATABASE_URL")


class IntegrationCrypto(unittest.TestCase):
    def setUp(self):
        self.saved = {k: os.environ.pop(k) for k in (ic.KEY_ENV, ic.WRITE_ENV) if k in os.environ}
        ic._warned.clear()

    def tearDown(self):
        os.environ.pop(ic.KEY_ENV, None)
        os.environ.pop(ic.WRITE_ENV, None)
        os.environ.update(self.saved)

    def test_no_key_keeps_plaintext_and_warns(self):
        with self.assertLogs(ic.logger, logging.WARNING) as logs:
            ic.warn_if_unconfigured()
        self.assertIn(ic.KEY_ENV, logs.output[0])
        os.environ[ic.WRITE_ENV] = "on"  # switch on without a key: still plaintext
        stored = ic.encode_config(CONFIG)
        self.assertEqual(json.loads(stored), CONFIG)
        self.assertEqual(ic.decode_config(stored), CONFIG)

    def test_key_and_write_switch_encrypt_round_trip(self):
        os.environ.update({ic.KEY_ENV: KEY, ic.WRITE_ENV: "on"})
        stored = ic.encode_config(CONFIG)
        self.assertTrue(stored.startswith(ic.PREFIX))
        self.assertNotIn("secret-token", stored)
        self.assertNotIn("refresh", stored)
        self.assertEqual(ic.decode_config(stored), CONFIG)

    def test_key_without_write_switch_reads_encrypted_but_writes_plaintext(self):
        os.environ.update({ic.KEY_ENV: KEY, ic.WRITE_ENV: "on"})
        encrypted = ic.encode_config(CONFIG)
        del os.environ[ic.WRITE_ENV]
        self.assertEqual(json.loads(ic.encode_config(CONFIG)), CONFIG)
        self.assertEqual(ic.decode_config(encrypted), CONFIG)

    def test_legacy_plaintext_reads_with_key_set(self):
        os.environ.update({ic.KEY_ENV: KEY, ic.WRITE_ENV: "on"})
        self.assertEqual(ic.decode_config(json.dumps(CONFIG)), CONFIG)
        self.assertEqual(ic.decode_config(""), {})
        self.assertEqual(ic.decode_config(None), {})
        with self.assertRaises(ValueError):  # bad plaintext fails as json.loads did
            ic.decode_config("{not json")

    def test_missing_or_wrong_key_returns_empty_or_raises_when_strict(self):
        os.environ.update({ic.KEY_ENV: KEY, ic.WRITE_ENV: "on"})
        stored = ic.encode_config(CONFIG)
        for key in (None, OTHER_KEY):
            if key is None:
                del os.environ[ic.KEY_ENV]
            else:
                os.environ[ic.KEY_ENV] = key
            with self.assertLogs(ic.logger, logging.ERROR) as logs:
                self.assertEqual(ic.decode_config(stored), {})
            self.assertNotIn(KEY, "".join(logs.output))
            self.assertNotIn("secret-token", "".join(logs.output))
            with self.assertRaises(ic.ConfigDecryptError), self.assertLogs(ic.logger, logging.ERROR):
                ic.decode_config(stored, strict=True)

    def test_rotation_new_key_first_still_reads_old_rows(self):
        os.environ.update({ic.KEY_ENV: KEY, ic.WRITE_ENV: "on"})
        old = ic.encode_config(CONFIG)
        os.environ[ic.KEY_ENV] = f"{OTHER_KEY},{KEY}"
        self.assertEqual(ic.decode_config(old), CONFIG)
        new = ic.encode_config(CONFIG)
        os.environ[ic.KEY_ENV] = OTHER_KEY
        self.assertEqual(ic.decode_config(new), CONFIG)

    def test_invalid_key_never_crashes(self):
        os.environ.update({ic.KEY_ENV: "not-a-fernet-key", ic.WRITE_ENV: "on"})
        with self.assertLogs(ic.logger, logging.WARNING) as logs:
            stored = ic.encode_config(CONFIG)
        self.assertEqual(json.loads(stored), CONFIG)
        self.assertNotIn("not-a-fernet-key", "".join(logs.output))

    def test_server_agent_and_orchestrator_copies_are_identical(self):
        root = Path(__file__).resolve().parent.parent
        server_copy = (root / "server" / "integration_crypto.py").read_text()
        for other in ("agent", "orchestrator"):
            self.assertEqual((root / other / "integration_crypto.py").read_text(), server_copy, other)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class IntegrationCryptoDatabase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("A", "A", f"enc-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id = ?", (cls.a,))
        conn.close()

    def setUp(self):
        self.saved = {k: os.environ.pop(k) for k in (ic.KEY_ENV, ic.WRITE_ENV) if k in os.environ}

    def tearDown(self):
        os.environ.pop(ic.KEY_ENV, None)
        os.environ.pop(ic.WRITE_ENV, None)
        os.environ.update(self.saved)

    def raw(self, key):
        conn = self.db._connect()
        try:
            return conn.execute("SELECT config_json FROM integrations WHERE account_id = ? AND key = ?",
                                (self.a, key)).fetchone()["config_json"]
        finally:
            conn.close()

    def config(self, key):
        return next(i["config"] for i in self.db.list_integrations(self.a) if i["key"] == key)

    def test_writes_encrypt_reads_decrypt_and_settings_merge(self):
        os.environ.update({ic.KEY_ENV: KEY, ic.WRITE_ENV: "on"})
        self.db.update_integration("sheets", "connected", dict(CONFIG), self.a)
        self.assertTrue(self.raw("sheets").startswith(ic.PREFIX))
        self.assertNotIn("secret-token", self.raw("sheets"))
        self.assertEqual(self.config("sheets"), CONFIG)
        self.db.update_integration("webhook", "connected", {"url": "https://x.test/hook"}, self.a)
        self.db.update_integration_settings(self.a, "webhook", events=["lead_update"])
        self.assertTrue(self.raw("webhook").startswith(ic.PREFIX))
        self.assertEqual(self.config("webhook"), {"url": "https://x.test/hook", "events": ["lead_update"]})

    def test_settings_update_without_the_key_refuses_instead_of_wiping(self):
        os.environ.update({ic.KEY_ENV: KEY, ic.WRITE_ENV: "on"})
        self.db.update_integration("slack", "connected", {"url": "https://hooks.slack.test/T/B/x"}, self.a)
        before = self.raw("slack")
        del os.environ[ic.KEY_ENV]
        with self.assertRaises(ic.ConfigDecryptError), self.assertLogs(ic.logger, logging.ERROR):
            self.db.update_integration_settings(self.a, "slack", events=["call_completed"])
        self.assertEqual(self.raw("slack"), before)
        with self.assertRaises(ic.ConfigDecryptError), self.assertLogs(ic.logger, logging.ERROR):
            self.db.list_integrations(self.a, strict=True)  # what PATCH /integrations/{key} uses
        with self.assertLogs(ic.logger, logging.ERROR):
            self.assertEqual(self.config("slack"), {}, "dashboard still loads, just without the config")

    def test_boot_migration_only_with_key_and_switch_and_is_idempotent(self):
        self.db.update_integration("zoho_crm", "connected", {"refresh_token": "zoho-refresh", "api_domain": "https://www.zohoapis.in"}, self.a)
        self.db.update_integration("arthaleads", "not_connected", {}, self.a)
        self.assertEqual(json.loads(self.raw("zoho_crm"))["refresh_token"], "zoho-refresh")

        self.assertEqual(self.db.encrypt_legacy_integration_configs(), 0, "no key: nothing changes")
        os.environ[ic.KEY_ENV] = KEY
        self.assertEqual(self.db.encrypt_legacy_integration_configs(), 0, "key but no switch: nothing changes")
        self.assertFalse(self.raw("zoho_crm").startswith(ic.PREFIX))

        os.environ[ic.WRITE_ENV] = "on"
        self.assertGreaterEqual(self.db.encrypt_legacy_integration_configs(), 1)
        self.assertTrue(self.raw("zoho_crm").startswith(ic.PREFIX))
        self.assertEqual(self.raw("arthaleads"), "{}", "empty configs are left alone")
        self.assertEqual(self.config("zoho_crm")["refresh_token"], "zoho-refresh")
        encrypted = self.raw("zoho_crm")
        self.assertEqual(self.db.encrypt_legacy_integration_configs(), 0, "second run is a no-op")
        self.assertEqual(self.raw("zoho_crm"), encrypted)


if __name__ == "__main__":
    unittest.main()
