"""Unanswered campaign dials must be recorded and retried.

Campaigns 8, 9 and 10 on 2026-09-15: one rang out unanswered, one never rang
(trunk 503), one was a real 78s conversation. All three ended up identical in
campaign_contacts as done/placed with no retry, and each campaign had already
auto-completed about a second after dialling, so a later correction could
never be picked up by the dialer anyway.
"""
import asyncio
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import db
import main


class _Rows:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _FakeConn:
    def __init__(self, max_attempts, attempts):
        self.max_attempts = max_attempts
        self.attempts = attempts
        self.sql = []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        self.sql.append(sql)
        if "FROM campaigns" in sql:
            return _Rows({"max_attempts": self.max_attempts, "retry_minutes": 60})
        if "FROM campaign_contacts" in sql:
            return _Rows({"attempts": self.attempts})
        return _Rows(None)

    def close(self):
        pass


def _reopened(conn):
    return any("UPDATE campaigns SET status = 'running'" in s for s in conn.sql)


class RetryReopensTheCampaign(unittest.TestCase):
    def test_a_scheduled_retry_reopens_a_completed_campaign(self):
        conn = _FakeConn(max_attempts=3, attempts=1)
        with mock.patch.object(db.dbconn, "connect", return_value=conn):
            db.record_campaign_voicemail(38, 10, "no_answer")
        self.assertTrue(_reopened(conn))

    def test_the_last_attempt_does_not_reopen_it(self):
        conn = _FakeConn(max_attempts=1, attempts=1)
        with mock.patch.object(db.dbconn, "connect", return_value=conn):
            db.record_campaign_voicemail(38, 10, "no_answer")
        self.assertFalse(_reopened(conn))


class UnansweredDialIsRecorded(unittest.TestCase):
    def test_a_campaign_dial_records_no_answer(self):
        with mock.patch.object(db, "record_campaign_voicemail") as rec:
            asyncio.run(main._record_unanswered_campaign_dial(
                {"campaign_contact_id": 38, "campaign_id": 10}, "never answered"))
        rec.assert_called_once_with(38, 10, "no_answer")

    def test_a_non_campaign_call_records_nothing(self):
        with mock.patch.object(db, "record_campaign_voicemail") as rec:
            asyncio.run(main._record_unanswered_campaign_dial(
                {"campaign_contact_id": None, "campaign_id": None}, "never answered"))
        rec.assert_not_called()


if __name__ == "__main__":
    unittest.main()
