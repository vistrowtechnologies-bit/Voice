"""agent/db.py finish_campaign_contact - resolving an in-flight campaign
contact when its call ends.

The dialer now leaves a placed contact 'calling' for the whole call (that is
what makes its concurrency cap count live calls - campaign 20 was configured
for 3 concurrent and peaked at 10 because contacts were marked 'done' the
instant the dial went out). So the agent owns the final state, and it must
never clobber a more specific outcome already recorded mid-call.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import db


class FakeConn:
    def __init__(self, contact, campaign=None):
        self.contact, self.campaign, self.writes = contact, campaign, []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def close(self):
        pass

    def execute(self, sql, params=()):
        cur = MagicMock()
        if sql.startswith("SELECT status, attempts FROM campaign_contacts"):
            cur.fetchone.return_value = self.contact
        elif sql.startswith("SELECT max_attempts, retry_minutes FROM campaigns"):
            cur.fetchone.return_value = self.campaign
        else:
            self.writes.append((sql, params))
        return cur


def run(contact, outcome, campaign=None):
    conn = FakeConn(contact, campaign)
    with patch.object(db.dbconn, "connect", return_value=conn):
        db.finish_campaign_contact(7, 20, outcome)
    return conn.writes


class Finish(unittest.TestCase):
    def test_connected_call_becomes_done(self):
        writes = run({"status": "calling", "attempts": 1}, "connected")
        self.assertEqual(len(writes), 1)
        self.assertIn("status = 'done'", writes[0][0])
        self.assertIn("AND status = 'calling'", writes[0][0])

    def test_already_resolved_mid_call_is_never_overwritten(self):
        # voicemail / carrier announcement / unanswered leg got there first.
        for status in ("no_answer", "voicemail", "done", "failed"):
            self.assertEqual(run({"status": status, "attempts": 1}, "connected"), [])

    def test_no_answer_with_attempts_left_schedules_a_retry(self):
        writes = run({"status": "calling", "attempts": 1}, "no_answer",
                     {"max_attempts": 3, "retry_minutes": 30})
        sql, params = writes[0]
        self.assertIn("status = 'no_answer'", sql)
        self.assertIsNotNone(params[0])  # next_attempt_at

    def test_no_answer_on_last_attempt_is_terminal(self):
        writes = run({"status": "calling", "attempts": 1}, "no_answer",
                     {"max_attempts": 1, "retry_minutes": 60})
        self.assertIsNone(writes[0][1][0])

    def test_null_campaign_policy_does_not_crash(self):
        writes = run({"status": "calling", "attempts": 1}, "no_answer",
                     {"max_attempts": None, "retry_minutes": None})
        self.assertEqual(len(writes), 1)

    def test_missing_contact_is_a_no_op(self):
        self.assertEqual(run(None, "connected"), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
