"""Gemini 3.8 persona descriptors guide both the LLM and speech synthesis."""

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


class Gemini38VoicePersonalityTests(unittest.TestCase):
    def test_casual_persona_informs_llm_prompt_and_tts_style(self):
        config = {
            "id": 1,
            "account_id": 1,
            "name": "Test",
            "model": "gpt-4.1-mini",
            "voice": "google38flash:zubenelgenubi",
            "language": "en-IN",
            "tone": "balanced",
            "system_prompt": "You are a test agent.",
            "enabled_functions": "end_call",
        }
        with patch.dict(os.environ, {"GEMINI_API_KEY": "offline-test-key"}):
            agent = main.RealEstateAgent(config, direction="inbound", call_type="phone")

        instructions = agent.instructions.lower()
        self.assertIn("selected voice persona (casual)", instructions)
        self.assertIn("use relaxed, informal and friendly conversational phrasing", instructions)
        self.assertIn("configured agent tone (balanced)", instructions)
        self.assertIn("conversational", agent.tts._style)
        self.assertIn("relaxed, informal and friendly", agent.tts._style)

    def test_explicit_professional_tone_suppresses_casual_tts_style_hint(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "offline-test-key"}):
            tts, _provider = main._build_tts(
                "en-IN", "google38flash:zubenelgenubi", main.TONE_PRESETS["professional"],
                "professional", is_phone=False,
            )
        self.assertIn("business-consultant delivery", tts._style)
        self.assertNotIn("relaxed, informal", tts._style)


if __name__ == "__main__":
    unittest.main()
