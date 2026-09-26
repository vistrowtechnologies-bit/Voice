"""Gemini 3.8 preview requests use Google's Gemini API Interactions route."""
import base64
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import voice_preview


class Gemini38Preview(unittest.TestCase):
    def test_synthesizes_with_interactions_and_decodes_wav(self):
        audio = b"RIFF-test-wave"
        response = {
            "steps": [{
                "type": "model_output",
                "content": [{"type": "audio", "data": base64.b64encode(audio).decode()}],
            }]
        }
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch.object(
            voice_preview, "_post", return_value=json.dumps(response).encode()
        ) as post:
            result = voice_preview._synth_gemini_api("Achernar", "नमस्ते")

        self.assertEqual(result, (audio, "audio/wav"))
        url, headers, payload = post.call_args.args
        self.assertEqual(url, "https://generativelanguage.googleapis.com/v1beta/interactions")
        self.assertEqual(headers["x-goog-api-key"], "test-key")
        self.assertEqual(payload["model"], "gemini-3.8-flash-lite-tts")
        self.assertEqual(payload["generation_config"]["speech_config"], [{"voice": "Achernar"}])
        self.assertEqual(payload["input"][0]["content"][0]["text"], "नमस्ते")
        self.assertEqual(payload["response_format"], {"type": "audio"})

    def test_missing_gemini_key_is_clear(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(voice_preview.PreviewError, "no Gemini API key"):
                voice_preview._synth_gemini_api("Achernar", "Hello")

    def test_malformed_response_is_a_preview_error(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key"}), patch.object(
            voice_preview, "_post", return_value=b'{"steps": []}'
        ):
            with self.assertRaisesRegex(voice_preview.PreviewError, "Unexpected audio response"):
                voice_preview._synth_gemini_api("Achernar", "Hello")

    def test_31_stays_on_cloud_text_to_speech_path(self):
        with patch.object(voice_preview, "_synth_google", return_value=(b"wav", "audio/wav")) as synth:
            result = voice_preview.synthesize("google31:kore", "en")

        self.assertEqual(result, (b"wav", "audio/wav"))
        self.assertEqual(synth.call_args.args[0], "kore")
        self.assertEqual(synth.call_args.args[3], "gemini-3.1-flash-tts-preview")


if __name__ == "__main__":
    unittest.main(verbosity=2)
