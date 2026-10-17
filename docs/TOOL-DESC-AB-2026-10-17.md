# Tool descriptions: size check and A/B — 2026-10-17

The question was whether tool schemas really are about 23% of each LLM request on the standard pipeline (Sarvam `sarvam-105b-conversations`), and whether shorter tool descriptions save money without losing tool accuracy.

Branch `claude/tool-desc-ab`, based on main `322c9ba3`. Not pushed, not deployed, not merged.

## Bottom line

- **The 23% was an undercount on today's main.** Tool definitions are **29–33% of every request on the tenant agents** (3, 17, 19, 26), counted by Sarvam itself. They are 9.8% on the platform demo (agent 4), whose built-in prompt is about 17K tokens. The 23% figure was taken before the prompt cuts shrank everything else; the tools stayed the same size, so their share went up.
- **Sarvam's own count** is from the same request sent with and without tools, using `usage.prompt_tokens`. The tool block is **2,625 tokens on agents 17 and 19, and 2,735 on agents 3 and 26** (they also have `transfer_call`). The tiktoken o200k proxy said 2,562 and 2,671, within 2.5%.
- **Cut:** descriptions of 8 tools shortened. `log_lead` was **reverted**, because shortening it broke lead capture on #26 (see below). After the cut the tool block is **2,249 and 2,346 tokens** in Sarvam's count, so **−376 to −389 tokens per request (−14% of the tool block, −4% of the request)**. On agent 4 it is −341.
- **A/B over 2×30 real turns:**
  - Right tool with valid args: **22/26**, against 21/26 before.
  - No-tool turns answered without a tool: 28/34 for both.
  - Wrong `end_call`: 0, against 1 before. Unneeded `switch_reply_language`: 2, against 2 before.
  - TTFT p50 unchanged, 266 ms in both runs.
  - **Acceptance met.**
- **Money: small.**
  - The cut saves about ₹0.026 per call-minute at Sarvam's list prices with 66% cached, and about ₹0.047 at our billed rates.
  - That is ₹26–47 per 1,000 call-minutes, or up to ₹71 if nothing is cached.
  - The whole tool block costs ₹0.18–0.50 per call-minute (table below). Most of it is JSON schema structure rather than prose.
- **Spend:** about ₹61 at the billed rates the harness uses (₹23/₹11/₹70 per M), or about ₹40 at list prices. The cap was ₹100.

## Step 1 — how big the tool block is (verified)

### Sarvam's own count (`prompt_tokens`, same request with and without `tools`)

| Case | Agent | Request with tools | Without tools | Tool block | Share | After cut | Share after |
|---|---|---|---|---|---|---|---|
| #3 | 17 | 9,026 | 6,401 | 2,625 | 29.1% | 2,249 | 26.0% |
| #12 | 26 | 8,996 | 6,261 | 2,735 | 30.4% | 2,346 | 27.3% |
| #20 | 3 | 9,499 | 6,764 | 2,735 | 28.8% | 2,346 | 25.8% |
| #26 | 19 | 7,910 | 5,285 | 2,625 | 33.2% | 2,249 | 29.9% |
| #17 | 4 (platform demo) | 19,245 | 17,366 | 1,879 | 9.8% | 1,538 | 8.1% |

### By turn (tiktoken o200k proxy, the request exactly as `llm_node` builds it, strict OpenAI tool schema as the plugin sends it to Sarvam)

Each cell gives total request tokens, then the tool block's share. The tool block is the same on every turn; only the history grows.

| Fixture / real agent | Tool block | Turn 1 | Turn 5 | Turn 10 |
|---|---|---|---|---|
| Fixture: custom-prompt tenant, strict 8K KB | 2,497 | 9,606 · 26.0% | 10,187 · 24.5% | 10,535 · 23.7% |
| Fixture: built-in persona, 8K KB, Chirp | 2,388 | 12,137 · 19.7% | 12,718 · 18.8% | 13,066 · 18.3% |
| Fixture: outbound lead + contact notes | 2,497 | 9,772 · 25.6% | 10,353 · 24.1% | 10,701 · 23.3% |
| Agent 17 (call 1090) | 2,562 | 8,887 · 28.8% | 9,141 · 28.0% | 9,530 · 26.9% |
| Agent 26 (call 1128) | 2,671 | 9,014 · 29.6% | 9,235 · 28.9% | 9,674 · 27.6% |
| Agent 3 (call 959) | 2,671 | 9,605 · 27.8% | 9,996 · 26.7% | (call has 9 turns) |
| Agent 19 (call 796) | 2,562 | 7,661 · 33.4% | 7,983 · 32.1% | 8,079 · 31.7% |
| Agent 4 (call 776, platform demo) | 1,818 | 18,818 · 9.7% | 19,010 · 9.6% | 19,244 · 9.4% |

