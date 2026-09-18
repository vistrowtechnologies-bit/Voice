"""'Don't call me again' has to survive the call.

Until 2026-09-18 the agent heard it and nothing recorded it: no tool wrote to
the DNC list, so the next campaign rang the same person again. The dialer
already checks that list before every dial (check_call_allowed), so a row is
all it takes — which makes the write, and its phone-number key, the whole
feature.
"""
import asyncio
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import db
import tools

do_not_call = tools.do_not_call.__wrapped__


class FakeContext:
    def __init__(self, **userdata):
        self.userdata = userdata


class PhoneKeyMatchesTheDialerGate(unittest.TestCase):
    """server/calls_db.py's _normalize_phone decides what check_call_allowed
    compares against. A row stored under any other key is a number we would
    carry on calling."""

    def test_every_way_a_number_arrives_collapses_to_one_key(self):
        for written in ("+91 98765 43210", "9876543210", "098765 43210",
                        "+919876543210", " +91-98765-43210 "):
            self.assertEqual(db._normalize_dnc_phone(written), "9876543210", written)

    def test_non_indian_numbers_are_kept_whole_rather_than_mangled(self):
        self.assertEqual(db._normalize_dnc_phone("+1 415 555 0123"), "14155550123")

    def test_junk_normalises_to_nothing(self):
        for junk in ("", None, "abc", "+++"):
            self.assertEqual(db._normalize_dnc_phone(junk), "")


class RecordDoNotCall(unittest.TestCase):
    def _record(self, account_id, phone, rowcount_row=(1,)):
        conn = MagicMock()
        conn.__enter__ = lambda s: s
        conn.__exit__ = lambda *a: False
        conn.execute.return_value.fetchone.return_value = rowcount_row
        with patch.object(db.dbconn, "connect", return_value=conn):
            result = db.record_do_not_call(account_id, phone, "asked to stop")
        return result, conn

    def test_it_writes_the_opt_out(self):
        added, conn = self._record(2, "+919876543210")
        self.assertTrue(added)
        sql, params = conn.execute.call_args.args
        self.assertIn("INSERT INTO dnc_list", sql)
        self.assertIn("call_opt_out", sql)
        self.assertEqual(params[1], "+919876543210")
        self.assertEqual(params[2], "9876543210")

    def test_already_on_the_list_is_not_an_error(self):
        added, _ = self._record(2, "+919876543210", rowcount_row=None)
        self.assertFalse(added)

    def test_no_account_or_no_number_writes_nothing(self):
        for account_id, phone in ((None, "+919876543210"), (2, ""), (2, "abc")):
            conn = MagicMock()
            with patch.object(db.dbconn, "connect", return_value=conn):
                self.assertFalse(db.record_do_not_call(account_id, phone))
            conn.execute.assert_not_called()

    def test_a_database_failure_never_reaches_the_caller(self):
        conn = MagicMock()
        conn.__enter__ = lambda s: s
        conn.__exit__ = lambda *a: False
        conn.execute.side_effect = RuntimeError("db down")
        with patch.object(db.dbconn, "connect", return_value=conn):
            self.assertFalse(db.record_do_not_call(2, "+919876543210"))
        conn.close.assert_called_once()


class Tool(unittest.TestCase):
    def test_it_suppresses_the_number_on_this_call(self):
        with patch.object(tools.db, "record_do_not_call", return_value=True) as record, \
             patch.object(tools, "_publish_event", new=self._noop), \
             patch.object(tools, "_is_demo", return_value=False):
            reply = asyncio.run(do_not_call(
                FakeContext(account_id=2, visitor_phone="+919876543210"), reason="not interested"
            ))
        record.assert_called_once_with(2, "+919876543210", "not interested")
        self.assertIn("not be called again", reply)

    def test_it_tells_the_agent_to_stop_selling(self):
        with patch.object(tools.db, "record_do_not_call", return_value=True), \
             patch.object(tools, "_publish_event", new=self._noop), \
             patch.object(tools, "_is_demo", return_value=False):
            reply = asyncio.run(do_not_call(FakeContext(account_id=2, visitor_phone="+91987")))
        self.assertIn("Do not pitch", reply)

    def test_a_demo_call_never_writes_a_real_row(self):
        with patch.object(tools.db, "record_do_not_call") as record, \
             patch.object(tools, "_publish_event", new=self._noop), \
             patch.object(tools, "_is_demo", return_value=True):
            asyncio.run(do_not_call(FakeContext(account_id=2, visitor_phone="+919876543210")))
        record.assert_not_called()

    def test_a_call_with_no_number_still_answers_gracefully(self):
        with patch.object(tools.db, "record_do_not_call") as record, \
             patch.object(tools, "_publish_event", new=self._noop), \
             patch.object(tools, "_is_demo", return_value=False):
            reply = asyncio.run(do_not_call(FakeContext(account_id=2)))
        record.assert_not_called()
        self.assertIn("not be contacted again", reply)

    @staticmethod
    async def _noop(*args, **kwargs):
        return None


if __name__ == "__main__":
    unittest.main(verbosity=2)
