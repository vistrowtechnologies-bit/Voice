# Prompt cuts A/B — 2026-10-16

The owner approved cutting the static prompt to lower LLM cost on the standard pipeline: Sarvam `sarvam-105b-conversations`, about 14K input tokens per request and 8 requests per call-minute.

Branch `claude/prompt-cuts`, based on `claude/llm-token-diet`. It is not pushed, not deployed and not merged.

## Bottom line

- **Tenant-shaped agents (3, 17, 19, 26): −21% input tokens per request** in the real replay, from 11,461 to 9,078 on average. Across all 30 turns, including the platform demo (agent 4, about 20K tokens, mostly its own built-in prompt), the average fell **−15.9%**, from 13,947 to 11,735.
- **Cost:** ₹/call-min at 8 requests/min fell from 2.58 to 2.18 with nothing cached. At the 66% cache hit seen on the Sep 2–Oct 1 bill, it fell from 1.70 to 1.44. In both cases that is −15.7% over all turns and about −21% on tenant agents.
- **No quality loss measured:**
  - Tool turns were 21/26 against 20/26 before. No-tool turns were 27/34 for both.
  - No gender-agreement errors, and replies stayed in the same scripts.
  - Two single-run differences each appeared once in 2 runs: an `end_call` on #1 and on #19. Re-run 5× per prompt they did not come back: 0/5 new and 0/5 old on each. The same was true for #24, where the new prompt gave `check_calendar_availability` 5/5.
- **The −40–50% target was not reachable within the allowed edit scope.** What is left in a tenant request (the custom fixture at turn 5, 9,704 tokens):

  | Part | Tokens | Share | Why it stays |
  |---|---|---|---|
  | Tenant prompt + knowledge base | ~4,500 | ~47% | Never cut |
  | Tool schemas | 2,257 | 23% | Their text is in `agent/tools.py`, which another agent owns |
  | Platform layers | ~1,550 | 16% | Already roughly halved |
  | Per-turn directive | ~700 | 7% | Already halved |
  | History | ~540 | 6% | — |

  Getting to −40% means trimming tool descriptions (tools.py) and the built-in persona prompts, which have their own duplicated delivery sections:
  - `generic_assistant.py`: about 2K tokens of "Voice conversation rules", "Sounding like a person" and "Natural speech imperfections";
  - `platform_assistant.py`: about 2.8K tokens of the same sections.

  No replayed agent uses `generic_assistant.py`, so it could not be A/B-tested. Agent 4 runs on Gemini Live, where `realtime_prompt.compact` already drops those sections.
- **Spend:**
  - ₹35.72 for the 2×30 A/B: ₹19.38 old, ₹16.34 new.
  - ₹14.34 for the 5× re-check of 5 turns: ₹7.81 old, ₹6.53 new.
  - Total about **₹50**, against a cap of ₹150.

## Cuts, in order of value (tokens = tiktoken o200k_base)

The fixture figures come from the offline fixture (`measure_prompt_tokens.py`, custom-prompt tenant, strict 8K knowledge base). The real-agent figures come from the same section split over agents 3, 17, 19 and 26 (read-only).