The 23% in docs/PROMPT-CUTS-AB-2026-10-16.md is what the offline fixture shows at turn 10 (23.3–23.7%). Real tenant agents carry 1–2 more tools (`send_dtmf_events`, plus `transfer_call` on 3 and 26) and a smaller prompt, so they sit at 27–33%.

### Per tool (tiktoken, agent 26, which has the full tenant set)

| Tool | Before | After | Saved | Description / param descriptions before | Note |
|---|---|---|---|---|---|
| log_lead | 617 | 617 | 0 | 159 / 213 | Cut reverted. 424 of its 617 tokens are the 9-parameter strict JSON schema |
| switch_reply_language | 437 | 294 | −143 | 266 / 92 | |
| request_callback | 278 | 249 | −29 | 74 / 55 | |
| book_appointment | 271 | 239 | −32 | 51 / 61 | |
| check_calendar_availability | 238 | 198 | −40 | 44 / 79 | |
| do_not_call | 218 | 168 | −50 | 132 / 12 | |
| end_call | 188 | 128 | −60 | 142 / 0 | |
| send_dtmf_events | 174 | 174 | 0 | 26 / 0 | livekit built-in, not in tools.py |
| send_brochure | 140 | 140 | 0 | 54 / 12 | Not touched (another session owns it) |
| transfer_call | 109 | 96 | −13 | 64 / 0 | |
| capture_platform_lead (agent 4 only) | 231 | 216 | −15 | 27 / 64 | |
| **Total (agent 26)** | **2,671** | **2,304** | **−367** | | Sarvam count: −389 |

About 55% of the remaining tool block is schema structure: names, types, `required` and `additionalProperties`. Strict mode makes every argument required and nullable. Only a schema change could shrink that part, and schema changes were out of scope.

### ₹ per call-minute (8 requests/min; Sarvam token counts)

Sarvam list prices for Sarvam 105B were checked on sarvam.ai/api-pricing on 2026-10-17: ₹15/M input, ₹5/M cached input, ₹60/M output. Our bill implied about ₹23/M and ₹11/M for input.

| | List, nothing cached | List, 66% cached | Billed, nothing cached | Billed, 66% cached |
|---|---|---|---|---|
| Whole tool block before (~2,700 tok/request) | ₹0.324 | ₹0.180 | ₹0.497 | ₹0.326 |
| Saved by this cut (~385 tok/request) | ₹0.046 | ₹0.026 | ₹0.071 | ₹0.047 |
| Per 1,000 call-min saved | ₹46 | ₹26 | ₹71 | ₹47 |

"66% cached" is the share of Sarvam input that the Sep 2–Oct 1 bill showed as cached. The tool block is static, so in practice it is more likely to hit the cache than the request average.

For scale, a whole tenant request (about 9,000 input and 35 output tokens) is about ₹1.10/min at list price with nothing cached.

## Step 2 — what was cut (`agent/tools.py`, docstrings only)

No logic, tool names, parameter names, types or defaults changed. Every rule the model needs was kept:

