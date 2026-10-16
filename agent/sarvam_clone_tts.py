"""LiveKit TTS for a customer's Sarvam cloned voice (Instant Voice Cloning, beta).

livekit-plugins-sarvam 1.8.6 has no voice-cloning support (it validates the
speaker against its stock list and only knows /text-to-speech), so this
calls Sarvam's HTTP streaming endpoint directly:

    POST https://api.sarvam.ai/voices/clone/stream   (multipart form)
      voice_id, text (<= 1000 chars), language_code, output_audio_codec

The response body streams binary audio once the first sentence is ready.
We ask for linear16 with no sample rate, which Sarvam documents as raw PCM
at the model's native 24 kHz, and forward chunks to the AudioEmitter as they
arrive. Non-streaming per LiveKit (one request per text), so _build_tts wraps
it in a StreamAdapter (sentence at a time) and a FallbackAdapter whose
second voice is a stock Sarvam voice - a clone failure mid-call is a
different voice, never silence. Cost: about Rs 30 per 10K characters
(~Rs 1.1 per call minute).
"""

from __future__ import annotations

import os
import uuid

import aiohttp
from livekit.agents import APIConnectionError, APIConnectOptions, APIStatusError, APITimeoutError
from livekit.agents.tts import AudioEmitter, ChunkedStream, TTS, TTSCapabilities
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS

STREAM_URL = "https://api.sarvam.ai/voices/clone/stream"
SAMPLE_RATE = 24_000
MAX_CHARS = 1000


class SarvamCloneTTS(TTS):
    def __init__(self, *, voice_id: str, language: str, api_key: str | None = None) -> None:
        super().__init__(capabilities=TTSCapabilities(streaming=False), sample_rate=SAMPLE_RATE, num_channels=1)
        self._voice_id = voice_id
        self._language = language or "hi-IN"
        self._api_key = api_key or os.environ.get("SARVAM_API_KEY") or ""
        self._session: aiohttp.ClientSession | None = None

    @property
    def model(self) -> str:
        return "voice-clone"

    @property
    def provider(self) -> str:
        return "sarvam-clone"

    def update_options(self, *, target_language_code: str | None = None, language: str | None = None, **_: object) -> None:
        code = target_language_code or language
        if code and "-" in code:
            self._language = code

    def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    def synthesize(self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS) -> "_CloneChunkedStream":
        return _CloneChunkedStream(tts=self, input_text=text, conn_options=conn_options)

    async def aclose(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
        self._session = None


def form_fields(voice_id: str, text: str, language: str) -> dict:
    """The multipart fields of one request (exactly one of voice_id/ref_audio)."""
    return {
        "voice_id": voice_id,
        "text": text[:MAX_CHARS],
        "language_code": language,
        "output_audio_codec": "linear16",
    }


class _CloneChunkedStream(ChunkedStream):
    def __init__(self, *, tts: SarvamCloneTTS, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._clone = tts

    async def _run(self, output_emitter: AudioEmitter) -> None:
        if not self._clone._api_key:
            raise APIConnectionError("cloned voice is not configured (missing SARVAM_API_KEY)")
        form = aiohttp.FormData()
        for key, value in form_fields(self._clone._voice_id, self._input_text, self._clone._language).items():
            form.add_field(key, value)
        try:
            async with self._clone._ensure_session().post(
                STREAM_URL,
                data=form,
                headers={"api-subscription-key": self._clone._api_key},
                timeout=aiohttp.ClientTimeout(total=30, sock_connect=self._conn_options.timeout),
            ) as res:
                if res.status != 200:
                    body = await res.text()
                    raise APIStatusError(
                        message=f"cloned voice TTS error ({res.status})", status_code=res.status, body=body[:300],
                    )
                output_emitter.initialize(
                    request_id=res.headers.get("x-request-id") or str(uuid.uuid4()),
                    sample_rate=SAMPLE_RATE, num_channels=1, mime_type="audio/pcm",
                )
                async for chunk in res.content.iter_any():
                    if chunk:
                        output_emitter.push(chunk)
                output_emitter.flush()
        except TimeoutError as e:
            raise APITimeoutError("cloned voice TTS timed out") from e
        except aiohttp.ClientError as e:
            raise APIConnectionError(f"cloned voice TTS connection error: {e}") from e
