# Sarvam LLM token audit: 13 Sep to 12 Oct 2026

Read-only investigation, done 12–13 Oct 2026. No code changed, nothing deployed, and no paid LLM calls made.
Sources: the production DB (read-only session, `SET default_transaction_read_only = on`), the staging DB
(read-only), the Sarvam dashboard's own usage API (`indus.sarvam.ai/api/dhan/org/usage/*`, read through the
logged-in dashboard), offline construction of the real agent prompts (the `RealEstateAgent` constructor run
locally under livekit-agents 1.8.3 with dummy keys), and local Claude/Codex session logs.
This report contains no prompt text, no KB text and no caller speech. Agents are named by ID only.

## TL;DR

* **Billed:** 37.55M tokens = 11.55M input + 25.31M cached input + 0.685M output, ₹656.53. The Sarvam
  usage API gives the same total, 36.86M input-side plus 0.685M output.
* **Live calls (prod and staging) explain about 6.5M tokens (17%), about ₹190.** That works out to about
  40k tokens per Sarvam call-minute. It is not 130k per minute: only 141 of the 286 call-minutes in the
  window actually used the Sarvam LLM.
* **28.5M tokens (76%, about ₹433) were billed on 27 Sep to 1 Oct IST, when no matching calls happened.**
  On 29 and 30 Sep production has **zero** Sarvam calls, staging did not exist yet, and Sarvam STT/TTS
  usage was about 0 (35 s of STT and 336 TTS chars on 29 Sep, nothing on 30 Sep). Even so, 379 chat
  requests were billed, averaging about 58k tokens each and 85% cached. That pattern looks like long-running
  text conversations or scripts, not voice calls. **The source is UNVERIFIED.** No local Claude or Codex
  session ran Sarvam chat in that window. Only one Sarvam API key has been used since July: "Vistrow Voice
  Master API", the same key as the repo `.env`.
* **About 1.8M tokens (5%, about ₹52) were developer benchmarks on other days.** For example, the 15 Sep
  prompt-ablation scripts in Claude session 1fcd8a9c, the 24 Sep caching retest and the 1 Oct TTFT test.
* **No hidden per-call LLM traffic.** On 25 and 26 Sep, Sarvam's billed requests and input tokens match
  the DB-recorded LLM requests exactly: 12 / 189,280 and 11 / 209,048. So the per-call prompt-cache
  warmup and cancelled preemptive generations add no billed requests.

## 1. Every code path that can call the Sarvam chat LLM

