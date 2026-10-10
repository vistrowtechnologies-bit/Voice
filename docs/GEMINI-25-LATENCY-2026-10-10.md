# Gemini Live 2.5 follow-up

## Evidence

Owner test 2026-10-09 17:35 UTC used 2.5 native audio on Agent 26. Four clean
caller-stop-to-playback energy estimates were 6256, 8759, 691, 7905 ms. Median
7080.5 ms; this is audible-response delay, not only late captions. The 3.1 test
at 17:32 UTC had a 1748 ms median over seven turns.

Both first mic frames arrived ~30 ms after session.start returned. No fatal
Gemini API error was captured. Both tests published ambience. Input transport
startup does not explain the repeated 2.5 delay. Echo/noise and Google turn
detection remain possible contributors; a recording has not been listened to.

The pinned LiveKit Google 1.8.3 code defines metric.timestamp as the creation of
the response generation and TTFT as time until its first received audio frame.
An input-transcription event may create that generation. It is **not** a
caller-stop timestamp. It finalizes caller captions on turn_complete, which
may follow model generation and playback. The browser renders streaming
transcriptions; it does not explicitly wait for final captions.

## Changes and limits

- 2.5 automatic detection silence window: 700 -> 500 ms. Retain END_LOW and
  START_HIGH with 200 ms prefix padding to protect Hindi mid-sentence pauses.
  This removes 200 ms of configured wait; it does not explain or prove a cure
  for the full multi-second delay. Live comparison is required.
- 3.1 retains 700 ms; native thinking budget vs level stays separate. Pipeline
  STT/TTS and endpointing are unchanged.
- Per-model overrides REALTIME_25_SILENCE_MS and REALTIME_31_SILENCE_MS; existing
  REALTIME_SILENCE_MS remains a fallback. Per-model value takes precedence.
- Log public native generation and first/final input-caption events, first
  provider audio timestamp, and playback timestamp. Log IDs and timings only.
  Observers never consume audio or issue a generation.
- Correct diagnostic first-audio offset to timestamp + TTFT. It formerly
  estimated from collection time minus duration, which can shift an event when
  metrics arrive late. Missing TTFT is unknown, not zero.

## Owner retest

Use Agent 26's 2.5 native configuration with headphones and ambience off for a
controlled comparison, then repeat with the intended ambience configuration.
Check greeting once, complete Hindi requests with natural pauses, short replies,
interruption, and response latency across several turns. Compare native-timing
generation -> provider-audio -> playback markers and first/final captions with
the audio-level estimate. A late final caption alone does not establish late
speech recognition. Do not match overlapping replies solely by timestamp.

No real calls or external model requests are initiated by automated checks.
This change is not a declaration that 2.5 is launch-ready.

## Primary references

- [Google Live API reference](https://ai.google.dev/api/live): silenceDurationMs
  increases latency; input transcription is independently ordered; turnComplete
  may wait for playback.
- [Google Live best practices](https://ai.google.dev/gemini-api/docs/live-api/best-practices):
  stream small PCM chunks, resample to 16 kHz, clear playback on interruption.
- [LiveKit Gemini plugin](https://docs.livekit.io/agents/models/realtime/plugins/gemini/):
  native VAD and model-specific thinking configuration.
