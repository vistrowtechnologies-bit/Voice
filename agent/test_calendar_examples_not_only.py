"""Offered slots are examples, not the only free times (call 1437, 21 Oct 2026).

Offered 10:00 / 14:30 / 18:30, the caller asked for 10:30 and the model said
"10:30 is not free" without checking: the tool said "Offer ONLY these". The
result must now say they are examples and that any other time is checked
with requested_time first.
"""
import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

import tools

SLOTS = [f"{h:02d}:{m:02d}" for h in range(10, 19) for m in (0, 30)]


def _ctx():
    agent = SimpleNamespace(_is_realtime=True, _reply_language="en-IN", _public_demo_slug="")
    session = SimpleNamespace(current_agent=agent, userdata={})
    return SimpleNamespace(session=session, userdata={}), agent


def _run(date, requested_time="", agent_ctx=None):
    ctx, agent = agent_ctx or _ctx()

    async def fake_check(context, d, mins):
        return list(SLOTS)

    with mock.patch.object(tools, "_calendar_check", fake_check):
        out = asyncio.run(tools.check_calendar_availability.__wrapped__(ctx, date=date, requested_time=requested_time))
    return out, (ctx, agent)


class OfferedSlotsAreExamples(unittest.TestCase):
    def test_three_offered_are_examples_and_other_times_get_checked(self):
        out, _ = _run("2026-10-25")
        self.assertIn("three examples from a fuller free list", out)
        self.assertIn("call check_calendar_availability again with requested_time", out)
        self.assertNotIn("Offer ONLY these", out)

    def test_named_time_that_is_free_comes_back_yes(self):
        out, _ = _run("2026-10-25", requested_time="10:30")
        self.assertTrue(out.startswith("YES"), out[:80])

    def test_asking_again_never_claims_nothing_else_is_open(self):
        out, state = _run("2026-10-25")
        again, _ = _run("2026-10-25", agent_ctx=state)
        self.assertIn("ALREADY offered", again)
        self.assertNotIn("nothing else is open that day", again)
        self.assertIn("requested_time", again)


if __name__ == "__main__":
    unittest.main()
