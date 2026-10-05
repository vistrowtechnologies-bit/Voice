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

## Rupee view (added 5 Oct 2026, after the first benchmark runs)
Rate used: Rs95.16 per USD (single web-search result, 5 Oct 2026; the table above assumed Rs88, which understated every dollar-priced line by about 8%). LiveKit session is a rupee price (Rs0.957/min), so it does not move with the rate.

| Setup | Provider Rs/min | Total with LiveKit | Margin at Scale (Rs5.20/min) |
|---|---|---|---|
| gpt-realtime-2.1 flagship, cached | 5.0 | 6.0 | -15% |
| gpt-realtime-2.1 flagship, prompt not cached | 8.2 | 9.1 | -75% |
| gpt-realtime-mini | 1.5 - 2.0 | 2.5 - 3.0 | 42 - 52% |
| Gemini 3.8 Live | 1.7 | 2.7 | ~48% |
| Gemini 2.5 native audio | 1.8 | 2.8 | ~46% |
| Our stack (gpt-4.1-mini + Sarvam STT + ElevenLabs Flash) | 2.7 | 3.7 | 29% |
| Our stack with Google Chirp 3 STT | 3.8 | 4.8 | 8% |
At the Starter price (Rs10/min) the flagship earns about 40% cached, 9% uncached.

## Latency benchmark (staging, us-east worker, caller on a laptop in India, 5 questions per stack)
Gemini Live 3.1 preview: median 2,368 ms (range 1,068-4,084). Cascaded reference in the same run (gpt-4.1-mini + Sarvam STT + ElevenLabs): 2,052 ms. Gemini Live 2.5 native audio: no replies at all; the agent log says "turn_detection is set to 'stt', but no STT model is provided" and "server cancelled tool calls", so our Gemini Live wiring has a fault on 2.5 and this is NOT a verdict on the model. OpenAI realtime: not wired in, not measured. n=5 and one run, so treat as indicative only.
