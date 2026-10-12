# Gemini Live 2.5: why the first reply was slow, and the fix (2026-10-12)

## What was measured

| Path | Model | Caller stops → first audio |
|---|---|---|
| Direct Live API, our VAD profile, no greeting | 2.5 native audio | 2.0–2.9 s (9 runs) |
| Direct Live API, Google's default VAD | 2.5 | no reply within 10 s (3 runs) |
| Direct Live API, LOW end-sensitivity / 300 ms silence | 2.5 | 2.4–3.0 s |
| Direct Live API, our profile | 3.1 Flash Live | 1.2 s (3 runs) |
| Real call through the LiveKit worker | 2.5 | 7.1–9.1 s (4 calls) |
| Real call through the LiveKit worker | 3.1 | 2.4 s |
| Direct, greeting *appended* to context, then first question | 2.5 | 2.4–2.9 s |
| Direct, greeting *generated* from a text turn (as the plugin does), then first question | 2.5 | no reply within 15 s |

Transcription on/off and hints made no difference (2.1–3.1 s). Blocking vs background tool calls made no difference on 2.5.

## Cause

The worker greets a realtime agent with `generate_reply(instructions=...)`. For 2.5 the LiveKit plugin must add a `"."` user placeholder turn (the API rejects a model-only turn with `turn_complete`), and after that generated greeting 2.5 mishandles the caller's first audio turn: an empty generation first, then the real answer several seconds later. The worker log for one call shows the empty generation 2 s after the caller stopped, the plugin's "Gemini Live does not support removing messages" warning, and the real generation 4.8 s after, with first audio at 7.3 s. The model's own reply time is 2–3 s.

This matches public reports: a [LiveKit community thread](https://community.livekit.io/t/high-latency-5-8-seconds-with-google-gemini-realtime-plugin-over-sip/238) with 5–8 s replies on 2.5 over SIP and no confirmed fix; [livekit/agents #5408](https://github.com/livekit/agents/issues/5408) on growing turn gaps with 2.5 native VAD; [googleapis/python-genai #2117](https://github.com/googleapis/python-genai/issues/2117) on empty `turnComplete` stalls (P2 at Google, no fix); and a [thread on first-turn delays after a scripted greeting](https://community.livekit.io/t/title-6-12s-latency-on-the-first-model-response-after-a-pre-recorded-greeting-even-with-early-session-initialization-gemini-3-1-flash-live/1431).

## Fix

`agent/main.py`: on 2.5, the operator's opener is spoken by Google Chirp 3 HD in the agent's Gemini persona (`google:kore` → `hi-IN-Chirp3-HD-Kore`) through `session.say(audio=...)`, which also appends the line to the model's context. Gemini never generates the greeting, so the first caller turn stays at the model's floor. 3.1 keeps greeting itself (works, 2.4 s). Agents with no opener keep the old path. `REALTIME_25_TTS_GREETING=0` turns the change off.

## How others run it

- [Bolna](https://www.bolna.ai/docs/gemini-live) (Indian competitor): Gemini Live speech-to-speech with **3.1 Flash Live as the default**, 2.5 listed for "reasoning with video".
- [Pipecat](https://docs.pipecat.ai/server/services/s2s/gemini-live): server-side VAD, `silence_duration_ms=500` (same as ours).
- [Vision Agents](https://visionagents.ai/integrations/realtime/gemini): HIGH/HIGH sensitivity, 250 ms silence, 50 ms prefix.
- Vapi and Retell: cascaded STT→LLM→TTS, no native Gemini Live found.
- Google's [capabilities guide](https://ai.google.dev/gemini-api/docs/live-api/capabilities): `silence_duration_ms` is the main latency dial; stream audio in 20–40 ms chunks (the LiveKit plugin sends 50 ms).

## Recommendation

For Gemini voice agents, prefer 3.1 Flash Live: 1.2 s model floor and 2.4 s in a real call, versus 2–3 s and 7–9 s (before this fix) on 2.5. 2.5 costs about a third as much per minute (₹4.6 vs ₹16.8 from the Oct 6–9 bill). The dashboard labels now say this.

## Verification after the fix (one call, 2.5)

The opener was spoken by TTS (`realtime opener via TTS (Kore) requested at +2.72s`) and the empty generation no longer appeared. The caller's question was still answered 7.5 s after the caller stopped: Gemini's first server event came 1.7 s after the caller stopped, its first audio 4.65 s after that, and its caption of the question only finished 10 s after the caller stopped. So the greeting was one cause, not the whole cause.

Everything else that differs between the worker and a direct session was then tested directly on 2.5 (2 runs each unless noted), and none of it reproduces the gap:

| Factor | First audio after caller stops |
|---|---|
| Baseline, short prompt | 1.9–2.5 s |
| Full 13 k rule block + all 12 tool definitions | 1.85–1.95 s |
| 15 s idle before the question | 1.8 s |
| Idle + greeting appended + 50 ms chunks | 1.9 s |
| Quiet room noise (−55 / −42 dBFS) instead of silence | 1.8–2.6 s (one 3.5 s) |
| Start-sensitivity LOW / end-sensitivity LOW | 1.8–2.4 s |

The same worker answers in 2.4 s on 3.1. The remaining 2.5 gap therefore only shows inside LiveKit Cloud with the 2.5 backend, which is what [googleapis/python-genai #2117](https://github.com/googleapis/python-genai/issues/2117) describes (0 stalls locally, 53 % on LiveKit Cloud, Google-side, P2, no fix). Note that these calls used a synthetic caller (TTS audio published into the room); the 10 Oct lab measured 3.5–4.3 s for real browser callers on 2.5 before this fix, so a real test call is the number that matters next.

## Not done

- 20 ms audio chunking to the plugin (Google's guidance; the plugin uses 50 ms). Untested here.
- Empty-turn nudge in the worker. Not needed once the greeting is no longer model-generated; revisit if empty generations still appear in `[native-timing]` logs.
- Spend on this investigation: about ₹25 of the ₹50 budget (5 real calls, ~90 direct probes of a few seconds each).
