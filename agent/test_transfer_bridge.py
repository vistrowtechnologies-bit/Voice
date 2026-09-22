"""Dialling a colleague INTO the call, when the carrier will not transfer it.

EnableX refuses SIP REFER on our trunk: a tel: target came back "603
Declined (Non sip: uri) (permission_denied)", and a sip: target on our own
trunk was accepted without error while the destination phone never rang
(calls 1036 and 1037, 2026-09-21). Bridging needs nothing from them beyond
an ordinary outbound call — and it makes the handoff warm, because everyone
can hear each other.
"""
import asyncio
import os
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import tools

transfer_call = tools.transfer_call.__wrapped__


class FakeRoom:
    name = "test-phone-918080197945_vistrow-abc"

    def __init__(self):
        p = MagicMock()
        p.identity, p.kind = "sip-918080197945", 3
        self.remote_participants = {"sip-918080197945": p}


class FakeContext:
    def __init__(self, **kw):
        self.userdata = kw


def fake_api(refer_fails=True, bridge_fails=False, trunk_id="ST_8YX6YkEkTymg"):
    api = MagicMock()
    api.aclose = AsyncMock()
    api.sip.transfer_sip_participant = AsyncMock(
        side_effect=RuntimeError("603 Declined (Non sip: uri)") if refer_fails else None
    )
    api.sip.create_sip_participant = AsyncMock(
        side_effect=RuntimeError("dial failed") if bridge_fails else None
    )
    trunk = MagicMock()
    trunk.address, trunk.sip_trunk_id = "35.234.209.8", trunk_id
    result = MagicMock()
    result.items = [trunk] if trunk_id else []
    api.sip.list_sip_outbound_trunk = AsyncMock(return_value=result)
    return api


class BridgeFallback(unittest.TestCase):
    def setUp(self):
        tools._TRUNK_ADDRESS_CACHE.clear()

    def _run(self, api, **userdata):
        ctx = FakeContext(transfer_phone="+917020950304", room=FakeRoom(), **userdata)
        with patch("livekit.api.LiveKitAPI", return_value=api), \
             patch.object(tools, "_publish_event", new=AsyncMock()), \
             patch.object(tools, "_is_demo", return_value=False):
            return asyncio.run(transfer_call(ctx)), ctx

    def test_a_refused_refer_falls_back_to_dialling_the_colleague_in(self):
        api = fake_api(refer_fails=True)
        reply, ctx = self._run(api)
        api.sip.create_sip_participant.assert_awaited_once()
        request = api.sip.create_sip_participant.await_args.args[0]
        self.assertEqual(request.sip_call_to, "+917020950304")
        self.assertEqual(request.room_name, FakeRoom.name)
        self.assertEqual(request.sip_trunk_id, "ST_8YX6YkEkTymg")
        self.assertIn("join this call", reply)

    def test_the_agent_does_not_go_quiet_while_the_phone_is_only_ringing(self):
        # The colleague has been dialled, not reached. Silencing the agent
        # here is how an unanswered transfer becomes a caller listening to
        # nothing — the failure Sarvam's docs call out as looking like
        # success. main.py flips handed_off when they actually join.
        reply, ctx = self._run(fake_api(refer_fails=True))
        self.assertNotIn("handed_off", ctx.userdata)
        self.assertEqual(ctx.userdata["handoff_pending"], "human-917020950304")
        self.assertIn("stay quiet", reply)

    def test_a_working_refer_is_still_preferred(self):
        # A REFER that genuinely moves the caller takes them out of the room,
        # and nothing is dialled in. See AcceptedButNotDelivered for the case
        # where the carrier accepts it and does nothing.
        api = fake_api(refer_fails=False)

        async def gone(room, identity, seconds):
            return False

        with patch.object(tools, "_still_here", new=gone):
            reply, ctx = self._run(api)
        api.sip.create_sip_participant.assert_not_awaited()
        self.assertNotIn("handed_off", ctx.userdata)

    def test_when_both_paths_fail_the_caller_is_told_honestly(self):
        reply, ctx = self._run(fake_api(refer_fails=True, bridge_fails=True))
        self.assertIn("couldn't go through", reply)
        self.assertNotIn("handed_off", ctx.userdata)

    def test_no_trunk_means_no_bridge_attempt(self):
        api = fake_api(refer_fails=True, trunk_id="")
        reply, ctx = self._run(api)
        api.sip.create_sip_participant.assert_not_awaited()
        self.assertIn("couldn't go through", reply)

    def test_the_caller_is_not_left_waiting_while_it_rings(self):
        api = fake_api(refer_fails=True)
        self._run(api)
        request = api.sip.create_sip_participant.await_args.args[0]
        self.assertFalse(request.wait_until_answered)


