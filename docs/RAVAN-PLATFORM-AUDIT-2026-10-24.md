# Ravan.ai (Agni) vs Vistrow Voice — platform audit

Date: 24 October 2026. Author: Claude (runtime session), for cross-verification by Codex.

## How to read the evidence marks

- **[S]** seen on a Ravan screen, logged in to our own Prophunt LLP account (Free plan, 0 credits), 24 Oct 2026. Nothing was bought, called, scraped or changed except switching our own test agent's model to read voice lists, then restoring Premium + Iris.
- **[J]** read from the model-catalog JSON the Ravan dashboard loads for our session (`/api/proxy/available-llm-models/with-voices`).
- **[D]** Ravan public docs (docs.ravan.ai, including llms.txt and openapi.json).
- **[A]** Ravan's in-app "Ask Agni" assistant. It gave 2 wrong answers out of 7 (reminder message, IVR direction), so it is used only where [S], [J] and [D] are silent.
- **[V]** verified by reading our code on `origin/main` (commit 9ef663cf) or production Railway variables on 24 Oct 2026.
- **[I]** inference by the author; not in any source. Codex: please challenge these.

Codex cross-check: every [V] row names a file; run `git show origin/main:<file>` and confirm. Every [J] row can be re-read by opening app.ravan.ai while logged in and viewing the request in DevTools → Network → `with-voices`.

## 1. Ravan's vendors (the key finding)

Every "Agni" model is a renamed third-party model. [J]: each model carries `realLlmModel`; each voice carries `realVoiceId` / `realVoiceName`. Catalog fields also include `sessionMode`, `sttModel`, `pipelineLlmModel`, `ttsModel`, `realtimeModel`, `showInUi` (the per-stage fields were empty for every model; `sessionMode` was `pipeline` for all).

