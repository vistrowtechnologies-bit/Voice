"""Text-to-speech — direct Sarvam/ElevenLabs REST calls, replacing
livekit-agents' sarvam.TTS/elevenlabs.TTS plugin wrappers. Provider/model
routing mirrors agent/main.py's _build_tts prefix convention exactly
(voice_catalog.py is the shared source of truth both read from) and reuses
server/voice_preview.py's proven request shapes — same payload fields,
same "Sarvam takes `text` not `inputs`" gotcha already worked out there.

Phase 1 scope: one-shot synthesis per agent turn (a whole reply is
synthesized, then played/streamed out as one clip) — not sentence-by-
sentence streaming yet. Good enough to prove the pipeline; Phase 2 can
switch to Sarvam/ElevenLabs' streaming endpoints once real-time latency
on live calls needs it (both providers' plain REST here already run
async, so this is a swap-in-place later, not a rewrite).
"""

from __future__ import annotations

import base64
import os

import httpx

import voice_catalog

_ELEVEN_API_KEY = os.environ.get("ELEVEN_API_KEY")
_SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY")

_ELEVEN_V3_PREFIX = "elevenlabs-v3:"
_ELEVEN_PREFIX = "elevenlabs:"
_SARVAM_V2_SPEAKERS = {"abhilash", "hitesh", "karun", "anushka", "arya", "manisha"}
_SARVAM_LANG_DEFAULT = "hi-IN"

_TIMEOUT_S = 20.0


class TTSError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


async def _synth_elevenlabs(voice_id: str, model_id: str, text: str, language_code: str | None) -> tuple[bytes, str]:
    if not _ELEVEN_API_KEY:
        raise TTSError("Premium voice isn't configured (no ElevenLabs key).")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
    headers = {"xi-api-key": _ELEVEN_API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    payload: dict = {"text": text, "model_id": model_id}
    if language_code:
        payload["language_code"] = language_code
    async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise TTSError(f"ElevenLabs returned {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise TTSError(f"Could not reach ElevenLabs: {e}") from e
    return resp.content, "audio/mpeg"


async def _synth_sarvam(speaker: str, model: str, target_language_code: str, text: str) -> tuple[bytes, str]:
    if not _SARVAM_API_KEY:
        raise TTSError("Voice isn't configured (no Sarvam key).")
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {"api-subscription-key": _SARVAM_API_KEY, "Content-Type": "application/json"}
    payload = {"target_language_code": target_language_code, "text": text, "speaker": speaker, "model": model}
    async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
        try:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise TTSError(f"Sarvam returned {e.response.status_code}: {e.response.text[:300]}") from e
        except httpx.HTTPError as e:
            raise TTSError(f"Could not reach Sarvam: {e}") from e
    body = resp.json()
    try:
        b64 = body["audios"][0]
    except (KeyError, IndexError) as e:
        raise TTSError("Unexpected TTS response from Sarvam.") from e
    return base64.b64decode(b64), "audio/wav"


async def synthesize(voice_string: str, text: str, reply_language: str | None = None) -> tuple[bytes, str]:
    """Synthesizes `text` with the given catalog voice string. Returns
    (audio_bytes, content_type). `reply_language` is a Sarvam-style
    "xx-IN" code (from language.detect_reply_language / switch_reply_language);
    defaults to Hindi for Sarvam voices when unset, matching _build_tts."""
    if voice_string.startswith(_ELEVEN_V3_PREFIX):
        lang = reply_language.split("-")[0] if reply_language else None
        return await _synth_elevenlabs(voice_string[len(_ELEVEN_V3_PREFIX):], "eleven_v3", text, lang)
    if voice_string.startswith(_ELEVEN_PREFIX):
        lang = reply_language.split("-")[0] if reply_language else None
        return await _synth_elevenlabs(voice_string[len(_ELEVEN_PREFIX):], "eleven_flash_v2_5", text, lang)
    model = "bulbul:v2" if voice_string in _SARVAM_V2_SPEAKERS else "bulbul:v3"
    return await _synth_sarvam(voice_string, model, reply_language or _SARVAM_LANG_DEFAULT, text)


def tts_provider_of(voice_string: str) -> str:
    """'elevenlabs' | 'elevenlabs-v3' | 'sarvam' — mirrors main.py's
    self._tts_provider, used by tools.py's switch_reply_language to decide
    whether a language code is safe to enforce."""
    if voice_string.startswith(_ELEVEN_V3_PREFIX):
        return "elevenlabs-v3"
    if voice_string.startswith(_ELEVEN_PREFIX):
        return "elevenlabs"
    return "sarvam"
