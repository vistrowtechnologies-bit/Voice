# LLM bake-off — 2026-10-16

Owner request: could cheaper models take simple turns from `sarvam-105b-conversations`?
Candidates were Gemini 3.5 Flash-Lite and GPT-5.4-nano, with Sarvam kept for Indian-language replies. The bar was to switch only after checking latency and Hindi quality.

**This is a measurement only. No routing or runtime change was made.**

## Bottom line

1. **Gemini 3.5 Flash-Lite was not measured.** `GEMINI_API_KEY` is empty in the repo `.env`, and no other local source has it. Production keeps it in LiveKit/Railway secrets, which this run did not read. Its list price is also *higher* than Sarvam's on input: $0.30/M = ₹26.4/M, against Sarvam's ₹23/M. Output is $2.50/M = ₹220/M, against ₹70/M. On our prompt-heavy turns it is cheaper only when its implicit cache hits. Re-run with the key set: `python agent/scripts/llm_bakeoff.py run …` (see the script docstring).
2. **GPT-5.4-nano is about 5.6x cheaper per call-minute**, but **about 1 s slower** to the first word: ₹0.34/min against ₹1.94/min, both measured.
   - First output p50 was 1,236 ms for nano and 259 ms for Sarvam. First sentence p50 was 1,458 ms and 324 ms.
   - The gap holds in every language (Hindi, Hinglish, Marathi, English) and for both text turns and tool turns.
   - A second of extra silence per turn is not acceptable on a live call. Nano should not take spoken turns on the measured latency.
3. **Tool routing:** nano was slightly better.
   - Right tool with valid arguments: 22/26 for nano, 20/26 for Sarvam.
   - Correctly answered without a tool: 30/34 for nano, 27/34 for Sarvam.
   - Sarvam's misses were unneeded `switch_reply_language` calls (one to a language already active) and an `end_call` on "send me details on WhatsApp". Nano's misses were two early `check_calendar_availability` calls and one `end_call` on a short Marathi "नाही आहे".