| Agni model | Credits/min (Rs at Rs10/credit) | realLlmModel [J] | Real voices seen [J] | Author's reading [I] |
|---|---|---|---|---|
| Ultra | 1 (Rs10) | `gemini` — description: "Live API … 30 HD voices across 24+ languages … thinking, proactive audio, affective dialog, function calling" | Aoede, Laomedeia, Kore, Fenrir, Leda, Orus, Callirrhoe, Zephyr, Puck, Charon (27) | Google Gemini Live API, newest version |
| Premium (marked RECOMMENDED) | 1 (Rs10) | `gemini_3.1` | same Gemini voice set (27) | Gemini 3.1 Flash Live |
| Premium Lite | 0.7 (Rs7) | `gemini_2` | same Gemini set (27) | Gemini 2.x Live |
| Duplex | 1 (Rs10) | `gpt-live-1` | ripple, quartz, Ash, tempo, Nira, Nuri (16) | OpenAI GPT-Live 1 (listed on OpenAI's pricing page at $0.05/min) |
| 5.0 — description: "It is the Cheapest." | 0.6 (Rs6) | `boson` | hashed ids `voice_d0753a4e…` plus Yashika, Rupali, Arjun, Ram Gujarati, Riya Hinglish, Riya Marathi, Ram Bengali, Harsh Hinglish 1/2 (14, all "No preview") | Boson AI (Higgs Audio) with custom cloned Indian voices |
| 5.0 Lite | 0.5 (Rs5) | `svara_pipeline` | `sv_bnaqa3fy`, `sv_enhdbrj5`, Sipoto, Arjun (9) | Svara |
| Lite 4.0 | 0.55 (Rs5.50) | `sarvam_pipeline` | kavya, amit, rahul, priya, ritu (8) | Sarvam Bulbul — the same vendor and voices as our "Bharat" |
| Lite 3.0 (beta) — "Budget friendly" | 0.45 (Rs4.50) | `murf` | de-DE-björn, pa-IN-harman, fr-FR-justine … (118) | Murf AI |
| Lite 2.0 — "Fast, low-cost multilingual voice model" | 0.45 (Rs4.50) | `Soniox` | Elise, Maya, Nina, Claire, Mina, Mateo, Meera (28) | Soniox |
| 4.0 (hidden, showInUi=false) | 1 | `gemini-3.1-flash-lite` | Leda, Laomedeia, Rasalgethi (14) | Gemini 3.1 Flash-Lite |
| 3.0 (hidden, showInUi=false) | 1 | `gemini_pipeline` | Zephyr, Alnilam, Algenib (27) | STT → Gemini → Gemini TTS chain |

Supporting observations:

- [S] Switching the test agent to Lite 2.0 removed the Emotion and Accent controls and changed the voice to Elise; Ultra, 5.0 and Duplex kept them. The Emotion switch therefore belongs to the Gemini models (affective dialog).
- [D] Agents have both `model` and `s2sModel` fields; example `gpt-4o` / `gpt-4o-realtime`. Post-call analysis runs on `gpt-4o-mini` [S][D].
- [D] Customers point their SIP carrier at `sip:…sip.livekit.cloud`; the create-call API returns a LiveKit access token and room id; the error-codes page explains LiveKit error wrappers. Platform = LiveKit Cloud.
- [S] Every dashboard API call is proxied through `app.ravan.ai/api/proxy/…`, so vendor hosts are not visible from normal browsing.
- [S] Website tracking and media: `link.quickadpro.com`, `backend.leadconnectorhq.com`, `assets.cdn.filesafe.space` = GoHighLevel/LeadConnector. Voice previews are static MP3 files on that CDN.
- [D] Trust Center sub-processor list names only AWS, Twilio, OpenAI, Stripe — it omits LiveKit, Google, Boson, Sarvam, Murf, Soniox, Svara.
- [S] Their marketing claims ("in-house Thunder Emotion engine", "<300 ms") are not supported by the catalog; the engine names map to the vendors above.

Consequences for Vistrow:

- Their flagship (Premium/Ultra, Rs10/min) is the model we sell as Vistrow Live (Gemini Live). We run Gemini Live 3.8; their recommended model is 3.1. Our measured cost on Live 3.8 is Rs4.7–5.3/min (call 1418 and later tests).
- Their Indian-voice tier (Lite 4.0) is Sarvam, which we already run as Bharat.
- Vendors we do not have: Boson/Higgs Audio (cloned Indian voices), Murf, Soniox, Svara.
- We are not more vendor-dependent than Ravan; they have no in-house models.

## 1b. Vistrow's own models and voices → vendor (from code on origin/main, 24 Oct 2026)

Our customer-facing names are vendor-neutral (owner rule 15 Oct). This table is the decoder. Codex: verify ids in web-demo/src/lib/agentOptions.ts (MODEL_OPTIONS, ADMIN_ONLY_MODELS, RETIRED_MODELS), server/voice_catalog.py (prefixes, tiers, _OWNER_ONLY_PREFIXES) and agent/main.py (LLM/STT/TTS builders around lines 2060-2250 and 2447-2495).

| Vistrow name (what customers see) | Internal id / prefix | Real vendor + model | Who can use it |
|---|---|---|---|
| Vistrow Bharat (LLM) | `sarvam/sarvam-105b-conversations` | Sarvam 105B through the OpenAI-compatible plugin; falls back to OpenAI `gpt-5.4-nano` | All customers; the only LLM in the tenant picker |
| GPT-5.4 nano / mini | `gpt-5.4-nano`, `gpt-5.4-mini` | OpenAI | Kept for existing agents; nano is the fallback LLM |
| Vistrow Nano Lab | `gpt-5-nano` | OpenAI | Owner-only (ADMIN_ONLY_MODELS) |
| Gemini 3.5 Flash-Lite / 3.6 Flash / 3.8 Flash | `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.8-flash` | Google Gemini API (`google.LLM`) | Combo tests only; not in the tenant picker |
| Vistrow Live 3.8 | `gemini-live:gemini-3.8-live` | Google Gemini Live API, speech-to-speech `RealtimeModel` | Owner-only until the combo tests finish; billed 2x. Same vendor as Ravan Ultra/Premium |
| Vistrow Live 2.5 / 3.1 | `gemini-live`, `gemini-live:gemini-3.1-flash-live-preview` | Google Gemini Live | Retired 19 Oct |
| Groq | `groq/*` | Groq | Owner-only; removed from the picker 7 Sep |
| Speech recognition, default | `stt_provider = "sarvam"` | Sarvam saaras v3, 17 Indian codes | All |
| Speech recognition, alternative | `stt_provider = "google-chirp3"` | Google Cloud Speech Chirp 3 | All, per agent |
| Bharat voices (tab Bharat) | plain names `ritu`, `priya`, `rohan` (v2) and `sarvam4:<name>` (v4 Flash) | Sarvam Bulbul TTS; same vendor and names as Ravan Lite 4.0 | All; tier standard |
| Vistrow HD | `google:chirp3:<Persona>` (Callirrhoe, Sana, Aoede) | Google Cloud Text-to-Speech Chirp 3 HD, service account | All; tier standard |
| Native voices | `google:<lang>-IN-Standard-X` (Anika, Kabir) | Google Cloud Text-to-Speech Standard | All; tier lite |
| Multilingual | `google:charon`, `google:kore` (Arin, Mira) | Google Cloud TTS multilingual | All |
| Studio Lite | `google38:<voice>` (for example `en-in-csagent-3` = Anjali) | Google Gemini 3.8 Flash-Lite TTS through the Gemini Interactions API (`GEMINI_API_KEY`) | Owner-only (preview) until Gemini API Tier 2 |
| Studio | `google38flash:<voice>` | Google Gemini 3.8 Flash TTS through the Interactions API | Owner-only (preview); tier premium 2x |
| Vistrow Expressive | `google31:<voice>` | Google Gemini 2.5 Flash TTS on Vertex (5 RPM quota) | Hidden; owner-only |
| Premium (tab Premium) | `elevenlabs:<voice id>` (Tara, Riya, Saavi, Bunty) | ElevenLabs | Owner-only; Scale customers get none (bug 3) |
| Cloned voices | custom_voices table | Sarvam voice cloning, 25 credits per clone | Off for customers (`VOICE_CLONE_OPEN` unset) |
| Call platform | LiveKit Cloud project Artha Voice; agents CA_TGdpVhSdxDyS (phone and tenant) and CA_53d8HgBktjZ7 (website demo) | LiveKit, Ship plan $50/mo | — |
| Telephony | EnableX SIP trunk into LiveKit SIP | EnableX, Rs0.25/min each way | Customers bring their own number |
| Post-call analysis | `gpt-5.4-mini` (server/call_intelligence.py); KB Q&A drafting `gpt-5.4-nano` | OpenAI | — |

Same-vendor pairs: Agni Ultra / Premium / Premium Lite = Vistrow Live (Gemini Live). Agni Lite 4.0 = Bharat voices (Sarvam Bulbul). Agni Duplex = OpenAI GPT-Live 1, which we do not run. Agni 5.0 (Boson), 5.0 Lite (Svara), Lite 3.0 (Murf) and Lite 2.0 (Soniox) are vendors we do not run.

## 2. Official per-minute costs (vendor pricing pages, 24 Oct 2026, Rs96/$)

| Item | $/min | Rs/min | Source |
|---|---|---|---|
| LiveKit agent session (every call) | 0.0100 | 0.96 | livekit.com/pricing |
| LiveKit observability (optional) | 0.0100 | 0.96 | livekit.com/pricing |
| Gemini 3.8 Live (audio in $3.00/M = $0.005/min; audio out $12/M = $0.018/min) | ~0.0182 at LiveKit's blend | 1.75 | ai.google.dev/gemini-api/docs/pricing |
| OpenAI GPT-Live 1 | 0.0500 | 4.80 | developers.openai.com/api/docs/pricing |
| OpenAI GPT Realtime 2.1 mini (audio $10/M in, $20/M out) | ~0.0216 | 2.07 | same |
| STT: AssemblyAI multilingual / Deepgram Nova-3 multilingual | 0.0025 / 0.0058 | 0.24 / 0.56 | livekit.com/pricing |
| TTS: Gemini 3.8 Flash-Lite TTS / Inworld 2.0 Flash (Scale) | 0.0096 / 0.0054 | 0.92 / 0.52 | livekit.com/pricing |

Our measured per-minute (model cost only, LiveKit excluded): Flash-Lite + HD Rs0.90–1.15; Flash-Lite + Native Rs1.02; Nano + Native Rs0.53–0.76; Gemini Live 3.8 Rs4.7–5.3. Our LLM cost is ~8x LiveKit's estimate for the same model because every reply re-sends ~6–8K tokens, of which ~68% is our platform prompt and tool definitions (measured 23 Oct with agent/scripts/measure_prompt_tokens.py).

## 3. Function by function

Ravan column = [S] unless marked. Vistrow column = [V].

| Area | Feature | Ravan | Vistrow | Verdict |
|---|---|---|---|---|
| Agent | Model choice | 8 models in picker (see section 1) | Customers see 1 model (Vistrow Bharat); Live 3.8 and Nano Lab owner-only until combo tests finish (web-demo/src/lib/agentOptions.ts) | In progress on our side |
| Agent | LLM temperature | Slider in AI Provider Settings, default 0.7 | None; "tone" preset changes the voice only (agent/main.py:349-383) | Behind |
| Agent | Voices | 27 per Gemini model, 28 Soniox, 14 Boson, 8 Sarvam, 118 Murf | ~157 customer voices (server/voice_catalog.py) | Ahead |
| Agent | Emotion | On/off, Gemini models only | `emotion_intensity` read at agent/main.py:4443 but no editor control (AgentDetail.tsx:197 defaults only) | Partial |
| Agent | Accent | Country + 21 Indian regional accents (Indian English; Hindi, Punjabi, Haryanvi, Bhojpuri, Pahadi; Rajasthani, Gujarati, Marathi, Konkani; Bengali, Odia, Assamese; Tamil, Telugu, Kannada, Malayalam; Manipuri, Mizo, Naga, Khasi) | None | Behind |
| Agent | Memory | Toggle; not on web calls; locked on Free; [A] not on Starter | `memory_enabled`, phone calls only, Starter and up (agent/main.py:4035) | Equal |
| Agent | Prompt size | Word counter: 500 words on Free, 3,000 words on paid plan cards | No limit (editor, server, runtime); soft warning requested on issue #2 | Ahead |
| Functions | End call | 3/4/5 per plan | Always on, no cap (agent/main.py:3546) | Ahead |
| Functions | Transfer | [D] static or dynamic number, hold music, caller-ID option, transfer hours, GHL staff | Fixed `transfer_phone` only; colleague dialled into the same room; no hours, no summary (agent/tools.py:3657-3782) | Behind |
| Functions | Press digit | [D] agent presses digits on another menu, 1 s pause detection | `send_dtmf`, same idea (agent/main.py:3564) | Equal; neither has caller keypad menus |
| Functions | Custom function | [D] headers, query, JSON schema, save response to call variables, speak during/after | GET/POST/PUT/PATCH/DELETE, fixed headers, 10 s timeout, flat parameter list, first 2,000 chars to the model, no save-to-variables (agent/tools.py:3867-3923) | Behind |
| Speech | Transcription language | Auto-detect, Multilanguage, ~125 locales | 17 Sarvam Indian codes pinned to the agent language; picker 10 Indian languages + English (agent/main.py:2353-2386, agentOptions.ts:472-484) | Equal for India |
| Speech | Background sound | None, City, Forest, Crowded, Keyboard, Hold | 7 sounds + Off | Equal |
| Speech | Interruption sensitivity | Slider, default 0.9 | Read at agent/main.py:7814; no editor control | Partial |
| Speech | Speech speed | Slider, default 1.0 | None (pace fixed 1.0) | Behind |
| Speech | Reminder message | Seconds + times + custom text | `silence_reminder_ms` + max; no custom text (agent/main.py:7795-7813) | Equal minus text |
| Call | Voicemail | Toggle | Outbound only, word pattern (English, Hindi, Telugu), fixed English line, not a setting (agent/main.py:1481-1490, 5561-5591) | Behind |
| Call | End on silence | Toggle + 10 s default | Setting read (agent/main.py:7819) | Equal |
| Call | Max duration | Slider, 30 min default | Up to 45 min, spoken wrap-up ~25 s before cut (agent/call_limit.py:15) | Ahead |
| Call | Emergency fallback | Toggle | `emergency_fallback_number` (agent/main.py:8596) | Equal |
| Call | Ring duration | Slider, 30 s default | Fixed 35 s (server/livekit_sip.py:189) | Behind |
| After call | Extraction | Custom fields, copy/paste sets, GPT-4o mini | `post_call_fields` + auto summary, sentiment, outcome, QA score (server/call_intelligence.py) | Equal, ours richer by default |
| After call | Webhook | Several URLs, custom header, retries; [D] unsigned | Account + per-agent URL; plain aiohttp POST, no URL safety check, no plan check, no signature (agent/tools.py:618-646); server integration deliveries do run the safety check (server/integrations_dispatch.py:48-59) | Behind + security bug on the agent path |
| CRM | CRM sync | Salesforce, GoHighLevel toggles | ArthaLeads, Zoho, Sheets, Slack, webhook | Different |
| Calendar | Booking | GHL or Cal.com per agent; own "Agni Calendar": event types, members, clients, branded email with domain auth, Google Calendar, Outlook, Calendly, iCloud (credentials only) | Built-in calendar: availability config (slot minutes), month/week/day/list views, statuses incl. rescheduled/cancelled, agent checks availability and books (agent/tools.py:1822, 2272); no external sync, no reschedule/cancel tool, no invites | Behind on sync |
| Knowledge | Normal KB | Text (multiple entries), URL add or Scan, files PDF/TXT/DOCX/MD, URL exclusions for auto-refresh, Refresh, Clear cache, Playground; searched as a tool during the call (`queryKnowledgeBase` seen in a transcript) | Text, URL (20 links), files, Q&A; whole text pasted into prompt, 8,000-char cap with a red warning bar (agent/db.py:513-557; KnowledgeBasePage.tsx:33,585); ~5,500 for realtime | Behind: no search, no refresh |
| Knowledge | Quick KB | Any file up to 500 MB incl. audio/video/scans (Gemini), links, text; Playground | None | Behind |
| Telephony | Providers | Twilio (own or managed), Telnyx (buy in-app, $1.20 US numbers, per-number concurrency + CPS), Indian (verify mobile → KYC with CIN/GSTIN docs → buy +91), WhatsApp calling, custom SIP (termination URI, CPS, user/pass) | EnableX only; Twilio/Exotel/Plivo "coming soon" (web-demo/src/pages/PhoneNumbers.tsx:51-54); numbers added one at a time on a shared trunk (server/livekit_sip.py:119,145) | Behind: biggest gap |
| Inbound | Routes | Number → agent, timezone, max concurrent 1–5, credit budget cap, start/end dates, call window, limit calls per caller, active days | Number → agent, hours, days, per-number cap (agent/inbound_rules.py); outside hours = silent hang-up (agent/main.py:7270-7297) | Behind |
| Outbound | Campaigns | Wizard: name, agent, caller ID; step 2 needs a number; [D] list, schedule, Fresh/Follow-up/Failed-retry | Preflight, test dial, caller-ID rotation, retry policy per outcome (server/campaign_dialer.py, agent/retry_rules.py) | Ahead on controls |
| Calls | History + detail | Web/inbound/outbound filter, sentiment, model, credits, export; detail: credit breakdown, disconnect reason, inline tool calls, Report button | Filters search/channel/direction/feedback (client-side); recordings, transcripts, CSV (CallsHistory.tsx:97-193) | Equal |
| Contacts | List + detail | CSV import, tags, status, variables, export; detail with Call button, stats, campaigns, activity, calls, notes | Same core + custom fields, notes | Equal |
| Team | Orgs and users | "+ New Organization" button but plan cards say 1 max organization ([A] confirms); roles User/Admin; email invites | One workspace per login (users.email UNIQUE, calls_db.py:202); roles viewer/member/admin/owner | Equal |
| Security | Login | Password, 2FA, sessions, Google sign-in | 2FA with recovery codes; Google and GitHub sign-in (server/mfa.py) | Equal |
| Audit | Activity log | Org event log (logins with provider, KB changes) | Security events only | Behind |
| Plans in UI | Upgrade prompts | Locked Analytics page shows "isn't included in your plan … Upgrade" | Inbound, Outbound, Integrations have no plan wording; save fails with 403 (server/token_api.py:375-389) | Behind |
| Help | In-app assistant | "Ask Agni" chat; 2 of 7 answers wrong | Copilot that performs actions with confirmation, Growth+ (server/copilot_tools.py) | Ahead |
| Billing | Plans | Stripe checkout, credits, GST shown, invoice history | Razorpay, top-ups, GST invoices, annual | Equal |

## 4. Ravan plan gates (their in-app plan cards [S])

| Feature | Free | Starter Rs7,999 | Growth Rs11,999 | Scale Rs14,999 |
|---|---|---|---|---|
| AI agents | 0 | 3 | 4 | 5 |
| Concurrent calls | 5 | 3 | 5 | 5 |
| Team members | 0 | 5 | 5 | 10 |
| Prompt length | 500 words | 3,000 words | 3,000 words | 3,000 words |
| End call / transfer / IVR functions | — | 3 each | 4 each | 5 each |
| Custom functions | — | 5 | 8 | 10 |
| Post-call actions | — | 10 | 10 | 10 |
| Knowledge bases | — | 2 | 2 sources | 2 sources |
| Webhooks, voicemail detection | — | Yes | Yes | Yes |
| Call recording | Off | Included | Included | Included |
| Inbound / outbound campaigns | — | Not listed | 10 + 10 | 15 + 15 |
| Agent memory, reminder messages, background sound | — | Not listed | Yes | Yes |
| Calendar integration, analytics dashboard, custom phone provider, assign human agent | — | Not listed | Yes | Yes |
| "200 Kb Source Link Limit" ([A]: 200 KB of data across links) | — | — | 200 KB | 200 KB |
| API access | Off | Not included | Not included | Included |

Contradictions in Ravan's own sources: the public pricing page ticks campaigns (5+5) and every product feature for Starter, while the in-app Starter card lists none of them; the assistant said Starter has no call recording (card: included) and has assign-human (card: Growth+); the FAQ says Starter is Hindi + English only; docs disagree on concurrency (8 / 15-25-50 / 5 / 1-10), model names and prices (Rs7,999 vs Rs8,000).

## 5. Vistrow blocks and bugs, ranked [V]

| # | Problem | Type | Evidence | Fix |
|---|---|---|---|---|
| 1 | Outbound limited to 2 calls across all customers while plans sell 5/15/30 | Block | `OUTBOUND_CHANNEL_LIMIT` unset on production; default 2 in server/campaign_dialer.py:90 | Buy EnableX channels and raise it, or sell 3/5/5 |
| 2 | Website demo silent: Gemini prepay at −Rs23.37 | Block | AI Studio billing; 402 errors in agent logs | Top up with auto-reload, or move agent 4 to Bharat |
| 3 | Scale's "premium voices" give customers none | Bug | All premium voices are ElevenLabs, owner-only (server/voice_catalog.py:619-634) | Open a premium set or drop the line |
| 4 | Voice cloning sold on Growth/Scale but off | Block | `VOICE_CLONE_OPEN` unset on production (server/custom_voices.py) | Open it or drop the line |
| 5 | Live-call webhook: no URL safety check, no plan check; no payload signed anywhere | Security bug (agent path) | agent/tools.py:618-646; server/integrations_dispatch.py:48-59 has the check | Sign, check URL, enforce plan |
| 6 | Customers get one model | In progress | agentOptions.ts MODEL_OPTIONS has one entry; ADMIN_ONLY_MODELS holds Nano Lab and Live 3.8 | Open tested models after combo grid |
| 7 | Telephony EnableX only, numbers one at a time | Gap | PhoneNumbers.tsx:51-54; livekit_sip.py:119,145 | Generic SIP import, then Twilio |
| 8 | KB pasted into prompt, 8,000-char cap (warned), not searched | Gap | agent/db.py:513-557 | Retrieval |
| 9 | Interruption sensitivity and emotion have no editor control | Bug | AgentDetail.tsx:197,205 defaults; read at agent/main.py:4443,7814 | Add controls |
| 10 | No upgrade notice on Inbound/Outbound/Integrations; 403 on save | Bug | token_api.py:375-389 | Upgrade screen |
| 11 | After-hours/over-cap inbound calls hang up silently | Gap | agent/main.py:7270-7297 | Message or callback |
| 12 | No credit budget cap or per-caller limit on inbound routes | Gap | agent/inbound_rules.py | Add both |
| 13 | Transfer fixed number only; no hours; no summary | Gap | agent/tools.py:3657-3782 | Hours, then dynamic |
| 14 | Voicemail message fixed English line | Gap | agent/main.py:5561-5591 | Make it a setting |
| 15 | No temperature/speech-speed; ring fixed 35 s | Gap | agent/main.py:349-383; livekit_sip.py:189 | Add with model picker |
| 16 | No automatic brochure sending (flags CRM outcome for sales) | By design | agent/tools.py:2157-2177 | Optional WhatsApp auto-send later |
| 17 | Old orchestrator pipeline's transfer is a stub; new accounts no longer use it (19 Oct) | Low | orchestrator/tools.py:577-599; calls_db.py:1626-1634 | Remove or fix before reuse |

## 6. Corrections made during the audit (earlier drafts were wrong)

- Ravan's "IVR / Press Digit" is agent-side (presses digits on another menu), same as our `send_dtmf`; not a gap.
- Ravan's prompt cap is 3,000 words (500 on Free), about 18,000 characters — not 3,000 characters.
- Our follow-up "days after the call" setting works (steps editor sets it on client and server, retry_rules.py:208-211); removed from the bug list.
- New signups no longer default to the orchestrator pipeline (fixed 19 Oct, calls_db.py:2096-2103).
- Our KB cap is not silent; the KB page shows a red warning bar.
- Our brochure tool is by design, not a bug.
- Our server-side integration deliveries do run the URL safety check; only the agent path lacks it.
- Ravan's calendar syncs Google, Outlook and Calendly, not only GHL/Cal.com.
- Ravan paid plans allow 1 organization; "200 Kb Source Link Limit" is 200 KB of data.
- Ravan's models are not in-house; see section 1.
