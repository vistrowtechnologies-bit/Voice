# Realtime voice investigation — 9 October 2026

Status: proposed fixes, offline verified; not deployed or validated with new calls.

## What was inspected

Main `4cec6bf`, Claude's handoff, bridge issue #2, the installed LiveKit 1.8.3
agent/Google plugin source, official Google/LiveKit docs, and tenant worker logs.
The inspected SDK files match their installed wheel hashes. No generated calls,
Google model requests, or production configuration changes were made.

The worker logs confirm:

| Existing call | Time (IST) | Runtime route | Evidence |
| --- | --- | --- | --- |
| 1143, dashboard browser | 19:14 | `gemini-live` → Google 2.5 native audio, Achernar | First caller frame at +2.19 s; session started +2.06 s; background audio track published; server noise cancellation disabled |
| 1144, phone | 19:17 | `gemini-live:gemini-3.1-flash-live-preview`, Achernar | First caller frame +3.30 s; session started +3.14 s; background audio track published; server noise cancellation disabled |

Audio arrived at the worker on both calls. This rules out a missing microphone
track, but does not prove that every word arrived intact at Google's service.
The existing transcripts show an apology/noise turn instead of a clean 2.5
opening and repeated replies. The phone transcript also contains interruptions
and a repeated introduction; it is not sufficient evidence of flawless 3.1.

## Confirmed implementation defects

1. **Browser mic frames are discarded during the opening.** Browser sessions
   configured `aec_warmup_duration=3.0`. LiveKit's `AgentActivity.push_audio`
   replaces incoming frames with silence while the agent speaks during this
   warmup. Phone sessions use `None`, explaining a concrete channel difference.
   The regression test reproduces this with real SDK code and nonzero PCM.
   Proposed fix removes this discard only for native realtime. Browser WebRTC
   echo cancellation is independent and stays enabled. This requires an echo
   retest on speakers as well as headphones; removing discard can expose echo.

2. **Unsupported native-audio language setting.** Both Live models received
   `language=hi-IN`, which the plugin serializes into `speech_config.language_code`.
   Google says native audio chooses language automatically and does not support
   this field. The fix omits it; the dedicated realtime prompt still asks for
   Hindi and allows caller-requested language switching. We have not proved
   that this field caused the recorded noise or repetition.

3. **Greeting state was ahead of actual playback.** `greeting_played=True` was
   set immediately after requesting speech. The fix waits for the speech handle
   and protects the opening from silence reminders until playback completes.
   The flag is released on failure and caller-first mode still stays silent.
   This closes a timing race; logs do not prove it caused every bad opening.

4. **Misleading latency reports.** Google plugin TTFT was logged as time after
   the caller stopped. These are different measurements. In call 1144 the old
   log reported 0–14 ms, which must not be advertised as human response latency.
   The fix labels provider TTFT correctly, logs the existing raw-audio-level
   estimate separately, and stores the exact configured model in diagnostics.
   The audio-level estimate can be biased by echo/noise; neither metric alone
   isolates network transit or playback buffering.

5. **A second unconditional garbled-speech rule survived the earlier fix.**
   Claude qualified the copy in Platform rules for after the caller spoke,
   but the copy in Only state back what they actually said still asked for an
   apology/repeat unconditionally. Both copies now require a genuine spoken
   request and explicitly exclude noise/silence. This is a confirmed prompt
   defect consistent with the apology opening; it is not proof of the exact
   model decision on that call.

6. **Deferred silence handling can inject a turn into active native audio.**
   The main away handler checked recent raw audio, but its deferred reminder
   bypassed that check. The post-reminder timeout could also request a goodbye
   while a model turn was still thinking/speaking. All native reminder sends
   now share the recent-audio/state guard; the timeout waits for an idle window.
   Google 3.1 explicitly says an injected client turn with `turn_complete=true`
   interrupts generation. This is a confirmed application race, but the logs
   do not establish which repeated reply it caused. Failed openings now release
   the pending flag and allow presence recovery rather than suppressing it forever.

7. **The alternate route ignored native-model compatibility.** Voice selected
   the separate orchestrator by account flag. That orchestrator runs STT, sends
   the configured model name to a text completion API, then runs TTS; it cannot
   execute `gemini-live` aliases. Dashboard tests, contact calls, phone tests and
   inbound events now bypass that route for an explicitly assigned native agent.
   The orchestrator also refuses native browser/demo tokens and native pipeline
   session construction. Pipeline models retain their route. Browser agent and
   phone-number ownership are checked before proxying. This was a latent defect;
   the two inspected calls actually ran on LiveKit, so it did not explain those
   two recordings. Native agents need a configured LiveKit phone path: if it is
   absent, setup must fail clearly instead of pretending the text pipeline can
   handle the selected model. Deployment now includes Voice server and orchestrator.

