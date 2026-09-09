# Sarvam realtime partials are ACCOUNT-GATED — resolved, with two questions left

**Date:** 2026-09-09
**Status:** root cause found locally. Not a Sarvam defect. Do not send this as a bug report.

---

## What we thought, and what it actually was

We spent most of 9 September believing `saaras:v3-realtime` had stopped emitting
`transcript.partial`: one run produced 32 partials at ~06:00 UTC and then 13+
consecutive connections produced zero, across a controlled sweep of 8 parameter
variants with byte-identical cached audio. The server's own `session.begin` echo
confirmed `stream_type: "fast"` and `turn_detection: "vad"` each time, so the
request was demonstrably correct.

**The variable we had not controlled was the API key.**

| key | account | `transcript.partial` events |
|---|---|---|
| `sk_y8tek…` | vistrowai@gmail.com | **0** (13+ connections, 8 parameter variants) |
| `sk_mva3i…` | vistrowtechnologies@gmail.com (holds the ₹25,000 Startup Program credits) | **32** |

Same code, same audio, same parameters, minutes apart. **Realtime partial
delivery is gated by account entitlement**, not by configuration, and not by a
Sarvam-side incident. The single successful run at ~06:00 UTC was the old
account exhausting whatever small allowance it had.

## The measurement that matters

With the entitled key:

```
   608ms  transcript.partial  'हाँ जी'
  ...
  5972ms  transcript.partial  'हाँ जी बोलिए मुझे अपनी मिठाई की दुकान के लिए एक नई वेबसाइट बनवानी है'   <- complete
  6333ms  vad.speech_end
  6375ms  transcript.partial  'हाँ जी बोलिए मुझे अपनी मिठाई की दुकान के लिए एक नई वेबसाइट बनवानी है'
  6551ms  transcript.final    'हाँ जी बोलिए, मुझे अपनी मिठाई की दुकान के लिए एक नई वेबसाइट बनवानी है।'

partials: 32   first at 608ms   final at 6551ms
```

The partial at **5,972ms already carries the complete sentence** — 579 ms before
the final. Our measured LLM time-to-first-token is 500 ms, so a preemptive
generation started there produces its first token before the turn is even
confirmed. `_transcripts_equivalent` compares word lists ignoring punctuation,
so the final's added "।" does not invalidate it.

## Still to raise with Sarvam

1. **`saaras:v4-realtime` is unreachable.** Every connection attempt terminates
   immediately with no `error` event first:
   `ClientConnectionResetError: Cannot write to closing transport`.

2. **Prompt caching does not appear to apply to our account.**

Your pricing page lists a cached-input rate for `sarvam-105b-conversations`
(₹10.98 / 1M against ₹29.28 / 1M uncached), but we see no evidence of caching.

Two identical back-to-back requests, same 42,476-character system prompt:

```
call 1: prompt_tokens=10018  completion_tokens=20  prompt_tokens_details=None
call 2: prompt_tokens=10018  completion_tokens=20  prompt_tokens_details=None
```

All 10,018 prompt tokens are billed on every turn and `prompt_tokens_details`
is always `None`. For comparison, the same prompt on an OpenAI-compatible
provider returns:

```
call 1: prompt=9757  cached=0
call 2: prompt=9757  cached=9600     <- 98% cached from the second call on
```

**Questions**

1. Is prompt caching available on `sarvam-105b-conversations`, and does it need
   to be enabled or requested per account?
2. Is there a parameter to opt in (an equivalent of OpenAI's
   `prompt_cache_key`), or is it meant to be automatic above a token
   threshold?
3. Will `usage.prompt_tokens_details.cached_tokens` be populated when it is
   active? We currently have no way to verify a cache hit.

**Why it matters.** This is a voice agent, so the same large system prompt is
re-sent on every conversational turn — caching dominates the token bill for
this workload in a way it would not for one-shot requests. Enabling it would
make a material difference to whether this scales for us.

## Lesson for us

Thirteen connections, an 8-variant parameter sweep, and a cached-audio control —
all rigorous, and all sweeping past the one variable that mattered because the
key was read from `.env` and never varied. When an A/B is clean and the result
still makes no sense, the uncontrolled variable is the environment itself.