| # | Path | Calls Sarvam? | Trigger and frequency | Tokens per invocation | Evidence |
|---|---|---|---|---|---|
| 1 | Live call agent `_build_llm` `sarvam/` branch | **Yes** | Every LLM turn of a call on an agent whose model is `sarvam/*`, plus tool follow-up rounds | 11–22k input per request (measured, see §2/§3); output ≤400 (200 for platform demo) | agent/main.py:1911-1965, max tokens agent/main.py:3822-3833 |
| 1a | Fallback to gpt-4o-mini | No (OpenAI) | When Sarvam errors or stalls past `LLM_FALLBACK_TIMEOUT_S`=4 s; shipped 12 Oct | – | agent/main.py:1949-1965 |
| 1b | Per-call prompt-cache warmup | Sends a request to the same LLM (system prompt + "hi", no tools), closed after the first token | Once per call when the agent speaks first | No billed requests or tokens on 25/26 Sep, where billing reconciles exactly (see §4) | agent/main.py:3894-3940, called at agent/main.py:4376 |
| 1c | Preemptive generation | Yes, when it runs | Up to `max_retries`=3 speculative runs per user turn. Cancelled runs are not in our metrics | Billing on 25/26 Sep shows no extra requests | agent/main.py:7101; livekit agents voice/turn.py:226-227 and agent_activity.py:2386-2425 (1.8.0 source; 1.8.3 defaults UNVERIFIED) |
| 1d | Per-turn directive | Adds a system message to the same request, not a separate call | Every turn | Small | agent/main.py:4533-4554 |
| 1e | Sarvam latency-lab override | Forces `sarvam/sarvam-105b-conversations` | Only when `sarvam_latency_lab` is set on the call | Same as row 1 | agent/main.py:6662-6675 |
| 2 | Post-call field extraction / caller-memory summary | **No**: OpenAI gpt-4o-mini | Calls with post_call_fields or memory | – | agent/main.py:6240-6286 |
| 3 | Call intelligence (`server/call_intelligence.py`) | **No**: OpenAI gpt-4.1-mini, on demand | Dashboard "analyze" | – | server/call_intelligence.py:18-19, 65-75; route token_api.py:3541 |
| 4 | Copilot / help chat | Only as a **fallback** after OpenAI fails (`_PROVIDER_KEYS` order openai, then sarvam; `COPILOT_PROVIDER` not set in prod). Added 12 Oct (commit 9eb2523c) | Per question, up to 4 rounds, history capped at 6 turns | Small; none in the window before 12 Oct | server/help_chat.py:41-52, 248-282 |
| 5 | Agent builder `/agents/draft` | **Yes, Sarvam first** (max_tokens 6000) | Per draft; added 12 Oct (commits 38727c38 and ffaca14e) | A few k | server/agent_builder.py:36-37, 324-341 |
| 6 | Vendor health check | Yes, `max_tokens 1`, prompt "ok" | Every 3 h through ops_alert_worker, and on admin demand; added 12 Oct | about 10 tokens | server/vendor_health.py:113-119; server/ops_alert_worker.py:15, 236 |
| 7 | `server/llm_warmer.py` | **No.** It posts to **api.openai.com** with the agent's own model name | Every 240 s for agents called in the last 30 min. Enabled in prod: started at import (token_api.py:100), `OPENAI_API_KEY` is set and `DISABLE_LLM_WARMER` is not (Railway var names checked) | 0 Sarvam tokens. For a `sarvam/...` agent it sends a model name OpenAI does not have, so the ping fails every 4 min (log noise, a bug, no cost) | server/llm_warmer.py:33-34, 52-63 (filter excludes only gemini/groq), 69-87, 112-131 |
| 8 | Widget text chat (`server/widget_chat.py`) | **No**: OpenAI gpt-4o-mini | – | – | server/widget_chat.py:23-28, 141 |
| 9 | Orchestrator (legacy phone pipeline) | **No.** `_get_client` routes non-gemini models to OpenAI | – | – | orchestrator/llm.py:39-50 |
| 10 | Testing Lab (`test_run_id`) | Same as row 1, if the tested agent is on Sarvam | – | – | Every call row in the window has `test_run_id = ''`: no Testing Lab runs logged |
| 11 | `push-sarvam-key.sh` key check | Yes, "hi", max_tokens 5 | Manual | Negligible | push-sarvam-key.sh:39-41 |
| 12 | Staging agent `CA_QXKko3RGzmbB` | Yes: same Sarvam key copied from prod (docs/STAGING.md:29) | Real staging calls 6–7 Oct | 0.97M recorded | staging DB, see §4 |
| 13 | Developer benchmarks (Claude/Codex sessions) | Yes: production key from `.env` | Ad hoc | 15 Sep ablations about 1.1M; 1 Oct TTFT/cache tests about 0.1M | Claude session 1fcd8a9c (15 Sep 06:18–06:34 UTC: ab978.py, ablate.py, soften.py…; 1 Oct 11:13 UTC: sarvam_ttft.py, cache_cmp.py) |

## 2. How the live-call prompt is built, and its real size

Assembly happens in `RealEstateAgent.__init__` (agent/main.py:3230-3790), in this order:
1. Platform rules block (prepended), then the gender identity block (prepended).
2. Base persona: the tenant `system_prompt` if one is set. Otherwise the built-in generic persona, or
   `platform_assistant` for the platform demo (54,418 chars on its own).
3. Human-speech layer (3,272 chars), appended to every custom-prompt agent.
4. Catalog index, only for agents with a live catalog.
5. **Knowledge base: the whole KB goes into the prompt, with no retrieval.** It is truncated to 8,000 chars
   (agent/db.py:480-540, `max_chars=8000`). Strict mode adds about 2.3k chars of rules first
   (agent/main.py:3351-3388).
6. `VOICE_STYLE_PROMPT` (3,313 chars), the lead-capture, numbers and state-back rules (about 4.5k chars),
   default language (about 1k), global languages (1.4k, Chirp/Gemini voices only), call direction,
   transfer/consent, the caller tail (caller ID and memory) and the date line. The last two sit at the end
   on purpose, for prefix caching.
7. **Tool JSON schemas** go into every request: 7–10 tools.

Measured by building the real agents offline from production config, with the model forced to Sarvam as
it was at call time:

| Agent (current model) | Tenant prompt chars | KB injected / full chars | Final instructions chars | Tools / schema chars | Calibrated first-request tokens (DB) |
|---|---|---|---|---|---|
| 26 phone (now gemini-live) | 6,707 | 7,074 / 7,074 | 32,814 | 10 / 11,439 | 11,408 median |
| 26 browser | 6,707 | 7,074 | 32,371 | 10 / 11,439 | 15,491 |
| 4 platform demo (now gemini-live 3.1) | 0 (built-in 54k) | 4,522 | **73,794** | 7 / 7,248 | about 20,300–21,700 |
| 17 (sarvam) | 11,644 | 2,060 | 31,836 | 9 / 10,969 | about 11,000 |
| 3 (sarvam) | 7,841 | 7,790 | 34,191 | 10 / 11,439 | not recorded |

