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
import unittest.mock

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
    """Markup stays OFF for tenants: with use_markup=True, 3 of 5 real calls
    (1245, 1246, 1248) had a 2.6-3.2 s TTS first byte on one segment, against
    0 of 37 Chirp calls before. Only a test opt-in may turn it on."""

    def _enabled(self, config, env):
        ns = {"os": os}
        exec(function_source("_chirp_markup_enabled"), ns)
        with unittest.mock.patch.dict(os.environ, env, clear=False):
            if not env:
                os.environ.pop("CHIRP_MARKUP_ACCOUNT_IDS", None)
            return ns["_chirp_markup_enabled"](config)

    def test_chirp_branch_uses_the_opt_in_never_a_constant(self):
        build_tts = function_source("_build_tts")
        self.assertNotIn("use_markup=True", build_tts)
        self.assertIn("use_markup=chirp_markup", build_tts)
        self.assertIn("chirp_markup: bool = False", build_tts)

    def test_off_unless_account_listed_and_agent_named(self):
        named = {"account_id": 2, "name": "Combo test [chirp-markup]"}
        self.assertFalse(self._enabled(named, {}))
        self.assertFalse(self._enabled({"account_id": 7, "name": named["name"]}, {"CHIRP_MARKUP_ACCOUNT_IDS": "2"}))
        self.assertFalse(self._enabled({"account_id": 2, "name": "Combo test"}, {"CHIRP_MARKUP_ACCOUNT_IDS": "2"}))
        self.assertTrue(self._enabled(named, {"CHIRP_MARKUP_ACCOUNT_IDS": " 2 ,5"}))

    def test_break_marker_prompt_only_with_markup_on(self):
        # In the text field a "[pause long]" tag is read aloud (measured), so
        # the LLM may be told about it only when markup is on.
        start = SOURCE.index("# Pause control")
        self.assertIn("and _chirp_markup_enabled(config)):", SOURCE[start - 600:start])


class PerRequestTiming(unittest.TestCase):
    """One [google-tts-timing] line per streaming_synthesize request."""

    def test_one_line_per_request_with_markup_payload(self):
        import asyncio
        from types import SimpleNamespace
        from google_tts_streaming_patch import _PatchedSynthesizeStream

        sent = []

        async def streaming_synthesize(gen, timeout):
            async def responses():
                sent.extend([r async for r in gen])
                yield SimpleNamespace(audio_content=b"\x00" * 320)
            return responses()

        fake = SimpleNamespace(
            _opts=SimpleNamespace(use_markup=True, prompt=None),
            _conn_options=SimpleNamespace(timeout=5),
            _mark_started=lambda: None,
            _tts=SimpleNamespace(_ensure_client=lambda: SimpleNamespace(streaming_synthesize=streaming_synthesize)),
        )

        async def chunks():
            yield "पता है, "
            yield '<expr type="break" label="1s"/> बारह, एमजी रोड।'

        emitter = SimpleNamespace(push=lambda b: None)
        with self.assertLogs("livekit.plugins.google", level="INFO") as logs:
            ok = asyncio.run(_PatchedSynthesizeStream._synthesize_call(fake, chunks(), emitter, None))
        self.assertTrue(ok)
        self.assertEqual(sent[2].input.markup.strip(), "[pause long] बारह, एमजी रोड।")
        line = next(m for m in logs.output if "[google-tts-timing]" in m)
        for part in ("markup=True", "call=1", "chunks=2", "pauses=1", "blank_chunks=0", "audio_bytes=320"):
            self.assertIn(part, line)
        self.assertNotIn("text_to_audio_ms=None", line)


class SarvamStreamingRecipeEverywhere(unittest.TestCase):
    def test_primary_and_safety_net_share_the_recipe(self):
        build_tts = function_source("_build_tts")
        self.assertEqual(build_tts.count("**sarvam_stream_options"), 2)
        self.assertNotIn("if sarvam_latency_lab else {}", build_tts)
        self.assertIn('"output_audio_codec": "linear16"', build_tts)
        self.assertIn('"speech_sample_rate": _TELEPHONY_SAMPLE_RATE if is_phone else 24000', build_tts)


if __name__ == "__main__":
    unittest.main()
