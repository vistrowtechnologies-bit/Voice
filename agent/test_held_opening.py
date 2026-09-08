"""The outbound opening must never be held forever.

Call 915: 112 seconds, ZERO transcript turns, and VAD had the caller speaking
twice - 349ms and 452ms, two short "hello"s that STT returned nothing for.
The agent said nothing for the entire call and could not recover, because the
hold waits on a transcript and greeting_played stays False while it waits,
which is exactly what suppresses the silence check-in that would otherwise
have rescued it.

Voice activity is the right release signal: it means a human is on the line
whether or not we understood the words.
"""
import asyncio, os, sys, time, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main


class FakeSession:
    """Just enough AgentSession for the watchdog: userdata and say()."""

    def __init__(self, userdata):
        self.userdata = userdata
        self.said = []

    async def say(self, text):
        self.said.append(text)

    def generate_reply(self, instructions=""):
        self.said.append(f"<generated:{instructions[:20]}>")


class Agent:
    """The watchdog only touches these, so borrow the real method."""

    # Graces scaled down so tests stay fast, but the SHORT/long threshold is
    # the real 1.2s - scaling it too made a 349ms "hello" count as long,
    # which is the exact misclassification these tests exist to catch.
    _HELD_OPENING_AFTER_SHORT_SPEECH_S = 0.05
    _HELD_OPENING_AFTER_SPEECH_S = 0.5
    _SHORT_FIRST_UTTERANCE_S = 1.2
    _HELD_OPENING_HARD_CAP_S = 1.5
    _release_held_opening_if_unheard = main.RealEstateAgent._release_held_opening_if_unheard

    def __init__(self, userdata, welcome="Namaste, Artha bol rahi hoon."):
        self.session = FakeSession(userdata)
        self._welcome_message = welcome


class HeldOpeningWatchdog(unittest.TestCase):
    def test_releases_when_vad_heard_speech_but_stt_gave_nothing(self):
        # This is call 915 exactly: the caller speaks, no transcript follows.
        ud = {"outbound_opening_pending": True, "user_state": "listening"}
        a = Agent(ud)

        async def scenario():
            task = asyncio.create_task(a._release_held_opening_if_unheard())
            ud["speech_started_at"] = time.monotonic()   # VAD: a human is there
            await asyncio.sleep(0.05)
            ud["speech_ended_at"] = time.monotonic()     # stopped; no transcript
            await task

        asyncio.run(scenario())
        self.assertEqual(a.session.said, ["Namaste, Artha bol rahi hoon."])
        self.assertTrue(ud["greeting_played"])
        self.assertNotIn("outbound_opening_pending", ud)

    def test_stays_silent_when_a_transcript_arrives_normally(self):
        # The normal path must be untouched: on_user_turn_completed clears the
        # flag and plays the opening itself. Speaking here would double it.
        ud = {"outbound_opening_pending": True, "user_state": "listening"}
        a = Agent(ud)

        async def scenario():
            task = asyncio.create_task(a._release_held_opening_if_unheard())
            await asyncio.sleep(0.05)
            ud.pop("outbound_opening_pending")     # a real transcript landed
            await task

        asyncio.run(scenario())
        self.assertEqual(a.session.said, [])

    def test_hard_cap_speaks_even_if_nothing_is_ever_heard(self):
        # A silent-but-answered line must not leave the agent mute forever.
        ud = {"outbound_opening_pending": True, "user_state": "listening"}
        a = Agent(ud)
        t0 = time.monotonic()
        asyncio.run(a._release_held_opening_if_unheard())
        self.assertEqual(a.session.said, ["Namaste, Artha bol rahi hoon."])
        self.assertGreaterEqual(time.monotonic() - t0, a._HELD_OPENING_HARD_CAP_S * 0.8)

    def test_generates_a_line_when_no_welcome_message_is_configured(self):
        ud = {"outbound_opening_pending": True, "user_state": "listening"}
        a = Agent(ud, welcome="")
        asyncio.run(a._release_held_opening_if_unheard())
        self.assertEqual(len(a.session.said), 1)
        self.assertTrue(a.session.said[0].startswith("<generated:"))

    def test_greeting_played_is_set_so_silence_rules_resume(self):
        # greeting_played False is what suppressed the silence check-in during
        # the hold. Releasing must hand that watchdog back.
        ud = {"outbound_opening_pending": True, "user_state": "listening"}
        a = Agent(ud)
        asyncio.run(a._release_held_opening_if_unheard())
        self.assertTrue(ud["greeting_played"])