class AgentGoesQuiet(unittest.TestCase):
    def _turn(self, userdata):
        import main
        agent = main.RealEstateAgent.__new__(main.RealEstateAgent)
        agent._booking_confirmed_this_turn = False
        session = MagicMock()
        session.userdata = userdata
        # `session` is a read-only property on the real class.
        with patch.object(type(agent), "session", property(lambda self: session)):
            message = MagicMock()
            message.text_content = "hello are you still there"
            return asyncio.run(
                main.RealEstateAgent.on_user_turn_completed(agent, MagicMock(), message)
            )

    def test_handed_off_suppresses_the_reply(self):
        import main
        with self.assertRaises(main.StopResponse):
            self._turn({"handed_off": True})


class UnansweredHandoff(unittest.TestCase):
    """A colleague who never picks up must hand the call back to the agent."""

    def test_the_watcher_constants_are_sane(self):
        import inspect, main
        source = inspect.getsource(main.entrypoint)
        self.assertIn("_HANDOFF_ANSWER_WAIT_S = 45.0", source)
        # The flag that silences the agent is only ever set on a real join.
        self.assertIn('userdata["handed_off"] = True', source)
        self.assertIn('identity.startswith("human-")', source)

    def test_a_joining_colleague_is_what_silences_the_agent(self):
        import inspect, main
        source = inspect.getsource(main.entrypoint)
        join_block = source.split('def _on_participant_connected')[1].split('async def')[0]
        self.assertIn('handed_off', join_block)
        self.assertIn('handoff_pending', join_block)


if __name__ == "__main__":
    unittest.main(verbosity=2)


