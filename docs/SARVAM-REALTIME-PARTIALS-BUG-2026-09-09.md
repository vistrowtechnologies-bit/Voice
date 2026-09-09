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

1. **Which account holds our Startup Program benefits?** Our onboarding form
   (submitted 2026-09-08) put **vistrowai@gmail.com** in the Primary Email field
   — the one labelled *"Startup credits & rate limits will be added to this
   account"* and *"cannot be changed"*. But the ₹25,000 and, evidently, the
   realtime entitlement are on **vistrowtechnologies@gmail.com**. These need to
   be the same account, and the form says it cannot be changed by us.

2. **`saaras:v4-realtime` is unreachable.** Every connection attempt terminates
   immediately with no `error` event first:
   `ClientConnectionResetError: Cannot write to closing transport`.
   Worth re-testing on the entitled key before asking — it may be the same
   gating.

## Lesson for us

Thirteen connections, an 8-variant parameter sweep, and a cached-audio control —
all rigorous, and all sweeping past the one variable that mattered because the
key was read from `.env` and never varied. When an A/B is clean and the result
still makes no sense, the uncontrolled variable is the environment itself.