class GreetingLengthDecidesTheWait(unittest.TestCase):
    """A bare "hello" is answered almost at once; something substantive gets
    a moment for the transcript, so the reply addresses what was said rather
    than reciting the opener over the top of it."""

    def _elapsed_for(self, spoke_for):
        ud = {"outbound_opening_pending": True, "user_state": "listening"}
        a = Agent(ud)
        now = time.monotonic()
        # Stamp a completed utterance of the given length, already finished,
        # so the only thing left to measure is the grace.
        ud["speech_started_at"] = now - spoke_for
        ud["speech_ended_at"] = now
        t0 = time.monotonic()
        asyncio.run(a._release_held_opening_if_unheard())
        return time.monotonic() - t0, a

    def test_a_349ms_hello_is_answered_almost_immediately(self):
        # Call 915's actual utterance length. This is the case that has to be
        # fast: the recipient says hello, and silence is what makes them hang
        # up.
        waited, a = self._elapsed_for(0.349)
        self.assertLess(waited, 0.3)
        self.assertEqual(a.session.said, ["Namaste, Artha bol rahi hoon."])

    def test_a_substantive_first_turn_waits_for_the_transcript(self):
        # Two seconds of speech is content, not a greeting. Answering it with
        # the canned opener would talk over what they actually said.
        waited, _ = self._elapsed_for(2.0)
        self.assertGreaterEqual(waited, 0.4)


class SpeechDetectionCannotBeMissed(unittest.TestCase):
    def test_a_short_utterance_does_not_fall_between_polls(self):
        # The first version SAMPLED user_state every 200ms, so a 349ms
        # utterance could pass entirely between two samples and be missed
        # altogether. The transition is stamped by the event handler now.
        ud = {"outbound_opening_pending": True, "user_state": "listening"}
        a = Agent(ud)
        now = time.monotonic()
        ud["speech_started_at"] = now - 0.349
        ud["speech_ended_at"] = now
        t0 = time.monotonic()
        asyncio.run(a._release_held_opening_if_unheard())
        # Released on the speech, nowhere near the hard cap.
        self.assertLess(time.monotonic() - t0, a._HELD_OPENING_HARD_CAP_S * 0.5)

    def test_still_speaking_is_never_cut_across(self):
        # Started but never ended: they are mid-sentence, so the watchdog must
        # wait rather than talk over them.
        ud = {"outbound_opening_pending": True, "user_state": "speaking",
              "speech_started_at": time.monotonic()}
        a = Agent(ud)
        t0 = time.monotonic()
        asyncio.run(a._release_held_opening_if_unheard())
        self.assertGreaterEqual(time.monotonic() - t0, a._HELD_OPENING_HARD_CAP_S * 0.8)


class RingbackSafety(unittest.TestCase):
    def test_release_needs_actual_voice_not_just_a_timer(self):
        # VAD is trusted because it stayed silent through 5.8-13.0s of
        # ringback on calls 915-919, five for five. Releasing on a timer
        # alone would put the opening back into ringback.
        ud = {"outbound_opening_pending": True, "user_state": "listening"}
        a = Agent(ud)
        t0 = time.monotonic()
        asyncio.run(a._release_held_opening_if_unheard())
        self.assertGreaterEqual(time.monotonic() - t0, a._HELD_OPENING_HARD_CAP_S * 0.8)


class RealAgentTimings(unittest.TestCase):
    def test_short_greeting_grace_is_actually_short(self):
        self.assertLessEqual(main.RealEstateAgent._HELD_OPENING_AFTER_SHORT_SPEECH_S, 0.5)

    def test_substantive_turn_still_waits_for_a_transcript(self):
        self.assertGreaterEqual(main.RealEstateAgent._HELD_OPENING_AFTER_SPEECH_S, 1.0)

    def test_hard_cap_exists_and_is_bounded(self):
        self.assertGreater(main.RealEstateAgent._HELD_OPENING_HARD_CAP_S, 0)
        self.assertLessEqual(main.RealEstateAgent._HELD_OPENING_HARD_CAP_S, 30.0)

    def test_a_hello_counts_as_short(self):
        # Anything under this uses the fast grace. A "hello" is 300-600ms.
        self.assertGreaterEqual(main.RealEstateAgent._SHORT_FIRST_UTTERANCE_S, 0.8)


if __name__ == "__main__":
    unittest.main(verbosity=2)