4. **Hindi/Hinglish/Marathi quality.** The side-by-side table below is the owner's call to make. Things worth checking:
   - Sarvam stays closer to the knowledge base (the #12 offer details, #3 plot sizes).
   - Nano tends to write English words in Devanagari (वेबसाइट, प्रॉपर्टी). It also uses slashes ("city/area", "ग्राहकांना/सेवेसाठी") that a TTS reads awkwardly, and once mixed scripts inside a word ("फेacing").
   - Both models sometimes wrote a price as digits ("₹## lacs") despite the prompt.
   - Nano was better on #16 Marathi: Sarvam spent the turn on a redundant language switch. Nano was also better on #22: Sarvam hung up when the caller asked for details on WhatsApp.

## Headline numbers (30 real turns × 2 runs per model)

| Model | Requests (errors) | First output p50 / p90 (ms) | First text token p50 (ms) | First sentence p50 / p90 (ms) | Total p50 (ms) | Tool turns right + valid args | No-tool turns with no tool | Avg input / cached / output tokens | ₹ per 1M in / cached / out | Est. ₹/turn | Est. ₹/call-min (6 turns) | ₹/call-min if nothing cached |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `sarvam/sarvam-105b-conversations` | 60 (0) | 259 / 321 | 253 | 324 / 383 | 332 | 20/26 | 27/34 | 13,952 / 0 / 30 | 23.0 / 11.0 / 70.0 | 0.3230 | 1.938 | 1.938 |
| `gpt-5.4-nano` | 60 (0) | 1,236 / 1,584 | 1,192 | 1,458 / 1,782 | 1,479 | 22/26 | 30/34 | 12,876 / 10,944 / 36 | 17.6 / 1.8 / 110.0 | 0.0573 | 0.344 | 1.384 |

"First output" is the time to the first streamed text token or tool call. For a tool turn, the spoken reply needs a second LLM round after the tool runs, so the caller hears a filler first.

First output p50 by language (ms):

| | English | Hindi | Hinglish | Marathi | text turns | tool turns |
|---|---|---|---|---|---|---|
| Sarvam | 281 | 256 | 237 | 291 | 253 | 274 |
| GPT-5.4-nano | 1,202 | 1,251 | 1,199 | 1,236 | 1,192 | 1,368 |

### Cost per call-minute

Assumes 6 turns per minute and the tokens measured here: about 13–14K input tokens per turn, because the assembled prompt is 25–74K characters. Output was only 30–36 tokens.

| Model | Price per 1M tokens: input / cached / output | ₹/min, measured caching | ₹/min, nothing cached | Note |
|---|---|---|---|---|
| Sarvam 105B conversations | ₹23 / ₹11 / ₹70 (owner billing rates) | 1.94 (API reports 0 cached) | 1.94 | At the ~66% cache hit the Sarvam dashboard shows (Sep 2–Oct 1), this is ≈ **₹1.27/min** |
| GPT-5.4-nano | $0.20 / $0.02 / $1.25 = ₹17.6 / ₹1.8 / ₹110 | **0.34** (85% of input cached) | 1.38 | Caching needs back-to-back requests with the same prefix |
| Gemini 3.5 Flash-Lite | $0.30 / $0.03 / $2.50 = ₹26.4 / ₹2.6 / ₹220 | not measured; ≈ 0.53 if 85% cached (projection) | ≈ 2.11 (projection) | Projection uses nano's token counts |

Sources, read 2026-10-16:
- OpenAI: https://developers.openai.com/api/docs/pricing (gpt-5.4-nano, Standard: $0.20 input / $0.02 cached / $1.25 output)
- Google: https://ai.google.dev/gemini-api/docs/pricing (gemini-3.5-flash-lite, paid tier: $0.30 input / $0.03 cached / $2.50 output)
- Exchange rate: ₹88/USD was assumed.

**Why routing only some turns saves less than the table suggests.** Nano's ₹0.34 depends on its prompt cache. Every request in this run followed another with the same 10K-token prefix. A router that sends only occasional turns to nano would often reach a cold cache, which costs about ₹1.38/min, and it would also break the Sarvam prefix continuity. The bigger and safer cost lever is the prompt itself, at about 14K tokens on every turn: see docs/LLM-TOKEN-AUDIT-2026-10-12.md. Getting Sarvam's caching to show in the API is another.

## Recommendation

- **Do not move spoken turns to GPT-5.4-nano yet.** It cuts cost by about 5x but adds about 1 s of silence on every turn. That outweighs its small tool-routing edge.
- **Turns that could go to the cheaper model, if a production-region measurement shows nano below about 600 ms.** The main.py comment from 2026-10-14 claims about 670 ms "from India"; this run measured 1.2 s.
  1. Farewell turns that only need `end_call`: 8/8 correct for both models, and the reply is not latency-sensitive in the same way.
  2. An explicit language-switch request (`switch_reply_language`): 6/6 for both models.
  3. Short English acknowledgements on an `en-IN` call: 4/4 for both models.
- **Keep Sarvam** for every Hindi, Hinglish or Marathi reply that carries content: KB answers, prices, qualification questions.
- **Proposed routing rule (NOT implemented):** route a turn to `gpt-5.4-nano` only when all of the following hold:
  - the call's reply language is `en-IN`;
  - the caller text is Latin-script, 6 words or fewer, and has no digits;
  - it matches `_looks_like_farewell` or `_LANGUAGE_REQUEST_PATTERN`, or is a plain acknowledgement (ok / yes / sure / got it);
  - it is not the first turn after a tool result.
  
  Every other turn stays on Sarvam.

  Before shipping: (a) re-measure nano's TTFT from the LiveKit Cloud worker region; (b) confirm nano's cache hit rate under intermittent routing; (c) add Gemini Flash-Lite with the key set.
- **Fix these Sarvam misses whatever happens with routing:**
  - redundant `switch_reply_language` calls (#10, #16, #19);
  - `end_call` on a WhatsApp-details request (#22).

## Method

Script: `agent/scripts/llm_bakeoff.py`. It is scratch tooling that nothing in the runtime imports.

**Inputs**
- 30 caller turns from 14 recent calls of internal accounts 1 and 2 only (agents 3, 4, 17, 19, 26), each call with at least 6 caller turns.
- Language mix: 11 Hindi, 7 Hinglish (one in Latin script), 6 Marathi, 6 English.
- The 30 turns include:
  - 10 expected tool turns: `end_call` ×4, `switch_reply_language` ×3, calendar/booking ×3;
  - 2 lead captures with a spoken phone number;
  - 1 callback;
  - 17 expected plain replies: KB/price questions, acknowledgements, general.
- Consecutive caller lines before an agent reply were merged into one turn.

**Data handling and request construction**
- Database access was read-only. The connection was opened with `default_transaction_read_only=on` (asserted), and agent/db.py's pool was forced read-only through `PGOPTIONS`. No writes were made.
- Phone-like digit runs were swapped for synthetic numbers before any text left the machine. Every digit is masked (`#`) in this report.
- The prompt and tools come from constructing the real `RealEstateAgent` with each agent's row, using the standard-pipeline model. Agent 4 is on Gemini Live today, but its replayed calls ran this pipeline.
- The per-turn directive comes from running the agent's own `on_user_turn_completed` over every earlier caller turn with a fake session, then attaching it as `llm_node` does.
- LLMs were built with `main._build_llm`: same plugins and params, max output 400 (200 for the platform demo), GPT-5 `reasoning_effort="none"`, and the Sarvam fallback disabled so that Sarvam is what gets measured.
- Requests were streamed through `LLM.chat()` with the agent's tools. Each model got one warm-up request first, because production workers hold warm connections.
- Runs were interleaved per turn (run 1: Sarvam then nano; run 2: the same) so both models see the same cache conditions.

**Spend:** ₹22.82 estimated for the reported run. Including one earlier full run (₹23.20, discarded after fixing the phone substitution and two expectations) and two small dry runs, the total was about ₹48. The cap was ₹150.

### What could not be measured, and caveats

- **Gemini 3.5 Flash-Lite:** no key available locally (see above).
- **Location:** latency was measured from the owner's Mac (India), not from the LiveKit Cloud worker. Absolute numbers will differ in production; the Sarvam-to-nano gap is the robust finding.
- **Missing tool history:** stored transcripts have no tool calls or tool results. Turns after a tool ran are therefore replayed without that result. This is why #24 (name given after a slot was offered) re-checks availability instead of booking, so both models were credited for it. It is also why `lead_data` is empty in the per-turn facts reminder.
- **Context not reproduced:** contact notes, lead context and caller-ID variables are not in the replay, because the call row does not store them.
- **Sarvam caching:** Sarvam never reports cached tokens through the API, so its measured cost is an upper bound.
- **Sample size:** 2 runs × 30 turns is enough to see a 1 s latency gap. It is not enough to rank tool accuracy (2 turns apart). The quality comparison needs a human read of the table below.
- **#25 (phone number given on the platform demo):** neither model called `capture_platform_lead`. Both moved on to scheduling the demo. This may be the intended order in the platform prompt, so it is scored as a miss for both.
- **#1 ("जी जी।" after a callback offer):** neither model called `request_callback`/`log_lead`. Both said they would forward the request. This is the same for both models.

### Per-turn tool results

| # | Call | Category | Language | Expected tool | `sarvam-105b-conversations` | `gpt-5.4-nano` |
|---|---|---|---|---|---|---|
| 0 | 1389 | kb_price | Hindi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 1 | 1389 | ack_after_offer | Hindi | log_lead, request_callback | ✘text / ✘text | ✘text / ✘text |
| 2 | 1389 | ending | Hindi | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |
| 3 | 1090 | kb_question | Hindi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 4 | 1090 | kb_price | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 5 | 1090 | general | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 6 | 1090 | ending | English | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |
| 7 | 1164 | language_switch | Marathi | switch_reply_language | ✔switch_reply_language / ✔switch_reply_language | ✔switch_reply_language / ✔switch_reply_language |
| 8 | 1164 | general | Marathi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 9 | 1164 | demo_request | Marathi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 10 | 1160 | kb_question | Hindi | (reply) | ✘switch_reply_language / ✘switch_reply_language | ✘switch_reply_language / ✘switch_reply_language |
| 11 | 1160 | language_switch | English | switch_reply_language | ✔switch_reply_language / ✔switch_reply_language | ✔switch_reply_language / ✔switch_reply_language |
| 12 | 1128 | kb_question | Hindi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 13 | 1128 | general | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 14 | 1128 | ending | Hindi | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |
| 15 | 912 | language_switch | Marathi | switch_reply_language | ✔switch_reply_language / ✔switch_reply_language | ✔switch_reply_language / ✔switch_reply_language |
| 16 | 912 | kb_question | Marathi | (reply) | ✘switch_reply_language / ✘switch_reply_language | ✔text / ✔text |
| 17 | 776 | short_ack | English | (reply) | ✔text / ✔text | ✔text / ✔text |
| 18 | 776 | short_ack | English | (reply) | ✔text / ✔text | ✔text / ✔text |
| 19 | 776 | short_ack | Marathi | (reply) | ✘switch_reply_language / ✔text | ✔text / ✘end_call |
| 20 | 959 | kb_price | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 21 | 959 | booking | Hinglish | check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability |
| 22 | 959 | general | Hinglish | (reply) | ✘end_call / ✘end_call | ✔text / ✔text |
| 23 | 851 | booking | Hindi | check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability |
| 24 | 851 | booking | Hindi | book_appointment, check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability |
| 25 | 1157 | lead_capture | Hindi | capture_platform_lead | ✘text / ✘text | ✘check_calendar_availability / ✘check_calendar_availability |
| 26 | 796 | lead_capture | English | log_lead | ✘text / ✘text | ✔log_lead / ✔log_lead |
| 27 | 956 | kb_price | English | (reply) | ✔text / ✔text | ✔text / ✔text |
| 28 | 1376 | general | Hinglish (Latin) | (reply) | ✔text / ✔text | ✘check_calendar_availability / ✔text |
| 29 | 1092 | ending | Hindi | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |

### Replies side by side (Hindi / Hinglish / Marathi turns, first run, digits masked)

**#0 · call 1389 · kb_price · Hindi**  
Caller: ठीक है, इसका प्राइस क्या है?

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | Project में plots starting from ## lacs mentioned हैं, but final pricing और availability developer confirmation के subject पर रहेगी। क्या मैं आपके लिए pricing callback arrange कर दूँ? |
| `gpt-5.4-nano` | प्राइस के लिए मैं final pricing और availability sales manager से confirm करवाती हूँ—आपका target plot size कितना है? |

**#1 · call 1389 · ack_after_offer · Hindi**  
Caller: जी जी।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | Perfect जी, मैं आपका interest और budget range sales manager को forward कर देती हूँ, वो shortly आपको call करके exact pricing बता देंगे। Thank you. |
| `gpt-5.4-nano` | अच्छा जी, मैं आपके लिए pricing और latest availability के लिए sales manager का callback arrange कर देती हूँ—आपका approximate budget range क्या रहेगा? |

**#2 · call 1389 · ending · Hindi**  
Caller: थैंक यू।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `end_call({"reason": "caller thanked and closed"})` |
| `gpt-5.4-nano` | — `end_call({})` |

**#3 · call 1090 · kb_question · Hindi**  
Caller: आपके पास कौन सा available है?

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | Project में plot sizes लगभग सत्रह सौ square feet से लेकर छह हज़ार square feet तक mentioned हैं। Availability sales manager inventory से confirm करेंगे। आप किस size range में देख रहे हैं? |
| `gpt-5.4-nano` | जी, उपलब्धता अभी current inventory पर depend करती है—मैं sales manager को आपके लिए latest available plot options check करने को बोल देती हूँ, आप किस plot size range में देख रहे हैं? |

**#4 · call 1090 · kb_price · Hinglish**  
Caller: Prizes का इसको price है।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | Project की starting price अस्सी लाख रुपये* mention है, लेकिन final pricing developer confirmation पर depend करेगी। क्या मैं pricing callback arrange कर दूँ? |
| `gpt-5.4-nano` | हाँ जी, project में plots के starting price ₹## lacs* mention है, लेकिन exact pricing plot size और current inventory पर depend करती है—final details sales manager developer से confirm करके बताएँगे। |

**#5 · call 1090 · general · Hinglish**  
Caller: क्या आप मुझे sales executive का number दे सकते हैं? मैं बात कर लूँगा उनसे।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | Direct number तो मैं share नहीं कर सकती, पर sales manager shortly आपको call करके सारी details explain कर देंगे। क्या मैं आपकी callback request note कर दूँ? |
| `gpt-5.4-nano` | जी, मैं sales manager का contact sharing के लिए टीम को forward कर देती हूँ—आप callback preferred कर रहे हैं या चाहते हैं कि वे सीधे कॉल करें? |

**#7 · call 1164 · language_switch · Marathi**  
Caller: मला मराठीतून बोलायचं आहे

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `switch_reply_language({"language": "Marathi"})` |
| `gpt-5.4-nano` | — `switch_reply_language({"language":"Marathi"})` |

**#8 · call 1164 · general · Marathi**  
Caller: मला service reminder calls automation करायचा आहे तुमच्या through possible आहे का?

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | हो, ते अगदी शक्य आहे. आम्ही outbound campaigns द्वारे reminder calls automate करतो. साधारणपणे दिवसाला किती calls जातात तुमच्याकडे? |
| `gpt-5.4-nano` | हम्म, हो शक्य आहे. तुम्ही service reminder calls कोणत्या ग्राहकांना/सेवेसाठी करणार आहात, आणि महिन्याला साधारण किती कॉल्स होतील? |

**#9 · call 1164 · demo_request · Marathi**  
Caller: हो मला demo दाखवू शकता का

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | नक्की, मी समजावून सांगते. दोनशे reminder calls साठी outbound campaigns एकदम परफेक्ट काम करतात — मानून घ्या की एक buyer कॉल करतो, मी त्याचा तपशील घेते आणि reminder पाठवते, सगळं automatic. तुम्हाला हे तुमच्याच CRM मध्ये हवं आहे का? |
| `gpt-5.4-nano` | नक्कीच, डेमो दाखवण्यासाठी मी एक छोटा सीनारिओ सेट करेन—तुमच्या reminder calls मध्ये तुम्हाला मुख्यतः अपॉइंटमेंटची तारीख-वेळ कन्फर्म करायची आहे का? |

**#10 · call 1160 · kb_question · Hindi**  
Caller: आप कितनी भाषाओं में बात कर सकते हो मुझसे?

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `switch_reply_language({"language": "English"})` |
| `gpt-5.4-nano` | — `switch_reply_language({"language":"English"})` |

**#12 · call 1128 · kb_question · Hindi**  
Caller: क्या ऑफर चालू है आपके पास आई?

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | हाँ, अभी offer चल रहा है — website build के साथ पूरे एक साल का domain और hosting बिल्कुल free है, बस enquiry के पंद्रह दिन के अंदर claim करना होता है। वैसे आपको अभी क्या चाहिए, नया website बनवाना है या कुछ और? |
| `gpt-5.4-nano` | हम्म, हाँ ऑफर चालू है—आप किस चीज़ के लिए पूछ रहे हैं, वेबसाइट बनानी है या डिजिटल मार्केटिंग/लीड जनरेशन? |

**#13 · call 1128 · general · Hinglish**  
Caller: एक्चुअली मुझे गूगल पे रैंक करना है वेबसाइट को, कोई अगर सर्च करे मेरा बिज़नेस तो दिखना चाहिए।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | SEO और on-page optimization इसमें included है, तो आपकी site search में अच्छी दिखेगी। अभी आपकी site live है, या बिल्कुल नई बनानी है? |
| `gpt-5.4-nano` | हाँ, अगर Google पर रैंकिंग चाहिए तो वेबसाइट के साथ SEO और Google Search के लिए सही lead-capture structure बनाना पड़ता है—आप किस city/area में अपने buyers को target कर रहे हैं? |

**#14 · call 1128 · ending · Hindi**  
Caller: बाय।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `end_call({})` |
| `gpt-5.4-nano` | — `end_call({})` |

**#15 · call 912 · language_switch · Marathi**  
Caller: ओके, तुम्ही मराठी में बोलू शकता का?

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `switch_reply_language({"language": "Marathi"})` |
| `gpt-5.4-nano` | — `switch_reply_language({"language":"Marathi"})` |

**#16 · call 912 · kb_question · Marathi**  
Caller: की ऑफर बद्दल सांगा तुम्ही आत्ता काय बोलला ते

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `switch_reply_language({"language": "Marathi"})` |
| `gpt-5.4-nano` | हम्म, मी आत्ता सांगितलं की बेसिक वेबसाइटसाठी limited-time ऑफर आहे—पंधरा दिवसांत claim केलं तर एक वर्ष domain आणि hosting मोफत मिळतं. आता तुम्हाला ही वेबसाइट फक्त enquiries साठी हवी आहे की ready-to-call WhatsApp lead सुद्धा जोडायचं आहे? |

**#19 · call 776 · short_ack · Marathi**  
Caller: नाही आहे.

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `switch_reply_language({"language": "English"})` |
| `gpt-5.4-nano` | Got it, thanks. I’m ready to connect you with the team to confirm the exact Growth plan credits and setup for your Zoho—what’s your name? |

**#20 · call 959 · kb_price · Hinglish**  
Caller: प्रोजेक्ट के prices क्या है?

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | अभी plots की starting price लगभग निन्यानवे लाख रुपये से है. Exact price size, location और availability पर depend करता है, तो हमारी sales team आपको latest details confirm कर देगी. |
| `gpt-5.4-nano` | हम्म, Treetopia में प्लॉट्स की कीमतें अभी लगभग निन्यानवे लाख रुपये से शुरू होती हैं; फाइनल प्राइस प्लॉट साइज, लोकेशन, फेacing, रोड चौड़ाई और मौजूदा उपलब्धता पर निर्भर करता है। |

**#21 · call 959 · booking · Hinglish**  
Caller: Sunday का slots available है।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| `gpt-5.4-nano` | — `check_calendar_availability({"date":"####-##-##","duration_minutes":##,"requested_time":null})` |

**#22 · call 959 · general · Hinglish**  
Caller: हम्म देखता हूं मैं, वापस कॉल करता हूं। आप details मुझे WhatsApp पे भेज दीजिए।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `end_call({})` |
| `gpt-5.4-nano` | जी, मैं आपके उसी नंबर पर WhatsApp के जरिए details भेज देती हूँ, धन्यवाद! |

**#23 · call 851 · booking · Hindi**  
Caller: হ্যাঁ। आज मुझे विज़िट करना है। कॉफ़ी कितने बजे तक? पूरा रहेगा।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| `gpt-5.4-nano` | — `check_calendar_availability({"date":"####-##-##","duration_minutes":##,"requested_time":null})` |

**#24 · call 851 · booking · Hindi**  
Caller: मेरा नाम <caller name> है। (name redacted)

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": "##:##"})` |
| `gpt-5.4-nano` | — `check_calendar_availability({"date":"####-##-##","duration_minutes":##,"requested_time":"##:##"})` |

**#25 · call 1157 · lead_capture · Hindi**  
Caller: ##########

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | हम्म, एक मिनट... मैं अभी चेक कर लेती हूँ कि टीम के पास कौन सा स्लॉट खुला है. वैसे आपको किस दिन डेमो चाहिए — आज, कल, या कोई और दिन? |
| `gpt-5.4-nano` | — `check_calendar_availability({"date":"####-##-##","duration_minutes":##,"requested_time":null})` |

**#28 · call 1376 · general · Hinglish (Latin)**  
Caller: Book nahin karna hai pahle mujhe bataoge uske bad book karna.

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | बिल्कुल, पहले मैं आपको बता दूँगी, उसके बाद ही बुकिंग करूँगी। आप किस दिन और किस समय का डेमो चाहते हैं? तारीख और समय बताइए। |
| `gpt-5.4-nano` | — `check_calendar_availability({"date":"####-##-##","duration_minutes":##,"requested_time":null})` |

**#29 · call 1092 · ending · Hindi**  
Caller: जी ना, थैंक यू। थैंक यू, बाय।

| Model | Reply (first run) |
|---|---|
| `sarvam-105b-conversations` | — `end_call({})` |
| `gpt-5.4-nano` | — `end_call({})` |

