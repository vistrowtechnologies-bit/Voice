"""An unanswered phone must not hold a carrier channel indefinitely.

Call 1055 (2026-09-21) rang for 94 seconds and was never answered. On SIP a
ringing call occupies one of the trunk's channels for its whole duration, and
this account has three — so a third of capacity was spent on a phone nobody
picked up. LiveKit rings until the carrier gives up unless told otherwise.
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import livekit_sip


class RingingTimeout(unittest.TestCase):
    def test_it_is_set_and_sane(self):
        seconds = livekit_sip._RINGING_TIMEOUT.seconds
        self.assertGreaterEqual(seconds, 30, "shorter than a normal pickup would drop real answers")
        self.assertLessEqual(seconds, 45, "longer wastes a scarce channel")

    def test_it_sits_just_past_the_agents_own_ringback_give_up(self):
        # agent/main.py gives up on detected ringback at 30s; the carrier-side
        # cap has to be the outer bound, not the inner one.
        agent_main = open(os.path.join(os.path.dirname(__file__), "..", "agent", "main.py")).read()
        give_up = float(re.search(r"_RINGBACK_GIVE_UP_S = ([\d.]+)", agent_main).group(1))
        self.assertGreater(livekit_sip._RINGING_TIMEOUT.seconds, give_up)

    def test_every_outbound_call_carries_it(self):
        source = open(os.path.join(os.path.dirname(__file__), "livekit_sip.py")).read()
        self.assertEqual(source.count("CreateSIPParticipantRequest("), 1,
                         "a second dial path would need the cap too")
        self.assertEqual(source.count("ringing_timeout=_RINGING_TIMEOUT"), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
