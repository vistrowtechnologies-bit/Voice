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
from livekit.agents.tts._provider_format import _GEMINI_TAGS, convert_markup, split_expr_markup


_API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
_STYLE_TAG = re.compile(r'<expression\s+value="([^"]*)"\s*/>')
_SOUND_TAG = re.compile(r'<sound\s+value="([^"]*)"\s*/>')
_BREAK_TAG = re.compile(r'<break\s+time="([^"]*)"\s*/>')
# Where the first request of a turn may be cut: after a sentence or clause
# mark, same boundary set and minimum as clause_tokenizer.py (the Chirp path).
_CLAUSE_END = re.compile(r"[।.!?,;:—](?=\s|$)")
_MIN_FIRST_CLAUSE_CHARS = 6


def _first_clause_end(text: str) -> int | None:
    """Index just past the first clause boundary in `text` that is at least
    _MIN_FIRST_CLAUSE_CHARS in and not inside a <...> tag, else None.

    A boundary at the very end of the buffer is not trusted: "3." may be
    "3.5" once the next token arrives, so wait for the following character.
    """
    for match in _CLAUSE_END.finditer(text):
        end = match.end()
        if end >= len(text):
            return None
        head = text[:end]
        if len(head.strip()) >= _MIN_FIRST_CLAUSE_CHARS and head.count("<") == head.count(">"):
            return end
    return None


# An <expr type="expression"/> marker starts a new delivery style; it is the
# only thing that changes it (same split LiveKit's own GeminiTTS plugin uses).
_EXPRESSION_MARKER = re.compile(r'<expr\b(?=[^>]*type="expression")[^>]*?/\s*>')
# Anything left that is not one of Gemini's native inline tags would be read
# aloud, so it goes.
_NON_NATIVE_TAG = re.compile(
    r"<(?!/?(?:" + "|".join(re.escape(t) for t in _GEMINI_TAGS) + r")\s*/?>)[^>]*>"
)


def _gemini_spans(text: str) -> list[tuple[str, str | None]]:
    """Lower the LLM's expressive markup into (words, style label) spans.

    The prompt has the LLM write LiveKit's <expr .../> markers. Because this
    adapter streams natively, the framework never lowers them for us
    (AgentActivity._resolve_expressive_options), so it happens here, with
    LiveKit's own Gemini lowering: sounds -> <laugh>/<sigh>/..., breaks ->
    <short pause>, emphasis -> capitals. Each expression marker's label styles
    the words up to the next one; a leading span has no label of its own.
    The older <expression value/>, <sound value/> and <break time/> forms
    are still accepted.
    """
    text = _STYLE_TAG.sub(lambda m: f'<expr type="expression" label="{m.group(1)}"/>', text)
    text = _SOUND_TAG.sub(lambda m: f'<expr type="sound" label="{m.group(1)}"/>', text)
    text = _BREAK_TAG.sub(lambda m: f'<expr type="break" label="{m.group(1)}"/>', text)
    text = convert_markup("gemini", text)
    bounds = [0, *(m.start() for m in _EXPRESSION_MARKER.finditer(text)), len(text)]
    spans: list[tuple[str, str | None]] = []
    for a, b in zip(bounds, bounds[1:]):
        words, markers = split_expr_markup(text[a:b])
        words = re.sub(r"\s{2,}", " ", _NON_NATIVE_TAG.sub("", words)).strip()
        label = next((m["value"] for m in markers if m["type"] == "expression"), None)
        if words:
            spans.append((words, label))
    return spans


def _gemini_text_and_style(text: str) -> tuple[str, str | None]:
    """Spoken text and its labels joined - for callers that need one string."""
    spans = _gemini_spans(text)
    labels = [label for _words, label in spans if label]
    return " ".join(words for words, _label in spans), "; ".join(dict.fromkeys(labels)) or None


class GeminiInteractionsTTS(TTS):
    """Streaming Gemini TTS with selectable Flash / Flash-Lite model and persona."""

    class Markup(TTS.Markup):
        def _provider_key(self) -> str:
            # LiveKit's Gemini dialect; _run lowers the markers itself.
            return "gemini"

        def convert(self, text: str) -> str:
            # _run lowers the raw markers itself (see _gemini_spans).
            return text

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

        # Gemini returns audio only after a request's text is complete, so one
        # request per turn means no audio until the LLM has finished the whole
        # reply. Send the first clause as its own request the moment it
        # closes, while the rest of the turn is still being written, then the
        # remainder - what google_tts_streaming_patch does for Chirp 3 HD.
        # Two requests, not one per clause: every cut is a prosody seam.
        pending = ""
        first: asyncio.Task | None = None
        in_segment = False
        # A style label applies until the next one. When the first-clause cut
        # lands mid-sentence, the second request carries the last label on,
        # so the rest of that sentence is not spoken flat.
        carry: str | None = None
        try:
            async for item in self._input_ch:
                if isinstance(item, SynthesizeStream._FlushSentinel):
                    if first is not None:
                        await first
                        first = None
                    spans = _gemini_spans(pending)
                    if spans:
                        if not in_segment:
                            output_emitter.start_segment(segment_id=str(uuid.uuid4()))
                            in_segment = True
                        await self._synthesize_call(spans, carry, output_emitter)
                    if in_segment:
                        output_emitter.end_segment()
                        in_segment = False
                    pending = ""
                    carry = None  # a style never carries into the next turn
                    continue
                pending += item
                if not in_segment:
                    cut = _first_clause_end(pending)
                    spans = _gemini_spans(pending[:cut]) if cut is not None else []
                    if spans:
                        output_emitter.start_segment(segment_id=str(uuid.uuid4()))
                        in_segment = True
                        first = asyncio.create_task(
                            self._synthesize_call(spans, None, output_emitter)
                        )
                        carry = next((label for _w, label in reversed(spans) if label), None)
                        pending = pending[cut:]
            # end_input() always flushes first, so a clean end has nothing left.
        finally:
            if first is not None and not first.done():
                first.cancel()

    async def _synthesize_call(
        self, spans: list[tuple[str, str | None]], carry: str | None, output_emitter: AudioEmitter
    ) -> None:
        """One Interactions request; pushes its audio into the open segment.

        Each span's style rides a speech_metadata annotation over that span's
        byte range of the one text item (start_index/end_index are in bytes,
        per google-genai's SpeechAnnotation). The tone/persona/emotion
        direction (`style` on the TTS) is part of every span's style.
        """
        base = self._gemini_tts._style
        text = ""
        annotations: list[dict] = []
        for i, (words, label) in enumerate(spans):
            if text:
                text += " "
            start = len(text.encode("utf-8"))
            text += words
            label = label or (carry if i == 0 else None)
            style = ", ".join(s for s in (base, label) if s)
            if style:
                annotations.append({
                    "type": "speech_metadata", "style": style,
                    "start_index": start, "end_index": len(text.encode("utf-8")),
                })
        if len(annotations) == 1 and len(spans) == 1:
            # One style over the whole text: send it unranged.
            annotations[0].pop("start_index")
            annotations[0].pop("end_index")
        content: dict = {"type": "text", "text": text}
        if annotations:
            content["annotations"] = annotations
        payload = {
            "model": self._gemini_tts._model_name,
            "input": [{"type": "user_input", "content": [content]}],
            "response_format": {"type": "audio", "mime_type": "audio/l16", "sample_rate": 24000},
            "generation_config": {"speech_config": [{"voice": self._gemini_tts._voice_name}]},
            "stream": True,
        }
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
