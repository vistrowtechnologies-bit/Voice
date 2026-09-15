"""Caller memory must come from a real conversation, and name the right side.

Call 980 reached a carrier "busy on another call" recording; its summary was
saved as the caller's history, and call 981 opened with "you were busy on
another call". Call 981's own summary then said "The caller is from Vistrow
Technologies" — the agent's business attributed to the caller.
"""
import io
import os
import re
import unittest

SRC = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"), encoding="utf-8").read()


class MemoryIsOnlySavedFromARealConversation(unittest.TestCase):
    def setUp(self):
        m = re.search(r"want_memory = \((.*?)\n        \)", SRC, re.S)
        self.assertIsNotNone(m)
        self.gate = m.group(1)

    def test_a_failed_or_carrier_call_is_not_remembered(self):
        self.assertIn('not userdata.get("failure_reason")', self.gate)

    def test_a_voicemail_is_not_remembered(self):
        self.assertIn('not userdata.get("voicemail_detected")', self.gate)

    def test_the_voicemail_branch_sets_the_flag(self):
        i = SRC.index("voicemail detected on outbound call")
        self.assertIn('_userdata["voicemail_detected"] = True', SRC[i:i + 200])


class TheSummaryKeepsTheSidesStraight(unittest.TestCase):
    def test_the_prompt_says_which_lines_are_the_caller(self):
        self.assertIn("only the user lines are", SRC)
        self.assertIn("Never describe the caller as being from our business", SRC)


if __name__ == "__main__":
    unittest.main()
