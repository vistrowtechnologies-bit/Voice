"""The original GPT-5 models (gpt-5, gpt-5-mini, gpt-5-nano) reject
reasoning_effort "none" with HTTP 400 (verified 2026-10-21), which made the
admin-only gpt-5-nano agent silent on every turn. GPT-5.x keeps "none"."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main


class Gpt5ReasoningEffort(unittest.TestCase):
    def test_original_gpt5_models_get_minimal(self):
        for model in ("gpt-5-nano", "gpt-5-mini", "gpt-5", "gpt-5-nano-2025-08-07"):
            self.assertEqual(main._openai_voice_kwargs(model), {"reasoning_effort": "minimal"}, model)

    def test_gpt5_x_models_keep_none(self):
        for model in ("gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.1"):
            self.assertEqual(main._openai_voice_kwargs(model), {"reasoning_effort": "none"}, model)

    def test_other_models_get_nothing(self):
        self.assertEqual(main._openai_voice_kwargs("gemini-2.5-flash"), {})

    def test_built_gpt5_nano_llm_sends_minimal(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-test"}):
            built = main._build_llm("gpt-5-nano")
        self.assertEqual(built.model, "gpt-5-nano")
        self.assertEqual(built._opts.reasoning_effort, "minimal")


if __name__ == "__main__":
    unittest.main()
