"""RealEstateAgent must actually construct. Nothing tested that until now.

Commit 2841656 added `is_phone=(call_context or {}).get("call_type")` inside
__init__, where call_context is a LOCAL of entrypoint() and not in scope. That
is a NameError on every single call, and it was deployed to both workers — the
19:05 test call produced no call record at all because the agent died before
the session started.

The whole suite passed the entire time. 122 tests, and not one of them built
the agent: test_held_opening uses a stand-in class, the persona tests call the
prompt builders directly. A crash in __init__ was invisible.
"""
import os
import sys
import unittest
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main

# A config with no external dependencies — enough to exercise __init__.
BASE = {
    "id": 1, "account_id": 1, "name": "Test", "model": "gpt-4.1-mini",
    "voice": "shubh", "language": "hi-IN", "tone": "balanced",
    "system_prompt": "You are a test agent.", "enabled_functions": "end_call",
    "_compliance_config": {},
}


class ItConstructs(unittest.TestCase):
    def test_outbound_phone(self):
        a = main.RealEstateAgent(dict(BASE), direction="outbound", call_type="phone")
        self.assertEqual(a._direction, "outbound")
        self.assertTrue(a.instructions)

    def test_inbound_phone(self):
        main.RealEstateAgent(dict(BASE), direction="inbound", call_type="phone")

    def test_widget(self):
        # No direction at all — the browser path. This must not assume the
        # phone-only fields exist.
        main.RealEstateAgent(dict(BASE), call_type="widget")

    def test_browser_with_nothing_passed(self):
        # The most permissive call shape. If __init__ reads anything that
        # only exists on a phone call, this is where it shows.
        main.RealEstateAgent(dict(BASE))


class RealtimeIgnoresThePipeline(unittest.TestCase):
    """A speech-to-speech model must not build or touch any STT/TTS leg."""

    def setUp(self):
        os.environ["GEMINI_API_KEY"] = os.environ.get("GEMINI_API_KEY") or "test-key-not-used-offline"

    def _agent(self, model):
        cfg = dict(BASE, model=model, voice="google:chirp3:Aoede")
        return main.RealEstateAgent(cfg, call_type="widget")

    def test_no_tts_is_built(self):
        for model in ("gemini-live", "gemini-live:gemini-3.1-flash-live-preview"):
            a = self._agent(model)
            self.assertTrue(a._is_realtime)
            self.assertIsNone(a.tts)
            self.assertIsNone(a.stt)
            self.assertEqual(a._tts_provider, "realtime")

    def test_pipeline_agent_is_unchanged(self):
        a = main.RealEstateAgent(dict(BASE), call_type="widget")
        self.assertFalse(a._is_realtime)
        self.assertIsNotNone(a.tts)
        self.assertNotEqual(a._tts_provider, "realtime")

    def test_native_provider_settings(self):
        from livekit.agents.utils import is_given
        for model in ("gemini-live", "gemini-live:gemini-3.1-flash-live-preview"):
            a = self._agent(model)
            opts = a.llm._opts
            self.assertFalse(is_given(opts.language))
            self.assertFalse(opts.thinking_config.include_thoughts)
            if "3.1" in model:
                self.assertEqual(opts.thinking_config.thinking_level.value, "MINIMAL")
                self.assertIsNone(opts.thinking_config.thinking_budget)
            else:
                self.assertEqual(opts.thinking_config.thinking_budget, 0)
                self.assertIsNone(opts.thinking_config.thinking_level)


class TheChannelReachesTheStt(unittest.TestCase):
    """Sarvam's per-channel VAD silence: 500ms telephony, 300ms browser."""

    def test_call_type_is_an_explicit_parameter(self):
        import inspect
        sig = inspect.signature(main.RealEstateAgent.__init__)
        self.assertIn("call_type", sig.parameters,
                      "call_type must be passed in, not read from a caller's local")

    def test_entrypoint_passes_it(self):
        import inspect
        src = inspect.getsource(main)
        self.assertIn('call_type=call_context.get("call_type")', src)

    def test_init_does_not_reach_for_call_context(self):
        # The actual bug: reading a name that only exists in entrypoint().
        # Checks CODE, not prose — the comment above the parameter explains
        # the bug and legitimately mentions the name.
        import ast, inspect
        tree = ast.parse(inspect.getsource(main.RealEstateAgent.__init__).strip())
        names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
        self.assertNotIn("call_context", names,
                         "__init__ reads call_context, which is a local of entrypoint()")


class RealtimeGreetingLifecycle(unittest.IsolatedAsyncioTestCase):
    def agent(self, playout):
        session = SimpleNamespace(userdata={}, generate_reply=Mock(
            return_value=SimpleNamespace(wait_for_playout=playout)))
        return SimpleNamespace(
            session=session, _first_speaker="agent", _is_realtime=True,
            _welcome_message="Namaste, main Artha bol rahi hoon.",
            _reply_language="hi-IN", _warm_llm_prompt_cache=Mock(),
            _await_own_audio_track=AsyncMock(),
        )

    async def test_greeting_is_pending_until_playout_finishes(self):
        entered, release = asyncio.Event(), asyncio.Event()
        async def playout():
            entered.set()
            await release.wait()
        agent = self.agent(playout)
        task = asyncio.create_task(main.RealEstateAgent.on_enter(agent))
        await entered.wait()
        self.assertTrue(agent.session.userdata["realtime_greeting_pending"])
        self.assertFalse(agent.session.userdata.get("greeting_played", False))
        release.set()
        await task
        self.assertTrue(agent.session.userdata["greeting_played"])
        self.assertFalse(agent.session.userdata["realtime_greeting_pending"])
        agent.session.generate_reply.assert_called_once()

    async def test_failed_greeting_releases_pending_flag(self):
        agent = self.agent(AsyncMock(side_effect=RuntimeError("offline failure")))
        with self.assertRaises(RuntimeError):
            await main.RealEstateAgent.on_enter(agent)
        self.assertFalse(agent.session.userdata["realtime_greeting_pending"])
        self.assertFalse(agent.session.userdata.get("greeting_played", False))

    async def test_user_speaks_first_does_not_generate_a_greeting(self):
        agent = self.agent(AsyncMock())
        agent._first_speaker = "user"
        await main.RealEstateAgent.on_enter(agent)
        agent.session.generate_reply.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
