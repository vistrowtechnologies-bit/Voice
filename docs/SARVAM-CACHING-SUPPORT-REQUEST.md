# Draft: Sarvam support request about prompt caching on sarvam-105b-conversations

Draft written 13 Oct 2026 for the owner to send. It has no API keys, prompt text or customer data.
The figures come from docs/LLM-TOKEN-AUDIT-2026-10-12.md (§3, §4 and §5 option 2) and the
2026-09-24 retest noted in agent/main.py `_build_llm`. Before sending, fill in the
placeholders in angle brackets. Attach screenshots of the dashboard Usage page if you want.

---

**To:** Sarvam support (Startup Program)
**Subject:** Prompt caching never hits on sarvam-105b-conversations (0 cached tokens on call days)

Hello Sarvam team,

We are Vistrow Voice, a voice-agent platform in the Sarvam Startup Program
(org: <org name as shown in the dashboard>). We use `sarvam-105b-conversations` through the
OpenAI-compatible endpoint `https://api.sarvam.ai/v1/chat/completions`, with streaming and tool
calling. Prompt caching never seems to apply to this traffic, and we would like to know why.

**What we see**

- On every day that only had our live voice-call traffic, the usage dashboard shows **0 cached
  input tokens**. Two days where the bill matches our own request logs exactly:
  - 25 Sep 2026 (IST): 12 requests, 189,280 input tokens, 0 cached.
  - 26 Sep 2026 (IST): 11 requests, 209,048 input tokens, 0 cached.
- Each request is about 11,000 to 22,000 input tokens. About **80% of every request is an identical
  prefix**: the same system prompt and the same tool definitions, in the same order, within a call
  and across calls to the same agent. Only the chat history and a short tail at the end of the
  system prompt change between requests. Requests in one call are seconds apart.
- `prompt_tokens_details` comes back null on these responses. We read `cached_tokens` from it
  whenever it is present.
- **Controlled retest on 24 Sep 2026:** we sent 33 requests to `sarvam-105b-conversations` with
  identical prefixes of about 1.5k and about 4k tokens, with and without `prompt_cache_key`, and as a
  7-turn conversation with tools. Every request returned 0 cached tokens. Plain `sarvam-105b`, sent
  the same way, showed cache hits some of the time.
- Our account does show cached input on other days: 25.31M cached against 11.55M uncached input
  between 13 Sep and 12 Oct 2026. Caching is therefore enabled for the org in general, but it never
  appears on our `-conversations` call traffic.

**Our questions**

1. Is automatic prompt caching supported on `sarvam-105b-conversations`? If it is not, is support
   planned?
2. If it is supported, what does a request need to get a hit? For example: a minimum prefix length,
   a time-to-live, a requirement that requests arrive within N seconds, an effect from tools,
   streaming or `stream_options.include_usage`, or particular message ordering.
3. Does `prompt_cache_key` (or any other parameter) affect cache routing on your side?
4. Does `prompt_tokens_details.cached_tokens` get reported in streamed responses? If not, where
   should we read cache hits per request?

Caching on this model would move about 80% of our call input from ₹28.46/M to ₹10.98/M, so a clear
answer helps us decide how to build our prompts.

We are happy to share request IDs and timestamps from a test call if that helps.

Thank you,
<name>
Vistrow Technologies, <contact email>
