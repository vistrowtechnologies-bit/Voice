"""LLM turn-taking through OpenAI-compatible Chat Completions clients,
replacing livekit-agents' openai.LLM plugin wrapper. Tool-calling shape
mirrors server/help_chat.py's existing OpenAI function-calling pattern
(TOOL_SCHEMAS/TOOL_FUNCTIONS passed straight into `tools=`).

Gemini's official OpenAI-compatible endpoint lets this pipeline preserve the
same streaming and function-calling code while routing gemini-* models with
GEMINI_API_KEY.
"""

from __future__ import annotations

import json
import os
import re
from typing import Awaitable, Callable

from openai import AsyncOpenAI

_clients: dict[str, AsyncOpenAI] = {}
_SENTENCE_BREAK = re.compile(r"[.!?\n]\s+")
_MAX_CHUNK_CHARS = 220  # force-flush a long unpunctuated run so it isn't held forever
# A fragment shorter than this doesn't get flushed as its own TTS call even
# on a real sentence-break match — each sentence is synthesized as an
# independent Sarvam call with no prosody continuity from the last, so
# splitting every few words (common with decimals like "2.5 lakh" or list
# numbering like "1. First point", where the period reads as a sentence
# break) makes the voice sound like it's changing word to word.
_MIN_CHUNK_CHARS = 20


def _get_client(model: str) -> AsyncOpenAI:
    provider = "gemini" if model.startswith("gemini") else "openai"
    if provider not in _clients:
        if provider == "gemini":
            api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
            if not api_key:
                raise RuntimeError(f"{model} is selected, but GEMINI_API_KEY is not set.")
            _clients[provider] = AsyncOpenAI(
                api_key=api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            )
        else:
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY is not set.")
            _clients[provider] = AsyncOpenAI(api_key=api_key)
    return _clients[provider]


async def run_turn(
    model: str,
    messages: list[dict],
    tool_schemas: list[dict],
    tool_handlers: dict[str, callable],
    session,
    max_tool_hops: int = 4,
) -> tuple[str, list[dict]]:
    """Runs one assistant turn against `messages` (OpenAI chat format),
    executing any tool calls the model makes (each handler is called as
    `await handler(session, **arguments)`), and returns
    (final_reply_text, updated_messages) — `updated_messages` includes every
    assistant/tool message generated along the way, ready to append to the
    session's running transcript for the next turn.

    max_tool_hops bounds a runaway tool-call loop (a model repeatedly
    calling tools without ever producing a final reply) — matches the
    spirit of agent/tools.py's various best-effort guards elsewhere in this
    codebase: fail safe, never hang a live call indefinitely.
    """
    client = _get_client(model)
    working = list(messages)
    for _ in range(max_tool_hops):
        resp = await client.chat.completions.create(
            model=model,
            messages=working,
            tools=tool_schemas or None,
            tool_choice="auto" if tool_schemas else None,
        )
        choice = resp.choices[0]
        msg = choice.message
        working.append({"role": "assistant", "content": msg.content, "tool_calls": msg.tool_calls})
        if not msg.tool_calls:
            return (msg.content or "").strip(), working[len(messages):]
        for call in msg.tool_calls:
            name = call.function.name
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except ValueError:
                arguments = {}
            handler = tool_handlers.get(name)
            if handler is None:
                result = f"Unknown tool {name!r}."
            else:
                result = await handler(session, **arguments)
            working.append({"role": "tool", "tool_call_id": call.id, "content": str(result)})
    # Ran out of hops without a final reply — degrade honestly rather than
    # hang the call or return an empty response. Must append a closing
    # assistant message: otherwise `working` ends on a dangling 'tool'
    # message, and the next turn's OpenAI call 400s on invalid pairing.
    fallback_text = "Let me follow up on that in a moment."
    working.append({"role": "assistant", "content": fallback_text})
    return fallback_text, working[len(messages):]


def _pop_complete_sentence(buf: str) -> tuple[str, str]:
    """Splits off the first complete sentence from `buf` (ending in
    . ! ? or a newline, followed by whitespace) and returns
    (sentence, remainder). Force-flushes at the last space once `buf`
    passes _MAX_CHUNK_CHARS so one long unpunctuated run (a list, a run-on
    reply) still starts speaking promptly instead of waiting for a
    terminator that may never come this early in the stream.

    Skips a match immediately after a digit (a decimal point like "2.5",
    not a sentence end) and any match that would flush a fragment shorter
    than _MIN_CHUNK_CHARS — see _MIN_CHUNK_CHARS' docstring for why."""
    pos = 0
    while True:
        match = _SENTENCE_BREAK.search(buf, pos)
        if not match:
            break
        if buf[match.start()] == "." and match.start() > 0 and buf[match.start() - 1].isdigit():
            pos = match.end()
            continue
        if match.end() < _MIN_CHUNK_CHARS:
            pos = match.end()
            continue
        return buf[: match.end()].strip(), buf[match.end():]
    if len(buf) >= _MAX_CHUNK_CHARS:
        idx = buf.rfind(" ", 0, _MAX_CHUNK_CHARS)
        if idx > 0:
            return buf[:idx].strip(), buf[idx + 1:]
    return "", buf


async def stream_turn(
    model: str,
    messages: list[dict],
    tool_schemas: list[dict],
    tool_handlers: dict[str, callable],
    session,
    on_sentence: Callable[[str], Awaitable[None]],
    max_tool_hops: int = 4,
) -> tuple[str, list[dict]]:
    """Streams a plain (no-tool-call) reply sentence-by-sentence, calling
    `on_sentence(text)` — and therefore TTS — on each sentence the moment
    it's complete, instead of waiting for the whole reply to finish
    generating. This is what actually cuts perceived latency: the caller
    hears the first words while the model is still writing the rest.

    Tool calls can't be streamed usefully (the model needs the tool's
    result before it can keep going), so the instant the stream's first
    delta signals a tool call, this abandons streaming and falls back to
    run_turn()'s tested full round-trip loop — nothing will have been
    spoken yet at that point, since content and tool_calls don't interleave
    within one OpenAI streamed response. Returns (full_reply_text,
    updated_messages), same shape as run_turn.
    """
    client = _get_client(model)
    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        tools=tool_schemas or None,
        tool_choice="auto" if tool_schemas else None,
        stream=True,
    )
    pending = ""
    parts: list[str] = []
    first_delta = True
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if first_delta:
            first_delta = False
            if delta.tool_calls:
                reply_text, new_messages = await run_turn(
                    model, messages, tool_schemas, tool_handlers, session, max_tool_hops
                )
                if reply_text:
                    await on_sentence(reply_text)
                return reply_text, new_messages
        if delta.content:
            pending += delta.content
            sentence, pending = _pop_complete_sentence(pending)
            if sentence:
                parts.append(sentence)
                await on_sentence(sentence)
    tail = pending.strip()
    if tail:
        parts.append(tail)
        await on_sentence(tail)
    full_text = " ".join(parts)
    return full_text, [{"role": "assistant", "content": full_text}]