Calibration: agent 26 has 44.2k chars of prompt plus tools against 11,408 recorded tokens, which is
**about 3.9 chars per token**. That holds even though most of the prompt is Latin script: only 253 to 1,731
Devanagari chars in these prompts, so the "Devanagari tokenizes worse" effect is small here.

Breakdown of agent 26's request (about 11.4k tokens of static prefix):
* Tenant prompt: about 1.7k tokens (15%).
* KB plus strict-KB rules: about 2.4k (21%).
* Platform-added layers: about 4.3k (38%). The two "how you talk" layers alone are 6.6k chars.
* **Tool schemas: about 2.9k (26%).** The biggest are `log_lead` at 2,831 chars and `switch_reply_language`
  at 2,071. `capture_platform_lead` (895) is sent to tenant agents even though it is only meant for the
  platform demo.

## 3. Per turn

* **The full system prompt, the tools and the full chat history are sent on every request.** History is
  never truncated: there is no `truncate`, `max_items` or `update_chat_ctx` in agent/main.py.
* LLM requests per caller turn, from `diagnostic_events_json` (stage `llm`, non-cancelled) over the
  window's 111 Sarvam calls: 391 LLM requests against 356 caller turns, about **1.1 requests per turn**
  (the extra ones are tool follow-up rounds).
* There is no separate classifier, translation or filler LLM call. Backchannels and the greeting are TTS
  only.
* Recorded `promptTokens` (logged since commit c6655431, 24 Sep) exist for 29 of 111 calls: 1,824,294
  tokens, with `cachedTokens` = 0 on every Sarvam request.
* Per-request input grows over a call: agent 26 goes from about 11.4k on the first request to about 16k
  late in a call. Average 13,345 tokens per request on agent 26 phone (86 requests, 10 calls), 21,632 on
  agent 4, 12,457 on agent 17.
* Agent 26 phone: 60 calls, 91.5 min, 236 caller turns, 266 requests. That is 3.9 turns and 4.4 requests
  per call, about **59k tokens per call, about 39k per call-minute**.
* Completion tokens are not recorded anywhere. Billing shows output is small: 685k in the whole window,
  of which about 620k fell on the 27 Sep–1 Oct anomaly.

## 4. Reconciliation (IST days, as the Sarvam dashboard counts them)

Live-call tokens are measured where `promptTokens` was recorded. For 13–24 Sep they are estimated as
recorded requests × that agent's measured average tokens per request. Those estimates land within 1–10%
of the bill on days with no other activity (16 Sep: 1,204,873 estimated against 1,205,923 billed).

| Source | Tokens | Share | ₹ (approx.) | Basis |
|---|---|---|---|---|
| Live calls, production (109 Sarvam calls, 141 min) | 5.52M | 14.7% | about 157 | DB diagnostics (measured from 25 Sep; extrapolated before) |
| Live calls, staging (13 real browser calls, 6–7 Oct) | 0.97M | 2.6% | about 28 | staging DB diagnostics |
| **Unattributed bulk, 27 Sep–1 Oct** | **28.5M** | **76%** | **about 433** | Billed minus calls: 29–30 Sep have 0 calls, 379 requests, about 58k tokens each, 85% cached, no STT/TTS |
| Developer benchmarks and other excess (15 Sep ablations about 1.09M, 24 Sep about 0.13M, 3 Oct 0.13M, 7 Oct 0.17M, 12 Oct 0.12M, tiny key checks) | 1.84M | 4.9% | about 52 | Billed minus calls per day; 15 Sep matched to Claude session scripts |
| Post-call summaries, call intelligence, widget chat, llm_warmer | 0 | 0 | 0 | These paths use OpenAI (§1) |
| Copilot fallback, agent builder, vendor health | about 0 in window | – | – | All shipped 12 Oct; 12 Oct excess is 116k total |
| Output tokens (all sources) | 0.685M | 1.8% | about 50 | billing |
| **Total** | **37.55M** | | **₹656** | dashboard 37.5M / ₹656.53 |

**Explained with evidence: about 8.3M (22%), namely calls, benchmarks and output outside the anomaly.
Unexplained: about 28.5M (76%) on 27 Sep–1 Oct.** Billed by IST day (input+cached / requests): 28 Sep 21k/79
(but 154k output, about 1.9k output per request, so generation-shaped), 29 Sep 8.22M/164, 30 Sep 13.42M/215,
1 Oct 7.41M/200 (of which DB calls account for 0.53M/41).

