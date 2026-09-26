"""LiveKit streaming adapter for Gemini 3.8 Flash and Flash-Lite TTS.

Gemini 3.8 TTS is served by the Gemini Interactions API (not Google Cloud
Text-to-Speech). Its streaming response is 24 kHz mono signed PCM in SSE audio
deltas; this adapter forwards those deltas into LiveKit's AudioEmitter.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import uuid
import aiohttp
from livekit.agents import APIConnectOptions
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS
from livekit.agents.tts import AudioEmitter, MarkupInfo, SynthesizeStream, TTS, TTSCapabilities


_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
_STYLE_TAG = re.compile(r'<expression\s+value="([^"]*)"\s*/>')
_SOUND_TAG = re.compile(r'<sound\s+value="([^"]*)"\s*/>')
_BREAK_TAG = re.compile(r'<break\s+time="([^"]*)"\s*/>')


def _gemini_text_and_style(text: str) -> tuple[str, str | None]:
    """Lower LiveKit expressive markers into Gemini's native text controls."""
    styles = _STYLE_TAG.findall(text)
    text = _STYLE_TAG.sub("", text)
    def sound_tag(match: re.Match[str]) -> str:
        sound = match.group(1).strip().lower()
        sound = {"breathe": "breath", "clear throat": "cough"}.get(sound, sound)
        return f"<{sound}>" if sound in {"laugh", "sigh", "cough", "breath"} else ""

    text = _SOUND_TAG.sub(sound_tag, text)
    text = _BREAK_TAG.sub("<short pause>", text)
    # Gemini's native tags include laugh, sigh, cough, breath and short pause.
    # Reject arbitrary model-generated XML rather than sending unknown markup.
    text = re.sub(r"<(?!/?(?:laugh|sigh|cough|breath|short pause|long pause)\b)[^>]+>", "", text)
    style = "; ".join(dict.fromkeys(s.strip() for s in styles if s.strip())) or None
    return re.sub(r"\s{2,}", " ", text).strip(), style


class GeminiInteractionsTTS(TTS):
    """Streaming Gemini TTS with selectable Flash / Flash-Lite model and persona."""

    class Markup(TTS.Markup):
        def _provider_key(self) -> str:
            # Reuse LiveKit's safe expressive vocabulary/instructions. _run
            # lowers its normalized markers to Gemini's native syntax.
            return "inworld"

        def convert(self, text: str) -> str:
            from livekit.agents.tts._provider_format import convert_markup

            return convert_markup("inworld", text)

        @property
        def info(self) -> MarkupInfo:
            return MarkupInfo(nonverbals={"sound": ["laugh", "sigh", "breathe", "cough"]})

        def llm_instructions(self, *, speech_steering=None) -> str:
            return (
                "Use occasional expressive TTS markers only when they fit the context. "
                "Delivery style: <expr type=\"expression\" label=\"warm and reassuring\"/> "
                "sets the delivery for the following sentence. Natural nonverbal sounds: "
                "<expr type=\"sound\" label=\"laugh\"/> or sigh/breathe/cough. "
                "Pauses: <expr type=\"break\" label=\"300ms\"/>. Keep markers sparse; "
                "never force laughter into routine, serious, or factual replies."
            )

    def __init__(self, *, model: str, voice: str, style: str = "", api_key: str | None = None):
        super().__init__(
            capabilities=TTSCapabilities(streaming=True), sample_rate=24_000, num_channels=1
        )
        self._model_name = model
        self._voice_name = voice
        self._style = style[:240]
        self._api_key = api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self._session: aiohttp.ClientSession | None = None

    @property
    def model(self) -> str:
        return self._model_name

    @property
    def provider(self) -> str:
        return "google-gemini-interactions"

    def update_options(self, *, voice_name: str | None = None, model_name: str | None = None,
                       style: str | None = None, prompt: str | None = None, **_: object) -> None:
        if voice_name:
            self._voice_name = voice_name
        if model_name:
            self._model_name = model_name
        if style is not None:
            self._style = style[:240]
        elif prompt is not None:
            self._style = prompt[:240]

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ):
        return self._synthesize_with_stream(text, conn_options=conn_options)

    def stream(self, *, conn_options: APIConnectOptions):
        return _GeminiStream(tts=self, conn_options=conn_options)

    async def aclose(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
        self._session = None


class _GeminiStream(SynthesizeStream):
    def __init__(self, *, tts: GeminiInteractionsTTS, conn_options: APIConnectOptions):
        super().__init__(tts=tts, conn_options=conn_options)
        self._gemini_tts = tts

    async def _run(self, output_emitter: AudioEmitter) -> None:
        if not self._gemini_tts._api_key:
            raise RuntimeError("Gemini TTS is not configured (missing GEMINI_API_KEY).")
        output_emitter.initialize(
            request_id=str(uuid.uuid4()), sample_rate=24_000, num_channels=1,
            # Gemini's API identifies raw signed 16-bit PCM as audio/pcm.
            mime_type="audio/pcm", frame_size_ms=100, stream=True,
        )
        if self._gemini_tts._session is None or self._gemini_tts._session.closed:
            timeout = aiohttp.ClientTimeout(total=90, connect=12, sock_read=30)
            self._gemini_tts._session = aiohttp.ClientSession(timeout=timeout)

        pending = ""
        async for item in self._input_ch:
            if isinstance(item, SynthesizeStream._FlushSentinel):
                if pending.strip():
                    await self._synthesize_segment(pending, output_emitter)
                pending = ""
                continue
            pending += item
        if pending.strip():
            await self._synthesize_segment(pending, output_emitter)

    async def _synthesize_segment(self, raw_text: str, output_emitter: AudioEmitter) -> None:
        text, inline_style = _gemini_text_and_style(raw_text)
        if not text:
            return
        style = "; ".join(s for s in (self._gemini_tts._style, inline_style) if s)
        content: dict = {"type": "text", "text": text}
        if style:
            content["annotations"] = [{"type": "speech_metadata", "style": style}]
        payload = {
            "model": self._gemini_tts._model_name,
            "input": [{"type": "user_input", "content": [content]}],
            "response_format": {"type": "audio", "mime_type": "audio/l16", "sample_rate": 24000},
            "generation_config": {"speech_config": [{"voice": self._gemini_tts._voice_name}]},
            "stream": True,
        }
        output_emitter.start_segment(segment_id=str(uuid.uuid4()))
        try:
            async with self._gemini_tts._session.post(
                _API_URL,
                headers={"x-goog-api-key": self._gemini_tts._api_key,
                         "content-type": "application/json", "accept": "text/event-stream"},
                json=payload,
            ) as response:
                if response.status >= 400:
                    detail = (await response.text())[:300]
                    raise RuntimeError(f"Gemini TTS returned HTTP {response.status}: {detail}")
                async for line in response.content:
                    line = line.decode("utf-8", "replace").strip()
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data or data == "[DONE]":
                        continue
                    event = json.loads(data)
                    if event.get("event_type") != "step.delta":
                        continue
                    delta = event.get("delta") or {}
                    if delta.get("type") == "audio" and delta.get("data"):
                        output_emitter.push(base64.b64decode(delta["data"]))
        except asyncio.CancelledError:
            raise
        finally:
            output_emitter.end_segment()
