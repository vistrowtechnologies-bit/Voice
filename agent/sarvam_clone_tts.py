"""LiveKit streaming TTS for a customer's Sarvam cloned voice (Instant Voice Cloning, beta).

livekit-plugins-sarvam 1.8.6 has no voice-cloning support, so this speaks
Sarvam's clone WebSocket directly - ONE socket per call, reused turn after
turn (it used to be one HTTP request per sentence, which spent our 10
requests/minute Sarvam limit in a few turns):

    wss://api.sarvam.ai/voices/clone/ws?send_completion_event=true
      header api-subscription-key
      -> {"type": "config", "data": {target_language_code, voice_id, ...}}
      -> {"type": "text", "data": {"text": ...}}   (one per clause, as written)
      -> {"type": "flush"}                          (end of the reply)
      <- {"type": "audio", "data": {"audio": <b64>, "content_type": "audio/pcm"}}
      <- {"type": "event", "data": {"event_type": "final"}}   (one per flush)
      <- {"type": "error", "data": {"message", "code"}}

Verified against the live server on 2026-10-16 (agent/scripts/
clone_ws_live_check.py): linear16 frames are raw PCM with no header at the
requested speech_sample_rate (an int is accepted), one "final" arrives per
flush, a second utterance on the same socket needs no new config, a new
config on the same socket changes the language, a ping gets no reply, and a
bad language or voice comes back as an error frame (code 422).

The config is sent when a socket is opened and again only when the language
or pace changes. A socket idle between turns is kept alive with a ping well
inside Sarvam's 60 s idle close; a closed one is replaced on the next turn.
A reply that is interrupted, errors or stalls closes its socket (its late
audio must never leak into the next reply) and a fresh one is opened in the
background.

Failure policy: this TTS never retries (max_retry=0) and a reply whose audio
has started is never replayed (retryable=False after the first byte). The
FallbackAdapter in main._build_tts moves the reply to a stock Sarvam voice
instead, so a 429/5xx/stall costs one voice change, never dead air. A
language the clone cannot speak fails at once, with no request to Sarvam.
Cost: Rs 30 per 10K characters.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import os
import time
from dataclasses import replace

import aiohttp
from livekit.agents import APIConnectionError, APIConnectOptions, APIStatusError, APITimeoutError, utils
from livekit.agents.tts import AudioEmitter, ChunkedStream, SynthesizeStream, TTS, TTSCapabilities
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS

from clause_tokenizer import ClauseTokenizer

logger = logging.getLogger("sarvam_clone_tts")

WS_URL = "wss://api.sarvam.ai/voices/clone/ws?send_completion_event=true"
# The 12 languages a clone speaks (server/custom_voices.LANGUAGES; Sarvam's
# target_language_code enum). Anything else is never sent to Sarvam.
LANGUAGES = frozenset({
    "as-IN", "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN",
    "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN",
})
MAX_TEXT_CHARS = 2500       # per "text" message
PACE_MIN, PACE_MAX = 0.5, 2.0
# Sarvam closes a socket after 60 s without traffic.
KEEPALIVE_INTERVAL_S = 20.0
# No audio for this long while a flush is outstanding = stalled. Measured
# first audio on the live server: ~1.4-1.6 s after the flush.
AUDIO_STALL_TIMEOUT_S = 5.0
IDLE_RECONNECT_GAP_S = 10.0


def clamp_pace(pace: float | None) -> float:
    try:
        value = float(pace if pace is not None else 1.0)
    except (TypeError, ValueError):
        value = 1.0
    return min(PACE_MAX, max(PACE_MIN, value))


def clone_config(voice_id: str, language: str, *, pace: float, sample_rate: int) -> dict:
    """The "config" message's data (Sarvam's field names, not the REST ones)."""
    return {
        "target_language_code": language,
        "voice_id": voice_id,
        "pace": clamp_pace(pace),
        "speech_sample_rate": int(sample_rate),
        "output_audio_codec": "linear16",
        # Sarvam's LiveKit guide: the smallest buffer starts audio soonest.
        "min_buffer_size": 30,
        "max_chunk_length": 150,
    }


class SarvamCloneTTS(TTS):
    def __init__(self, *, voice_id: str, language: str, sample_rate: int = 24_000, pace: float = 1.0,
                 api_key: str | None = None, ws_url: str = WS_URL,
                 keepalive_interval: float = KEEPALIVE_INTERVAL_S,
                 stall_timeout: float = AUDIO_STALL_TIMEOUT_S) -> None:
        super().__init__(capabilities=TTSCapabilities(streaming=True), sample_rate=sample_rate, num_channels=1)
        self._voice_id = voice_id
        self._language = language or "hi-IN"
        self._pace = clamp_pace(pace)
        self._api_key = api_key or os.environ.get("SARVAM_API_KEY") or ""
        self._ws_url = ws_url
        self._keepalive_interval = keepalive_interval
        self._stall_timeout = stall_timeout
        self._session: aiohttp.ClientSession | None = None
        # The one socket parked between replies, and the config it last got.
        self._idle_ws: aiohttp.ClientWebSocketResponse | None = None
        self._keepalive_task: asyncio.Task | None = None
        self._sent_config: dict[int, dict] = {}
        self._connect_task: asyncio.Task | None = None
        self._closed = False
        self._last_idle_reconnect = float("-inf")
        self.connections_opened = 0  # observability + tests

    @property
    def model(self) -> str:
        return "voice-clone"

    @property
    def provider(self) -> str:
        return "sarvam-clone"

    @property
    def language(self) -> str:
        return self._language

    def speaks(self, language: str | None = None) -> bool:
        return (language or self._language) in LANGUAGES

    def update_options(self, *, target_language_code: str | None = None, language: str | None = None,
                       pace: float | None = None, **_: object) -> None:
        """Takes effect on the next reply: its stream sends a new config on
        the same socket. An unsupported language is stored too, so replies
        go to the fallback voice until the caller is back in one of the 12."""
        code = target_language_code or language
        if code and "-" in code:
            self._language = code
        if pace is not None:
            self._pace = clamp_pace(pace)

    def config(self) -> dict:
        return clone_config(self._voice_id, self._language, pace=self._pace, sample_rate=self.sample_rate)

    def stream(self, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS) -> "_CloneStream":
        # Never retried: a retry is more silence and another request against
        # the 10/min limit; the FallbackAdapter's stock voice takes the reply.
        return _CloneStream(tts=self, conn_options=replace(conn_options, max_retry=0))

    def synthesize(self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS) -> ChunkedStream:
        return self._synthesize_with_stream(text, conn_options=replace(conn_options, max_retry=0))

    def prewarm(self) -> None:
        """Open the call's socket and send its config before the first reply."""
        self._schedule_connect()

    # ---------------------------------------------------------- socket pool

    def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def _open_ws(self, timeout: float) -> aiohttp.ClientWebSocketResponse:
        if not self._api_key:
            raise APIConnectionError("cloned voice is not configured (missing SARVAM_API_KEY)", retryable=False)
        try:
            ws = await asyncio.wait_for(
                self._ensure_session().ws_connect(self._ws_url, headers={"api-subscription-key": self._api_key}),
                timeout,
            )
        except asyncio.TimeoutError as e:
            raise APITimeoutError("cloned voice WebSocket connect timed out") from e
        except aiohttp.WSServerHandshakeError as e:
            raise APIStatusError("cloned voice WebSocket handshake rejected", status_code=e.status) from e
        except aiohttp.ClientError as e:
            raise APIConnectionError(f"cloned voice WebSocket connect failed: {type(e).__name__}") from e
        self.connections_opened += 1
        return ws

    async def _send_config_if_changed(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        cfg = self.config()
        if self._sent_config.get(id(ws)) != cfg:
            await ws.send_str(json.dumps({"type": "config", "data": cfg}))
            self._sent_config[id(ws)] = cfg

    def _schedule_connect(self) -> None:
        if self._closed or self._idle_ws is not None:
            return
        if self._connect_task is not None and not self._connect_task.done():
            return
        try:
            self._connect_task = asyncio.get_running_loop().create_task(self._connect_idle())
        except RuntimeError:
            pass  # no loop (construction in a test); the first reply connects

    async def _connect_idle(self) -> None:
        try:
            ws = await self._open_ws(DEFAULT_API_CONNECT_OPTIONS.timeout)
            await self._send_config_if_changed(ws)
        except Exception as e:  # the next reply connects for itself
            logger.warning("cloned voice prewarm failed: %s", e)
            return
        if self._closed or self._idle_ws is not None:
            await self._discard(ws)
            return
        self._park(ws)

    async def _take_ws(self, timeout: float) -> tuple[aiohttp.ClientWebSocketResponse, bool]:
        """(socket, reused). Takes the parked socket if it is still open."""
        if self._connect_task is not None and not self._connect_task.done():
            with contextlib.suppress(Exception):
                await asyncio.wait_for(asyncio.shield(self._connect_task), timeout)
        ws = self._idle_ws
        self._idle_ws = None
        await self._stop_keepalive()
        if ws is not None and not ws.closed:
            return ws, True
        if ws is not None:
            self._sent_config.pop(id(ws), None)
        return await self._open_ws(timeout), False

    def _park(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        """Keep a socket that finished cleanly for the next reply."""
        if self._closed or ws.closed or self._idle_ws is not None:
            asyncio.ensure_future(self._discard(ws))
            return
        self._idle_ws = ws
        self._keepalive_task = asyncio.ensure_future(self._keepalive(ws))

    async def _discard(self, ws: aiohttp.ClientWebSocketResponse | None) -> None:
        if ws is None:
            return
        self._sent_config.pop(id(ws), None)
        with contextlib.suppress(Exception):
            await ws.close()

    async def _stop_keepalive(self) -> None:
        task, self._keepalive_task = self._keepalive_task, None
        if task is not None and not task.done():
            task.cancel()
            with contextlib.suppress(BaseException):
                await task

    async def _keepalive(self, ws: aiohttp.ClientWebSocketResponse) -> None:
        """While parked: read (so a server close is noticed) and ping on
        silence so Sarvam's 60 s idle timer never fires."""
        try:
            while not ws.closed:
                try:
                    msg = await ws.receive(timeout=self._keepalive_interval)
                except asyncio.TimeoutError:
                    await ws.send_str(json.dumps({"type": "ping"}))
                    continue
                if msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED,
                                aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.ERROR):
                    break
                # Anything else while parked is stale; drop it.
        except asyncio.CancelledError:
            raise
        except Exception:
            pass
        if self._idle_ws is ws:
            self._idle_ws = None
            await self._discard(ws)
            # At most one background reconnect per IDLE_RECONNECT_GAP_S, so a
            # server that keeps closing sockets cannot loop us into its rate
            # limit; otherwise the next reply connects for itself.
            now = time.monotonic()
            if now - self._last_idle_reconnect >= IDLE_RECONNECT_GAP_S:
                self._last_idle_reconnect = now
                logger.info("cloned voice WebSocket closed while idle (code %s); reconnecting", ws.close_code)
                self._schedule_connect()
            else:
                logger.info("cloned voice WebSocket closed while idle (code %s); next reply reconnects",
                            ws.close_code)

    async def aclose(self) -> None:
        self._closed = True
        if self._connect_task is not None:
            self._connect_task.cancel()
            with contextlib.suppress(BaseException):
                await self._connect_task
        await self._stop_keepalive()
        ws, self._idle_ws = self._idle_ws, None
        await self._discard(ws)
        if self._session and not self._session.closed:
            await self._session.close()
        self._session = None


class _CloneStream(SynthesizeStream):
    def __init__(self, *, tts: SarvamCloneTTS, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, conn_options=conn_options)
        self._clone = tts

    @staticmethod
    async def _flush_segment(sentences, reader, send_json, state: dict) -> None:
        """End of a reply: send its last sentence, then one flush (one
        "final" comes back per flush)."""
        sentences.end_input()
        await reader
        if state["unflushed"]:  # a flush with no text would get no "final"
            await send_json({"type": "flush"})
            state["flushes"] += 1
            state["unflushed"] = 0

    async def _run(self, output_emitter: AudioEmitter) -> None:
        clone = self._clone
        if not clone.speaks():
            # M1: never sent to Sarvam (it would 422 every sentence).
            raise APIStatusError(f"cloned voice does not speak {clone.language}", status_code=422, retryable=False)
        output_emitter.initialize(
            request_id=utils.shortuuid(), sample_rate=clone.sample_rate, num_channels=1,
            mime_type="audio/pcm", stream=True,
        )
        state = {"audio": False, "flushes": 0, "finals": 0, "unflushed": 0, "sending_done": False}
        ws_box: dict = {}
        ready = asyncio.Event()
        segment_started = False
        clean = False

        async def send_json(payload: dict) -> None:
            """Sends on the call's socket, opened lazily on the first text (an
            empty reply costs nothing). The first send of a reply on a parked
            socket gets one fresh-socket retry: the server may have closed it
            a moment ago, and nothing of this reply has gone out yet."""
            if "ws" in ws_box:
                await ws_box["ws"].send_str(json.dumps(payload))
                return
            ws, reused = await clone._take_ws(self._conn_options.timeout)
            try:
                await clone._send_config_if_changed(ws)
                await ws.send_str(json.dumps(payload))
            except Exception:
                await clone._discard(ws)
                if not reused:
                    raise
                ws, reused = await clone._open_ws(self._conn_options.timeout), False
                await clone._send_config_if_changed(ws)
                await ws.send_str(json.dumps(payload))
            self._connection_reused = reused
            ws_box["ws"] = ws
            ready.set()

        async def send_sentences(stream) -> None:
            async for sentence in stream:
                text = sentence.token
                for start in range(0, len(text), MAX_TEXT_CHARS):
                    chunk = text[start:start + MAX_TEXT_CHARS]
                    if chunk.strip():
                        # The clause splitter drops the space at a boundary;
                        # Sarvam concatenates text messages, so put it back.
                        if state["unflushed"] and not chunk[:1].isspace():
                            chunk = " " + chunk
                        await send_json({"type": "text", "data": {"text": chunk}})
                        state["unflushed"] += 1

        async def send_task() -> None:
            nonlocal segment_started
            sentences = reader = None
            try:
                async for item in self._input_ch:
                    if isinstance(item, str):
                        if not item:
                            continue
                        if not segment_started:
                            segment_started = True
                            output_emitter.start_segment(segment_id=utils.shortuuid())
                            self._mark_started()
                        if sentences is None:
                            sentences = ClauseTokenizer().stream()
                            reader = asyncio.ensure_future(send_sentences(sentences))
                        sentences.push_text(item)
                    elif sentences is not None:
                        await self._flush_segment(sentences, reader, send_json, state)
                        sentences = reader = None
                if sentences is not None:
                    await self._flush_segment(sentences, reader, send_json, state)
            finally:
                if reader is not None and not reader.done():
                    reader.cancel()
                state["sending_done"] = True
                ready.set()

        async def recv_task() -> None:
            await ready.wait()
            ws = ws_box.get("ws")
            if ws is None:
                return  # no text was sent
            while True:
                if state["sending_done"] and state["finals"] >= state["flushes"]:
                    return
                waiting = state["flushes"] > state["finals"]
                try:
                    msg = await ws.receive(timeout=clone._stall_timeout if waiting else 0.5)
                except asyncio.TimeoutError as e:
                    if waiting:
                        raise APITimeoutError("cloned voice stalled (no audio)", retryable=not state["audio"]) from e
                    continue
                if msg.type == aiohttp.WSMsgType.TEXT:
                    handle(msg.data)
                elif msg.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED,
                                  aiohttp.WSMsgType.CLOSING, aiohttp.WSMsgType.ERROR):
                    raise APIStatusError(
                        "cloned voice WebSocket closed mid-reply",
                        status_code=ws.close_code or -1, retryable=not state["audio"],
                    )

        def handle(raw: str) -> None:
            try:
                msg = json.loads(raw)
            except ValueError:
                return
            kind = msg.get("type")
            data = msg.get("data") if isinstance(msg.get("data"), dict) else {}
            if kind == "audio":
                audio = data.get("audio")
                if audio:
                    output_emitter.push(base64.b64decode(audio))
                    state["audio"] = True
            elif kind == "event":
                if data.get("event_type") == "final":
                    state["finals"] += 1
            elif kind == "error":
                code = data.get("code")
                # Message text is the provider's; it stays out of the exception.
                raise APIStatusError(
                    "cloned voice error from Sarvam",
                    status_code=code if isinstance(code, int) else -1,
                    request_id=data.get("request_id"),
                    retryable=False if state["audio"] else None,
                )

        tasks = [asyncio.ensure_future(send_task()), asyncio.ensure_future(recv_task())]
        try:
            await asyncio.gather(*tasks)
            clean = True
        except (APIStatusError, APIConnectionError) as e:
            if state["audio"]:
                e.retryable = False  # H6: never replay audio the caller heard
            raise
        except (aiohttp.ClientError, ConnectionError, RuntimeError) as e:
            raise APIConnectionError(f"cloned voice WebSocket failed: {type(e).__name__}",
                                     retryable=not state["audio"]) from e
        finally:
            await utils.aio.gracefully_cancel(*tasks)
            ws = ws_box.get("ws")
            if ws is not None:
                if clean:
                    clone._park(ws)
                else:
                    # Interrupted / failed: its late audio must not reach the
                    # next reply. Replace it in the background.
                    await clone._discard(ws)
                    clone._schedule_connect()
