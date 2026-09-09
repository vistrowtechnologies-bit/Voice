"""A caller saying "hello" again must not throw away the reply in flight.

Call 939, the spiral the operator reported. The caller re-prompts about 1.2s
after their own previous turn; the agent needs ~400ms endpointing + ~450ms LLM
+ ~150ms TTS before any sound. The re-prompt lands inside that window and
every new turn discards the reply being prepared:

    17903ms turn -> thinking -> 18657ms listening   (nothing said)
    19060ms turn -> thinking -> 19933ms listening   (nothing said)
    20336ms turn -> LLM ran  -> 22368ms listening   (nothing said)
    22371ms turn -> LLM ran  -> 24774ms speaking    ("ठीक है," and no more)

Self-reinforcing, because the discarded reply IS the silence that prompts the
next "हेलो". Three of eleven turns died this way and the caller hung up.

Measured on both STT paths, so this is not a realtime-STT regression: call 928
on the legacy plugin abandoned 6 of 14 turns (43%), call 939 abandoned 3 of 11.
"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main


class WhatCountsAsAContentFreeReprompt(unittest.TestCase):
    """The guard reuses _looks_like_opening_ack, so what it matches decides
    which turns get absorbed. Too wide and real questions are swallowed."""

    def test_the_reprompts_from_call_939(self):
        for text in ("हेलो।", "हाँ बोलिए।", "हाँ बोलिए ना।"):
            with self.subTest(text=text):
                self.assertTrue(main._looks_like_opening_ack(text))

    def test_a_real_question_is_never_absorbed(self):
        # These MUST interrupt. Absorbing them would mean the caller asked
        # something and the agent carried on with an unrelated answer.
        for text in ("इसका प्राइस क्या है?", "प्रीमियम कस्टम वाला चाहिए।",
                     "ठीक है, बाय।", "मुझे वेबसाइट चाहिए",
                     "Haan mujhe website banwani hai"):
            with self.subTest(text=text):
                self.assertFalse(main._looks_like_opening_ack(text))


class TheGuardIsWiredAndNarrow(unittest.TestCase):
    def test_absorption_only_while_a_reply_is_in_flight(self):
        # A "हेलो" into genuine silence is a real turn and must be answered —
        # that is the caller checking whether the line is dead, and answering
        # it is the whole point.
        import inspect
        src = inspect.getsource(main.RealEstateAgent.on_user_turn_completed)
        self.assertIn("_reply_in_flight", src)
        self.assertIn('("thinking", "speaking")', src)

    def test_it_stops_the_turn_rather_than_replying_twice(self):
        import inspect
        src = inspect.getsource(main.RealEstateAgent.on_user_turn_completed)
        after = src[src.index("_reply_in_flight"):]
        self.assertIn("StopResponse()", after)

    def test_absorbed_reprompts_are_counted(self):
        # Silently dropping caller turns is exactly the kind of thing that
        # must be measurable, or a guard that is too wide never gets caught.
        import inspect
        src = inspect.getsource(main.RealEstateAgent.on_user_turn_completed)
        self.assertIn("repromptsAbsorbed", src)


if __name__ == "__main__":
    unittest.main(verbosity=2)