8. **Agent/server catalogs had already diverged on main.** The worker copy
   lacked the server's current fallback defaults and hidden-voice rules. Synced
   the agent from the server's existing catalog as required by AGENTS.md, and
   added a byte-equality regression check. Existing voice resolution is retained;
   this is a consistency defect, not evidence of a Gemini native-audio failure.

## Why captions and repeated turns can be misleading

Gemini receives microphone audio directly; Sarvam STT is not in this route.
In LiveKit 1.8.3 input captions are emitted provisionally and finalized when the
model generation ends. A late final bubble does not show when audio reached
Gemini. The automatic realtime audio path also does not run the pipeline's
`on_user_turn_completed` hook. Its text/gender/repetition guards cannot be assumed
to protect native audio. Essential noise/greeting/interruption instructions are
now in the separate realtime prompt, but prompt compliance is probabilistic.

The screenshot has call-center ambience at 30%; the logs confirm background audio
was published and server noise cancellation was off. Audible ambience is an
intentional setting. Whether speaker echo fed that ambience back and produced
`<noise>` is **unproven** without synchronized audio/event analysis. Google's
high start sensitivity can react to unwanted audio. Keep the 700 ms end-of-speech
window for now: shortening it blindly risks splitting Hindi phrases again.

## Independent configuration

| Path | Input / turn handling | Reasoning profile | Output |
| --- | --- | --- | --- |
| Google Live 2.5 | Native audio; Google's automatic VAD | Explicit budget 0, thoughts excluded | Google's native voice |
| Google Live 3.1 | Native audio; Google's automatic VAD | Explicit minimal level, thoughts excluded | Google's native voice |
| Existing pipeline | Sarvam STT; existing per-channel endpointing | Existing selected text LLM | Existing selected TTS |

2.5 budget 0 is a proposed latency setting, not a measured explanation of its
previous slow turns; acceptance/quality must be verified against the live API.
3.1's minimal level matches Google's documented default. Explicit
`turn_detection="realtime_llm"` prevents an unnecessary default detector warning.
Separate STT/TTS remain absent for both Live models; pipeline settings are retained.
The old comment that 3.1 cannot update instructions is outdated: LiveKit documents
support from 1.8.2 onward. No model substitution or fallback was added.

## Before calling this launch-ready

Offline verification: 82 agent tests passed (plus four subtests) across
`test_realtime_config`, `test_realtime_prompt`, `test_agent_constructs`,
`test_turn_latency`, `test_held_opening`, `test_ringback`,
`test_google31_preview_voice`, `test_google38_voices`, and
`test_gemini38_voice_personality`, with LiveKit 1.8.3.
The database URL was deliberately unreachable and the OpenAI key was a dummy;
construct tests use an in-memory compliance configuration; the additional voice
regressions also mock the compliance lookup. Python compilation
and `git diff --check` passed. One existing `audioop` deprecation warning remains.

Additionally: 31 server routing, EnableX, hidden-voice and tenant-default tests
passed (six subtests), executing real
endpoint bodies with mocked database/HTTP/dial collaborators; nine orchestrator
route tests passed with unittest. In total, 122 selected tests passed.
No test dialled a number or used a real token.

1. Review and merge the PR, deploy Voice server and orchestrator, then deploy the agent code to both tenant and platform
   LiveKit workers. A Railway/server deployment alone does not update these workers.
2. Use owner-started tests for each model on dashboard, embedded widget, and phone.
   Start with ambience off and headphones; then test speakers and ambience separately.
3. Verify opening exactly once, speaking during the opening, Hindi with natural
   pauses, a short acknowledgement, genuine interruption, silence/noise, and ten
   continuous turns. Confirm no repeated audio or duplicate final transcript.
4. Inspect exact-model diagnostics, caller-stop-to-playback distributions, missed
   words, provider errors, and speech overlap. A good single call is not enough.
5. Recheck the pipeline on all three channels. If either preview model fails the
   agreed acceptance checks, do not make that model the customer default.

Unverified: live setup acceptance of the new profiles, actual quality improvement,
speaker echo after removing warmup, the precise cause of duplicate replies,
and outbound early-media greeting timing. No promise of zero bugs is justified.

## Primary references

- [Google Live API capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities): PCM formats, native language behavior, transcription and interruption.
- [Google Live API best practices](https://ai.google.dev/gemini-api/docs/live-api/best-practices): small streaming audio chunks and conversational prompts.
- [Google 3.1 Live model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview): model-specific behavior.
- [LiveKit Gemini plugin](https://docs.livekit.io/agents/models/realtime/plugins/gemini/): 3.1 compatibility, native turn detection, thinking budget versus level.
