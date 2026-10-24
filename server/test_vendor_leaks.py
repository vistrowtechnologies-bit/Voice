"""Tenant-facing responses must not name our speech, model or voice vendors
(owner rule 2026-10-15, vendor-leak request on issue #2, 24 Oct)."""
import re
import unittest

import calls_db
import help_tools

VENDOR_WORDS = re.compile(r"sarvam|gemini|google|openai|gpt|groq|qwen|elevenlabs|chirp|deepgram|cartesia", re.I)


class CallLatencyMetrics(unittest.TestCase):
    STORED = {
        "stack": {"stt": "sarvam", "llm": "sarvam/sarvam-105b-conversations", "tts": "google:chirp3:Kore",
                  "ttsProvider": "google"},
        "providers": ["sarvam/saaras", "google/chirp3"],
        "usage": {"gpt-5-nano": {"input": 120}},
        "llmUsage": {"model": "gemini-3.8"},
        "callerStopToFirstAudioMs": [820, 1140],
        "eouMs": [310.5],
        "repromptsAbsorbed": 2,
        "flag": True,
        "mixed": [1, "google"],
    }

    def test_timings_stay_and_vendor_text_goes(self):
        kept = calls_db._tenant_latency_metrics(self.STORED)
        self.assertEqual(kept, {"callerStopToFirstAudioMs": [820, 1140], "eouMs": [310.5], "repromptsAbsorbed": 2})
        self.assertIsNone(VENDOR_WORDS.search(repr(kept)))

    def test_garbage_is_empty(self):
        self.assertEqual(calls_db._tenant_latency_metrics(None), {})
        self.assertEqual(calls_db._tenant_latency_metrics(["x"]), {})


class HelpBotModelNames(unittest.TestCase):
    def summary(self, model):
        agent = {"id": 1, "name": "Siya", "status": "live", "model": model, "voiceName": "Myra", "language": "hi-IN"}
        return help_tools._agent_summary(agent, {})["model"]

    def test_every_known_model_has_a_vendor_free_name(self):
        for model, label in help_tools._MODEL_LABELS.items():
            self.assertIsNone(VENDOR_WORDS.search(label), (model, label))
            self.assertEqual(self.summary(model), label)

    def test_realtime_model_is_named(self):
        self.assertEqual(self.summary("gemini-live:gemini-3.8-live"), "Vistrow Live 3.8")

    def test_an_unknown_model_never_echoes_the_raw_id(self):
        self.assertEqual(self.summary("openai/gpt-9-turbo"), "Vistrow model")


if __name__ == "__main__":
    unittest.main(verbosity=2)
