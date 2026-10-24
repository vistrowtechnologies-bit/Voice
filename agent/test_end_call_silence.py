"""end_call armed + a turn that ends without a word must not leave dead air.

Calls 1505 and 1517 (24 Oct 2026, found by the automated combo caller): on
"ठीक है, बाद में बात करते हैं" the model called switch_reply_language and
end_call until the tool-step limit and returned no text. The state went
thinking -> listening with no speaking, so the hang-up (which waits for the
goodbye to finish playing) never fired and the caller sat in silence.
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


class NeedsFallbackGoodbye(unittest.TestCase):
    def test_calls_1505_and_1517_silent_turn_after_end_call(self):
        self.assertTrue(main._needs_fallback_goodbye(dict(ARMED), "thinking", "listening"))

    def test_not_when_the_goodbye_was_spoken(self):
        # speaking -> listening is the normal path; the existing branch hangs up.
        self.assertFalse(main._needs_fallback_goodbye(dict(ARMED), "speaking", "listening"))

    def test_not_while_the_agent_is_still_working(self):
        self.assertFalse(main._needs_fallback_goodbye(dict(ARMED), "listening", "thinking"))
        self.assertFalse(main._needs_fallback_goodbye(dict(ARMED), "thinking", "speaking"))

    def test_not_without_end_call(self):
        self.assertFalse(main._needs_fallback_goodbye({}, "thinking", "listening"))

    def test_not_while_the_caller_is_talking(self):
        self.assertFalse(main._needs_fallback_goodbye(dict(ARMED, user_state="speaking"), "thinking", "listening"))

    def test_only_once_per_call(self):
        self.assertFalse(main._needs_fallback_goodbye(dict(ARMED, fallback_goodbye_sent=True), "thinking", "listening"))


class FallbackGoodbyeLine(unittest.TestCase):
    def test_language_of_the_call(self):
        self.assertEqual(main._fallback_goodbye_line("hi-IN"), "धन्यवाद, आपका दिन शुभ रहे।")
        self.assertEqual(main._fallback_goodbye_line("mr-IN"), "धन्यवाद, आपला दिवस छान जावो.")
        self.assertEqual(main._fallback_goodbye_line("en-IN"), "Thank you, have a great day.")

    def test_other_languages_fall_back_to_english(self):
        for lang in ("ta-IN", "", None):
            self.assertEqual(main._fallback_goodbye_line(lang), "Thank you, have a great day.")

    def test_no_gendered_first_person_verbs(self):
        for line in main._FALLBACK_GOODBYE.values():
            for verb in ("रही", "रहा", "करती", "करता", "I'm", "I am"):
                self.assertNotIn(verb, line)


class WiredIntoTheStateHandler(unittest.TestCase):
    def test_handler_says_the_fallback_and_marks_it(self):
        src = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"), encoding="utf-8").read()
        i = src.index("elif _needs_fallback_goodbye(userdata, str(ev.old_state), str(ev.new_state)):")
        block = src[i:i + 900]
        self.assertIn('userdata["fallback_goodbye_sent"] = True', block)
        self.assertIn("_say_fallback_goodbye()", block)
        # The goodbye must leave ending_call armed, so its playout hangs up.
        j = src.index("async def _say_fallback_goodbye")
        say = src[j:j + 900]
        self.assertIn("session.say(line)", say)
        self.assertIn("generate_reply", say)  # speech-to-speech has no say()
        self.assertIn("await _hang_up(ctx.room.name)", say)


if __name__ == "__main__":
    unittest.main()
