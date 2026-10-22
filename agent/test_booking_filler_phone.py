"""Booking fixes, 2026-10-14 (owner request, from real booking test calls):
- the generic tool-wait line was English "One second..." on Hindi calls;
- book_appointment accepted a mis-heard 9-digit number ("982134567")."""
import asyncio
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import tools


def _context(language: str | None, *, backchannel: bool = False, realtime: bool = False):
    agent = SimpleNamespace(_reply_language=language, _is_realtime=realtime)
    session = SimpleNamespace(userdata={"backchannel_turn": backchannel}, current_agent=agent)
    ctx = MagicMock()
    ctx.session = session
    ctx.with_filler = MagicMock(return_value="filler-cm")
    return ctx


class FillerFollowsTheCallLanguage(unittest.TestCase):
    def test_hindi_call_hears_hindi(self):
        ctx = _context("hi-IN")
        tools._tool_filler(ctx)
        ctx.with_filler.assert_called_once_with("एक सेकंड...", delay=0.6)

    def test_every_supported_language_has_a_line(self):
        for code in ("hi-IN", "en-IN", "mr-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN", "gu-IN", "bn-IN", "pa-IN", "od-IN"):
            self.assertTrue(tools._tool_filler_text(code).strip(), code)

    def test_unknown_language_falls_back_to_english(self):
        self.assertEqual(tools._tool_filler_text("fr-FR"), "One second...")
        self.assertEqual(tools._tool_filler_text(None), "One second...")

    def test_existing_skips_still_apply(self):
        for ctx in (_context("hi-IN", backchannel=True), _context("hi-IN", realtime=True)):
            tools._tool_filler(ctx)
            ctx.with_filler.assert_not_called()


class BookingRejectsImplausiblePhones(unittest.TestCase):
    def _book(self, phone: str) -> str:
        func = tools.book_appointment._func
        return asyncio.run(func(MagicMock(), "2026-10-17", "11:00", "Ravi Kumar", phone, "site visit"))

    def test_misheard_nine_digit_number_is_rejected(self):
        # The exact value from booking test calls 1296 and 1298.
        out = self._book("982134567")
        self.assertIn("BOOKING REJECTED", out)
        self.assertIn("digit by digit", out)

    def test_ten_digit_number_starting_1_to_5_is_rejected(self):
        self.assertIn("BOOKING REJECTED", self._book("4821345671"))

    def test_plausible_numbers_pass_the_phone_check(self):
        # These must get past the phone check; whatever rejects them next
        # (e.g. the availability gate) must not be about the phone number.
        for phone in ("9821345670", "+91 98213 45670", "09821345670", "+971501234567", "+14155552671"):
            out = self._book(phone)
            self.assertNotIn("phone number", out, phone)


if __name__ == "__main__":
    unittest.main()


class BookingRejectsTheBusinessOwnNumber(unittest.TestCase):
    """Call 1459: a website caller was booked under +91 90670 97779, the
    business's own number from the prompt."""

    def _ctx(self, visitor_phone=""):
        ctx = MagicMock()
        ctx.session.current_agent = SimpleNamespace(instructions="Contact +91 90670 97779, hello@vistrow.com.")
        ctx.userdata = {"visitor_phone": visitor_phone}
        return ctx

    def test_business_number_is_rejected(self):
        out = asyncio.run(tools.book_appointment._func(self._ctx(), "2026-10-22", "14:00", "Abhishek", "+919067097779", "growth audit"))
        self.assertIn("business's own contact number", out)

    def test_callers_own_number_is_not_rejected_by_this_rule(self):
        out = asyncio.run(tools.book_appointment._func(self._ctx("+919067097779"), "2026-10-22", "14:00", "Abhishek", "+919067097779", "growth audit"))
        self.assertNotIn("business's own contact number", out)


class StillCheckingLine(unittest.TestCase):
    def test_slow_lookup_gets_one_different_line(self):
        said = []
        agent = SimpleNamespace(_reply_language="hi-IN", _voice_gender="female", _is_realtime=False)
        ctx = MagicMock()
        ctx.session = SimpleNamespace(current_agent=agent, say=lambda text, **k: said.append(text))

        async def go():
            async def slow():
                await asyncio.sleep(0.05)
                return ["10:00"]
            with unittest.mock.patch.object(tools, "_STILL_CHECKING_AFTER_S", 0.01):
                first = await tools._await_with_still_checking(ctx, asyncio.ensure_future(slow()))
                second = await tools._await_with_still_checking(ctx, asyncio.ensure_future(slow()))
            return first, second
        first, second = asyncio.run(go())
        self.assertEqual((first, second), (["10:00"], ["10:00"]))
        self.assertEqual(said, ["बस देख रही हूँ..."])  # once per call

    def test_fast_lookup_says_nothing(self):
        said = []
        agent = SimpleNamespace(_reply_language="hi-IN", _voice_gender="female", _is_realtime=False)
        ctx = MagicMock()
        ctx.session = SimpleNamespace(current_agent=agent, say=lambda text, **k: said.append(text))

        async def go():
            async def fast():
                return []
            return await tools._await_with_still_checking(ctx, asyncio.ensure_future(fast()))
        self.assertEqual(asyncio.run(go()), [])
        self.assertEqual(said, [])
