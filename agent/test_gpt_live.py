"""OpenAI GPT-Live 1 ("Vistrow Duplex", owner-only) builds as a speech-to-speech
agent, takes Gemini Live's place, and leaves Gemini Live and pipelines unchanged."""
import os
import unittest
from unittest.mock import patch

os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main  # noqa: E402
from livekit.agents.llm import DuplexModel  # noqa: E402
from livekit.plugins import openai  # noqa: E402
from test_agent_constructs import BASE  # noqa: E402


class ModelName(unittest.TestCase):
    def test_parsing(self):
        self.assertEqual(main._gpt_live_model_name("duplex:live-1"), "gpt-live-1")
        self.assertEqual(main._gpt_live_model_name("duplex"), "gpt-live-1")
        self.assertEqual(main._gpt_live_model_name("duplex:"), "gpt-live-1")
        self.assertEqual(main._gpt_live_model_name("duplex:unknown"), "gpt-live-1")


class Builder(unittest.TestCase):
    def test_defaults(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "offline-not-used"}):
            os.environ.pop("GPT_LIVE_VOICE", None)
            os.environ.pop("GPT_LIVE_BACKEND_MODEL", None)
            m = main._build_gpt_live_llm("duplex:live-1", "RESPOND IN HINDI")
        self.assertIsInstance(m, openai.realtime.GPTLiveModel)
        self.assertIsInstance(m, DuplexModel)
        self.assertEqual(m._opts.model, "gpt-live-1")
        self.assertEqual(m._opts.voice, "nira")
        self.assertEqual(m._opts.responses["model"], "gpt-5.6-luna")
        self.assertEqual(m._opts.responses["instructions"], "RESPOND IN HINDI")

    def test_env_overrides(self):
        env = {"OPENAI_API_KEY": "offline-not-used", "GPT_LIVE_VOICE": "marin", "GPT_LIVE_BACKEND_MODEL": "gpt-5.4-nano"}
        with patch.dict(os.environ, env):
            m = main._build_gpt_live_llm("duplex", "x")
        self.assertEqual(m._opts.voice, "marin")
        self.assertEqual(m._opts.responses["model"], "gpt-5.4-nano")

    def test_missing_key_is_a_clear_error(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                main._build_gpt_live_llm("duplex:live-1", "x")


class AgentUsesIt(unittest.TestCase):
    def setUp(self):
        os.environ["OPENAI_API_KEY"] = os.environ.get("OPENAI_API_KEY") or "test-key-not-used-offline"
        os.environ["GEMINI_API_KEY"] = os.environ.get("GEMINI_API_KEY") or "test-key-not-used-offline"

    def test_gpt_live_agent_is_speech_to_speech(self):
        a = main.RealEstateAgent(dict(BASE, model="duplex:live-1", voice="google:chirp3:Aoede"), call_type="widget")
        self.assertTrue(a._is_realtime)
        self.assertTrue(a._is_gpt_live)
        self.assertEqual(a._realtime_model_name, "gpt-live-1")
        self.assertIsNone(a.stt)
        self.assertIsNone(a.tts)
        self.assertEqual(a._tts_provider, "realtime")
        self.assertFalse(a._realtime_wants_tts_greeting())

    def test_gemini_live_is_unchanged(self):
        a = main.RealEstateAgent(dict(BASE, model="gemini-live:gemini-3.8-live", voice="google:chirp3:Aoede"), call_type="widget")
        self.assertTrue(a._is_realtime)
        self.assertFalse(a._is_gpt_live)
        self.assertEqual(a._realtime_model_name, "gemini-3.8-live")
        self.assertNotIsInstance(a.llm, DuplexModel)

    def test_pipeline_is_unchanged(self):
        a = main.RealEstateAgent(dict(BASE), call_type="widget")
        self.assertFalse(a._is_realtime)
        self.assertFalse(a._is_gpt_live)
        self.assertEqual(a._realtime_model_name, "")
        self.assertIsNotNone(a.tts)


if __name__ == "__main__":
    unittest.main()
