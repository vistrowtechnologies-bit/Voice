# Voice pipeline matrix — 2026-09-13

## Production recommendation

Use this stack for Hindi/Hinglish/Indian-language calls:

- **STT:** Sarvam Saaras realtime, language pinned to the agent's selected language
- **LLM:** Sarvam 105B Conversations for the current fastest proven production path; keep GPT-4.1 mini as the accuracy/control comparison
- **TTS:** Google Chirp 3 HD, streamed through the existing guarded LiveKit adapter
- **Region:** India LiveKit worker; Google STT experiments use `asia-southeast1` (GA)

Google Chirp 3 HD is the TTS default. It is not the same product as Gemini TTS:
the `google:chirp3:<persona>` voice path selects Cloud TTS Chirp 3, while
`google:kore`/`google31:kore` select Gemini TTS. Do not combine their latency
results under a generic “Google” label.

## Why this is the default

The live-call report on 2026-09-13, grouped by exact saved model and voice,
showed these estimated caller-stop-to-first-audio results. These historical
rows are sums of each stage's percentile because exact state-to-state timing
was not yet stored; new calls now record the exact perceived span:

| STT | LLM | TTS | Calls | Turns | p50 | p95 |
|---|---|---|---:|---:|---:|---:|
| Sarvam | Sarvam 105B Conversations | ElevenLabs Flash / Siya | 4 | 16 | 891 ms | 1,888 ms |
| Sarvam | Sarvam 105B Conversations | Google Chirp 3 / Callirrhoe | 23 | 157 | 927 ms | 1,986 ms |
| Sarvam | GPT-4.1 mini | Google Chirp 3 / Aoede | 9 | 60 | 1,571 ms | 2,773 ms |
| Sarvam | GPT-4.1 mini | ElevenLabs Flash / Monika | 22 | 148 | 1,557 ms | 2,181 ms |
| Sarvam | GPT-4.1 mini | Gemini TTS / Kore | 25 | 112 | 2,319 ms | 6,925 ms |

ElevenLabs is marginally faster in the small Sarvam-LLM sample, but Google
Chirp 3 is the preferred production TTS because its measured result is close,
its p95 is controlled, it supports the required Indian locales with the same
persona name, and it avoids routing every response from India to ElevenLabs'
self-serve US region. ElevenLabs' own documentation says South Asia typically
sees 380–440 ms TTFB from that region before application/LLM latency.

The old Gemini TTS voices are the actual slow outlier and must not be used as
evidence against Google Chirp 3.

## What was built

The agent editor now treats the three stages independently:

1. **Speech recognition:** Vistrow Indic (Sarvam) or Google Chirp 3.
2. **Model:** Sarvam 105B, GPT-4.1 mini, Gemini Flash variants, and an
   admin-only GPT-5 nano lab option.
3. **Voice:** Google Chirp 3, ElevenLabs Flash, or Sarvam Bulbul through the
   existing curated voice catalog.

Google STT is deliberately fixed to the selected default language and uses
Chirp 3 streaming with short endpointing. It is a comparison lane, not the
new default: earlier Indian proper-name checks favored Sarvam strongly.

Every new call writes the configured stack into `latency_metrics_json.stack`.
LiveKit's metric events continue to record the provider/model that actually
answered, so a fallback cannot be mistaken for success by the selected lane.

Generate a fresh comparison from real calls with:

```bash
server/.venv/bin/python scripts/compare_voice_pipelines.py --days 14 --min-turns 3
```

Add `--json` for machine-readable output. New calls are ranked using the exact
caller-stop-to-first-audio state span. Historical calls are clearly labelled
`estimated-stage-sum`; independent metric arrays are never zipped into fake
per-turn totals.

## Test sequence

For each STT × LLM × TTS combination, run the same agent prompt and the same
scenario set in this order:

1. Hindi fixed-language browser call.
2. Hinglish browser call with names, numbers, and property localities.
3. Hindi PSTN call on an 8 kHz real number.
4. Marathi fixed-language call.
5. Interruption/barge-in and quiet-caller cases.

Do not choose a winner from one call. Require at least 30 fully observed turns
per stack, then compare p50, p95, transcription correctness, hallucinated lead
facts, interruption rate, and provider error/fallback rate.

## Official references

- Google Cloud Chirp 3 HD TTS: https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- Google Cloud Chirp 3 STT: https://docs.cloud.google.com/speech-to-text/v2/docs/chirp-model
- ElevenLabs latency: https://elevenlabs.io/docs/api-reference/reducing-latency
- ElevenLabs realtime WebSocket TTS: https://elevenlabs.io/docs/eleven-api/guides/how-to/websockets/realtime-tts
- Sarvam + LiveKit: https://docs.sarvam.ai/api/integration/build-voice-agent-with-live-kit
- Sarvam STT best practices: https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/best-practices
- OpenAI GPT-5 nano: https://developers.openai.com/api/docs/models/gpt-5-nano
