# Vendor integration plan — matching Ravan's model line-up

Date: 24 Oct 2026. Author: Claude (runtime session). Companion to `docs/RAVAN-PLATFORM-AUDIT-2026-10-24.md`.

Owner rules this plan follows: quality first (no cheap robotic voices); owner-only models go public only after the combo tests pick the best low-latency combination; prices exclude telephony (tenants bring their own).

Evidence marks: **[O]** vendor's own official page, read 24 Oct 2026 · **[P]** checked in our installed packages (`tmp/agentvenv`, livekit-agents 1.8.6) or PyPI · **[K]** checked against our own API key (read-only model list, no charge) · **[M]** our own measured call costs · **[I]** inference.

## 1. Verified facts per vendor

| Vendor (Ravan model) | What it is | Official price [O] | Indian languages [O] | LiveKit support | Our access |
|---|---|---|---|---|---|
| OpenAI GPT-Live 1 (Agni Duplex) | Full-duplex speech-to-speech; delegates reasoning/tools to a backend Responses model | $0.05/min; backend model and tools billed separately (developers.openai.com/api/docs/pricing) | Not stated on the pages read | `GPTLiveModel` present in our pinned livekit-plugins-openai 1.8.6 [P]; also via LiveKit Inference as `openai/gpt-live-1` at $0.05/min (livekit.com/pricing) | `gpt-live-1` is in our OpenAI account's model list [K] |
| OpenAI GPT Realtime 2.1 / 2.1 mini | Realtime speech-to-speech (turn-based) | 2.1 mini: audio $10/M in, $20/M out, cached $0.30/M; LiveKit lists ~$0.0216/min | Not stated | OpenAI realtime plugin (installed) [P] | Both in our model list [K] |
| Google Gemini Live 3.8 (Agni Ultra / Premium / Premium Lite = Gemini Live) | Speech-to-speech, affective dialog | audio in $3.00/M (~$0.005/min), out $12/M (~$0.018/min), text in $0.75/M (ai.google.dev pricing) | 24+ languages incl. Hindi | Already integrated (Vistrow Live 3.8) | Live; measured Rs4.7–5.3/min [M] |
| Boson AI — Higgs Realtime (related to Agni 5.0 `boson`) | Speech-to-speech; OpenAI-Realtime-compatible WebSocket | Billed per token: $0.75/M in, $0.25/M cached, $4.50/M out; Boson's own per-minute estimates $0.0023 in / $0.014 out (boson.ai/pricing) | Hindi, Bengali, Urdu listed (boson.ai/higgs-realtime) | No LiveKit plugin (docs.livekit.io TTS/STT lists); OpenAI-Realtime-compatible protocol, so the OpenAI realtime plugin with a custom base URL may work [I] | No account yet |
| Boson AI — Higgs TTS 3 (Agni 5.0 `boson`) | TTS, 100+ languages, zero-shot cloning | $0.015 per 1K characters, audio free (boson.ai/pricing) | "100+ languages"; Hindi not individually confirmed | No LiveKit plugin; needs a custom TTS adapter | No account yet. Open weights are research/non-commercial; hosted API is the commercial route |
| Murf — Falcon (Agni Lite 3.0 `murf`) | Streaming TTS | $0.01 per 1,000 characters (Falcon docs page, rechecked 24 Oct; murf.ai/api marketing says per minute) | Codex reports Hindi/Hinglish, Odia and other Indian languages in Murf's voice library; not rechecked by Claude | `livekit-plugins-murf` exists, 1.8.6 on PyPI [P] (Python only) | No account yet |
| Soniox — STT (likely half of Agni Lite 2.0 `Soniox`) | Real-time STT, 60 languages | $0.12/hour real-time ($0.002/min), $0.10/hour async (soniox.com/pricing) | Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, Malayalam, Gujarati, Punjabi, Urdu; **no Odia**; code-switching not stated | `livekit-plugins-soniox` exists, 1.8.6 on PyPI [P] | No account yet |
| Soniox — TTS v2 | TTS | ~$0.70/hour of generated speech; $21.50/M output audio tokens | TTS language list not on the page read | Same plugin (TTS listed in LiveKit TTS plugins) | No account yet |
| Svara (Agni 5.0 Lite `svara_pipeline`) | Open-source Indic TTS (Kenpath), 19 languages, emotion tags, cloning | Free, Apache-2.0; self-host only (GPU) | 18 Indic + Indian English | No plugin; OpenAI-compatible `/v1/audio/speech` server | Would need our own GPU servers |
| Sarvam (Agni Lite 4.0) | STT + Bulbul TTS + 105B LLM | Already in use | 10–11 Indian languages | Plugin installed | Live today as "Bharat" |

Discrepancy to note: our installed GPT-Live plugin lists voices aster, beacon, cinder, marin, stone, vesper [P]; Ravan's "Duplex" voices are ripple, quartz, Ash, tempo, Nira, Nuri. The vendor key (`gpt-live-1`) is from Ravan's own catalog, but the voice names do not match the plugin list (newer or custom voices). [I]

## 2. Estimated cost per call-minute (Rs96/$)

