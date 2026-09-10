"""The outbound opening must never be held forever.

WIRED IN again as of 2026-09-09. on_enter holds the outbound opening and
starts this watchdog; the hold was reverted on 2026-09-08 and restored when
removing it brought back the failure it existed to prevent - a call recording
with the ring tone and the opening playing over each other, so the recipient
picks up partway through and hears only the tail of the line.

What makes the hold safe this time is the release signal. The first version
waited for a TRANSCRIPT, so an utterance STT could not read left the agent
mute (call 915: 112 seconds). This waits on VOICE ACTIVITY, caps the wait,
and sets greeting_played so the silence check-in is handed back.

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


class TheHoldIsActuallyWiredIn(unittest.TestCase):
    """The watchdog spent a day written, tested and never started.

    Its tests all passed the whole time, because they call the method
    directly. Nothing asserted that on_enter reaches it, so the safety net
    existed and did nothing. These check the wiring itself.
    """

    def test_on_enter_holds_the_opening_for_outbound(self):
        import inspect
        src = inspect.getsource(main.RealEstateAgent.on_enter)
        self.assertIn("outbound_opening_pending", src,
                      "on_enter no longer holds the outbound opening")
        self.assertIn("_release_held_opening_if_unheard", src,
                      "the hold is set but its release watchdog is never started")

    def test_the_hold_is_outbound_only(self):
        # An inbound caller dialled US and is waiting to be greeted. Holding
        # their opening would be silence on a call they initiated.
        import inspect
        src = inspect.getsource(main.RealEstateAgent.on_enter)
        held = src.index("outbound_opening_pending")
        guard = src.rindex('self._direction == "outbound"', 0, held)
        self.assertLess(guard, held, "the hold is not guarded on direction")

    def test_release_hands_back_the_silence_checkin(self):
        # greeting_played staying False is what suppressed the away check-in
        # and turned a missed opener into 112 seconds of nothing.
        import inspect
        src = inspect.getsource(main.RealEstateAgent._release_held_opening_if_unheard)
        self.assertIn('greeting_played', src)


class TheFirstPlayingIsNotAReplay(unittest.TestCase):
    """Call 935 logged "Agent replayed its opening line mid-call" as an error
    for an opening that played exactly once.

    The detector fires when greeting_played is set and the reply contains the
    opener. Both held-opening paths set greeting_played BEFORE speaking it —
    deliberately, so the silence check-in is handed back immediately — so the
    one legitimate playing looks identical to a mid-call echo. on_enter sets
    the flag after its say(), which is why this never surfaced until the hold
    came back.
    """

    def test_both_hold_paths_mark_the_deliberate_playing(self):
        import inspect
        for fn in (main.RealEstateAgent._release_held_opening_if_unheard,
                   main.RealEstateAgent.on_user_turn_completed):
            with self.subTest(fn=fn.__name__):
                src = inspect.getsource(fn)
                self.assertIn("greeting_played", src)
                self.assertIn("opening_being_played", src,
                              f"{fn.__name__} plays the opener without marking it")

    def test_the_suppression_is_one_shot(self):
        # pop(), not get(): a SECOND appearance of the opener mid-call is the
        # real defect this detector exists for and must still be reported.
        import inspect, re
        src = inspect.getsource(main)
        line = next(l for l in src.splitlines() if "opening_being_played" in l and "pop" in l)
        self.assertIn("pop(", line)


class SilentRecipientsAreNotPunished(unittest.TestCase):
    """Call 936: the cap was 20s and the recipient simply waited.

    Answered 4.9s, "Caller away" 17.5s, first speech 24.2s — about 19 seconds
    of mutual silence, because on an OUTBOUND call the recipient expects the
    caller to speak first. The opening then released straight into their
    "hello" and was cut off at "...bol rahi hoon Vistrow"; the agent
    re-introduced itself three times and they hung up.
    """

    def test_the_cap_bounds_both_failures(self):
        """4s was too short and 20s was too long; both were measured.

        At 20s, call 936 sat in 19 seconds of mutual silence and the opening
        collided with the recipient finally speaking.

        At 4s, call 949 released the greeting into ringback — "callee
        answered" had fired 100ms after "still dialing", which is
        sip.callStatus going active on 183 early media, not a pickup. The
        recipient never spoke, so the interrupted-opener recovery never fired
        either; they heard silence and hung up, and the operator had to dial
        a second time.

        A recipient who makes any sound is released by VAD in under a second
        and never reaches this cap at all.
        """
        cap = main.RealEstateAgent._HELD_OPENING_HARD_CAP_S
        self.assertGreaterEqual(cap, 8.0, "short enough to greet a ringing handset again")
        self.assertLessEqual(cap, 15.0, "long enough to read as a dropped line (call 936)")

    def test_the_cap_still_leaves_room_for_a_greeting(self):
        # It must not be so tight that it fires before someone saying "hello"
        # can be heard and release it normally.
        self.assertGreaterEqual(main.RealEstateAgent._HELD_OPENING_HARD_CAP_S, 2.0)

    def test_a_greeting_still_releases_far_sooner_than_the_cap(self):
        # The common path must never depend on the cap.
        self.assertLess(
            main.RealEstateAgent._HELD_OPENING_AFTER_SHORT_SPEECH_S,
            main.RealEstateAgent._HELD_OPENING_HARD_CAP_S / 2,
        )
