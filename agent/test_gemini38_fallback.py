"""Gemini 3.8 must never leave a caller in silence.

Before: a missing GEMINI_API_KEY raised inside _build_tts, which runs while
the agent is constructed, so the call died; and a Gemini API error mid-call
had no fallback. 3.8 Flash's provider label was also missing from the
language-range and language-switch checks. The backups must never be handed
the LLM's <expr/> markup, which they would read aloud.
"""
import asyncio
import base64
import json
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")

import language
import main
from gemini_interactions_tts import GeminiInteractionsTTS
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS

_CREDS = {
    "type": "service_account", "project_id": "x", "client_email": "a@b.c",
    "private_key": "k", "token_uri": "https://oauth2.googleapis.com/token",
}
_BASE = {
    "id": 1, "account_id": 1, "name": "Test", "model": "gpt-4.1-mini",
    "voice": "google38:kore", "language": "hi-IN", "tone": "balanced",
    "system_prompt": "You are a test agent.", "enabled_functions": "end_call",
}


def _no_gemini_key():
    env = {k: v for k, v in os.environ.items() if k not in ("GEMINI_API_KEY", "GOOGLE_API_KEY")}
    return patch.dict(os.environ, env, clear=True)


class MissingKey(unittest.TestCase):
    def test_tts_falls_back_to_sarvam_instead_of_raising(self):
        with _no_gemini_key(), patch.object(main.db, "log_platform_error") as logged:
            _tts, provider = main._build_tts("hi-IN", "google38:kore", {"pace": 1.0}, "balanced", is_phone=True)
        self.assertEqual(provider, "sarvam")
        self.assertIn("GEMINI_API_KEY", logged.call_args.args[0])


class SamePersonaBackup(unittest.TestCase):
    def build(self, voice, tone="balanced"):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "k"}), \
                patch.object(main, "_GOOGLE_CREDENTIALS", _CREDS), \
                patch.object(main, "_GOOGLE_VOICE_ENABLED", True):
            return main._build_tts("hi-IN", voice, {"pace": 1.0}, tone)

    def test_backup_is_the_same_persona_on_3_1(self):
        for voice, model in (("google38:sulafat", "gemini-3.8-flash-lite-tts"),
                             ("google38flash:puck", "gemini-3.8-flash-tts")):
            with self.subTest(voice=voice):
                tts, _ = self.build(voice)
                primary, wrapped = tts._tts_instances[:2]
                backup = wrapped._inner
                self.assertIsInstance(primary, GeminiInteractionsTTS)
                self.assertIsInstance(wrapped, main._MarkupStrippedTTS)
                self.assertEqual(primary.model, model)
                self.assertEqual(backup._opts.model_name, "gemini-3.1-flash-tts-preview")
                self.assertEqual(backup._opts.voice.name, primary._voice_name)

    def test_style_updates_reach_the_backup_as_its_prompt(self):
        tts, _ = self.build("google38:sulafat")
        tts.update_options(style="gently reassuring")
        self.assertEqual(tts._tts_instances[0]._style, "gently reassuring")
        self.assertEqual(tts._tts_instances[1]._inner._opts.prompt, "gently reassuring")

    def test_language_switch_keeps_the_backup_on_3_1(self):
        tts, _ = self.build("google38:sulafat")
        tts.update_options(language="ta-IN", voice_name="Sulafat", model_name="gemini-3.8-flash-lite-tts")
        backup = tts._tts_instances[1]._inner
        self.assertEqual(backup._opts.model_name, "gemini-3.1-flash-tts-preview")
        self.assertEqual(backup._opts.voice.language_code, "ta-IN")

    def test_a_gemini_failure_retries_once_not_five_times(self):
        tts, _ = self.build("google38:sulafat")
        self.assertEqual(tts._max_retry_per_tts, 1)

    def test_without_cloud_credentials_3_8_runs_alone(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "k"}), patch.object(main, "_GOOGLE_CREDENTIALS", None):
            tts, provider = main._build_tts("hi-IN", "google38:kore", {"pace": 1.0}, "balanced")
        self.assertIsInstance(tts, GeminiInteractionsTTS)
        self.assertEqual(provider, "google-multilingual-38")


class FlashLanguageRange(unittest.TestCase):
    def test_flash_speaks_the_full_gemini_range(self):
        self.assertTrue(language.is_google_multilingual("google-multilingual-38-flash"))
        self.assertTrue(language.is_google_multilingual("google-multilingual-38"))


class _Session:
    """Fake Gemini API: `status` for every request, 100ms of PCM on success."""

    closed = False

    def __init__(self, status):
        self.status = status
        self.requests = 0

    def post(self, _url, **kwargs):
        session = self
        session.requests += 1
        session.texts = getattr(session, "texts", []) + [
            c["text"] for item in kwargs["json"]["input"] for c in item["content"]
        ]
        pcm = base64.b64encode(b"\0\0" * 2400).decode("ascii")
        event = json.dumps({"event_type": "step.delta", "delta": {"type": "audio", "data": pcm}})

        class Content:
            async def __aiter__(self):
                yield f"data: {event}\n".encode()

        class Response:
            status = session.status
            content = Content()

            async def text(self):
                return "quota exceeded"

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                return None

        return Response()


class FailoverMidCall(unittest.TestCase):
    def test_a_gemini_error_is_spoken_by_the_backup_not_silence(self):
        async def run():
            failing = GeminiInteractionsTTS(model="gemini-3.8-flash-lite-tts", voice="Kore", api_key="k")
            failing._session = _Session(429)
            backup = GeminiInteractionsTTS(model="gemini-3.8-flash-lite-tts", voice="Kore", api_key="k")
            backup._session = _Session(200)
            with patch.object(main, "_ELEVENLABS_API_KEY", None), patch.object(main.db, "log_platform_error"):
                tts = main._google_fallback_tts(
                    failing, backup, "gemini-3.8-flash-lite-tts", "hi-IN", "balanced"
                )
                stream = tts.stream(conn_options=DEFAULT_API_CONNECT_OPTIONS)
                stream.push_text(
                    '<expr type="expression" label="warm"/>नमस्ते! <expr type="sound" label="laugh"/>'
                    "क्या आपके पास दो मिनट हैं?"
                )
                stream.end_input()
                frames = [a async for a in stream]
                await stream.aclose()
            return failing, backup, frames

        failing, backup, frames = asyncio.run(run())
        self.assertGreater(failing._session.requests, 0)
        self.assertGreater(backup._session.requests, 0)
        self.assertTrue(frames)
        spoken = " ".join(backup._session.texts)
        self.assertIn("नमस्ते", spoken)
        self.assertNotIn("<", spoken)  # no <expr/>, no <laugh> read out by the backup


if __name__ == "__main__":
    unittest.main(verbosity=2)
