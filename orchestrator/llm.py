"""LLM turn-taking — direct OpenAI Chat Completions call with function-calling,
replacing livekit-agents' openai.LLM plugin wrapper. Tool-calling shape
mirrors server/help_chat.py's existing OpenAI function-calling pattern
(TOOL_SCHEMAS/TOOL_FUNCTIONS passed straight into `tools=`).

Only OpenAI is implemented for Phase 1. agent/main.py's _build_llm also
supports a "gemini"-prefixed model via livekit.plugins.google — porting
that is deferred until an agent config actually needs it live, rather than
half-implementing a second provider now; model_name here is expected to be
a plain OpenAI model id (e.g. "gpt-4o-mini").
"""

from __future__ import annotations

import json
import os

from openai import AsyncOpenAI

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set.")
        _client = AsyncOpenAI(api_key=api_key)
    return _client


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
    client = _get_client()
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
    # hang the call or return an empty response.
    return "Let me follow up on that in a moment.", working[len(messages):]
