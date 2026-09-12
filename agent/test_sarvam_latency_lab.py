"""Regression contract for the isolated all-Sarvam LiveKit A/B lane."""
import ast
import os
import unittest


ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "main.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


class DedicatedWorkerContract(unittest.TestCase):
    def test_session_requires_matching_room_tag(self):
        entrypoint = function_source("entrypoint")
        self.assertIn('call_context.get("pipeline_profile") == _SARVAM_LATENCY_PROFILE', entrypoint)
        self.assertIn("sarvam_latency_lab=sarvam_latency_lab", entrypoint)

    def test_profile_pins_all_three_sarvam_providers(self):
        entrypoint = function_source("entrypoint")
        self.assertIn('"model": "sarvam/sarvam-105b-conversations"', entrypoint)
        self.assertIn('"voice": "simran"', entrypoint)
        self.assertIn('"language": _requested_language or "hi-IN"', entrypoint)


class HonestLatencyMeasurement(unittest.TestCase):
    def test_sarvam_stt_has_no_google_fallback_in_lab(self):
        build_stt = function_source("_build_stt")
        self.assertIn("if sarvam_latency_lab or _GOOGLE_CREDENTIALS is None", build_stt)

    def test_sarvam_tts_has_no_google_fallback_in_lab(self):
        build_tts = function_source("_build_tts")
        self.assertIn("if sarvam_latency_lab or _GOOGLE_CREDENTIALS is None", build_tts)

    def test_web_and_phone_use_sarvams_native_pcm_recipe(self):
        build_tts = function_source("_build_tts")
        self.assertIn('"min_buffer_size": 30', build_tts)
        self.assertIn('"max_chunk_length": 150', build_tts)
        self.assertIn('"output_audio_codec": "linear16"', build_tts)
        self.assertIn('"speech_sample_rate": _TELEPHONY_SAMPLE_RATE if is_phone else 24000', build_tts)


if __name__ == "__main__":
    unittest.main()
