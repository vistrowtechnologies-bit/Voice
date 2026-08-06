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

Scoped to Gemini's multilingual voice personas (Mira/Arin, see
voice_catalog.py) only — agent/main.py's google-native branch (locale-
specific Neural2/Chirp voices) keeps use_streaming=False untouched, since
it hasn't been validated against this same race yet.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from google.api_core.exceptions import DeadlineExceeded, GoogleAPICallError
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
