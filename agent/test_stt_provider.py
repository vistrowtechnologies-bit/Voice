"""The explicit Google STT lane must be a real Chirp 3 lane."""
import ast
import os
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "main.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


def method_source(class_name: str, method_name: str) -> str:
    cls = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == class_name)
    node = next(n for n in cls.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == method_name)
    return ast.get_source_segment(SOURCE, node) or ""


class GoogleChirp3Stt(unittest.TestCase):
    def test_explicit_lane_is_streaming_chirp3_and_language_pinned(self):
        build = function_source("_build_stt")
        self.assertIn('stt_provider == "google-chirp3"', build)
        self.assertIn('model="chirp_3"', build)
        self.assertIn('detect_language=False', build)
        self.assertIn('endpointing_sensitivity="ENDPOINTING_SENSITIVITY_SHORT"', build)

    def test_india_near_ga_region_is_the_default(self):
        build = function_source("_build_stt")
        self.assertIn('GOOGLE_SPEECH_LOCATION", "asia-southeast1"', build)

    def test_agent_config_reaches_the_provider_factory(self):
        init = method_source("RealEstateAgent", "__init__")
        self.assertIn('stt_provider=config.get("stt_provider") or "sarvam"', init)

    def test_perceived_latency_is_recorded_from_state_events(self):
        self.assertIn('"callerStopToFirstAudioMs": []', SOURCE)
        self.assertIn('userdata["pending_caller_stop_at"] = stopped_at', SOURCE)
        self.assertIn('userdata["latency_metrics"]["callerStopToFirstAudioMs"].append(perceived_ms)', SOURCE)


if __name__ == "__main__":
    unittest.main()