What rules things out for that window:
* Production DB: 0 Sarvam calls on 29–30 Sep IST, 1 on 28 Sep, 8 on 1 Oct.
* Staging: its first real call was 6 Oct.
* `error_events`: nothing on those days.
* Sarvam STT/TTS: about zero, so these were not voice sessions.
* Local Claude sessions: only 3 small Sarvam tool calls on 1 Oct.
* Codex sessions for 29–30 Sep: no "sarvam" mentions.

Leads still open (UNVERIFIED):
* Codex cloud tasks (remote containers do not log on this Mac).
* The Sarvam dashboard Chat Completions playground.
* The key being used on another machine or service.

The dashboard key list shows only "Vistrow Voice Master API" in use, so the key alone cannot attribute
the traffic.

## 5. Ranked reduction options

Current live-call volume is about 6.5M tokens, about ₹190 per 30 days. Live-call input is billed
uncached at ₹28.46/M (no Sarvam cache hits on any call day). Note that agents 26 and 4 have since moved
to Gemini Live, so future Sarvam call volume will be lower than this window.

| Rank | Option | Saving (tokens per 30 days) | ₹ per month | Call-quality risk |
|---|---|---|---|---|
| 1 | **Find and stop the 27 Sep–1 Oct consumer.** Give dev, benchmark, staging, agent-builder and copilot their own Sarvam keys so the dashboard attributes usage. Rotate the master key if the source stays unknown | about 28.5M non-recurring; about 30M including benchmarks | about ₹430–485 if it recurs | None |
| 2 | Get Sarvam prompt caching to work for `-conversations` on calls. Cached is 0 on every call day, yet about 80% of each request is a stable prefix. Raise it with Sarvam support (Startup Program) | 0 tokens; about 80% of input moves to ₹10.98 | about ₹90 (about 49% of call LLM cost) | None |
| 3 | Trim tool schemas: drop tools an agent cannot use (`capture_platform_lead` on tenants; calendar/booking tools when no calendar is set up) and shorten `log_lead` and `switch_reply_language` descriptions. Measured 11.4k chars (about 2.9k tokens, about 22% of an average request). Halving them | about 0.7M | about ₹20 | Low–medium: tool-call reliability needs Testing Lab runs |
| 4 | Remove duplication in platform layers: two "how you talk" layers of 3.3k chars each, clinic anecdotes in the strict-KB rules, the global-language block. About 19k chars (about 4.9k tokens, about 37%). Cutting 40% | about 1.0M | about ₹28 | Medium: these rules each fixed a real call bug, so A/B test them |
| 5 | Platform demo prompt (agent 4): 54k-char built-in persona, 21.6k tokens per request against about 13k for tenants. It was 17% of call tokens. Halving | about 0.55M (0 while agent 4 is on Gemini Live) | about ₹16 | Medium for demo quality |
| 6 | KB retrieval instead of stuffing: up to 8k chars (about 1.8–2.4k tokens with strict rules, about 15%) | about 0.6M | about ₹17 | Medium–high: grounding |
| 7 | Cap history to the last N turns | about 0.3M (history averages about 14% of a request) | about ₹8 | Medium: lost context |
| – | Remove the per-call warmup or preemptive generation | 0 (billing shows no extra requests) | 0 | Would cost latency |

## 6. Instrumentation needed to measure this precisely

1. Record `completion_tokens` alongside `promptTokens`/`cachedTokens` in the `llm_metrics` diagnostic
   (agent/main.py:7916-7945), and **also record cancelled requests**: the handler skips
   `metric.cancelled` (agent/main.py:7915), which hides speculative and interrupted requests.
2. Add per-call rollup columns (`llm_requests`, `llm_prompt_tokens`, `llm_completion_tokens`, `llm_model`)
   so the cost per call is one query.
3. Use one Sarvam key per consumer (prod agent, staging agent, server copilot/builder, dev benchmarks).
   The dashboard cannot group by key (`group_by=api_key` returns "Invalid usage grouping"), so separate
   keys are the only attribution available.
4. Add a daily reconciliation job: the Sarvam usage timeseries (request `event_count` and tokens per SKU
   per day) against the DB sum per IST day, alerting when billed exceeds recorded by more than 20%.
5. Fix `llm_warmer` so it skips `sarvam/` models: it currently posts them to OpenAI and fails every 4 min.

## Not done / caveats

* Prompt sizes come from the agents' current stored config. Prompts edited since the calls would differ;
  the measured `promptTokens` cover 25 Sep onward.
* livekit-agents preemptive defaults were read from the local 1.8.0 source; deployed 1.8.3 is UNVERIFIED.
* LiveKit Cloud logs (`lk agent logs`) only tail about 15 minutes, so they could not be used for the window.
* `docs/AGENT-MESSAGE-BOX.md` and issue #2 were not updated, because this task was limited to creating
  this one file.
