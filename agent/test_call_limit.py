import asyncio
import unittest

import call_limit


class _Clock:
    """Virtual time: sleep() advances it instantly, so a 6-minute call runs in milliseconds."""
    def __init__(self):
        self.now = 0.0
        self.events = []

    async def sleep(self, seconds):
        self.now += seconds
        await asyncio.sleep(0)

    def mark(self, what):
        self.events.append((round(self.now, 1), what))


async def _run(max_s, userdata, *, demo=False, speak_raises=False, script=None):
    clock = _Clock()
    spoken = []

    def speak(text):
        clock.mark("wrap-up")
        if speak_raises:
            raise RuntimeError("tts down")
        spoken.append(text)

    async def hang_up():
        clock.mark("hang-up")

    async def sleep(s):
        await clock.sleep(s)
        if script:
            script(clock, userdata)

    await call_limit.run_guard(max_s, userdata=userdata, speak=speak, hang_up=hang_up,
                               is_platform_demo=demo, sleep=sleep)
    return clock, spoken


class LeadTests(unittest.TestCase):
    def test_lead_is_25s_for_normal_limits_and_a_third_for_short_ones(self):
        self.assertEqual(call_limit.wrapup_lead_seconds(360), 25.0)
        self.assertEqual(call_limit.wrapup_lead_seconds(60), 20.0)
        self.assertAlmostEqual(call_limit.wrapup_lead_seconds(30), 10.0)

    def test_demo_wrapup_invites_them_back_but_tenant_wrapup_does_not(self):
        self.assertIn("book a demo", call_limit.wrapup_instructions(True))
        self.assertNotIn("book a demo", call_limit.wrapup_instructions(False))
        for demo in (True, False):
            self.assertIn("Do not ask a question", call_limit.wrapup_instructions(demo))


class GuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_farewell_25s_before_the_limit_then_hang_up_at_the_limit(self):
        ud = {}
        clock, spoken = await _run(360, ud)
        self.assertEqual(clock.events, [(335.0, "wrap-up"), (360.0, "hang-up")])
        self.assertEqual(len(spoken), 1)
        self.assertTrue(ud["ending_call"])  # lets the existing handler hang up after the goodbye

    async def test_waits_while_the_caller_is_speaking_and_then_speaks(self):
        ud = {"user_state": "speaking"}

        def script(clock, u):
            if clock.now >= 338.0:
                u["user_state"] = "listening"

        clock, _ = await _run(360, ud, script=script)
        wrap = next(t for t, w in clock.events if w == "wrap-up")
        self.assertGreaterEqual(wrap, 338.0)
        self.assertEqual(clock.events[-1], (360.0, "hang-up"))

    async def test_never_waits_past_half_the_lead_even_if_the_caller_never_stops(self):
        ud = {"user_state": "speaking"}
        clock, spoken = await _run(360, ud)
        wrap = next(t for t, w in clock.events if w == "wrap-up")
        self.assertLessEqual(wrap, 335.0 + 12.6)
        self.assertEqual(clock.events[-1], (360.0, "hang-up"))

    async def test_waits_for_the_agent_to_finish_its_answer(self):
        ud = {"agent_state": "speaking"}

        def script(clock, u):
            if clock.now >= 337.0:
                u["agent_state"] = "listening"

        clock, _ = await _run(360, ud, script=script)
        self.assertGreaterEqual(next(t for t, w in clock.events if w == "wrap-up"), 337.0)

    async def test_call_already_ending_gets_no_second_goodbye_but_still_hits_the_ceiling(self):
        clock, spoken = await _run(360, {"ending_call": True})
        self.assertEqual(spoken, [])
        self.assertEqual(clock.events, [(360.0, "hang-up")])

    async def test_silence_timers_are_stopped_before_the_farewell_starts(self):
        order = []
        clock = _Clock()

        async def sleep(s):
            await clock.sleep(s)

        async def hang_up():
            order.append("hang-up")

        await call_limit.run_guard(
            360, userdata={}, speak=lambda t: order.append("speak"), hang_up=hang_up,
            before_speak=lambda: order.append("timers-cancelled"), sleep=sleep)
        self.assertEqual(order, ["timers-cancelled", "speak", "hang-up"])

    async def test_timers_are_left_alone_when_there_is_no_wrapup(self):
        order = []

        async def hang_up():
            order.append("hang-up")

        await call_limit.run_guard(
            360, userdata={"ending_call": True}, speak=lambda t: order.append("speak"), hang_up=hang_up,
            before_speak=lambda: order.append("timers-cancelled"), sleep=_Clock().sleep)
        self.assertEqual(order, ["hang-up"])

    async def test_handed_off_call_is_left_alone(self):
        _, spoken = await _run(360, {"handed_off": True})
        self.assertEqual(spoken, [])

    async def test_if_the_farewell_cannot_start_the_hard_cut_still_ends_the_call(self):
        ud = {}
        clock, _ = await _run(360, ud, speak_raises=True)
        self.assertFalse(ud["ending_call"])
        self.assertEqual(clock.events[-1], (360.0, "hang-up"))

    async def test_cancelled_call_never_speaks_or_hangs_up(self):
        spoken, hung = [], []

        async def hang_up():
            hung.append(1)

        task = asyncio.create_task(call_limit.run_guard(
            360, userdata={}, speak=spoken.append, hang_up=hang_up))
        await asyncio.sleep(0)
        task.cancel()
        await task
        self.assertEqual((spoken, hung), ([], []))


if __name__ == "__main__":
    unittest.main()
