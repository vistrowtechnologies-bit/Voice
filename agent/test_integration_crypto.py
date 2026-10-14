"""The agent decrypts integration configs the server encrypted (same
integration_crypto.py, same INTEGRATION_ENCRYPTION_KEY), still reads legacy
plaintext rows, and a Zoho token refresh it writes back is encrypted only
when the write switch is on. No database: dbconn is mocked."""
import json
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

from cryptography.fernet import Fernet

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import db
import integration_crypto as ic

KEY = Fernet.generate_key().decode()
SHEETS = {"mode": "oauth", "access_token": "ya29.agent", "refresh_token": "1//r", "spreadsheet_id": "s1"}


def _conn(rows=None, row=None):
    conn = MagicMock()
    cursor = MagicMock()
    cursor.fetchall.return_value = rows or []
    cursor.fetchone.return_value = row
    conn.execute.return_value = cursor
    conn.__enter__.return_value = conn
    return conn


class AgentReadsEncryptedIntegrations(unittest.TestCase):
    def setUp(self):
        self.saved = {k: os.environ.pop(k) for k in (ic.KEY_ENV, ic.WRITE_ENV) if k in os.environ}

    def tearDown(self):
        os.environ.pop(ic.KEY_ENV, None)
        os.environ.pop(ic.WRITE_ENV, None)
        os.environ.update(self.saved)

    def _encrypted(self, config):
        os.environ.update({ic.KEY_ENV: KEY, ic.WRITE_ENV: "on"})
        stored = ic.encode_config(config)
        del os.environ[ic.WRITE_ENV]
        return stored

    def test_delivery_integrations_decrypt_and_accept_plaintext(self):
        rows = [{"key": "sheets", "config_json": self._encrypted(SHEETS)},
                {"key": "webhook", "config_json": json.dumps({"url": "https://x.test/h"})}]
        policy = {"features": {"crm": True}}
        with patch.object(db.dbconn, "connect", return_value=_conn(rows=rows)), \
             patch.object(db.plan_policy, "account_policy", return_value=policy):
            got = db.get_delivery_integrations(5)
        self.assertEqual({g["key"]: g["config"] for g in got},
                         {"sheets": SHEETS, "webhook": {"url": "https://x.test/h"}})

    def test_webhook_url_decrypts(self):
        row = {"config_json": self._encrypted({"url": "https://x.test/enc"})}
        with patch.object(db.dbconn, "connect", return_value=_conn(row=row)):
            self.assertEqual(db.get_webhook_url(5), "https://x.test/enc")

    def test_without_the_key_an_encrypted_row_reads_empty_not_a_crash(self):
        rows = [{"key": "sheets", "config_json": self._encrypted(SHEETS)}]
        del os.environ[ic.KEY_ENV]
        with patch.object(db.dbconn, "connect", return_value=_conn(rows=rows)), \
             patch.object(db.plan_policy, "account_policy", return_value={"features": {"crm": True}}), \
             self.assertLogs(ic.logger, "ERROR"):
            self.assertEqual(db.get_delivery_integrations(5), [{"key": "sheets", "config": {}}])

    def test_token_refresh_write_back_encrypts_only_with_the_switch(self):
        for write, encrypted in ((None, False), ("on", True)):
            os.environ[ic.KEY_ENV] = KEY
            if write:
                os.environ[ic.WRITE_ENV] = write
            conn = _conn()
            with patch.object(db.dbconn, "connect", return_value=conn):
                db.update_integration_config(5, "zoho_crm", {"access_token": "zoho-new"})
            stored = conn.execute.call_args[0][1][0]
            self.assertEqual(stored.startswith(ic.PREFIX), encrypted)
            self.assertEqual(ic.decode_config(stored), {"access_token": "zoho-new"})


if __name__ == "__main__":
    unittest.main()
