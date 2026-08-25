"""Patched Gemini-TTS streaming for google.TTS — works around a real bug in
livekit-plugins-google 1.6.4 (confirmed still present on livekit/agents' main
branch as of 2026-08-06): SynthesizeStream._run_stream's `finally: await
input_gen.aclose()` races the in-flight gRPC call that's still iterating the
same generator. If the call gets cancelled mid-utterance (a barge-in, or the
caller hanging up while the agent is speaking) both sides can try to close
`input_gen` at once, raising `RuntimeError: aclose(): asynchronous generator
is already running` — unhandled, this kills the whole LiveKit session, not
just the current turn. That's why agent/main.py's _build_tts previously
forced use_streaming=False for every Google voice, trading real streaming
(and its latency win) for stability.

This subclasses just the one vulnerable method rather than patching the
whole plugin, and only swallows that exact RuntimeError message — any other
failure still propagates normally. Everything else (the actual gRPC
streaming call, audio emission) is an unmodified copy of upstream's
_run_stream, so if livekit-plugins-google ever fixes this upstream, deleting
this file and going back to plain google.TTS(use_streaming=True) is a
no-op change in behavior.

Despite the class name, nothing here is Gemini-specific — it subclasses
google.TTS/SynthesizeStream from the same shared livekit-plugins-google
module every Google TTS voice in this app goes through, Gemini persona or
locale-specific Neural2/Chirp voice alike. Originally scoped to just the
Gemini personas (Mira/Arin) while the locale-voice branch stayed on
use_streaming=False, unvalidated against this same race; agent/main.py now
uses PatchedGeminiTTS for every Google TTS construction, so there is no
remaining non-streaming Google TTS path in this app.

Second, separate bug fixed here (found via real Cloud Monitoring data,
2026-08-13): a normal caller barge-in cancels the in-flight gRPC
streaming_synthesize call, which google-api-core surfaces as
`Cancelled` (HTTP/gRPC code 499) — NOT a server-side failure. `Cancelled`
is a subclass of `GoogleAPICallError`, so the unpatched exception
handling below wraps it as `APIStatusError`, which
`TtsFallbackAdapter._try_synthesize` catches via a bare `except
Exception` — counting a routine interruption against max_retry_per_tts
and, once exhausted, flipping availability to False and swapping the
caller to the Sarvam/Monika safety net mid-conversation. Real data:
499s were ~19% of ALL Google TTS requests over 7 days — by far the
largest error category, dwarfing genuine 504 timeouts (~1.6%). This is
very likely the dominant cause of the "Google TTS randomly falls back
mid-call" symptom, not backend slowness. Converting `Cancelled` to
`asyncio.CancelledError` (a `BaseException`, not `Exception`) makes it
bypass `_try_synthesize`'s `except Exception` entirely, so an
interruption is handled the same way every other TTS provider's
cancellation already is — never counted as a provider failure.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator

from google.api_core.exceptions import Cancelled, DeadlineExceeded, GoogleAPICallError
from google.cloud import texttospeech
from livekit.agents import APIConnectOptions, APIStatusError, APITimeoutError, tokenize, tts, utils
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS
from livekit.plugins.google.log import logger
from livekit.plugins.google.tts import TTS as GoogleTTS
from livekit.plugins.google.tts import SynthesizeStream as GoogleSynthesizeStream


class _PatchedSynthesizeStream(GoogleSynthesizeStream):
    async def _run_stream(
        self,
        input_stream: tokenize.SentenceStream,
        output_emitter: tts.AudioEmitter,
        streaming_config: texttospeech.StreamingSynthesizeConfig,
    ) -> None:
        @utils.log_exceptions(logger=logger)
        async def input_generator() -> AsyncGenerator[texttospeech.StreamingSynthesizeRequest, None]:
            try:
                yield texttospeech.StreamingSynthesizeRequest(streaming_config=streaming_config)

                is_first_input = True
                async for input in input_stream:
                    self._mark_started()
                    synthesis_input = texttospeech.StreamingSynthesisInput(
                        markup=input.token if self._opts.use_markup else None,
                        text=None if self._opts.use_markup else input.token,
                        prompt=self._opts.prompt if is_first_input else None,
                    )
                    is_first_input = False
                    yield texttospeech.StreamingSynthesizeRequest(input=synthesis_input)
            except Exception:
                logger.exception("an error occurred while streaming input to google TTS")

        input_gen = input_generator()
        try:
            stream = await self._tts._ensure_client().streaming_synthesize(
                input_gen, timeout=self._conn_options.timeout
            )
            output_emitter.start_segment(segment_id=utils.shortuuid())

            async for resp in stream:
                output_emitter.push(resp.audio_content)

            output_emitter.end_segment()

        except Cancelled:
            # A caller barge-in, not a provider failure — see module
            # docstring. Must be caught before the GoogleAPICallError
            # branch below, since Cancelled is one of its subclasses.
            raise asyncio.CancelledError() from None
        except DeadlineExceeded:
            raise APITimeoutError() from None
        except GoogleAPICallError as e:
            raise APIStatusError(e.message, status_code=e.code or -1, body=f"{e.details}") from e
        finally:
            # The one-line fix: cancellation can already be tearing input_gen
            # down (via the gRPC client's own internal iteration) by the time
            # we get here — aclose()-ing it again is what raises. Any other
            # RuntimeError is a real bug and should still surface.
            try:
                await input_gen.aclose()
            except RuntimeError as e:
                if "asynchronous generator is already running" not in str(e):
                    raise


class PatchedGeminiTTS(GoogleTTS):
    """Drop-in google.TTS subclass whose .stream() hands out the guarded
    SynthesizeStream above instead of the stock (crash-prone-on-cancel) one."""

    def stream(
        self, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> GoogleSynthesizeStream:
        stream = _PatchedSynthesizeStream(tts=self, conn_options=conn_options)
        self._streams.add(stream)
        return stream
