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

    def test_actual_google_setup_keeps_native_options(self):
        """Verify SDK wire setup, without opening a connection or sending audio."""
        from livekit.plugins.google.realtime.realtime_api import RealtimeSession
        from livekit.agents import llm
        from google.genai import types, _live_converters, _common
        from types import SimpleNamespace
        from unittest.mock import patch
        import realtime_config
        with patch.dict(os.environ, {}, clear=True):
            os.environ["GEMINI_API_KEY"] = "offline-not-used"
            for name, silence in ((realtime_config.DEFAULT_MODEL, 500), (realtime_config.MODEL_31, 700)):
                model = main._build_realtime_llm("gemini-live:" + name, "RESPOND IN HINDI", "Achernar", "hi-IN")
                # Avoid the SDK constructor: it starts background network tasks.
                session = object.__new__(RealtimeSession)
                session._realtime_model = model
                session._opts = model._opts
                session._tools = llm.ToolContext.empty()
                session._session_resumption_handle = None
                conf = session._build_connect_config()
                assert conf.response_modalities == ["AUDIO"]
                assert conf.speech_config.language_code is None
                assert conf.speech_config.voice_config.prebuilt_voice_config.voice_name == "Achernar"
                assert conf.input_audio_transcription.language_codes == (["hi-IN", "en-IN"] if name == realtime_config.DEFAULT_MODEL else None)
                assert conf.output_audio_transcription is not None
                aad = conf.realtime_input_config.automatic_activity_detection
                assert aad.end_of_speech_sensitivity.value == ("END_SENSITIVITY_HIGH" if name == realtime_config.DEFAULT_MODEL else "END_SENSITIVITY_LOW")
                assert aad.prefix_padding_ms == (20 if name == realtime_config.DEFAULT_MODEL else 200)
                wire = conf.model_dump(by_alias=True, exclude_none=True)
                assert wire["inputAudioTranscription"] == ({"languageCodes": ["hi-IN", "en-IN"]} if name == realtime_config.DEFAULT_MODEL else {})
                assert conf.realtime_input_config.automatic_activity_detection.silence_duration_ms == silence
                payload = _common.convert_to_dict(_live_converters._LiveConnectParameters_to_mldev(
                    SimpleNamespace(vertexai=False), types.LiveConnectParameters(model=name, config=conf).model_dump(exclude_none=True)
                ))["setup"]
                assert payload["inputAudioTranscription"] == ({"language_codes": ["hi-IN", "en-IN"]} if name == realtime_config.DEFAULT_MODEL else {})
                assert payload["realtimeInputConfig"]["automatic_activity_detection"]["prefix_padding_ms"] == (20 if name == realtime_config.DEFAULT_MODEL else 200)
                thinking = conf.generation_config.thinking_config
                assert not thinking.include_thoughts
                if name == realtime_config.DEFAULT_MODEL:
                    assert thinking.thinking_budget == 0 and thinking.thinking_level is None
                else:
                    assert thinking.thinking_level.value == "MINIMAL" and thinking.thinking_budget is None


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
        agent = SimpleNamespace(
            session=session, _first_speaker="agent", _is_realtime=True,
            realtime_llm_session=Mock(),
            _welcome_message="Namaste, main Artha bol rahi hoon.",
            _reply_language="hi-IN", _warm_llm_prompt_cache=Mock(),
            _await_own_audio_track=AsyncMock(), _direction="inbound",
            _HELD_OPENING_HARD_CAP_S=8.0,
        )
        agent._speak_realtime_greeting = lambda *a, **k: main.RealEstateAgent._speak_realtime_greeting(
            agent, *a, **k)
        agent._release_held_opening_if_unheard = lambda: main.RealEstateAgent._release_held_opening_if_unheard(
            agent)
        return agent

    async def test_realtime_outbound_holds_the_greeting_like_the_pipeline(self):
        # The realtime branch used to greet straight away on outbound, into
        # ringback. It must now hold, and the held release must greet through
        # generate_reply (a realtime model cannot say()).
        agent = self.agent(AsyncMock())
        agent._direction = "outbound"
        agent._HELD_OPENING_HARD_CAP_S = 0.05
        await main.RealEstateAgent.on_enter(agent)
        agent.session.generate_reply.assert_not_called()
        self.assertTrue(agent.session.userdata["outbound_opening_pending"])
        await agent._held_opening_task
        agent.session.generate_reply.assert_called_once()
        self.assertIn("just answered", agent.session.generate_reply.call_args.kwargs["instructions"])
        self.assertTrue(agent.session.userdata["greeting_played"])
        self.assertNotIn("outbound_opening_pending", agent.session.userdata)

    async def test_realtime_outbound_held_while_ringback_plays(self):
        agent = self.agent(AsyncMock())
        agent._direction = "outbound"
        agent._HELD_OPENING_HARD_CAP_S = 0.05
        agent._RINGBACK_GIVE_UP_S = 30.0
        agent.session.userdata["ringback_active"] = True
        await main.RealEstateAgent.on_enter(agent)
        await asyncio.sleep(0.2)
        agent.session.generate_reply.assert_not_called()
        agent._held_opening_task.cancel()

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
        self.assertTrue(agent.session.userdata["realtime_greeting_failed"])

    async def test_user_speaks_first_does_not_generate_a_greeting(self):
        agent = self.agent(AsyncMock())
        agent._first_speaker = "user"
        await main.RealEstateAgent.on_enter(agent)
        agent.session.generate_reply.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
