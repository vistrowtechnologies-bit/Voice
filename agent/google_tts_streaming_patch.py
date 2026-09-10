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

from clause_tokenizer import ClauseTokenizer


async def _next_token(stream: tokenize.SentenceStream) -> str | None:
    async for chunk in stream:
        return chunk.token
    return None


async def _take_one(stream: tokenize.SentenceStream) -> AsyncGenerator[str, None]:
    """Exactly one token, awaited from inside the open gRPC call."""
    async for chunk in stream:
        yield chunk.token
        return


async def _chain(first: str, rest: tokenize.SentenceStream) -> AsyncGenerator[str, None]:
    yield first
    async for chunk in rest:
        yield chunk.token


class _PatchedSynthesizeStream(GoogleSynthesizeStream):
    async def _run_stream(
        self,
        input_stream: tokenize.SentenceStream,
        output_emitter: tts.AudioEmitter,
        streaming_config: texttospeech.StreamingSynthesizeConfig,
    ) -> None:
        """Synthesize the first clause as its own call, then the remainder.

        MEASURED against Chirp 3 HD with real credentials, 4 interleaved
        repeats per condition. Google's streaming_synthesize does not stream
        out: the first audio frame arrives a near-constant ~165ms after the
        LAST character is pushed, whatever the input looks like.

            30 chars   -> first audio  512ms   (150ms after input ended)
            66 chars   -> first audio  856ms   (182ms after input ended)
           102 chars   -> first audio 1192ms   (176ms after input ended)

        And it is length, not punctuation. Same 57-character line, once with
        an early full stop and once with an em-dash in the same position:
        728ms vs 758ms — noise. So feeding the call in clause-sized pieces
        changes nothing; the call still ends when the turn ends.

        The only lever is ending a call early. Closing the first clause as
        its own request, with the remainder following as a second request fed
        live at the same rate:

            one call        832ms  [946, 833, 830, 821]
            first clause
              closed early  546ms  [549, 542, 545, 547]   -285ms

        Two calls, not one per clause: every extra boundary is a prosody seam
        and another request, and the win is entirely in the first one.
        ClauseTokenizer (the stream's tokenizer) decides where that single cut
        lands — see clause_tokenizer.py.
        """
        # ONE segment across both calls. The emitter is told upstream to
        # expect exactly one per _run_stream ("number of segments mismatch"),
        # and splitting the turn is our latency trick, not something the
        # session should hear as two utterances.
        output_emitter.start_segment(segment_id=utils.shortuuid())
        try:
            # The first call is opened BEFORE the first clause exists, and its
            # generator waits for the text. Awaiting the token first instead
            # cost 94-143ms on short turns: it serialized the gRPC setup
            # behind the LLM rather than overlapping the two.
            got_first = await self._synthesize_call(
                _take_one(input_stream), output_emitter, streaming_config
            )
            if not got_first:  # empty turn
                return

            # Peeking is fine here — the first clause is already playing, so
            # this waits in the shadow of its audio. It keeps a one-clause
            # turn from paying for an empty second streaming_synthesize.
            second = await _next_token(input_stream)
            if second is None:
                return
            await self._synthesize_call(
                _chain(second, input_stream), output_emitter, streaming_config
            )
        finally:
            output_emitter.end_segment()

    async def _synthesize_call(
        self,
        text_chunks: AsyncGenerator[str, None],
        output_emitter: tts.AudioEmitter,
        streaming_config: texttospeech.StreamingSynthesizeConfig,
    ) -> bool:
        """One streaming_synthesize call; returns whether any text was sent. Body below is upstream's, unchanged
        apart from taking its text from `text_chunks` and re-sending
        `prompt` on each call's first input — a Gemini-TTS prompt carries the
        tone, so the second half must be styled the same as the first."""
        @utils.log_exceptions(logger=logger)
        async def input_generator() -> AsyncGenerator[texttospeech.StreamingSynthesizeRequest, None]:
            try:
                yield texttospeech.StreamingSynthesizeRequest(streaming_config=streaming_config)

                async for token in text_chunks:
                    self._mark_started()
                    sent.append(True)
                    synthesis_input = texttospeech.StreamingSynthesisInput(
                        markup=token if self._opts.use_markup else None,
                        text=None if self._opts.use_markup else token,
                        prompt=self._opts.prompt if len(sent) == 1 else None,
                    )
                    yield texttospeech.StreamingSynthesizeRequest(input=synthesis_input)
            except Exception:
                logger.exception("an error occurred while streaming input to google TTS")

        sent: list[bool] = []
        input_gen = input_generator()
        try:
            stream = await self._tts._ensure_client().streaming_synthesize(
                input_gen, timeout=self._conn_options.timeout
            )
            async for resp in stream:
                output_emitter.push(resp.audio_content)

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
        return bool(sent)


class PatchedGeminiTTS(GoogleTTS):
    """Drop-in google.TTS subclass whose .stream() hands out the guarded
    SynthesizeStream above instead of the stock (crash-prone-on-cancel) one,
    and which chunks input at clause boundaries rather than sentence ends.

    The tokenizer default is the third fix here, and it is worth as much as
    the other two. Upstream defaults to `tokenize.blingfire.SentenceTokenizer`,
    so `_run_stream` above receives nothing until a full sentence exists.
    [tts_node] instrumentation on the widget measured audio starting 140-180ms
    after the first sentence terminator every time — but a conversational
    Hindi turn is usually one sentence held together with commas and em-dashes,
    so "the first terminator" and "the end of the reply" are the same moment
    and streaming never actually streams. ClauseTokenizer emits each clause as
    soon as it closes; see clause_tokenizer.py for the measurements.
    """

    def __init__(self, *args, **kwargs) -> None:
        kwargs.setdefault("tokenizer", ClauseTokenizer())
        super().__init__(*args, **kwargs)

    def stream(
        self, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> GoogleSynthesizeStream:
        stream = _PatchedSynthesizeStream(tts=self, conn_options=conn_options)
        self._streams.add(stream)
        return stream
