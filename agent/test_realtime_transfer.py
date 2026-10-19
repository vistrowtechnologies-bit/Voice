"""Caller-requested transfer on realtime calls (Dashboard session finding, 19 Oct 2026).

livekit-agents 1.8.6 calls on_user_turn_completed only from AudioRecognition's
end of turn (STT/VAD). A realtime session has neither, so the keyword transfer
check never ran on gemini-live calls. The final caption now triggers it from
conversation_item_added via _realtime_handoff_task.
"""
import asyncio
import unittest
from types import SimpleNamespace
from unittest import mock

import main


def _item(role, text):
    return SimpleNamespace(role=role, text_content=text)


class RealtimeHandoffTask(unittest.TestCase):
    def setUp(self):
        self.calls = []

        async def handoff(text, userdata):
            self.calls.append(text)
            return True

        self.agent = SimpleNamespace(_is_realtime=True, _handoff_if_requested=handoff)
        self.userdata = {"transfer_phone": "+919999999999"}

    def test_caller_caption_on_realtime_runs_the_check(self):
        coro = main._realtime_handoff_task(self.agent, self.userdata, _item("user", "please connect me to a person"))
        self.assertIsNotNone(coro)
        asyncio.run(coro)
        self.assertEqual(self.calls, ["please connect me to a person"])

    def test_nothing_to_do_on_the_pipeline_or_for_the_agents_own_lines(self):
        pipeline = SimpleNamespace(_is_realtime=False, _handoff_if_requested=self.agent._handoff_if_requested)
        self.assertIsNone(main._realtime_handoff_task(pipeline, self.userdata, _item("user", "connect me")))
        self.assertIsNone(main._realtime_handoff_task(self.agent, self.userdata, _item("assistant", "connecting")))
        self.assertIsNone(main._realtime_handoff_task(self.agent, {}, _item("user", "connect me")))
        self.assertIsNone(main._realtime_handoff_task(self.agent, self.userdata, _item("user", "   ")))

    def test_a_failing_check_never_raises_into_the_event_loop(self):
        async def boom(text, userdata):
            raise RuntimeError("x")

        agent = SimpleNamespace(_is_realtime=True, _handoff_if_requested=boom)
        asyncio.run(main._realtime_handoff_task(agent, self.userdata, _item("user", "connect me")))


class RealtimeTransferInterruptsTheModel(unittest.TestCase):
    def test_model_reply_is_interrupted_before_the_hold_line(self):
        order = []
        session = SimpleNamespace(
            interrupt=lambda **k: order.append("interrupt"),
            generate_reply=mock.AsyncMock(side_effect=lambda **k: order.append("hold_line")),
        )
        agent = SimpleNamespace(_is_realtime=True, _reply_language="hi-IN", session=session)
        userdata = {"transfer_phone": "+919999999999"}

        async def fake_transfer(ctx):
            order.append("transfer")
            return "transferred"

        with mock.patch.object(main.transfer_call, "__wrapped__", fake_transfer):
            started = asyncio.run(main.RealEstateAgent._handoff_if_requested(
                agent, "mujhe kisi insaan se baat karni hai, connect kar do", userdata))
        self.assertTrue(started)
        self.assertEqual(order, ["interrupt", "hold_line", "transfer"])


if __name__ == "__main__":
    unittest.main()
