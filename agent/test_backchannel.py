"""The latency backchannel (main.py _backchannel_line and _BACKCHANNEL_*).

Guards the two things that make it read as a person rather than a tic: it
answers in the language actually being spoken, and it never repeats itself
twice running.
"""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main


class BackchannelLine(unittest.TestCase):
    def test_matches_the_language_being_spoken(self):
        for lang, expected in (("hi-IN", "hi"), ("mr-IN", "mr"), ("ta-IN", "ta")):
            self.assertIn(main._backchannel_line(lang), main._BACKCHANNEL_LINES[expected])

    def test_unknown_language_falls_back_to_english(self):
        # Never fail closed into silence, and never speak Hindi at a caller
        # whose language we have no line for.
        for lang in ("", "fr-FR", None):
            self.assertIn(main._backchannel_line(lang), main._BACKCHANNEL_LINES["en"])

    def test_never_repeats_the_previous_line(self):
        # The failure mode this exists to prevent: the same "जी" every turn.
        for previous in main._BACKCHANNEL_LINES["hi"]:
            for _ in range(40):
                self.assertNotEqual(main._backchannel_line("hi-IN", previous), previous)

    def test_lines_are_short_enough_to_finish_before_the_reply(self):
        # The reply's own audio lands ~1.24s after the turn commits. A long
        # ack plays past that and delays what the caller is waiting for.
        for lang, lines in main._BACKCHANNEL_LINES.items():
            for line in lines:
                self.assertLessEqual(len(line.rstrip(". ")), 12, f"{lang}: {line!r}")

    def test_delay_clears_a_whole_median_turn(self):
        # Measured on call 898: reply audio lands ~1.19s after the turn
        # commits (llm 1036 + tts 154). An ack must not fire inside that, or
        # it lands just before the real answer instead of covering a wait —
        # which is exactly what 0.9s did, 9 times in one 3-minute call.
        self.assertGreater(main._BACKCHANNEL_DELAY_S, 1.19 + 0.15)

    def test_every_dashboard_language_has_lines(self):
        # A language offered in the picker but missing here silently falls
        # back to English mid-Hindi-call.
        self.assertIn("hi", main._BACKCHANNEL_LINES)
        self.assertIn("en", main._BACKCHANNEL_LINES)


if __name__ == "__main__":
    unittest.main(verbosity=2)
