"""Chirp 3 HD pause markup and the promoted Sarvam streaming recipe (2026-10-13).

Measured on hi-IN-Chirp3-HD-Achernar: only "[pause long]" in Cloud TTS's
`markup` field adds silence (0.7-1.1 s); in the `text` field a tag is read
aloud. So Chirp runs with use_markup=True and the LLM's break marker is
rewritten to that one tag, everything else stripped.
"""
import ast
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

from google_tts_streaming_patch import chirp_markup

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "main.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


class ChirpMarkup(unittest.TestCase):
    def test_break_marker_becomes_the_one_tag_chirp_honours(self):
        self.assertEqual(
            chirp_markup('दस बजे खुलता है। <expr type="break" label="1s"/> पता लिखिए।'),
            "दस बजे खुलता है। [pause long] पता लिखिए।",
        )
        self.assertEqual(chirp_markup('a <expr type="break" label="500ms" /> b'), "a [pause long] b")

    def test_every_other_tag_is_stripped(self):
        self.assertEqual(
            chirp_markup('<expr type="expression" label="warm"/> नमस्ते <laugh> जी'),
            "नमस्ते जी",
        )

    def test_plain_text_and_stray_brackets_pass_through(self):
        # "[Name]" in the markup field is not spoken (measured), so it needs no escaping.
        self.assertEqual(chirp_markup("नमस्ते [Name], कैसे हैं?"), "नमस्ते [Name], कैसे हैं?")
        self.assertEqual(chirp_markup("ठीक है..."), "ठीक है...")


class WiringInMain(unittest.TestCase):
    def test_chirp_branch_uses_the_markup_field(self):
        build_tts = function_source("_build_tts")
        chirp = build_tts[build_tts.index("CHIRP3_PERSONA_PREFIX") :] if "CHIRP3_PERSONA_PREFIX" in build_tts else build_tts
        self.assertIn("use_markup=True", chirp)
        # The Gemini persona branch and the locale Standard voices keep the text field.
        self.assertEqual(build_tts.count("use_markup=True"), 1)

    def test_only_chirp_agents_are_told_about_the_break_marker(self):
        self.assertIn("voice_value.startswith(voice_catalog.CHIRP3_PERSONA_PREFIX)", SOURCE)
        self.assertIn('<expr type=\\"break\\" label=\\"1s\\"/>', SOURCE)


class SarvamStreamingRecipeEverywhere(unittest.TestCase):
    def test_primary_and_safety_net_share_the_recipe(self):
        build_tts = function_source("_build_tts")
        self.assertEqual(build_tts.count("**sarvam_stream_options"), 2)
        self.assertNotIn("if sarvam_latency_lab else {}", build_tts)
        self.assertIn('"output_audio_codec": "linear16"', build_tts)
        self.assertIn('"speech_sample_rate": _TELEPHONY_SAMPLE_RATE if is_phone else 24000', build_tts)


if __name__ == "__main__":
    unittest.main()