class CallerAsksForAPerson(unittest.TestCase):
    """The handoff is triggered by what the caller said, not by the model's
    mood. Three live calls on 2026-09-21 had the tool registered, the number
    set and a prompt telling the agent to transfer — and produced a refusal,
    a correct transfer, and a promised callback plus hang-up."""

    def _turn(self, said, userdata):
        """Drive the handoff decision alone — the rest of the turn pipeline
        needs a fully built agent and is not what these tests are about."""
        import main
        agent = main.RealEstateAgent.__new__(main.RealEstateAgent)
        session = MagicMock()
        session.userdata = userdata
        session.say = AsyncMock()
        agent._reply_language = "en-IN"
        with patch.object(type(agent), "session", property(lambda self: session)):
            handled = asyncio.run(agent._handoff_if_requested(said, userdata))
        return session, handled

    def _userdata(self, **kw):
        return {"transfer_phone": "+917020950304", "room": FakeRoom(),
                "lead_data": {}, "latency_metrics": {}, **kw}

    def test_a_request_transfers_without_waiting_for_the_model(self):
        import main
        with patch.object(main, "transfer_call") as tool:
            tool.__wrapped__ = AsyncMock(return_value="connecting you now")
            session, stopped = self._turn("आप मुझे आपके एजेंट से कनेक्ट कीजिए।", self._userdata())
        tool.__wrapped__.assert_awaited_once()
        self.assertTrue(stopped, "the model must not also answer this turn")
        # Spoken with session.say, not generate_reply: raising StopResponse
        # cancels a queued reply, which is why call 1066 went silent on the
        # caller the moment they asked to be put through.
        session.say.assert_awaited_once()
        self.assertIn("connect", session.say.await_args.args[0].lower())

    def test_ordinary_conversation_is_untouched(self):
        import main
        with patch.object(main, "transfer_call") as tool:
            tool.__wrapped__ = AsyncMock(return_value="x")
            self._turn("मुझे नई वेबसाइट बनवानी है", self._userdata())
        tool.__wrapped__.assert_not_awaited()

    def test_an_agent_without_a_transfer_number_never_tries(self):
        import main
        with patch.object(main, "transfer_call") as tool:
            tool.__wrapped__ = AsyncMock(return_value="x")
            self._turn("connect me to a human", self._userdata(transfer_phone=""))
        tool.__wrapped__.assert_not_awaited()

    def test_it_only_fires_once_per_call(self):
        import main
        data = self._userdata()
        with patch.object(main, "transfer_call") as tool:
            tool.__wrapped__ = AsyncMock(return_value="connecting you now")
            self._turn("connect me to a human", data)
            self._turn("connect me to a human please", data)
        self.assertEqual(tool.__wrapped__.await_count, 1)

    def test_a_failing_transfer_leaves_the_agent_able_to_retry(self):
        import main
        data = self._userdata()
        with patch.object(main, "transfer_call") as tool:
            tool.__wrapped__ = AsyncMock(side_effect=RuntimeError("livekit down"))
            session, stopped = self._turn("connect me to a human", data)
        self.assertFalse(stopped, "the model should still answer if the transfer blew up")
        self.assertNotIn("transfer_started", data)


class AcceptedButNotDelivered(unittest.TestCase):
    """EnableX accepts our REFER and then does not move the caller.

    Calls 1037 and 1066 (2026-09-21/22): the REFER returned no error, the
    agent believed the handoff was done, and the destination phone never
    rang. The caller was left with an agent that had stopped trying. A real
    transfer takes the caller OUT of the room, so their continued presence
    is the proof it did not happen.
    """

    def setUp(self):
        tools._TRANSFER_HOLD_LINE = None
        tools._TRANSFER_CACHE = None

    def _run(self, caller_leaves):
        room = FakeRoom()
        api = fake_api(refer_fails=False)

        async def still_here(r, identity, seconds):
            return not caller_leaves

        ctx = FakeContext(transfer_phone="+917020950304", room=room)
        with patch("livekit.api.LiveKitAPI", return_value=api), \
             patch.object(tools, "_publish_event", new=AsyncMock()), \
             patch.object(tools, "_is_demo", return_value=False), \
             patch.object(tools, "_still_here", new=still_here):
            reply = asyncio.run(transfer_call(ctx))
        return reply, ctx, api

    def test_a_caller_still_on_the_line_means_the_transfer_failed(self):
        reply, ctx, api = self._run(caller_leaves=False)
        api.sip.create_sip_participant.assert_awaited_once()
        self.assertEqual(ctx.userdata["handoff_pending"], "human-917020950304")
        self.assertIn("join this call", reply)

    def test_a_caller_who_left_was_genuinely_transferred(self):
        reply, ctx, api = self._run(caller_leaves=True)
        api.sip.create_sip_participant.assert_not_awaited()
        self.assertNotIn("handoff_pending", ctx.userdata)
        self.assertIn("connecting them", reply)


class StillHere(unittest.IsolatedAsyncioTestCase):
    async def test_it_returns_false_as_soon_as_they_leave(self):
        room = FakeRoom()
        import asyncio as aio

        async def drop():
            await aio.sleep(0.6)
            room.remote_participants.clear()

        task = aio.create_task(drop())
        self.assertFalse(await tools._still_here(room, "sip-918080197945", 5.0))
        await task

    async def test_it_returns_true_when_they_stay(self):
        room = FakeRoom()
        self.assertTrue(await tools._still_here(room, "sip-918080197945", 1.0))
