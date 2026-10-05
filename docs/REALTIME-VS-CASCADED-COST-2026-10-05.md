# Cost per minute: realtime voice models vs our cascaded stack (5 Oct 2026)

Prices read from the providers' own pages on 5 Oct 2026: developers.openai.com/api/docs/pricing, ai.google.dev/gemini-api/docs/pricing, elevenlabs.io/pricing/api, sarvam.ai/api-pricing; Google Chirp 3 STT ($0.016/min) from a web search of cloud.google.com/speech-to-text/pricing (the page itself did not load). LiveKit session cost and Sarvam STT cost come from comments in `server/calls_db.py` (Rs0.957 and Rs0.50 per minute).

## Assumptions (one minute of conversation)
Caller talks 30 s, agent talks 30 s, 6 turns, ~1,500 text tokens of prompt/knowledge re-sent each turn, agent speech ~410 characters, Rs88 = $1 (assumption, not checked). OpenAI audio tokens: 1,200 per minute the assistant speaks, 600 per minute the caller speaks (from a third-party breakdown, not OpenAI's page). gpt-4.1-mini output price ($1.60/M) is from memory, not the page.

## Estimate, USD per minute (provider cost only)
| Setup | Provider cost | + LiveKit session ($0.011) |
|---|---|---|
| gpt-realtime-2.1 (flagship), cache works | 0.053 | 0.064 |
| gpt-realtime-2.1, prompt NOT cached | 0.086 | 0.097 |
| gpt-realtime-mini | 0.016 - 0.021 | 0.027 - 0.032 |
| Gemini 3.8 Live ($0.005/min audio in, $0.018/min audio out) | ~0.018 | ~0.029 |
| Gemini 2.5 Flash native audio (token rate assumed 32/s) | ~0.019 | ~0.030 |
| Our cascaded: gpt-4.1-mini + Sarvam STT + ElevenLabs Flash ($0.04/1K chars) | 0.030 | 0.041 |
| Same with Google Chirp 3 STT instead of Sarvam | 0.040 | 0.051 |

If the caller's audio is billed for the whole minute including silence, add about $0.01 (flagship) or $0.003 (mini).

## What we charge
Scale plan Rs12,999 / 2,500 credits = Rs5.20 per credit = about $0.059 per standard minute (1 credit/min); Starter Rs10 per credit = about $0.114. Premium voices bill 2x.
Margin at the Scale price: cascaded ~31%, realtime-mini and Gemini Live ~46-54%, flagship realtime negative.

## Not known
Latency and answer quality of any realtime model on our prompts; Hindi/Indic accuracy (the code says Sarvam is the measured-accurate one); whether cached-input discounts hold on real calls; long-call growth (context is re-billed every turn). Gemini Live is already wired (admin-only, `gemini-live` prefix; 3.1 is deliberately not the default because it ignores mid-session instruction updates that our per-turn guards rely on). OpenAI realtime is not wired; the plugin is installed.
