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

    _HELD_OPENING_AFTER_SPEECH_S = 0.15   # scaled down so tests stay fast
    _HELD_OPENING_HARD_CAP_S = 0.9
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
            ud["user_state"] = "speaking"          # VAD: a human is there
            await asyncio.sleep(0.05)
            ud["user_state"] = "listening"         # they stopped; no transcript
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


class RealAgentConstants(unittest.TestCase):
    def test_production_timings_are_sane(self):
        # Long enough not to talk over a caller mid-"hello", short enough that
        # nobody sits in silence. And the cap must never be disabled.
        self.assertGreaterEqual(main.RealEstateAgent._HELD_OPENING_AFTER_SPEECH_S, 1.0)
        self.assertLessEqual(main.RealEstateAgent._HELD_OPENING_AFTER_SPEECH_S, 5.0)
        self.assertGreater(main.RealEstateAgent._HELD_OPENING_HARD_CAP_S, 0)
        self.assertLessEqual(main.RealEstateAgent._HELD_OPENING_HARD_CAP_S, 30.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
