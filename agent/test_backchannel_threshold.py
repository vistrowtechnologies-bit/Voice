"""The backchannel must cover tool-call turns and never ordinary ones.

Measured on phone call 950 (vad.speech_end -> first audio):

    1104  1008  1289  1044  980  971  939  7050 ms

Ordinary turns cluster just above 1s. The 7050ms one is a tool-calling turn —
two sequential LLM round trips, log_lead recording a timeline — and it is
seven seconds of dead air on a live phone call.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main

CALL_950_MS = [1104, 1008, 1289, 1044, 980, 971, 939, 7050]
ORDINARY = [m for m in CALL_950_MS if m < 3000]
TOOL_TURN = 7050


class ItFiresOnlyWhereThereIsRealSilence(unittest.TestCase):
    def test_it_is_on(self):
        self.assertTrue(main._BACKCHANNEL_ENABLED)

    def test_no_ordinary_turn_can_reach_it(self):
        threshold_ms = main._BACKCHANNEL_DELAY_S * 1000
        self.assertGreater(threshold_ms, max(ORDINARY),
                           f"would fire on an ordinary turn ({max(ORDINARY)}ms) — "
                           "that is the 9-fillers regression from call 898")

    def test_the_tool_turn_does_reach_it(self):
        self.assertLess(main._BACKCHANNEL_DELAY_S * 1000, TOOL_TURN)

    def test_it_covers_most_of_the_tool_turn(self):
        covered = TOOL_TURN - main._BACKCHANNEL_DELAY_S * 1000
        self.assertGreater(covered, 4000, f"only covers {covered:.0f}ms of dead air")

    def test_there_is_margin_over_the_slowest_ordinary_turn(self):
        """Not tuned to the exact sample — leave room for run-to-run variance."""
        margin = main._BACKCHANNEL_DELAY_S * 1000 - max(ORDINARY)
        self.assertGreaterEqual(margin, 500, f"only {margin:.0f}ms of headroom")


if __name__ == "__main__":
    unittest.main()
