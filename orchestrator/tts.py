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

import array
import asyncio
import audioop
import base64
import json
import os
from typing import AsyncIterator

import httpx
from sarvamai import AsyncSarvamAI, AudioOutput, EventResponse

import voice_catalog

_ELEVEN_API_KEY = os.environ.get("ELEVEN_API_KEY")
_SARVAM_API_KEY = os.environ.get("SARVAM_API_KEY")

_ELEVEN_V3_PREFIX = "elevenlabs-v3:"
_ELEVEN_PREFIX = "elevenlabs:"
_GOOGLE_31_PREFIX = "google31:"
_GOOGLE_PREFIX = "google:"
_GOOGLE_MULTILINGUAL_VOICES = {"charon", "kore"}
_SARVAM_V2_SPEAKERS = {"abhilash", "hitesh", "karun", "anushka", "arya", "manisha"}
_SARVAM_LANG_DEFAULT = "hi-IN"

_TIMEOUT_S = 20.0

# Same reasoning as orchestrator/stt.py's _get_client(): one pooled client
# reused across every synthesize() call in this process instead of a fresh
# TCP+TLS handshake per sentence. A multi-sentence reply can call this
# several times per turn, so this matters even more here than in stt.py.
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=_TIMEOUT_S)
    return _client


# Sarvam doesn't publish a raw WebSocket protocol for streaming TTS/STT —
# only this SDK exposes it (AsyncSarvamAI.text_to_speech_streaming /
# speech_to_text_streaming). One shared client instance is safe to reuse
# across calls: .connect() opens a fresh WebSocket per call regardless, this
# just avoids rebuilding the client object itself each time.
_sarvam_client: AsyncSarvamAI | None = None


def _get_sarvam_client() -> AsyncSarvamAI:
    global _sarvam_client
    if _sarvam_client is None:
        if not _SARVAM_API_KEY:
            raise TTSError("Voice isn't configured (no Sarvam key).")
        _sarvam_client = AsyncSarvamAI(api_subscription_key=_SARVAM_API_KEY)
    return _sarvam_client


class TTSError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


