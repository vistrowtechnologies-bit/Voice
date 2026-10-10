"""A speech-to-speech (Gemini Live) agent cannot session.say()
(RealtimeCapabilities.supports_say is False). The booking filler logged an
error on every booking there, and the transfer hold line raised and was
swallowed, so realtime transfers bridged in silence.
"""
import asyncio
import contextlib
import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import main
import tools


def _context(realtime: bool):
    session = SimpleNamespace(userdata={}, current_agent=SimpleNamespace(_is_realtime=realtime))
    return SimpleNamespace(session=session, with_filler=mock.MagicMock(name="with_filler"))


class ToolFiller(unittest.TestCase):
    def test_realtime_agent_gets_no_filler(self):
        ctx = _context(realtime=True)
        self.assertIsInstance(tools._tool_filler(ctx), contextlib.nullcontext)
        ctx.with_filler.assert_not_called()

    def test_pipeline_agent_still_gets_the_filler(self):
        ctx = _context(realtime=False)
        self.assertIs(tools._tool_filler(ctx), ctx.with_filler.return_value)

    def test_no_running_agent_falls_back_to_the_filler(self):
        class _Session:
            userdata = {}

            @property
            def current_agent(self):
                raise RuntimeError("VoiceAgent isn't running")

        ctx = SimpleNamespace(session=_Session(), with_filler=mock.MagicMock())
        self.assertIs(tools._tool_filler(ctx), ctx.with_filler.return_value)


class TransferHoldLine(unittest.TestCase):
    def _handoff(self, realtime: bool):
        session = SimpleNamespace(say=mock.AsyncMock(), generate_reply=mock.AsyncMock())
        agent = SimpleNamespace(_is_realtime=realtime, _reply_language="en-IN", session=session)
        userdata = {"transfer_phone": "+911234567890"}
        fake_tool = SimpleNamespace(__wrapped__=mock.AsyncMock(return_value="transferred"))
        with mock.patch.object(main.transfer_intent, "wants_human", return_value=True), \
             mock.patch.object(main, "transfer_call", fake_tool):
            started = asyncio.run(main.RealEstateAgent._handoff_if_requested(agent, "connect me to a person", userdata))
        self.assertTrue(started)
        return session

    def test_realtime_speaks_the_hold_line_through_the_model(self):
        session = self._handoff(realtime=True)
        session.say.assert_not_called()
        session.generate_reply.assert_awaited_once()
        self.assertIn(main._TRANSFER_HOLD_LINE["en"], session.generate_reply.call_args.kwargs["instructions"])

    def test_pipeline_still_uses_say(self):
        session = self._handoff(realtime=False)
        session.say.assert_awaited_once_with(main._TRANSFER_HOLD_LINE["en"])
        session.generate_reply.assert_not_called()


if __name__ == "__main__":
    unittest.main()