Assumptions [I]: the agent speaks ~40% of a call minute; ~370 TTS characters per call minute (from our Sarvam v4 measurement, Rs1/1K chars ≈ Rs0.37/min [M]). LiveKit agent session $0.01/min is added separately. Realtime rows exclude context re-billing, which raised Gemini Live from ~Rs1.7 list to Rs4.7–5.3 measured [M]; expect the same effect on every realtime model until measured.

| Component | Option | Rs per call-minute |
|---|---|---|
| STT | Sarvam (today) | 0.43–0.65 [M] |
| STT | Soniox real-time | ~0.19 |
| TTS | Sarvam Bulbul v4 (today) | ~0.37 [M] |
| TTS | Murf Falcon | ~0.36 (370 chars × $0.01/1K) |
| TTS | Boson Higgs TTS 3 | ~0.53 (370 chars × $0.015/1K) |
| TTS | Soniox TTS v2 | ~0.45 (0.40 audio-min × $0.70/h) |
| Realtime | Boson Higgs Realtime | ~1.56 list, before context growth |
| Realtime | Gemini Live 3.8 | ~1.7 list; 4.7–5.3 measured [M] |
| Realtime | OpenAI GPT Realtime 2.1 mini | ~2.07 list |
| Realtime | OpenAI GPT-Live 1 | ~4.8 + backend model |
| Platform | LiveKit agent session | 0.96 |

## 3. Plan (quality first, verified at each step)

Order is by value to customers and ease, not by price.

**Step 0 — no new vendor needed (start now)**
- Finish the combo grid on what we have (3.8 Flash, Nano Lab, Live 3.8) after the Gemini top-up, then open the winners to customers.
- Trim the shared platform prompt and tool schemas (~68% of every LLM request); re-measure cost and latency.

**Step 1 — OpenAI GPT-Live 1 as an owner-only realtime option ("Vistrow Duplex")**
- Why: Ravan's Duplex engine; we already have access [K] and the plugin is in our pinned version [P]; no new account, no dependency change.
- Work: add a model id (e.g. `gpt-live:gpt-live-1`) to the runtime model builder (agent/main.py near the Gemini Live branch), owner-only in `ADMIN_ONLY_MODELS`, billing multiplier like Live.
- Verify: test calls in Hindi, Hinglish and English on agent 26; record first-audio latency from backend logs, interruption handling, language switching, cost per minute from the OpenAI usage dashboard. Pass bar = sounds human, under ~1.5 s, correct Hindi.
- Risk: GPT-Live prompting differs (separate voice and backend instructions); the plugin cannot pair with a separate TTS.

**Step 2 — Soniox STT as an alternative speech recogniser**
- Why: ~Rs0.19/min vs Sarvam's ~Rs0.43–0.65, 10 Indian languages, plugin at our pinned version [P]. Quality must be proven, not assumed.
- Needs: owner creates a Soniox account + API key (`SONIOX_API_KEY` as a LiveKit secret, merged without `--overwrite`).
- Work: add `stt_provider = "soniox"` next to "sarvam" and "google-chirp3" (agent/main.py ~2447); add `livekit-plugins-soniox==1.8.6` to agent/requirements.txt.
- Verify: same scripted calls with Sarvam vs Soniox; compare word errors on Hindi/Hinglish/Marathi transcripts and end-of-turn latency. Keep Sarvam as default unless Soniox wins on accuracy. No Odia support, so Odia agents stay on Sarvam.

**Step 3 — Murf Falcon as a quality TTS candidate**
- Why: plugin at our pinned version [P], $0.01 per 1,000 characters, <100 ms first-audio claim.
- Needs: Murf account + key; confirm in Murf's voice library which Hindi/Indian voices exist for Falcon (Codex lists them; Claude has not rechecked).
- Verify: owner listens to Hindi and Hinglish samples next to our Bharat and HD voices; only voices the owner rates "non-robotic" go in.

**Step 4 — Boson AI (Higgs Realtime and Higgs TTS 3)**
- Why: Higgs Realtime lists Hindi and is cheaper than Gemini Live on paper; Ravan's cloned Indian voices (their 5.0 tier) run on Boson.
- Needs: Boson account; read their commercial terms (hosted API vs open weights).
- Work: realtime — try the OpenAI realtime plugin pointed at Boson's endpoint (protocol-compatible per their page) [I]; TTS — a small custom streaming TTS adapter (no plugin).
- Verify: same latency/quality/cost tests; cloning only with recorded consent (our existing consent flow).

**Not planned now**
- Svara: self-hosted GPU only, and owner rule excludes unproven robotic-sounding Indic voices.
- Soniox TTS: only if Step 2 goes well and its Indian voices pass the owner's listening test.

## 4. What the owner needs to do
- Top up Gemini prepay (blocks Step 0 tests and the website demo).
- Create accounts and send keys (via the secret stores, never chat) for: Soniox (Step 2), Murf (Step 3), Boson (Step 4).
- Approve each step's live test calls.

## 5. Process for each step
Runtime lane (agent/): worktree on its own branch, function-level `[CLAIM]` on issue #2, `scripts/agent_overlap.py`, tests with `DATABASE_URL` set to a placeholder, `graphify update .`, PR, `[DONE]`. Deploy both LiveKit agents only when `lk room list` is empty, verify by startup logs. Dashboard pieces (model labels) go to the dashboard session as `[REQUEST]`.
