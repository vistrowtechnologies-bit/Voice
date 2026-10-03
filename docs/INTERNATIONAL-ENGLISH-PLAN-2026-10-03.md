# International (English-first) plan, started 3 Oct 2026

Goal: sell the dashboard and an English voice agent to clients outside India.

## What the data said (production, 539 calls, all Hindi)
Caller-stop to first audio, median: 1.53 s for Sarvam model + Google voice (LLM 0.80, endpointing 0.40, STT 0.18, TTS 0.18); 2.1-2.5 s for gpt-4.1-mini / gpt-4o-mini with a Gemini/Google voice (TTS 0.93-0.95). The LLM and the end-of-speech wait dominate, not the language. No English calls exist yet.

## Gaps found in the code (not yet fixed)
1. Only `en-IN` is offered as English. No `en-US` / `en-GB`. Touches `web-demo/src/lib/agentOptions.ts` LANGUAGES, `server/voice_catalog.py` and `agent/voice_catalog.py` (CHIRP3_LANGUAGES, language labels), `agent/language.py`, greeting cache.
2. STT choices are only Sarvam or Google Chirp 3. Chirp 3 is pinned to `asia-southeast1` (env `GOOGLE_SPEECH_LOCATION`), which is wrong for a US/EU worker. No Deepgram or similar low-latency English STT.
3. Workers run in `ap-south`. A US/EU caller pays the extra network distance every turn. A staging worker exists in `us-east`.
4. Billing is INR only; the phone trunk is EnableX (India); calling rules are India's.

## Phase I1: English latency benchmark (in progress)
`scripts/bench_english_latency.py` joins a STAGING room as a synthetic caller, speaks fixed English questions and times caller-stop to first agent audio, across model / STT / voice combinations. It refuses any non-staging address. Absolute numbers include the laptop-to-worker network path; compare variants, not absolutes.

## Next
I2 region: put workers where the callers are; I3 add en-US/en-GB; I4 add a low-latency English STT; I5 USD billing; I6 carrier for the first target market; I7 that market's calling/consent rules. Waiting on the owner: first target market.
