"""Speech-to-text — direct Sarvam REST call, replacing livekit-agents'
sarvam.STT plugin wrapper. Mirrors agent/main.py's _build_stt provider
choice (always Sarvam saaras:v3, mode="transcribe", language="unknown" for
auto-detect) and voice_preview.py's plain-urllib REST style (same file
docstrings this module borrows the "NOT LiveKit, one-shot REST" framing
from).

Phase 1 scope: one-shot transcription of a complete utterance's audio
(the VAD/turn-taking layer in session.py decides where an utterance ends
and hands this a single WAV/PCM blob). True incremental/streaming STT
(Sarvam's WebSocket endpoint) is a Phase 2 optimization once real EnableX
audio is flowing continuously; batch-per-utterance is simpler and correct
for proving the pipeline end-to-end first.

NOTE: verify the exact endpoint path against Sarvam's current API docs
(docs.sarvam.ai/api-reference-docs/speech-to-text) before Phase 2 goes
live against real calls — Sarvam's own docs were inconsistent between
"/speech-to-text" and "/v1/speech-to-text" as of 2026-07-27. This module
uses the un-versioned host+path already proven working for TTS in
voice_preview.py; flip _STT_URL if Sarvam's current docs say otherwise.
"""

from __future__ import annotations

import io
import os

import httpx

_SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY")
_STT_URL = "https://api.sarvam.ai/speech-to-text"
_TIMEOUT_S = 20.0

# Reused across every transcribe() call in this process instead of opening a
# fresh httpx.AsyncClient (and therefore a fresh TCP+TLS handshake to
# api.sarvam.ai) per utterance — on a live call that handshake cost is paid
# on every single turn. httpx.AsyncClient itself pools connections across
# requests, so one long-lived client here is what actually gets that reuse;
# a `async with` client per call defeats it by tearing the pool down each
# time. Created lazily (not at import time) so a client without an active
# event loop yet doesn't bind one prematurely.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=_TIMEOUT_S)
    return _client


class STTError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


async def transcribe(wav_bytes: bytes) -> str:
    """Transcribes one complete utterance (WAV bytes, any sample rate Sarvam
    accepts) and returns the recognized text, or '' on silence/no-speech.
    Raises STTError on a genuine provider/network failure so session.py can
    decide how to degrade (e.g. ask the caller to repeat)."""
    if not _SARVAM_API_KEY:
        raise STTError("Speech-to-text isn't configured (no Sarvam key).")
    headers = {"api-subscription-key": _SARVAM_API_KEY}
    files = {"file": ("utterance.wav", io.BytesIO(wav_bytes), "audio/wav")}
    data = {"model": "saaras:v3", "mode": "transcribe", "language_code": "unknown"}
    try:
        resp = await _get_client().post(_STT_URL, headers=headers, files=files, data=data)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        raise STTError(f"STT provider returned {e.response.status_code}: {e.response.text[:300]}") from e
    except httpx.HTTPError as e:
        raise STTError(f"Could not reach STT provider: {e}") from e
    body = resp.json()
    return (body.get("transcript") or "").strip()