- **`switch_reply_language`:** when to call it (asked, or the whole message is in another language); before the first reply in the new language (Hindi/Marathi share a script); not for the language already active, a question about languages, or English words inside a sentence; never refuse a language without calling it, because the tool knows what exists; any number of switches. The argument example list was shortened from 17 named languages to 6 plus "pass what the caller asked for".
- **`end_call`:** a clear end signal only; not for a pause, "okay" or small talk; a send-details, brochure, WhatsApp or callback request is not a goodbye, so confirm out loud first. The sentence about main.py internals was dropped, since the model does not need it.
- **`do_not_call`:** call it the moment they ask, in any language, even if they are annoyed; not for busy, later or "not interested".
- **`request_callback`:** use it when an appointment couldn't be had; never end without a booking or this. All argument formats kept (digits only, YYYY-MM-DD, "HH:MM").
- **`book_appointment`:** only after `check_calendar_availability` showed the slot free and the caller agreed. Formats kept.
- **`check_calendar_availability`:** call it before offering any time. `requested_time` is "HH:MM", and the model should not match it against the list itself.
- **`transfer_call`:** only on an explicit request or a genuine handoff; never unprompted.
- **`capture_platform_lead`:** wording only.

Not touched: `log_lead` (reverted), `send_brochure`, `record_consent`, `lookup_catalog` and `web_search`. The last three are not offered to any replayed agent, so they could not be A/B-tested. Also not touched: `crm_outcome`, `_integration_body`, `_INTEGRATION_FIELDS` and `agent/lead_facts.py`.

### Reverted: `log_lead`

The first NEW run shortened `log_lead` too, which saved 144 more tokens. On #26, where agent 19's caller gives a phone number, it dropped `log_lead` from 2/2 to 0/2. The 5× re-check:

| Variant | #26 `log_lead` |
|---|---|
| OLD (main) | 5/5 (7/7 with the 2×30 run) |
| NEW, all `log_lead` text shortened | 2/5 |
| NEW, original description + shortened Args | 0/5 |
| NEW, `log_lead` docstring restored (final) | 5/5, and 2/2 in the final 2×30 |

The parameter descriptions are what carry it, so the whole `log_lead` docstring is back to main's text. Re-checks on the same first variant were unchanged for #22 (`send_brochure`+`end_call`: OLD 4/5, NEW 4/5) and #24 (`check_calendar_availability`: OLD 4/5, NEW 5/5).

## Step 3 — A/B (OLD = main `322c9ba3`, NEW = this branch, final)

Method: `agent/scripts/llm_bakeoff.py run --agent-dir` (OLD = `git archive origin/main agent`), then `compare`.

- The prompt and tools came from the real `RealEstateAgent` of each call's agent. The database was read-only: `default_transaction_read_only=on` was set and asserted, and only accounts 1 and 2 were read.
- Phone numbers and e-mail addresses were swapped for synthetic ones before sending, and digits are masked below.
- `LLM_FALLBACK=0`. TTFT was measured from the owner's Mac.
- The runs were sequential in one session: OLD 2×30, then NEW.

<!-- generated by agent/scripts/llm_bakeoff.py compare; model `sarvam/sarvam-105b-conversations` -->

| | Old prompt | New prompt | Change |
|---|---|---|---|
| Requests (errors) | 60 (0) | 60 (0) |  |
| Avg input tokens / request | 11,961 | 11,588 | -3.1% |
| Avg output tokens / request | 35.8 | 33.6 | -6.0% |
| Avg words per spoken reply | 31.3 | 29.7 | -5.0% |
| ₹ / request (nothing cached) | 0.2776 | 0.2689 | -3.1% |
| ₹ / call-min at 8 requests/min (nothing cached) | 2.221 | 2.151 | -3.1% |
| ₹ / call-min at 8 requests/min, 66% cached (Sep 2-Oct 1 billing) | 1.463 | 1.417 | -3.2% |
| First output p50 (ms) | 266 | 266 |  |
| First output p90 (ms) | 367 | 374 |  |
| First sentence p50 (ms) | 297 | 313 |  |
| Tool turns: right tool + valid args | 21/26 | 22/26 |  |
| No-tool turns answered without a tool | 28/34 | 28/34 |  |
| Wrong end_call (on a no-tool turn) | 1 | 0 |  |
| Unneeded switch_reply_language | 2 | 2 |  |
| Reply in the expected script | 28/32 | 28/32 |  |
| Caller addressed with a feminine verb (आप … सकती/चाहती/करेंगी) | 0 | 0 |  |
| Replies with a masculine first-person verb | 0 | 0 |  |
| Replies with a feminine first-person verb | 2 | 0 |  |
| Replies containing digits (should be words) | 2 | 2 |  |

