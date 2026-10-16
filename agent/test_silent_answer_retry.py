"""A dialled call where nobody ever spoke is a no-answer, ringback or not.

Call 1390 (16 Oct 2026): the network answered silently (SIP 200, no ring
tone), the owner saw a missed call, the agent greeted an empty line for
22 s, and the contact was recorded 'connected' with no retry. The CRM got
"Not Reachable" correctly; the dialler did not."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main


class CampaignEndOutcome(unittest.TestCase):
    def test_silent_answer_without_ringback_is_no_answer(self):
        self.assertEqual(main._campaign_end_outcome({"ringback_seen": False, "caller_spoke": False}), "no_answer")

    def test_rang_out_unanswered_is_still_no_answer(self):
        self.assertEqual(main._campaign_end_outcome({"ringback_seen": True, "caller_spoke": False}), "no_answer")

    def test_a_person_who_spoke_is_connected(self):
        self.assertEqual(main._campaign_end_outcome({"ringback_seen": False, "caller_spoke": True}), "connected")
        self.assertEqual(main._campaign_end_outcome({"ringback_seen": True, "caller_spoke": True}), "connected")


if __name__ == "__main__":
    unittest.main()