async def _synth_elevenlabs(
    voice_id: str,
    model_id: str,
    text: str,
    language_code: str | None,
    speed: float | None = None,
    style: float | None = None,
) -> tuple[bytes, str]:
    if not _ELEVEN_API_KEY:
        raise TTSError("Premium voice isn't configured (no ElevenLabs key).")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
    headers = {"xi-api-key": _ELEVEN_API_KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"}
    payload: dict = {"text": text, "model_id": model_id}
    if language_code:
        payload["language_code"] = language_code
    if speed is not None or style is not None:
        voice_settings: dict = {}
        if speed is not None:
            voice_settings["speed"] = speed
        if style is not None:
            voice_settings["style"] = style
        payload["voice_settings"] = voice_settings
    try:
        resp = await _get_client().post(url, headers=headers, json=payload)
        resp.raise_for_status()
    except httpx.HTTPStatusError as e:
        if language_code and e.response.status_code == 400 and "unsupported_language" in e.response.text:
            # detect_reply_language() occasionally misreads a caller's
            # accented speech as a language this model/voice doesn't
            # support (e.g. 'gu') — rather than losing the whole reply,
            # retry once letting ElevenLabs auto-detect from the text.
            return await _synth_elevenlabs(voice_id, model_id, text, None, speed, style)
        raise TTSError(f"ElevenLabs returned {e.response.status_code}: {e.response.text[:300]}") from e
    except httpx.HTTPError as e:
        raise TTSError(f"Could not reach ElevenLabs: {e}") from e
    return resp.content, "audio/mpeg"


async def _synth_sarvam(
    speaker: str,
    model: str,
    target_language_code: str,
    text: str,
    pace: float | None = None,
    pitch: float | None = None,
) -> tuple[bytes, str]:
    if not _SARVAM_API_KEY:
        raise TTSError("Voice isn't configured (no Sarvam key).")
    url = "https://api.sarvam.ai/text-to-speech"
    headers = {"api-subscription-key": _SARVAM_API_KEY, "Content-Type": "application/json"}
    payload = {"target_language_code": target_language_code, "text": text, "speaker": speaker, "model": model}
    if pace is not None:
        payload["pace"] = pace
    if pitch is not None:
        payload["pitch"] = pitch
    try:
        resp = await _get_client().post(url, headers=headers, json=payload)
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


# Matches audio.py's _FADE_SAMPLES (10ms at 8kHz) — same click-prevention
# reasoning as its _fade_edges: each streamed sentence is its own clip and
# won't reliably zero-cross at its edges, so concatenating clips back-to-back
# on the wire clicks at every boundary without this.
_FADE_SAMPLES = 80


def _fade_ulaw_chunk(ulaw_chunk: bytes, fade_in: bool, fade_out: bool) -> bytes:
    """Applies audio.py's linear-ramp-to-zero fade to a raw ulaw chunk, but
    only when asked — synthesize_stream calls this on just the first and
    last chunk of a sentence's stream, so every chunk in between (the vast
    majority) passes through with zero decode/re-encode cost."""
    if not (fade_in or fade_out) or not ulaw_chunk:
        return ulaw_chunk
    pcm16 = audioop.ulaw2lin(ulaw_chunk, 2)
    if len(pcm16) % 2:
        pcm16 = pcm16[:-1]
    samples = array.array("h")
    samples.frombytes(pcm16)
    n = len(samples)
    if n == 0:
        return ulaw_chunk
    fade = min(_FADE_SAMPLES, n // 2) if (fade_in and fade_out) else min(_FADE_SAMPLES, n)
    if fade_in:
        for i in range(fade):
            samples[i] = int(samples[i] * (i / fade))
    if fade_out:
        for i in range(fade):
            samples[n - 1 - i] = int(samples[n - 1 - i] * (i / fade))
    return audioop.lin2ulaw(samples.tobytes(), 2)


async def _synth_sarvam_stream(
    speaker: str,
    model: str,
    target_language_code: str,
    text: str,
    pace: float | None = None,
    pitch: float | None = None,
) -> AsyncIterator[bytes]:
    """Streams `text` as raw 8kHz mono ulaw chunks over Sarvam's WebSocket
    TTS API, instead of synthesize()'s one-shot REST call that only returns
    once the ENTIRE clip is done. Requesting output_audio_codec="mulaw" and
    speech_sample_rate=8000 directly means every yielded chunk is already
    exactly what the phone leg hands to audio.chunk_ulaw() — no per-chunk
    WAV decode/resample step, unlike the REST path's wav_or_mp3_to_ulaw.

    Only ever holds back _FADE_SAMPLES bytes (10ms) between chunks — not a
    whole chunk — so the true final chunk can still get a fade-out once the
    stream ends. An earlier version held back a WHOLE chunk to know which
    one was last; measured against the real API that delayed the reply's
    first audio by 700ms+ on a real multi-chunk sentence, which defeats the
    entire point of streaming. 10ms of buffering is the actual necessary
    cost of a click-free tail, nothing more.
    """
    client = _get_sarvam_client()
    try:
        async with client.text_to_speech_streaming.connect(model=model, send_completion_event=True) as ws:
            await ws.configure(
                target_language_code=target_language_code,
                speaker=speaker,
                pace=pace if pace is not None else 1.0,
                pitch=pitch if pitch is not None else 0.0,
                output_audio_codec="mulaw",
                speech_sample_rate=8000,
            )
            await ws.convert(text)
            await ws.flush()

            carry = b""
            is_first = True
            async for message in ws:
                if isinstance(message, AudioOutput):
                    chunk = carry + base64.b64decode(message.data.audio)
                    carry = b""
                    if is_first:
                        chunk = _fade_ulaw_chunk(chunk, fade_in=True, fade_out=False)
                        is_first = False
                    if len(chunk) > _FADE_SAMPLES:
                        chunk, carry = chunk[:-_FADE_SAMPLES], chunk[-_FADE_SAMPLES:]
                        yield chunk
                    else:
                        # Too short to safely split a fade tail off — hold
                        # it whole and let the next chunk (or the final
                        # flush below) absorb it instead.
                        carry = chunk
                elif isinstance(message, EventResponse) and message.data.event_type == "final":
                    break
            if carry:
                yield _fade_ulaw_chunk(carry, fade_in=is_first, fade_out=True)
    except TTSError:
        raise
    except Exception as e:
        raise TTSError(f"Sarvam streaming TTS failed: {e}") from e


def synthesize_stream(
    voice_string: str,
    text: str,
    reply_language: str | None = None,
    pace: float | None = None,
    pitch: float | None = None,
) -> AsyncIterator[bytes] | None:
    """Streaming counterpart to synthesize() — implemented for Sarvam voices
    only so far (the default provider; ElevenLabs/Google are unaffected).
    Returns None for any other provider so a caller can fall back to the
    one-shot synthesize() unchanged; never raises just because the voice
    isn't a Sarvam one. Not an async generator itself — plain function
    returning either None or the async generator object from
    _synth_sarvam_stream (constructing that doesn't run any of its body
    yet, so this stays a cheap, non-blocking call either way)."""
    if voice_string.startswith((_ELEVEN_V3_PREFIX, _ELEVEN_PREFIX, _GOOGLE_31_PREFIX, _GOOGLE_PREFIX)):
        return None
    model = "bulbul:v2" if voice_string in _SARVAM_V2_SPEAKERS else "bulbul:v3"
    return _synth_sarvam_stream(voice_string, model, reply_language or _SARVAM_LANG_DEFAULT, text, pace, pitch)


def _synth_google_sync(
    voice_name: str,
    text: str,
    reply_language: str | None,
    model_name: str = "gemini-2.5-flash-tts",
) -> tuple[bytes, str]:
    raw_credentials = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not raw_credentials:
        raise TTSError("Google voice isn't configured (no service-account credentials).")
    try:
        credentials_info = json.loads(raw_credentials)
        from google.cloud import texttospeech
        from google.oauth2 import service_account

        credentials = service_account.Credentials.from_service_account_info(credentials_info)
        client = texttospeech.TextToSpeechClient(credentials=credentials)
        is_multilingual = voice_name.lower() in _GOOGLE_MULTILINGUAL_VOICES
        language_code = (reply_language or "hi-IN") if is_multilingual else "-".join(voice_name.split("-")[:2])
        voice_kwargs = {
            "language_code": language_code,
            "name": voice_name.capitalize() if is_multilingual else voice_name,
        }
        if is_multilingual:
            voice_kwargs["model_name"] = model_name
        response = client.synthesize_speech(
            input=texttospeech.SynthesisInput(text=text),
            voice=texttospeech.VoiceSelectionParams(**voice_kwargs),
            audio_config=texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            ),
        )
    except (ValueError, KeyError) as e:
        raise TTSError("Google service-account credentials are invalid.") from e
    except TTSError:
        raise
    except Exception as e:
        raise TTSError(f"Google TTS failed: {e}") from e
    return response.audio_content, "audio/wav"


async def _synth_google(
    voice_name: str,
    text: str,
    reply_language: str | None,
    model_name: str = "gemini-2.5-flash-tts",
) -> tuple[bytes, str]:
    return await asyncio.to_thread(_synth_google_sync, voice_name, text, reply_language, model_name)


async def synthesize(
    voice_string: str,
    text: str,
    reply_language: str | None = None,
    pace: float | None = None,
    pitch: float | None = None,
    speed: float | None = None,
    style: float | None = None,
) -> tuple[bytes, str]:
    """Synthesizes `text` with the given catalog voice string. Returns
    (audio_bytes, content_type). `reply_language` is a Sarvam-style
    "xx-IN" code (from language.detect_reply_language / switch_reply_language);
    defaults to Hindi for Sarvam voices when unset, matching _build_tts.

    pace/pitch (Sarvam) and speed/style (ElevenLabs flash v2.5 only — v3
    has no per-call prosody knob, matching agent/main.py's _build_tts
    limitation) let session.py apply live emotion-reactive delivery, same
    intent as agent/main.py's on_user_turn_completed tts.update_options()
    calls."""
    if voice_string.startswith(_ELEVEN_V3_PREFIX):
        lang = reply_language.split("-")[0] if reply_language else None
        return await _synth_elevenlabs(voice_string[len(_ELEVEN_V3_PREFIX):], "eleven_v3", text, lang)
    if voice_string.startswith(_ELEVEN_PREFIX):
        lang = reply_language.split("-")[0] if reply_language else None
        return await _synth_elevenlabs(voice_string[len(_ELEVEN_PREFIX):], "eleven_flash_v2_5", text, lang, speed, style)
    if voice_string.startswith((_GOOGLE_31_PREFIX, _GOOGLE_PREFIX)):
        is_google_31 = voice_string.startswith(_GOOGLE_31_PREFIX)
        prefix = _GOOGLE_31_PREFIX if is_google_31 else _GOOGLE_PREFIX
        try:
            return await _synth_google(
                voice_string[len(prefix):],
                text,
                reply_language,
                "gemini-3.1-flash-tts-preview" if is_google_31 else "gemini-2.5-flash-tts",
            )
        except Exception:
            # Keep the same Gemini persona when the selected model is
            # temporarily unhealthy: 2.5 tenants silently use 3.1, while a
            # 3.1 admin/marketing test silently uses 2.5. Never switch the
            # caller to a visibly different Sarvam speaker mid-conversation.
            return await _synth_google(
                voice_string[len(prefix):],
                text,
                reply_language,
                "gemini-2.5-flash-tts" if is_google_31 else "gemini-3.1-flash-tts-preview",
            )
    model = "bulbul:v2" if voice_string in _SARVAM_V2_SPEAKERS else "bulbul:v3"
    return await _synth_sarvam(voice_string, model, reply_language or _SARVAM_LANG_DEFAULT, text, pace, pitch)


def tts_provider_of(voice_string: str) -> str:
    """'elevenlabs' | 'elevenlabs-v3' | 'google' | 'sarvam' — mirrors main.py's
    self._tts_provider, used by tools.py's switch_reply_language to decide
    whether a language code is safe to enforce."""
    if voice_string.startswith(_ELEVEN_V3_PREFIX):
        return "elevenlabs-v3"
    if voice_string.startswith(_ELEVEN_PREFIX):
        return "elevenlabs"
    if voice_string.startswith((_GOOGLE_31_PREFIX, _GOOGLE_PREFIX)):
        return "google"
    return "sarvam"
