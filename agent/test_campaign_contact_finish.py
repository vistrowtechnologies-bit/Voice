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
        elif sql.startswith("SELECT max_attempts") or sql.startswith("SELECT retry_policy"):
            cur.fetchone.return_value = self.campaign
        else:
            self.writes.append((sql, params))
        return cur


def scheduled_retry(write):
    """next_attempt_at from a no_answer/short_call write, or None if terminal."""
    sql, params = write
    assert "next_attempt_at = ?" in sql, sql
    return params[1]


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
        self.assertIsNone(scheduled_retry(writes[0]))

    def test_null_campaign_policy_does_not_crash(self):
        writes = run({"status": "calling", "attempts": 1}, "no_answer",
                     {"max_attempts": None, "retry_minutes": None})
        self.assertEqual(len(writes), 1)

    def test_missing_contact_is_a_no_op(self):
        self.assertEqual(run(None, "connected"), [])


class PerOutcomeRetryPolicy(unittest.TestCase):
    """campaigns.retry_policy (see retry_rules.py) overrides the campaign's
    blanket max_attempts/retry_minutes, and the agent must apply the same
    rules the server does."""

    def test_policy_grants_more_attempts_than_the_campaign_default(self):
        # Campaign default says 1 attempt (terminal), policy says 3 for no_answer.
        writes = run(
            {"status": "calling", "attempts": 1},
            "no_answer",
            {"max_attempts": 1, "retry_minutes": 60,
             "retry_policy": '{"no_answer": {"attempts": 3, "gapMinutes": 15}}'},
        )
        self.assertEqual(len(writes), 1)
        self.assertIsNotNone(scheduled_retry(writes[0]), "a retry should have been scheduled")

    def test_policy_can_stop_retrying_sooner_than_the_default(self):
        writes = run(
            {"status": "calling", "attempts": 2},
            "no_answer",
            {"max_attempts": 9, "retry_minutes": 60,
             "retry_policy": '{"no_answer": {"attempts": 2}}'},
        )
        self.assertIsNone(scheduled_retry(writes[0]), "policy ceiling reached, must be terminal")

    def test_campaign_without_a_policy_behaves_exactly_as_before(self):
        with_policy = run({"status": "calling", "attempts": 1}, "no_answer",
                          {"max_attempts": 3, "retry_minutes": 30, "retry_policy": ""})
        legacy = run({"status": "calling", "attempts": 1}, "no_answer",
                     {"max_attempts": 3, "retry_minutes": 30})
        self.assertEqual(with_policy[0][0], legacy[0][0])
        self.assertIsNotNone(with_policy[0][1][0])

    def test_malformed_policy_falls_back_instead_of_stranding_the_contact(self):
        writes = run({"status": "calling", "attempts": 1}, "no_answer",
                     {"max_attempts": 2, "retry_minutes": 30, "retry_policy": "{not json"})
        self.assertEqual(len(writes), 1)
        self.assertIsNotNone(scheduled_retry(writes[0]))


class ShortCall(unittest.TestCase):
    """A call that connected and lasted seconds is not a conversation. Off
    unless the campaign sets short_call.underSeconds."""

    def _finish(self, seconds, policy):
        conn = FakeConn({"status": "calling", "attempts": 1},
                        {"max_attempts": 3, "retry_minutes": 30, "retry_policy": policy})
        with patch.object(db.dbconn, "connect", return_value=conn):
            db.finish_campaign_contact(7, 20, "connected", duration_seconds=seconds)
        return conn.writes

    def test_short_connected_call_is_retried_when_configured(self):
        writes = self._finish(4.0, '{"short_call": {"underSeconds": 15, "attempts": 2}}')
        self.assertIn("status = 'no_answer'", writes[0][0])
        self.assertEqual(writes[0][1][0], "short call")
        self.assertIsNotNone(scheduled_retry(writes[0]))

    def test_a_real_conversation_is_still_done(self):
        writes = self._finish(140.0, '{"short_call": {"underSeconds": 15}}')
        self.assertIn("status = 'done'", writes[0][0])

    def test_off_by_default_even_for_a_two_second_call(self):
        writes = self._finish(2.0, "")
        self.assertIn("status = 'done'", writes[0][0])

    def test_no_duration_means_no_short_call_decision(self):
        conn = FakeConn({"status": "calling", "attempts": 1},
                        {"max_attempts": 3, "retry_minutes": 30,
                         "retry_policy": '{"short_call": {"underSeconds": 15}}'})
        with patch.object(db.dbconn, "connect", return_value=conn):
            db.finish_campaign_contact(7, 20, "connected")
        self.assertIn("status = 'done'", conn.writes[0][0])


if __name__ == "__main__":
    unittest.main(verbosity=2)
