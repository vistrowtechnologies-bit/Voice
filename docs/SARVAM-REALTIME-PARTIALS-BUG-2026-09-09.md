# Bug report for Sarvam: `saaras:v3-realtime` stopped emitting `transcript.partial`

**Account:** vistrowai@gmail.com (Sarvam Startup Program, onboarded 2026-09-08)
**Date:** 2026-09-09
**Severity:** blocks our latency work — partials are the entire reason we moved to the realtime API

---

## Summary

`wss://api.sarvam.ai/speech-to-text-realtime/ws` with `model=saaras:v3-realtime`
delivered **32 `transcript.partial` events** on our first test at approximately
**06:00 UTC on 9 September 2026**, then **zero partials on every connection since** —
at least 13 separate connections. `transcript.final` still arrives normally every time.

The server's own `session.begin` config echo confirms it accepted
`stream_type: "fast"` and `turn_detection: "vad"`, i.e. the exact configuration
documented to produce interim results.

## Evidence

Identical, byte-for-byte cached audio for every run below (6.14s of Hindi speech,
16 kHz mono linear16, streamed in 20 ms frames at real-time pace, followed by
0.9s of silence so VAD sees end-of-turn).

### The server confirms the config that should give partials

```
session.begin config echo:
    model            = 'saaras:v3-realtime'
    stream_type      = 'fast'
    mode             = 'transcribe'
    turn_detection   = 'vad'
    sample_rate      = 16000
    encoding         = 'linear16'
    language_code    = 'hi-IN'

  baseline -> partials=0  final=True  error=None
```

### Parameter sweep — no variant produces partials

| variant | partials | final |
|---|---|---|
| baseline (`stream_type=fast`, `hi-IN`) | **0** | yes |
| `stream_type=balanced` | **0** | yes |
| `language_code=auto` | **0** | yes |
| `language_code=en-IN` | **0** | yes |
| `mode=verbatim` | **0** | yes |
| `sample_rate=8000` | **0** | yes |
| `endpointing=manual` | **0** | no |
| `return_timestamps=true` | **0** | yes |

### What a working run looked like (first test, ~06:00 UTC)

Same code, same parameters:

```
   851ms  transcript.partial  'हाँ जी'
  ...
  6471ms  transcript.partial  'हाँ जी बोलिए मुझे अपनी मिठाई की दुकान के लिए एक नई वेबसाइट बनवानी है'
  6768ms  vad.speech_end
  6809ms  transcript.partial  'हाँ जी बोलिए मुझे अपनी मिठाई की दुकान के लिए एक नई वेबसाइट बनवानी है'
  7007ms  transcript.final    'हाँ जी बोलिए, मुझे अपनी मिठाई की दुकान के लिए एक नई वेबसाइट बनवानी है।'

partials: 32   first at 851ms   final at 7007ms
```

`vad.speech_start` and `vad.speech_end` still fire correctly in the failing runs.
Only `transcript.partial` is missing.

### `saaras:v4-realtime` is unreachable

Every connection attempt with `model=saaras:v4-realtime` terminates immediately:

```
aiohttp.client_exceptions.ClientConnectionResetError: Cannot write to closing transport
```

No `error` event is sent before the socket closes.

## Questions

1. Is `transcript.partial` delivery gated by account tier or a feature flag? If so,
   was something changed on our account on 9 September — the same day our Startup
   Program onboarding was processed?
2. Is `saaras:v4-realtime` restricted, and what enables it?
3. Was there an incident affecting partial delivery on 9 September 2026?

## Why this matters to us

We run production voice agents on Sarvam STT + TTS for Indian-language telephony.
Our measured per-turn pipeline is endpointing 402 ms + STT 200 ms + LLM 500 ms +
TTS 147 ms. Partial transcripts let the LLM start before the turn ends
(LiveKit's preemptive generation), which our measurements show would remove
roughly 470 ms of every turn. In the one working run the last usable partial
arrived **533 ms** before the final — comfortably more than our 500 ms LLM
time-to-first-token.

Without partials the realtime endpoint gives us nothing over the legacy socket,
so we have had to disable it.

## Reproduction

Minimal client: connect, stream 20 ms base64 `audio_input` frames at real-time
pace, count `transcript.partial` events before `transcript.final`. Happy to share
the exact script and the cached wav on request.
