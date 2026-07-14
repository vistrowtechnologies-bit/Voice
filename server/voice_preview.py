"""Voice audition synthesis — turns a catalog voice + language into audio.

Called by token_api's GET /voices/preview. It hits each provider's plain
REST TTS (NOT LiveKit — this is a one-shot sample, no realtime session) and
returns raw audio bytes the route caches in Postgres (voice_samples). Because
the audition script is fixed (voice_catalog.SAMPLE_TEXTS), a given (voice,
lang) is synthesized here at most once ever; every later play is a cached DB
read at zero provider cost.

Provider + model are derived from the voice string's prefix, mirroring
agent/main.py's _build_tts:
  - "elevenlabs-v3:<id>" → ElevenLabs REST, model eleven_v3
      (the v3 *streaming* endpoint 403s for live calls, but plain REST — which
       is exactly what a one-shot preview uses — works fine)
  - "elevenlabs:<id>"    → ElevenLabs REST, model eleven_flash_v2_5
  - bare name            → Sarvam REST, bulbul:v2 for the two v2 speakers,
                           else bulbul:v3

Uses only the stdlib (urllib) so no new server dependency.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request

import voice_catalog

_ELEVEN_API_KEY = os.environ.get("ELEVEN_API_KEY")
_SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY")

_ELEVEN_V3_PREFIX = "elevenlabs-v3:"
_ELEVEN_PREFIX = "elevenlabs:"
_SARVAM_V2_SPEAKERS = {"abhilash", "hitesh", "karun", "anushka", "arya", "manisha"}

# lang code (voice_catalog.SAMPLE_TEXTS keys) → Sarvam target_language_code.
_SARVAM_LANG = {"hi": "hi-IN", "en": "en-IN"}

_TIMEOUT_S = 30


class PreviewError(Exception):
    """Synthesis failed (missing provider key, or a provider/network error).
    token_api maps this to a 502/400 with .message."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _post(url: str, headers: dict, payload: dict) -> bytes:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_S) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        raise PreviewError(f"TTS provider returned {e.code}: {body}") from e
    except urllib.error.URLError as e:
        raise PreviewError(f"Could not reach TTS provider: {e.reason}") from e


def _synth_elevenlabs(voice_id: str, model_id: str, text: str) -> tuple[bytes, str]:
    if not _ELEVEN_API_KEY:
        raise PreviewError("Premium voice preview isn't configured (no ElevenLabs key).")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
    headers = {
        "xi-api-key": _ELEVEN_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    audio = _post(url, headers, {"text": text, "model_id": model_id})
    return audio, "audio/mpeg"


def _synth_sarvam(speaker: str, model: str, lang: str, text: str) -> tuple[bytes, str]:
    if not _SARVAM_API_KEY:
        raise PreviewError("Voice preview isn't configured (no Sarvam key).")
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {
        "api-subscription-key": _SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    # Field shape mirrors the installed livekit-plugins-sarvam TTS exactly:
    # current Sarvam API takes a single "text" string (the older "inputs" list
    # form is deprecated) and returns base64 WAV in an "audios" list.
    payload = {
        "target_language_code": _SARVAM_LANG.get(lang, "hi-IN"),
        "text": text,
        "speaker": speaker,
        "model": model,
    }
    raw = _post(url, headers, payload)
    try:
        obj = json.loads(raw)
        b64 = obj["audios"][0]
    except (ValueError, KeyError, IndexError) as e:
        raise PreviewError("Unexpected TTS response from Sarvam.") from e
    return base64.b64decode(b64), "audio/wav"


def synthesize(voice_string: str, lang: str) -> tuple[bytes, str]:
    """Synthesize the fixed audition line for `voice_string` in `lang`.
    Returns (audio_bytes, content_type). Raises PreviewError on any failure."""
    if voice_catalog.get_voice(voice_string) is None:
        raise PreviewError("That voice isn't available.")
    text = voice_catalog.SAMPLE_TEXTS.get(lang)
    if text is None:
        raise PreviewError(f"No preview script for language '{lang}'.")

    if voice_string.startswith(_ELEVEN_V3_PREFIX):
        return _synth_elevenlabs(voice_string[len(_ELEVEN_V3_PREFIX):], "eleven_v3", text)
    if voice_string.startswith(_ELEVEN_PREFIX):
        return _synth_elevenlabs(voice_string[len(_ELEVEN_PREFIX):], "eleven_flash_v2_5", text)
    model = "bulbul:v2" if voice_string in _SARVAM_V2_SPEAKERS else "bulbul:v3"
    return _synth_sarvam(voice_string, model, lang, text)
