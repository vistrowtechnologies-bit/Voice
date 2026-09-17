"""crm_integration_keys is stored as TEXT ("[]", '["arthaleads"]', ...) but
get_agent_config used to hand it back unparsed via `dict(row)` from a bare
`SELECT a.*`. Every caller did `cfg.get("crm_integration_keys") or None`
expecting a real list; against the raw string "[]" (truthy, non-empty),
that expression evaluates to the string itself, and
get_delivery_integrations's `set(allowed_keys)` then iterates its
CHARACTERS - {'[', ']'} - which never contains "arthaleads". Confirmed
live: calls 1003 and 1004 both logged
`connected_keys=['arthaleads'] allowed_keys='[]' type=str bool=True` and
delivered to nothing. This covers the fix: get_agent_config must return
a real list."""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import db


def _fake_conn(row: dict | None):
    conn = MagicMock()
    cursor = MagicMock()
    cursor.fetchone.return_value = row
    conn.execute.return_value = cursor
    return conn


class CrmIntegrationKeysAreParsedIntoARealList(unittest.TestCase):
    def setUp(self):
        db._agent_config_cache.clear()

    def test_stored_empty_array_string_becomes_an_empty_list(self):
        row = {"id": 17, "account_id": 1, "crm_integration_keys": "[]",
               "live_catalog_enabled": False}
        with patch.object(db.dbconn, "connect", return_value=_fake_conn(row)):
            cfg = db.get_agent_config(17)
        self.assertEqual(cfg["crm_integration_keys"], [])
        self.assertIsInstance(cfg["crm_integration_keys"], list)

    def test_stored_populated_array_string_becomes_a_real_list(self):
        row = {"id": 3, "account_id": 1, "crm_integration_keys": '["arthaleads"]',
               "live_catalog_enabled": False}
        with patch.object(db.dbconn, "connect", return_value=_fake_conn(row)):
            cfg = db.get_agent_config(3)
        self.assertEqual(cfg["crm_integration_keys"], ["arthaleads"])

    def test_the_exact_live_bug_set_of_a_json_string_never_matches_a_real_key(self):
        # Documents why this bug was so easy to miss: set("[]") = {'[', ']'}
        # and "arthaleads" in that set is False, silently - not an error.
        self.assertNotIn("arthaleads", set("[]"))
        self.assertNotIn("arthaleads", set('["arthaleads"]'))

    def test_null_or_missing_column_defaults_to_an_empty_list_not_a_crash(self):
        row = {"id": 9, "account_id": 1, "crm_integration_keys": None,
               "live_catalog_enabled": False}
        with patch.object(db.dbconn, "connect", return_value=_fake_conn(row)):
            cfg = db.get_agent_config(9)
        self.assertEqual(cfg["crm_integration_keys"], [])

    def test_get_delivery_integrations_now_matches_a_parsed_list(self):
        # End-to-end: with the real (parsed) list, arthaleads must survive
        # the allowed_keys filter instead of being silently dropped.
        with patch.object(
            db, "plan_policy",
            MagicMock(account_policy=lambda conn, acc: {"features": {"crm": True}}),
        ):
            conn = MagicMock()
            cursor = MagicMock()
            cursor.fetchall.return_value = [{"key": "arthaleads", "config_json": "{}"}]
            conn.execute.return_value = cursor
            with patch.object(db.dbconn, "connect", return_value=conn):
                result = db.get_delivery_integrations(1, allowed_keys=["arthaleads"])
        self.assertEqual([r["key"] for r in result], ["arthaleads"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
