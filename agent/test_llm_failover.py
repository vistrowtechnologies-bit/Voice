"""The default Sarvam LLM fails over to gpt-5.4-nano (gpt-4o-mini until 2026-10-14), and Gemini 2.5 gets a
thinking config it accepts (2026-10-12: thinking_level made 2.5 agents silent)."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main
from livekit.agents import llm


class SarvamFailsOverToGpt54Nano(unittest.TestCase):
    def test_sarvam_is_wrapped_with_the_fallback(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test", "LLM_FALLBACK": "1"}):
            built = main._build_llm("sarvam/sarvam-105b-conversations")
        self.assertIsInstance(built, llm.FallbackAdapter)
        models = [m.model for m in built._llm_instances]
        self.assertEqual(models, ["sarvam-105b-conversations", "gpt-5.4-nano"])
        # GPT-5.4 only accepts temperature with reasoning off, and "none" keeps
        # the first token fast on a live call.
        self.assertEqual(built._llm_instances[1]._opts.reasoning_effort, "none")

    def test_switch_turns_it_off(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test", "LLM_FALLBACK": "0"}):
            built = main._build_llm("sarvam/sarvam-105b-conversations")
        self.assertNotIsInstance(built, llm.FallbackAdapter)

    def test_no_openai_key_means_no_fallback(self):
        env = {k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"}
        with patch.dict(os.environ, env, clear=True):
            built = main._build_llm("sarvam/sarvam-105b-conversations")
        self.assertNotIsInstance(built, llm.FallbackAdapter)


class GeminiThinkingConfig(unittest.TestCase):
    def _thinking(self, model):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test"}), patch.object(main.google, "LLM") as fake:
            main._build_llm(model)
        return fake.call_args.kwargs["thinking_config"]

    def test_gemini_25_uses_a_zero_budget(self):
        self.assertEqual(self._thinking("gemini-2.5-flash"), {"thinking_budget": 0})

    def test_gemini_3_uses_minimal_level(self):
        self.assertEqual(self._thinking("gemini-3.6-flash"), {"thinking_level": "MINIMAL"})
        self.assertEqual(self._thinking("gemini-3.5-flash-lite"), {"thinking_level": "MINIMAL"})

    def test_gemini_37_38_flash_use_low(self):
        # They reject MINIMAL; Flash-Lite variants keep it.
        for model in ("gemini-3.8-flash", "gemini-3.7-flash"):
            self.assertEqual(self._thinking(model), {"thinking_level": "LOW"}, model)
        self.assertEqual(self._thinking("gemini-3.8-flash-lite"), {"thinking_level": "MINIMAL"})


if __name__ == "__main__":
    unittest.main()