| # | Cut | Before → after | Where |
|---|---|---|---|
| 1 | Per-turn directive, condensed (uncached on every request, and sent again on the follow-up request after any tool call) | 1,205–1,540 → 592–914 per request (**−610 to −625**) | `main.py` `on_user_turn_completed` |
| 1a | — gender block: same rules (own verbs in the voice's gender; caller-directed verbs plural until the caller states theirs; never inferred from the name, their own verbs or our voice), without the long incident narrative | ~600 → ~170 | |
| 1b | — language block: same rules, plus one line: "never call switch_reply_language for the language already active; an English word inside the sentence is not a switch" | ~250 → ~110 | |
| 1c | — delivery block (`build_turn_delivery`): its persona/language opener was dropped (the language block covers it) and the rest condensed | ~300 → ~190 | `prompts/human_speech.py` |
| 1d | — facts-list boilerplate | ~150 → ~75 | `_facts_reminder` |
| 1e | — objective text: "ANSWER WHAT THEY JUST ASKED" and IMPACT/SOLUTION_FIT condensed. SOLUTION_FIT no longer tells tenant calls to explain how "Vistrow Voice" fits | ~100 → ~55 | `_current_objective`, `_FUNNEL_STAGES` |
| 2 | The two "how you talk" layers merged into one: HOW YOU TALK, plus a short "Sounding human" sub-section for custom-prompt agents that keeps only what HOW YOU TALK does not already say | 775 + 783 → 643 (**−915**) | `prompts/voice_style.py`, `prompts/human_speech.py`, `main.py` |
| 3 | Lead capture condensed (all rules kept: log at once, partial fields, no placeholders, budget in any unit, two localities, calendar before booking, name/phone/purpose before `book_appointment`, never claim a booking without success, silent tools) | 503 → 294 (**−209**) | `main.py` |
| 4 | Strict-KB rules condensed (all 8 rules kept) | ~600 → ~320 (**−200 in measurement; the KB itself is unchanged**) | `main.py` |
| 5 | "Only state back what they actually said": dropped the sentences already in Platform rules 2 and 3 word for word; the inference-as-question rule is kept | 205 → 99 (**−106**) | `main.py` |
| 6 | Numbers/units rules condensed | 201 → 105 (**−96**) | `main.py` |
| 7 | Default language condensed (tool before the reply, Hindi/Marathi script reason kept) | 214 → 133 (**−81**) | `main.py` |
| 8 | Global languages condensed (only for multilingual voices; agents 3, 17, 19 and 26 all have it) | 311 → 258 (**−53**) | `main.py` |
| 9 | Identity block: same four-language verb table, shorter | 264 → ~150–220 (**−45 to −115**) | `main.py` |

Net static saving per request on the real tenant agents is **1,776 tokens**, the same for agents 3, 17, 19 and 26 (for example agent 17: 7,055 → 5,279 static tokens). On top of that the directive saves about 610 tokens.

**What was not cut:** compliance, recording disclosure, consent, DNC and transfer blocks (`_transfer_instructions`, `_consent_instructions`, `_disclosure_first_reply_instructions`); the outbound "ask permission / do-not-contact is final" block; Platform rules 1–4; the tenant's `system_prompt`, knowledge base and catalog; per-call facts, caller context, contact notes and date; the wrap-up objective; and every conditional one-turn nudge (appointment, healthcare, web search, garbled turn, repeat complaint, language request).

**Caching:** static text stays first and is byte-identical across turns and calls. The harness shows 90% of each request repeating the previous request's prefix, up from 86% before.

**Second request after `log_lead`: skipped as risky.** In livekit-agents 1.8.6, a tool that returns a string always triggers a follow-up generation. `log_lead` returns "Saved. Known so far — …", and that tool lives in `tools.py`, which is out of scope. Changing its return value is the real lever (no follow-up when the model already spoke).

Inside `main.py`, the only option would be to swap in a lighter follow-up prompt. That changes the prefix and loses the cache on the largest part of the request, so it would likely cost more than it saves. The follow-up is already an append-only extension of the first request. Its uncached part is the per-turn directive, which this change halves.

**Realtime (Gemini Live):** the merged layer keeps the `# HOW YOU TALK` heading, and its "Sounding human" part is a `##` sub-section. `realtime_prompt.compact` still drops all of it, and its tests pass.

## Method

Replay script: `agent/scripts/llm_bakeoff.py` (see its docstring), with three additions:
- `--agent-dir`, to build the prompt from another checkout's `agent/`. OLD is a `git archive origin/claude/llm-token-diet agent` export; NEW is this branch.
- `--cases`, to replay chosen turns only.
- `compare`, which generated the tables below.

How the requests were built:
- The request is exactly what `llm_node` sends: `RealEstateAgent._llm_request_ctx`, the stepped history window plus the per-turn directive.
- Database access was read-only. `PGOPTIONS default_transaction_read_only=on` was set and asserted on the connection, and only internal accounts 1 and 2 were read.
- Phone numbers and e-mail addresses were replaced with synthetic ones before sending, and every digit is masked below.
- Sarvam fallback was off.

The runs:
- OLD and NEW were each run 2× over the same 30 turns, one after the other in the same evening.
- TTFT was measured from the owner's Mac, not from the LiveKit region. NEW's lower p50 (397 ms against 452 ms) matches the shorter prompt, but treat it as indicative only.

Heuristic checks:
- The gender and script checks are regex heuristics. They were also read by hand: no masculine first-person forms and no feminine forms addressed to the caller in either prompt. A wider hand-run regex flagged NEW #9 once; it was a false positive on Marathi `सांगाल` (gender-neutral). The regex in `compare` does not include that word.
- The script check fails a Hindi or Marathi turn only when the reply contains no Devanagari at all.

### Known issues found, not fixed (outside this change)

- **#10, agent 26:** "आप कितनी भाषाओं में बात कर सकते हो?" gets `switch_reply_language("English")` 5/5 in both OLD and NEW. The per-turn `_LANGUAGE_REQUEST_PATTERN` treats the question as a request and pushes the switch, so this is a regex false positive, not prompt wording. It needs a fix in that pattern.
- **#22:** a WhatsApp-details request still gets `end_call` 5/5 in both prompts. This follows from the wrap-up objective, which explicitly says to confirm WhatsApp and end the call.
- `_FUNNEL_STAGES` gives tenant calls the platform demo's sales arc (PAIN, IMPACT and so on); only the "Vistrow Voice" wording was neutralised here.

### Needs a live call check before deploy

1. Female-voice Hindi/Marathi tenant call, at least 10 turns: check own verbs stay feminine and the caller is addressed with करेंगे/सकते throughout. The gender block is the largest single cut (~600 → ~170 tokens per turn).
2. A caller who gives budget, locality and name one at a time: check `log_lead` still fires per fact, because lead capture was condensed. In the replay, #26 was improved (2/2 against 0/2) and no capture was lost.
3. A clinic-demo call asking hours twice and which doctors exist, to check the strict-KB rules hold.
4. A Marathi language switch on a Hindi agent: one `switch_reply_language`, and no repeated switch on later turns.
5. Turn length and filler cadence: one live listen, since both how-you-talk layers were merged.

## A/B results (OLD = `claude/llm-token-diet`, NEW = `claude/prompt-cuts`)

5× re-check of the turns that differed or are known misses (case: OLD → NEW):
- #1 (`end_call` count): 0/5 → 0/5.
- #10 (unneeded switch): 5/5 → 5/5.
- #19 (wrong `end_call` or switch): 0/5 → 0/5.
- #22 (`end_call`): 5/5 → 5/5.
- #24 (`check_calendar_availability`): 5/5 → 5/5.

Average input tokens per request, by agent (2×30 replay):

| Agent | OLD | NEW | Change |
|---|---|---|---|
| 3 (tenant-shaped) | 11,877 | 9,501 | −20.0% |
| 17 (tenant-shaped) | 11,320 | 8,909 | −21.3% |
| 19 (industry demo) | 9,701 | 7,648 | −21.2% |
| 26 (tenant-shaped) | 11,493 | 9,086 | −20.9% |
| 4 (platform demo, built-in prompt) | 20,783 | 19,042 | −8.4% |

<!-- generated by agent/scripts/llm_bakeoff.py compare; model `sarvam/sarvam-105b-conversations` -->

| | Old prompt | New prompt | Change |
|---|---|---|---|
| Requests (errors) | 60 (0) | 60 (0) |  |
| Avg input tokens / request | 13,947 | 11,735 | -15.9% |
| Avg output tokens / request | 31.5 | 34.2 | +8.4% |
| Avg words per spoken reply | 29.6 | 30.3 | +2.6% |
| ₹ / request (nothing cached) | 0.3230 | 0.2723 | -15.7% |
| ₹ / call-min at 8 requests/min (nothing cached) | 2.584 | 2.178 | -15.7% |
| ₹ / call-min at 8 requests/min, 66% cached (Sep 2-Oct 1 billing) | 1.700 | 1.435 | -15.6% |
| First output p50 (ms) | 452 | 397 |  |
| First output p90 (ms) | 903 | 761 |  |
| First sentence p50 (ms) | 566 | 441 |  |
| Tool turns: right tool + valid args | 20/26 | 21/26 |  |
| No-tool turns answered without a tool | 27/34 | 27/34 |  |
| Wrong end_call (on a no-tool turn) | 2 | 3 |  |
| Unneeded switch_reply_language | 3 | 2 |  |
| Reply in the expected script | 29/32 | 28/31 |  |
| Caller addressed with a feminine verb (आप … सकती/चाहती/करेंगी) | 0 | 0 |  |
| Replies with a masculine first-person verb | 0 | 0 |  |
| Replies with a feminine first-person verb | 0 | 2 |  |
| Replies containing digits (should be words) | 3 | 1 |  |

### Per-turn tool results (run 1 / run 2)

| # | Call | Agent | Category | Language | Expected | Old prompt | New prompt |
|---|---|---|---|---|---|---|---|
| 0 | 1389 | 17 | kb_price | Hindi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 1 | 1389 | 17 | ack_after_offer | Hindi | log_lead, request_callback | ✘text / ✘text | ✘text / ✘end_call |
| 2 | 1389 | 17 | ending | Hindi | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |
| 3 | 1090 | 17 | kb_question | Hindi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 4 | 1090 | 17 | kb_price | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 5 | 1090 | 17 | general | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 6 | 1090 | 17 | ending | English | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |
| 7 | 1164 | 4 | language_switch | Marathi | switch_reply_language | ✔switch_reply_language / ✔switch_reply_language | ✔switch_reply_language / ✔switch_reply_language |
| 8 | 1164 | 4 | general | Marathi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 9 | 1164 | 4 | demo_request | Marathi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 10 | 1160 | 26 | kb_question | Hindi | (reply) | ✘switch_reply_language / ✘switch_reply_language | ✘switch_reply_language / ✘switch_reply_language |
| 11 | 1160 | 26 | language_switch | English | switch_reply_language | ✔switch_reply_language / ✔switch_reply_language | ✔switch_reply_language / ✔switch_reply_language |
| 12 | 1128 | 26 | kb_question | Hindi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 13 | 1128 | 26 | general | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 14 | 1128 | 26 | ending | Hindi | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |
| 15 | 912 | 26 | language_switch | Marathi | switch_reply_language | ✔switch_reply_language / ✔switch_reply_language | ✔switch_reply_language / ✔switch_reply_language |
| 16 | 912 | 26 | kb_question | Marathi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 17 | 776 | 4 | short_ack | English | (reply) | ✔text / ✔text | ✔text / ✔text |
| 18 | 776 | 4 | short_ack | English | (reply) | ✔text / ✔text | ✔text / ✔text |
| 19 | 776 | 4 | short_ack | Marathi | (reply) | ✘switch_reply_language / ✔text | ✘end_call / ✔text |
| 20 | 959 | 3 | kb_price | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 21 | 959 | 3 | booking | Hinglish | check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability |
| 22 | 959 | 3 | general | Hinglish | (reply) | ✘end_call / ✘end_call | ✘end_call / ✘end_call |
| 23 | 851 | 3 | booking | Hindi | check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability |
| 24 | 851 | 3 | booking | Hindi | book_appointment, check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability | ✔check_calendar_availability / ✘log_lead |
| 25 | 1157 | 4 | lead_capture | Hindi | capture_platform_lead | ✘text / ✘text | ✘text / ✘text |
| 26 | 796 | 19 | lead_capture | English | log_lead | ✘text / ✘check_calendar_availability | ✔log_lead / ✔log_lead |
| 27 | 956 | 3 | kb_price | English | (reply) | ✔text / ✔text | ✔text / ✔text |
| 28 | 1376 | 4 | general | Hinglish (Latin) | (reply) | ✘check_calendar_availability / ✘check_calendar_availability | ✘check_calendar_availability / ✘check_calendar_availability |
| 29 | 1092 | 26 | ending | Hindi | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |

### Replies side by side (Hindi / Hinglish / Marathi turns, both runs, digits masked)

**#0 · call 1389 · agent 17 · kb_price · Hindi**  
Caller: ठीक है, इसका प्राइस क्या है?

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | Project में starting price अस्सी लाख रुपये mention है, but final pricing और availability developer confirmation पर depend करेगी। क्या मैं आपके लिए pricing callback arrange कर दूँ? |
| old | 2 | Project में starting price अस्सी लाख रुपये* mention है, but final pricing developer confirmation से ही तय होगी। क्या मैं आपको pricing callback arrange कर दूँ? |
| new | 1 | Project में plots starting from अस्सी लाख rupees mentioned हैं, but final pricing और availability developer confirmation के subject पर हैं। क्या मैं आपको pricing callback arrange कर दूँ? |
| new | 2 | Project में plots starting from अस्सी लाख rupees* mention हैं, but final pricing developer confirmation से subject है। क्या मैं आपको pricing callback arrange कर दूँ? |

**#1 · call 1389 · agent 17 · ack_after_offer · Hindi**  
Caller: जी जी।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | हम्म, perfect जी। मैं आपका interest, preferred plot size और budget sales manager को forward कर रही हूँ, हमारी team आपको shortly call करके exact pricing और availability बता देगी। |
| old | 2 | Perfect जी, मैं आपका interest sales manager को forward कर देती हूँ, वो shortly call करके exact pricing और availability बता देंगे। |
| new | 1 | Perfect जी, मैं आपका interest sales manager को forward कर रही हूँ। हमारी team आपको shortly call करके exact pricing और availability बता देगी। Thank you. |
| new | 2 | Perfect जी, मैं आपका interest, preferred plot size और budget sales manager को forward कर रही हूँ। हमारी team आपको shortly call करके exact pricing, availability, brochure और site visit options explain करेगी। Thank you, जी। Sales manager आपको shortly connect करेंगे। Please final pricing, availability, project details और MahaRERA information verify करके ही decision लीजिए। Have a good day. `end_call({"end": "true"})` |

**#2 · call 1389 · agent 17 · ending · Hindi**  
Caller: थैंक यू।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `end_call({"reason": "Caller thanked and clearly signaled the conversation is over."})` |
| old | 2 | — `end_call({})` |
| new | 1 | — `end_call({})` |
| new | 2 | — `end_call({})` |

**#3 · call 1090 · agent 17 · kb_question · Hindi**  
Caller: आपके पास कौन सा available है?

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | Project में plot sizes करीब #### square feet से #### square feet तक mentioned हैं, लेकिन current availability sales manager inventory से confirm करेंगे। आप compact plot देख रहे हैं या larger size? |
| old | 2 | Project में plot sizes लगभग #### square feet से #### square feet तक mention हैं, लेकिन exact availability sales manager inventory से confirm करेंगे। क्या आप compact plot देख रहे हैं या बड़ा? |
| new | 1 | Project में plot sizes करीब सत्रह सौ square feet से लेकर छह हज़ार square feet तक mentioned हैं. Availability sales manager current inventory से confirm करेंगे. आप compact plot देख रहे हैं या larger size? |
| new | 2 | Project में plot sizes लगभग सत्रह सौ square feet से लेकर छह हज़ार square feet तक mentioned हैं. Availability sales manager inventory से confirm करेंगे. आप किस size range में देख रहे हैं? |

**#4 · call 1090 · agent 17 · kb_price · Hinglish**  
Caller: Prizes का इसको price है।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | Project में plots starting price अस्सी लाख रुपये से mention हैं, but final pricing और availability developer confirmation पर depend करेगी। क्या मैं pricing callback arrange कर दूँ? |
| old | 2 | Project की starting price अस्सी लाख रुपये है, लेकिन final pricing और availability developer confirmation पर depend करेगी। क्या मैं आपको pricing callback arrange कर दूँ? |
| new | 1 | Project की starting price अस्सी लाख रुपये* mention है, but final pricing plot size और availability पर depend करेगी। Sales manager current inventory से exact pricing confirm करेंगे। क्या मैं pricing callback arrange कर दूँ? |
| new | 2 | Project mentions starting price अस्सी लाख rupees* है, but final pricing और availability developer confirmation के subject पर रहेगी। Pricing callback arrange कर दूँ? |

**#5 · call 1090 · agent 17 · general · Hinglish**  
Caller: क्या आप मुझे sales executive का number दे सकते हैं? मैं बात कर लूँगा उनसे।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | Direct number share नहीं कर सकती जी, but sales manager shortly आपको connect कर लेंगे exact details के लिए। क्या मैं अभी आपका interest और preferences note कर लूँ? |
| old | 2 | Direct number share नहीं कर सकती, पर sales manager shortly आपको call करके सारी details explain कर देंगे। क्या मैं callback note कर दूँ? |
| new | 1 | Direct number तो मैं share नहीं कर पाऊँगी, पर sales manager shortly आपको call करके सारी details explain कर देंगे। Callback arrange कर दूँ? |
| new | 2 | Direct number तो मैं अभी share नहीं कर सकती, but sales manager shortly आपको call करके सारी details बता देंगे। Callback arrange कर दूँ? |

**#7 · call 1164 · agent 4 · language_switch · Marathi**  
Caller: मला मराठीतून बोलायचं आहे

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `switch_reply_language({"language": "Marathi"})` |
| old | 2 | — `switch_reply_language({"language": "Marathi"})` |
| new | 1 | — `switch_reply_language({"language": "Marathi"})` |
| new | 2 | — `switch_reply_language({"language": "Marathi"})` |

**#8 · call 1164 · agent 4 · general · Marathi**  
Caller: मला service reminder calls automation करायचा आहे तुमच्या through possible आहे का?

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | हो, ते अगदी शक्य आहे — outbound campaigns मधून reminder calls ऑटोमॅटिक जातात. साधारणपणे दिवसाला किती calls येतात तुमच्याकडे? |
| old | 2 | हो, हे अगदी शक्य आहे — outbound campaigns द्वारे service reminder calls automate करता येतात. साधारणपणे दिवसाला किती calls जातात तुमच्याकडे? |
| new | 1 | हो, absolutely possible आहे — outbound campaigns मधून service reminder calls एकदम आरामात automate करता येतात. तुम्ही सध्या दिवसाला साधारण किती reminder calls करता? |
| new | 2 | हो, एकदम possible आहे. तुम्ही service reminder calls बद्दल बोलत आहात, पण हे नक्की कोणत्या प्रकारच्या business साठी आहे? |

**#9 · call 1164 · agent 4 · demo_request · Marathi**  
Caller: हो मला demo दाखवू शकता का

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | हो, मी तुम्हाला दाखवते — समजा एखादा customer आहे, मी त्याचा बजेट, वेळ आणि बाकी details विचारून automatically reminder call schedule करते. तुमच्या business चं नाव काय आहे? |
| old | 2 | हो, मी तुम्हाला दाखवते — समजा एखादा customer आहे, मी थेट कॉल करून reminder देते आणि त्याचे details आपोआप log करते. तुमची team सध्या हे सगळं manual करते का? |
| new | 1 | हो नक्की, मी तुम्हाला समजावून सांगते. दोनशे reminder calls automate करणं म्हणजे तुमची team इतर महत्त्वाच्या कामांवर लक्ष देऊ शकेल. तर demo साठी तुमचं नाव सांगाल का? |
| new | 2 | हो नक्की, मी दाखवते — समजा एखादा customer due date जवळ आलीये म्हणून call येतो, तर मी त्याचा status check करून reminder देईन आणि पूर्ण log ठेवेन. तुम्हाला हे कधी बघायचंय, demo साठी कोणता दिवस सोयीचा राहील? |

**#10 · call 1160 · agent 26 · kb_question · Hindi**  
Caller: आप कितनी भाषाओं में बात कर सकते हो मुझसे?

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `switch_reply_language({"language": "English"})` |
| old | 2 | — `switch_reply_language({"language": "English"})` |
| new | 1 | — `switch_reply_language({"language": "English"})` |
| new | 2 | — `switch_reply_language({"language": "English"})` |

**#12 · call 1128 · agent 26 · kb_question · Hindi**  
Caller: क्या ऑफर चालू है आपके पास आई?

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | हाँ, अभी offer चल रहा है — website build पर पूरे एक साल का domain और hosting free मिल रहा है, बस enquiry के पंद्रह दिन के अंदर claim करना होता है। वैसे आपको किस तरह की website चाहिए? |
| old | 2 | हाँ, अभी offer चल रहा है। एक साल domain और hosting बिल्कुल free मिल रही है, बस enquiry के पंद्रह दिन के अंदर claim करना होता है। वैसे आपको अभी क्या चाहिए — नई website बनवानी है या कुछ और? |
| new | 1 | हम्म, हाँ अभी offer चल रहा है — website build के साथ पूरे एक साल का domain और hosting free मिल रहा है, बस enquiry के पंद्रह दिन के अंदर claim करना होगा। आपको अभी नई website बनवानी है या कुछ और देखना है? |
| new | 2 | हाँ, अभी offer चल रहा है — website build के साथ पूरे एक साल का domain और hosting बिल्कुल free है, बस enquiry के पंद्रह दिन के अंदर claim करना होता है। आपको अभी website बनवानी है या कोई और काम है? |

**#13 · call 1128 · agent 26 · general · Hinglish**  
Caller: एक्चुअली मुझे गूगल पे रैंक करना है वेबसाइट को, कोई अगर सर्च करे मेरा बिज़नेस तो दिखना चाहिए।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | SEO और on-page optimization हम site build में ही शामिल करते हैं, तो rank करना possible है। अभी आपकी website कितने time से live है? |
| old | 2 | SEO और on-page optimization हम site build में ही include करते हैं, तो search में rank करना आसान हो जाता है। अभी आपकी website कितनी पुरानी है और किस तरह की properties आप handle करते हैं? |
| new | 1 | देखिए, SEO और conversion tracking हम build में ही include करते हैं, तो search visibility अपने आप बेहतर होगी। अभी आपकी current website live है क्या, या बिल्कुल नई बनानी है? |
| new | 2 | देखिए, SEO और conversion tracking हम build में ही include करते हैं, तो search visibility अपने आप बेहतर होगी। क्या अभी आपकी कोई पुरानी website है जो काफी slow हो गई है, या फिर बिल्कुल नई बनानी है? |

**#14 · call 1128 · agent 26 · ending · Hindi**  
Caller: बाय।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `end_call({})` |
| old | 2 | — `end_call({})` |
| new | 1 | — `end_call({})` |
| new | 2 | — `end_call({})` |

**#15 · call 912 · agent 26 · language_switch · Marathi**  
Caller: ओके, तुम्ही मराठी में बोलू शकता का?

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `switch_reply_language({"language": "Marathi"})` |
| old | 2 | — `switch_reply_language({"language": "Marathi"})` |
| new | 1 | — `switch_reply_language({"language": "Marathi"})` |
| new | 2 | — `switch_reply_language({"language": "Marathi"})` |

**#16 · call 912 · agent 26 · kb_question · Marathi**  
Caller: की ऑफर बद्दल सांगा तुम्ही आत्ता काय बोलला ते

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | हम्म, ऑफर अशी आहे की website बनवताना पहिल्या वर्षासाठी domain आणि hosting पूर्णपणे free मिळेल. हे claim करण्यासाठी enquiry पासून फक्त पंधरा दिवस असतात. तुम्हाला सध्याची website आहे का, की ही पहिलीच बनवणार आहात? |
| old | 2 | हम्म, ऑफर अशी आहे — website बनवताना पहिल्या एका वर्षासाठी domain आणि hosting पूर्णपणे free मिळेल. पण हे claim करण्यासाठी enquiry च्या पंधरा दिवसांच्या आत नोंद करावी लागते. तुम्हाला किती pages हव्या आहेत website वर? |
| new | 1 | हम्म, ऑफर अशी आहे की website बनवताना पहिले एक वर्ष domain आणि hosting पूर्णपणे free मिळेल. हे पंधरा दिवसांच्या आत claim करायचं असतं. तुम्हाला नवीन website स्वतःच्या use साठी हवी आहे की investment साठी? |
| new | 2 | हम्म, offer असा आहे की website build सोबतच एक पूर्ण वर्ष domain आणि hosting free मिळतं. हे फक्त enquiry च्या पंधरा दिवसांच्या आत claim करायचं असतं. तुमची requirement team ला सांगून exact pricing confirm करू का? |

**#19 · call 776 · agent 4 · short_ack · Marathi**  
Caller: नाही आहे.

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `switch_reply_language({"language": "English"})` |
| old | 2 | So, exact rates aren't finalized yet ahead of our public beta, but the Growth plan is what most teams pick. Should I connect you with our team to walk through onboarding? |
| new | 1 | — `end_call({})` |
| new | 2 | No problem at all. Since you're exploring this, I can have the team reach out with exact pricing and a tailored demo. Would you like me to set that up? |

**#20 · call 959 · agent 3 · kb_price · Hinglish**  
Caller: प्रोजेक्ट के prices क्या है?

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | अभी plots starting price लगभग ## lakh rupees से है. Exact price plot size, location और availability पर depend करता है, तो हमारी sales team आपको latest details confirm कर देगी. |
| old | 2 | अभी plots की starting price लगभग निन्यानवे लाख रुपये से है, लेकिन final price plot size, location और availability पर depend करता है. हमारी sales team आपको exact details confirm कर देगी. |
| new | 1 | Plots अभी approximately निन्यानवे लाख से शुरू हो रहे हैं. Exact price size, facing और availability के हिसाब से change हो सकता है, हमारी sales team आपको latest confirmed details बता देगी. |
| new | 2 | अभी plots approximately ## lakh से शुरू हो रहे हैं. exact price size, facing और availability के हिसाब से change हो सकती है, हमारी sales team आपको latest confirmed details बता देगी. |

**#21 · call 959 · agent 3 · booking · Hinglish**  
Caller: Sunday का slots available है।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| old | 2 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| new | 1 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| new | 2 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |

**#22 · call 959 · agent 3 · general · Hinglish**  
Caller: हम्म देखता हूं मैं, वापस कॉल करता हूं। आप details मुझे WhatsApp पे भेज दीजिए।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `end_call({})` |
| old | 2 | — `end_call({})` |
| new | 1 | — `end_call({})` |
| new | 2 | — `end_call({})` |

**#23 · call 851 · agent 3 · booking · Hindi**  
Caller: হ্যাঁ। आज मुझे विज़िट करना है। कॉफ़ी कितने बजे तक? पूरा रहेगा।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| old | 2 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| new | 1 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| new | 2 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |

**#24 · call 851 · agent 3 · booking · Hindi**  
Caller: मेरा नाम संदीप यादव है।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": "##:##"})` |
| old | 2 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": "##:##"})` |
| new | 1 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": "##:##"})` |
| new | 2 | — `log_lead({"name": "Sandeep Yadav", "phone": "not provided in this turn", "budget": "not provided", "location")` |

**#25 · call 1157 · agent 4 · lead_capture · Hindi**  
Caller: ##########

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | हम्म, Abhishek जी, यह नंबर भी दस डिजिट का नहीं है. सही मोबाइल नंबर बता देंगे? तभी मैं डेमो बुक करवा पाऊँगी. |
| old | 2 | हम्म, अभी भी दस डिजिट का नंबर नहीं बन रहा है. एक बार अपना सही मोबाइल नंबर बता देंगे? |
| new | 1 | हम्म, अभी भी यह दस डिजिट का नहीं लग रहा है. एक बार चेक करके सही नंबर बता देंगे? |
| new | 2 | हम्म, ये नंबर भी दस अंकों का नहीं लग रहा है। एक बार फिर से पूरा नंबर बता देंगे? सही नंबर मिलने के बाद ही मैं डेमो बुक कर पाऊँगी। |

**#28 · call 1376 · agent 4 · general · Hinglish (Latin)**  
Caller: Book nahin karna hai pahle mujhe bataoge uske bad book karna.

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| old | 2 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| new | 1 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |
| new | 2 | — `check_calendar_availability({"date": "####-##-##", "duration_minutes": ##, "requested_time": null})` |

**#29 · call 1092 · agent 26 · ending · Hindi**  
Caller: जी ना, थैंक यू। थैंक यू, बाय।

| Prompt | Run | Reply |
|---|---|---|
| old | 1 | — `end_call({})` |
| old | 2 | — `end_call({})` |
| new | 1 | — `end_call({})` |
| new | 2 | — `end_call({})` |

