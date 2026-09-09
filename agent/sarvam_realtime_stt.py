"""Sarvam realtime STT — partial transcripts, so the LLM can start early.

WHY THIS EXISTS

LiveKit's AgentSession has preemptive generation built in and **enabled by
default**: on a PREFLIGHT_TRANSCRIPT it starts the LLM while the caller is
still talking, and cancels that run if the transcript changes. That hides LLM
time underneath the endpointing wait instead of adding to it.

It has never once fired on this platform. `livekit-plugins-sarvam` emits only
START_OF_SPEECH, FINAL_TRANSCRIPT, END_OF_SPEECH and RECOGNITION_USAGE — zero
PREFLIGHT_TRANSCRIPT, zero INTERIM_TRANSCRIPT — because it connects to
wss://api.sarvam.ai/speech-to-text/ws, the LEGACY socket, which Sarvam's own
docs describe as giving "only a final per utterance". The machinery to hide
the LLM was wired up and running the whole time, starved of the one event it
needs.

Sarvam shipped wss://api.sarvam.ai/speech-to-text-realtime/ws (saaras:v3-realtime,
August 2026) with real partials. The plugin cannot reach it: SarvamSTTModels is
Literal["saarika:v2.5", "saaras:v2.5", "saaras:v3"], the same stale-allowlist
pattern that blocked sarvam-105b-conversations on the LLM side.

WHAT IT SHOULD BUY

Measured on call 926: endpointing 410ms + STT 183ms + LLM 450ms + TTS 133ms =
1,176ms. If the LLM runs under the endpointing wait rather than after it, the
caller's experience becomes roughly endpointing + TTS. The arithmetic says
~600-700ms. That is a prediction, not a result — it is exactly what this
prototype exists to measure.

STATUS: prototype, off by default. Set SARVAM_REALTIME_STT=1 to enable.
Unproven on a live call; see _build_stt in main.py for the flag.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import weakref
from dataclasses import dataclass, field
from urllib.parse import urlencode

import aiohttp
from livekit import rtc
from livekit.agents import (
    DEFAULT_API_CONNECT_OPTIONS,
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    stt,
    utils,
)
from livekit.agents.types import NOT_GIVEN, NotGivenOr
from livekit.agents.utils import is_given

logger = logging.getLogger("sarvam-realtime-stt")

WS_URL = "wss://api.sarvam.ai/speech-to-text-realtime/ws"

# Sarvam accepts 8000 or 16000 only. Telephony is 8k, but LiveKit hands us
# whatever the room negotiated and resamples to whatever we declare, so pin
# 16k and let it upsample — saaras is trained at 16k and the resample is
# cheaper than the accuracy loss.
SAMPLE_RATE = 16000


@dataclass
class RealtimeOptions:
    language: str = "unknown"
    model: str = "saaras:v3-realtime"
    # "fast" is Sarvam's own documented setting for conversational agents;
    # "balanced" (their default) trades partial latency for accuracy, which is
    # the wrong side of the trade when the whole point is early partials.
    stream_type: str = "fast"
    mode: str = "transcribe"
    prompt: str | None = None
    sample_rate: int = SAMPLE_RATE
    # Sarvam's own defaults, stated explicitly so a future tuning session
    # changes a number here rather than discovering an implicit one.
    threshold: float = 0.3
    silence_duration_ms: int = 500
    min_speech_duration_ms: int = 250
    prefix_padding_ms: int = 300

    def query(self) -> dict:
        # language_code is required and rejects our internal "unknown"
        # sentinel; "auto" is the realtime API's spelling for the same thing.
        q = {
            "language_code": "auto" if self.language in ("", "unknown", None) else self.language,
            "model": self.model,
            "stream_type": self.stream_type,
            "mode": self.mode,
            "endpointing": "vad",
            "encoding": "linear16",
            "sample_rate": str(self.sample_rate),
            "threshold": str(self.threshold),
            "prefix_padding_ms": str(self.prefix_padding_ms),
            "silence_duration_ms": str(self.silence_duration_ms),
            "min_speech_duration_ms": str(self.min_speech_duration_ms),
        }
        if self.prompt:
            q["prompt"] = self.prompt
        return q


class RealtimeSTT(stt.STT):
    """Streaming-only. There is no batch path here on purpose — the whole
    reason this class exists is the streaming partials, and a non-streaming
    fallback would silently hide a broken socket behind working audio."""

    def __init__(
        self,
        *,
        language: str = "unknown",
        api_key: str | None = None,
        prompt: str | None = None,
        model: str = "saaras:v3-realtime",
        stream_type: str = "fast",
        mode: str = "transcribe",
        threshold: float = 0.3,
        silence_duration_ms: int = 500,
        min_speech_duration_ms: int = 250,
        http_session: aiohttp.ClientSession | None = None,
    ) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(streaming=True, interim_results=True)
        )
        key = api_key or os.environ.get("SARVAM_API_KEY")
        if not key:
            raise ValueError("SARVAM_API_KEY is not set")
        self._api_key = key
        self._opts = RealtimeOptions(
            language=language,
            model=model,
            stream_type=stream_type,
            mode=mode,
            prompt=prompt,
            threshold=threshold,
            silence_duration_ms=silence_duration_ms,
            min_speech_duration_ms=min_speech_duration_ms,
        )
        self._session = http_session
        self._streams = weakref.WeakSet[RealtimeStream]()

    @property
    def model(self) -> str:
        return self._opts.model

    @property
    def provider(self) -> str:
        return "Sarvam"

    def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            self._session = utils.http_context.http_session()
        return self._session

    async def _recognize_impl(
        self,
        buffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechEvent:
        raise NotImplementedError(
            "RealtimeSTT is streaming-only — use .stream(). A batch path here "
            "would mask a dead socket by quietly transcribing anyway."
        )

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> RealtimeStream:
        opts = RealtimeOptions(**{**self._opts.__dict__})
        if is_given(language):
            opts.language = language
        s = RealtimeStream(stt=self, opts=opts, api_key=self._api_key, conn_options=conn_options)
        self._streams.add(s)
        return s

    def update_options(self, *, language: NotGivenOr[str] = NOT_GIVEN) -> None:
        if is_given(language):
            self._opts.language = language
            for s in self._streams:
                s.update_options(language=language)


class RealtimeStream(stt.SpeechStream):
    def __init__(
        self,
        *,
        stt: RealtimeSTT,
        opts: RealtimeOptions,
        api_key: str,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(stt=stt, conn_options=conn_options, sample_rate=opts.sample_rate)
        self._opts = opts
        self._api_key = api_key
        self._stt_impl = stt
        self._speaking = False
        # Open from vad.speech_start until transcript.final. Partials keep
        # arriving (and improving) after speech_end, and the last of those is
        # the only one whose words match the final.
        self._utterance_open = False
        self._reconfigure: asyncio.Queue[dict] = asyncio.Queue()
        self._request_id = ""

    def update_options(self, *, language: NotGivenOr[str] = NOT_GIVEN) -> None:
        """Mid-call language change without dropping the socket.

        The realtime API applies VAD numbers immediately and mode/prompt/
        language at the next utterance, so switch_reply_language no longer
        has to tear the connection down and lose the audio in flight.
        """
        if is_given(language):
            self._opts.language = language
            self._reconfigure.put_nowait(
                {"event": "config.update", "language_code": language}
            )

    async def _run(self) -> None:
        url = f"{WS_URL}?{urlencode(self._opts.query())}"
        session = self._stt_impl._ensure_session()
        try:
            ws = await asyncio.wait_for(
                session.ws_connect(url, headers={"API-SUBSCRIPTION-KEY": self._api_key}),
                self._conn_options.timeout,
            )
        except aiohttp.ClientResponseError as e:
            raise APIStatusError(
                f"sarvam realtime rejected the connection: {e.message}",
                status_code=e.status,
            ) from e
        except Exception as e:
            raise APIConnectionError("could not reach sarvam realtime STT") from e

        try:
            await asyncio.gather(
                self._send_audio(ws),
                self._recv_events(ws),
                self._send_reconfigures(ws),
            )
        finally:
            await ws.close()

    async def _send_audio(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        async for data in self._input_ch:
            if isinstance(data, self._FlushSentinel):
                # Sarvam's VAD owns turn boundaries in vad mode; flush only
                # asks it to finalise what it already has.
                await ws.send_str(json.dumps({"event": "flush"}))
                continue
            frame: rtc.AudioFrame = data
            await ws.send_str(
                json.dumps({
                    "event": "audio_input",
                    "audio": base64.b64encode(bytes(frame.data)).decode(),
                })
            )
        await ws.send_str(json.dumps({"event": "end"}))

    async def _send_reconfigures(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        while True:
            msg = await self._reconfigure.get()
            await ws.send_str(json.dumps(msg))

    async def _recv_events(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        async for msg in ws:
            if msg.type != aiohttp.WSMsgType.TEXT:
                if msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.CLOSING):
                    return
                continue
            try:
                ev = json.loads(msg.data)
            except ValueError:
                logger.warning("sarvam realtime sent non-JSON: %r", msg.data[:200])
                continue
            self._handle(ev)

    def _handle(self, ev: dict) -> None:
        kind = ev.get("event")

        if kind == "session.begin":
            self._request_id = ev.get("request_id") or ""
            logger.info("sarvam realtime session: %s", ev.get("config"))
            return

        if kind == "vad.speech_start":
            self._speaking = True
            self._utterance_open = True
            self._event_ch.send_nowait(
                stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
            )
            return

        if kind == "vad.speech_end":
            # NOT the end of useful partials. Sarvam's recogniser lags the
            # audio, so the partial that finally carries the COMPLETE
            # utterance arrives AFTER speech_end (measured: speech_end 6768ms,
            # complete partial 6809ms, final 7007ms). _speaking is therefore
            # the wrong gate for preflights - see _utterance_open.
            self._speaking = False
            self._event_ch.send_nowait(
                stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH)
            )
            return

        if kind == "transcript.partial":
            text = (ev.get("text") or "").strip()
            # The point of the whole module. PREFLIGHT (not INTERIM) is what
            # audio_recognition routes into preemptive generation — and its
            # handler calls on_interim_transcript itself, so this covers the
            # interim path too rather than double-reporting it.
            #
            # Gated on _utterance_open, NOT _speaking. Call 929 fired seven
            # preemptive generations and livekit invalidated all seven:
            # "the transcript, chat context, tools, or tool choice changed".
            #
            # Cause was here. _transcripts_equivalent (agent_activity.py:137 in
            # 1.7.1) compares WORD LISTS ignoring punctuation and case, so the
            # final's added "।" was never the problem - the words genuinely
            # differed, because gating on _speaking dropped the one partial
            # that completes the sentence and left a truncated fragment
            # ("...वेबसाइट ब") as the last preflight.
            #
            # The window from speech_end to final is small (~200ms measured)
            # but a VALID preflight beats a bigger invalid one: an invalidated
            # run is cancelled and the LLM re-runs from scratch, which is
            # strictly worse than not preempting at all.
            if text and self._utterance_open:
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.PREFLIGHT_TRANSCRIPT,
                        request_id=self._request_id,
                        alternatives=[
                            stt.SpeechData(
                                language=ev.get("language") or self._opts.language,
                                text=text,
                            )
                        ],
                    )
                )
            return

        if kind == "transcript.final":
            self._utterance_open = False
            text = (ev.get("text") or "").strip()
            if not text:
                return
            self._event_ch.send_nowait(
                stt.SpeechEvent(
                    type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                    request_id=self._request_id,
                    alternatives=[
                        stt.SpeechData(
                            language=ev.get("language") or self._opts.language,
                            text=text,
                            start_time=_f(ev.get("start_s")),
                            end_time=_f(ev.get("end_s")),
                            confidence=_f(ev.get("language_confidence")),
                        )
                    ],
                )
            )
            return

        if kind == "error":
            # is_fatal distinguishes "your config.update was rejected, carry
            # on" from "this session is over". Treating both as fatal would
            # kill calls over a rejected tuning value.
            if ev.get("is_fatal"):
                raise APIStatusError(
                    f"sarvam realtime: {ev.get('message')}",
                    status_code=ev.get("status_code") or 500,
                )
            logger.warning("sarvam realtime non-fatal error: %s", ev)


def _f(v) -> float:
    """Sarvam sends several numeric fields as strings ("0.99", "2.1")."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def enabled() -> bool:
    return (os.environ.get("SARVAM_REALTIME_STT") or "").strip().lower() in (
        "1", "true", "yes", "on",
    )
