"""Surviving a carrier outage without burning the contact list.

2026-09-21: EnableX answered every INVITE with "100 Trying" and then never
routed the call. Each dial died on a 30s timeout, for every destination, for
hours. A dialer that keeps going through that spends one attempt per contact
on calls nobody ever received — and with retries configured, spends those
too. A hundred-contact list can be used up on a problem that has nothing to
do with the contacts.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import campaign_dialer

TIMEOUT = "twirp error unknown: sip request timed out"


class Classification(unittest.TestCase):
    """Only failures that never reached the person get a refund."""

    def test_the_real_outage_error_counts_as_carrier_trouble(self):
        self.assertTrue(campaign_dialer._looks_like_carrier_trouble(TIMEOUT))

    def test_other_infrastructure_failures_count_too(self):
        for err in ("SIP service unavailable", "connection refused",
                    "503 Service Unavailable", "no trunk found", "internal error"):
            self.assertTrue(campaign_dialer._looks_like_carrier_trouble(err), err)

    def test_a_rejection_about_this_number_does_not(self):
        # Spending the attempt is right here — otherwise a bad row is retried
        # forever and the campaign never finishes.
        for err in ("404 Not Found", "486 Busy Here", "invalid destination number",
                    "603 Declined"):
            self.assertFalse(campaign_dialer._looks_like_carrier_trouble(err), err)


class Breaker(unittest.TestCase):
    def setUp(self):
        campaign_dialer._consecutive_dial_failures = 0

    def _fail(self, db, error=TIMEOUT, contact_id=1):
        with patch.object(campaign_dialer, "calls_db", db):
            return campaign_dialer._handle_failed_dial(contact_id, 20, error)

    def test_a_carrier_failure_hands_the_contact_back_unspent(self):
        db = MagicMock()
        self._fail(db)
        db.release_campaign_contact.assert_called_once_with(1)
        db.record_campaign_dial_result.assert_not_called()

    def test_a_number_specific_failure_still_counts_against_the_contact(self):
        db = MagicMock()
        self._fail(db, error="404 Not Found")
        db.record_campaign_dial_result.assert_called_once_with(1, 20, "failed")
        db.release_campaign_contact.assert_not_called()

    def test_it_takes_three_in_a_row_to_trip(self):
        db = MagicMock()
        db.running_campaigns.return_value = [{"id": 20, "account_id": 2}]
        self.assertFalse(self._fail(db))
        self.assertFalse(self._fail(db))
        db.pause_campaign_with_reason.assert_not_called()
        self.assertTrue(self._fail(db))
        db.pause_campaign_with_reason.assert_called_once()

    def test_the_operator_is_told_why_and_that_nobody_was_called(self):
        db = MagicMock()
        db.running_campaigns.return_value = [{"id": 20, "account_id": 2}]
        for _ in range(3):
            self._fail(db)
        reason = db.pause_campaign_with_reason.call_args.args[2]
        self.assertIn("could not be placed", reason)
        self.assertIn("were not called", reason)
        self.assertIn("keep their attempts", reason)

    def test_one_success_clears_the_streak(self):
        db = MagicMock()
        db.running_campaigns.return_value = [{"id": 20, "account_id": 2}]
        self._fail(db)
        self._fail(db)
        campaign_dialer._note_dial_outcome(placed=True)
        self.assertFalse(self._fail(db))
        db.pause_campaign_with_reason.assert_not_called()

    def test_every_running_campaign_is_paused_not_just_the_dialling_one(self):
        # The trunk is shared: an outage is never one campaign's problem.
        db = MagicMock()
        db.running_campaigns.return_value = [
            {"id": 20, "account_id": 2}, {"id": 21, "account_id": 1},
        ]
        for _ in range(3):
            self._fail(db)
        paused = [c.args[0] for c in db.pause_campaign_with_reason.call_args_list]
        self.assertEqual(paused, [20, 21])

    def test_one_campaign_failing_to_pause_does_not_stop_the_others(self):
        db = MagicMock()
        db.running_campaigns.return_value = [
            {"id": 20, "account_id": 2}, {"id": 21, "account_id": 1},
        ]
        db.pause_campaign_with_reason.side_effect = [RuntimeError("db blip"), None]
        for _ in range(3):
            self._fail(db)
        self.assertEqual(db.pause_campaign_with_reason.call_count, 2)


class TheOutageReplayed(unittest.TestCase):
    """Sixteen contacts, a trunk that accepts and never routes: how much of
    the list survives?"""

    def setUp(self):
        campaign_dialer._consecutive_dial_failures = 0

    def test_the_list_is_not_burned(self):
        released, spent = [], []
        db = MagicMock()
        db.running_campaigns.return_value = [{"id": 20, "account_id": 2}]
        db.release_campaign_contact.side_effect = released.append
        db.record_campaign_dial_result.side_effect = lambda cid, *a, **k: spent.append(cid)
        tripped_at = None
        with patch.object(campaign_dialer, "calls_db", db):
            for contact_id in range(1, 17):
                if campaign_dialer._handle_failed_dial(contact_id, 20, TIMEOUT):
                    tripped_at = contact_id
                    break
        self.assertEqual(tripped_at, 3, "should stop after three, not sixteen")
        self.assertEqual(len(released), 3)
        self.assertEqual(spent, [], "no contact should have spent an attempt")


if __name__ == "__main__":
    unittest.main(verbosity=2)
