# Phase 3 — combo grid under the 3,000-character prompt cap

Date: 24 Oct 2026. Author: Claude (runtime). Owner rule (21 Oct): test every LLM × every voice from the real picker, premium included, and show the grid before saying "done"; credits are priced per combo. Telephony is excluded (tenants bring their own).

## Why the grid is re-measured

All earlier combo calls (1437–1484, 21–23 Oct) ran agent 26 with its original 4,120-character prompt. The 2,874-character prompt went on at ~18:00 UTC on 23 Oct; since then agent 26 made one call (1493, Gemini 3.8 Flash + HD, 40 s, cut short by the Gemini prepay balance). **No cell is measured under the cap yet.** The earlier calls stay useful for behaviour and latency.

Checked from main (24 Oct): picker lists in `web-demo/src/lib/agentOptions.ts`, voice families in `server/voice_catalog.py` (`CATALOG`), voice routing in `agent/main.py`.

## What blocks what

| Needs | Cells |
|---|---|
| Nothing (runnable now) | Bharat, GPT-5.4 nano, GPT-5.4 mini, Nano Lab × Bharat, HD, Native, Expressive / Gemini persona, Premium (ElevenLabs) |
| **Gemini prepay balance** (`GEMINI_API_KEY`, currently ₹0) | every Gemini LLM row; Studio and Studio Lite voices (Interactions API); Vistrow Live 3.8 |
| Agent deploy (blocked by PyPI, 24 Oct) | Vistrow Duplex (`duplex:live-1`) |

Expressive (`google31:`) and the Gemini personas (`google:kore`, …) go through Cloud Text-to-Speech with the service account (Cloud billing, not the prepay key). Caveat: the Vertex quota for `gemini-2.5-flash-tts` is 5 requests/minute (Cloud Console refuses self-service increases); a busy test call can hit it.

## The grid

Cell = earlier call id(s) on the original prompt; **R** = re-measure under the cap; **N** = never tested; ⛔ = blocked (see above).

| LLM ↓ / voice → | Bharat | HD | Native | Studio Lite | Studio | Expressive / persona | Premium (EL) |
|---|---|---|---|---|---|---|---|
| Vistrow Bharat (Sarvam 105B) | 1439 R | 1437 R | 1440 R | 1441/1442 ⛔ | 1458 ⛔ | N | N |
| GPT-5.4 nano | 1443, 1450 R | 1451 R | 1452 R | 1453 ⛔ | 1457 ⛔ | N | N |
| GPT-5.4 mini | 1462 R | 1463 R | 1464, 1466 R | N ⛔ | 1467 ⛔ | N | N |
| Nano Lab (gpt-5-nano) | N | N | N | N ⛔ | N ⛔ | N | N |
| Gemini 3.5 Flash-Lite | 1477 ⛔ | 1469, 1476 ⛔ | 1478 ⛔ | 1484 ⛔ | 1479 ⛔ | ⛔ | ⛔ |
| Gemini 3.6 Flash | 1444 ⛔ | 1468 ⛔ | 1480 ⛔ | 1481 ⛔ | ⛔ | ⛔ | ⛔ |
| Gemini 3.8 Flash | ⛔ | 1493 (cut) ⛔ | ⛔ | ⛔ | ⛔ | ⛔ | ⛔ |
| Vistrow Live 3.8 (realtime, own voice) | agent 4: Rs4.7–5.3/min measured ⛔ | | | | | | |
| Vistrow Duplex (realtime, own voice) | N (deploy) | | | | | | |

Runnable now: 4 LLMs × 5 voice families = **20 calls**. After the Gemini top-up: 3 Gemini LLMs × 7 + Studio/Studio Lite for the 4 others + Live 3.8 = **30 calls**. Plus Duplex: **3 calls** (Hindi, Hinglish, English).

## Protocol (same for every cell)

- Agent 26 only (owner account 2), browser test from the dashboard, 3,000-character prompt as now. Change only `model` and `voice` between calls (API, so the workers' cache is notified).
- One script, read the same way each time (about 2 minutes):
  1. "नमस्ते, मुझे अपने real estate business के लिए website बनवानी है।"
  2. "हम Pune में flats बेचते हैं, listings और lead forms चाहिए।"
  3. "कितने pages होंगे और कितना time लगेगा?"
  4. "Price क्या होगा?"
  5. "ठीक है, मेरा नाम Rahul है, number 98XXXXXXXX." (a test number)
  6. "ठीक है, बाद में बात करते हैं।"
- Record per call: call id; caller-stop → agent-audio median (backend `turns.py`); LLM first-token; TTS first-byte; LLM tokens in / cached / out; TTS characters or seconds; tool calls; mistakes (promises, extra questions, wrong language, jargon).

## Cost per minute, by part (Rs96/$)

| Part | How it is computed | Source |
|---|---|---|
| LLM | tokens in × price + cached × cached price + out × price, from the call's own usage counters | provider price pages; Sarvam gives no cache discount on voice calls (checked daily since 2 Oct) |
| STT (Sarvam) | Rs0.31–0.65/min measured | October bills |
| Bharat voice (Sarvam v4) | Rs1 per 1,000 characters (~Rs0.37/min) | billing-verified (call 1462) |
| HD (Chirp 3) | real ~Rs1.11/min | Native-voices fix notes, 13 Oct |
| Native | from characters, Cloud TTS Standard price | Cloud billing |
| Studio / Studio Lite | audio seconds × 25 tok/s × output price | Google pricing; 1467, 1479 |
| Premium (ElevenLabs) | characters × plan rate | ElevenLabs plan |
| LiveKit | Rs0.96/min (beyond 5,000 included) | livekit.com/pricing |
| Realtime (Live 3.8, Duplex) | provider bill for the call's minutes | Google bill; OpenAI usage page |

Credits per combo then follow from cost vs plan price per minute (Starter Rs7.50, Growth Rs5.45, Scale Rs4.81 per included minute today).

## Order of work

1. Now (no top-up): the 20 runnable calls. The owner makes the calls; Claude switches model/voice between calls and pulls the logs.
2. After the Gemini top-up: the 30 Gemini/Studio/Live calls.
3. After the agent deploy: the 3 Duplex calls.
4. Then the grid with Rs/min, latency and behaviour per cell → owner picks the public line-up and the credit price per combo.

In parallel (Claude, no calls needed): trim the shared platform prompt and tool schemas (~68% of every LLM request today), re-measure tokens offline with `agent/scripts/measure_prompt_tokens.py`, and ship the trim before the cost table is final.