### Per-turn tool results (run 1 / run 2)

| # | Call | Agent | Category | Language | Expected | Old prompt | New prompt |
|---|---|---|---|---|---|---|---|
| 0 | 1389 | 17 | kb_price | Hindi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 1 | 1389 | 17 | ack_after_offer | Hindi | log_lead, request_callback | ✘text / ✘text | ✘text / ✘text |
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
| 19 | 776 | 4 | short_ack | Marathi | (reply) | ✔text / ✔text | ✔text / ✔text |
| 20 | 959 | 3 | kb_price | Hinglish | (reply) | ✔text / ✔text | ✔text / ✔text |
| 21 | 959 | 3 | booking | Hinglish | check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability |
| 22 | 959 | 3 | general | Hinglish | (reply) | ✘send_brochure / ✘send_brochure,end_call | ✘send_brochure / ✘send_brochure |
| 23 | 851 | 3 | booking | Hindi | check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability | ✔check_calendar_availability / ✔check_calendar_availability |
| 24 | 851 | 3 | booking | Hindi | book_appointment, check_calendar_availability | ✔check_calendar_availability / ✘log_lead | ✔check_calendar_availability / ✔check_calendar_availability |
| 25 | 1157 | 4 | lead_capture | Hindi | capture_platform_lead | ✘text / ✘text | ✘text / ✘text |
| 26 | 796 | 19 | lead_capture | English | log_lead | ✔log_lead / ✔log_lead | ✔log_lead / ✔log_lead |
| 27 | 956 | 3 | kb_price | English | (reply) | ✔text / ✔text | ✔text / ✔text |
| 28 | 1376 | 4 | general | Hinglish (Latin) | (reply) | ✘check_calendar_availability / ✘check_calendar_availability | ✘check_calendar_availability / ✘check_calendar_availability |
| 29 | 1092 | 26 | ending | Hindi | end_call | ✔end_call / ✔end_call | ✔end_call / ✔end_call |

Spend for this A/B (harness estimate at billed rates):

| Run | Spend |
|---|---|
| OLD 2×30 | ₹16.66 |
| NEW 2×30, first variant | ₹15.97 |
| NEW 2×30, final | ₹16.13 |
| 5× re-checks | ₹8.07 |
| With/without-tools counts | ₹4.48 |
| **Total** | **≈ ₹61** |

At list prices the total is about ₹40.

## Risks and what was not verified

- **30 turns × 2 runs is a small sample.**
  - Tool-accuracy differences of ±1 are within run-to-run noise. On #24, OLD itself flips between runs.
  - The acceptance (no lower accuracy, no new wrong `end_call` or switch) was met on the final run. It does not prove equal accuracy on tools these turns never exercise: `do_not_call`, `transfer_call`, `book_appointment` completion and `request_callback`.
  - `do_not_call` is the compliance-critical one. Its text keeps every rule, but no replayed turn asks to stop calls.
- **`switch_reply_language`'s language list was shortened.** On a global voice, a caller asking for, say, Japanese now relies on "pass what the caller asked for; the tool decides" plus the NEVER-refuse rule. No replay case covers a non-Indian language.
- **Pre-existing misses, unchanged by this cut:**
  - #10: `switch_reply_language` on a question about languages, 2/2 in both. This is the known `_LANGUAGE_REQUEST_PATTERN` false positive.
  - #22: `send_brochure` then `end_call` on a "send me details on WhatsApp, I'll call back" turn. The `end_call` description already says not to do this; the wrap-up objective in main.py pushes it.
  - #25: `capture_platform_lead` is never called; #28: `check_calendar_availability` is called on a general question.
- **TTFT is measured from the Mac, not the LiveKit region.** No change was expected or seen.
- **Live check before deploy:** one Hindi tenant call that switches to Marathi and back, asks for a brochure on WhatsApp, and ends normally, to confirm a single switch, no early hang-up and a clean `end_call`.
- **Deploying it** needs `lk agent deploy` on both workers. tools.py also has claims open on other functions (PR #153 `switch_reply_language` logic, about 10 lines below the docstring edited here; no line overlap).
