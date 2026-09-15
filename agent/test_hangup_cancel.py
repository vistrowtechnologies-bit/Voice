"""A caller who keeps talking after end_call must not be hung up on.

Call 979: the caller confirmed WhatsApp, the agent called end_call, the caller
then asked "इसका प्राइस क्या रहेगा वेबसाइट में?", the agent answered, and the
still-armed hang-up dropped the line five seconds after the answer.
"""
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main

ARMED = {"ending_call": True, "ending_call_from_tool": True}


class PendingHangup(unittest.TestCase):
    def test_call_979_price_question_cancels_it(self):
        self.assertTrue(main._caller_reopened_conversation(dict(ARMED), "इसका प्राइस क्या रहेगा वेबसाइट में?"))

    def test_a_goodbye_keeps_it(self):
        for text in ("धन्यवाद", "ok thank you", "bye bye"):
            with self.subTest(text=text):
                self.assertFalse(main._caller_reopened_conversation(dict(ARMED), text))

    def test_a_backchannel_keeps_it(self):
        for text in ("जी बिल्कुल जी", "ठीक है", "हाँ"):
            with self.subTest(text=text):
                self.assertFalse(main._caller_reopened_conversation(dict(ARMED), text))

    def test_voicemail_and_carrier_hangups_are_never_cancelled(self):
        self.assertFalse(main._caller_reopened_conversation({"ending_call": True}, "कौन बोल रहा है?"))

    def test_nothing_armed_nothing_to_cancel(self):
        self.assertFalse(main._caller_reopened_conversation({}, "इसका प्राइस क्या रहेगा?"))


class TheToolMarksItsOwnHangup(unittest.TestCase):
    def test_end_call_sets_the_marker(self):
        src = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools.py"), encoding="utf-8").read()
        self.assertIn('context.userdata["ending_call_from_tool"] = True', src)

    def test_the_watcher_does_not_hang_up_on_a_barge_in(self):
        src = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"), encoding="utf-8").read()
        i = src.index('ev.old_state == "speaking"\n            and ev.new_state != "speaking"')
        self.assertIn('userdata.get("user_state") != "speaking"', src[i:i + 300])


if __name__ == "__main__":
    unittest.main()
