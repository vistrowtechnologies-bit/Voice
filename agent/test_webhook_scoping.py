"""A call's lead/appointment webhook must go to ITS account's URL only.

get_webhook_url used to select any connected 'webhook' integration row
platform-wide, so the first tenant to connect one would have received every
other tenant's leads. Never connects to a database.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db


class WebhookIsScopedToTheAccount(unittest.TestCase):
    def _conn(self, row):
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = row
        return conn

    def test_lookup_filters_by_account(self):
        conn = self._conn({"config_json": '{"url": "https://tenant-7.example/hook"}'})
        with patch.object(db.dbconn, "connect", return_value=conn):
            self.assertEqual(db.get_webhook_url(7), "https://tenant-7.example/hook")
        sql, params = conn.execute.call_args.args
        self.assertIn("account_id = ?", sql)
        self.assertEqual(params, (7,))

    def test_no_account_means_no_webhook(self):
        with patch.object(db.dbconn, "connect") as connect:
            self.assertIsNone(db.get_webhook_url(None))
        connect.assert_not_called()

    def test_account_without_a_connected_webhook_gets_none(self):
        with patch.object(db.dbconn, "connect", return_value=self._conn(None)):
            self.assertIsNone(db.get_webhook_url(3))


if __name__ == "__main__":
    unittest.main()
