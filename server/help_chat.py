"""Answers a single turn of the in-dashboard help chatbot, grounded in
help_content.HELP_DOC plus live account data via OpenAI function-calling
(see help_tools.py) — e.g. "how many leads did we get today" gets a real
number, not a generic "check the Calls page" deflection.

Same stdlib-urllib OpenAI call as kb_extract/call_intelligence (no openai
package in the image), same cheap mini model — one call per user message
(or two, if the model calls a tool), multi-turn via a messages array
instead of single-shot JSON extraction.
"""

import json
import logging
import os
import urllib.error
import urllib.request

from help_content import HELP_DOC
from help_tools import TOOL_FUNCTIONS, TOOL_SCHEMAS

logger = logging.getLogger("help-chat")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
CHAT_MODEL = "gpt-4.1-mini"
# Cap history sent to the model — this is a support-chat panel, not a
# long-running conversation; the last few turns are enough context.
MAX_HISTORY_TURNS = 6
MAX_MESSAGE_CHARS = 2_000

_SYSTEM_PROMPT_BASE = f"""You are the help assistant embedded in the Vistrow Voice dashboard — a \
small text chat panel, not the voice product. You help logged-in users understand and use the \
platform. Answer in plain text, no markdown headers, at most a short paragraph or a few bullet \
points.

You have tools that read this account's real data (calls, leads, contacts, credits) — call one \
whenever the question needs an actual number or a live fact instead of general product info. \
Never guess or estimate a number that a tool could answer.

{HELP_DOC}"""

# Human-readable label for the current page, shown to the model so it can
# reference where the user is (mirrors the sidebar section names in
# HELP_DOC) — keys are route prefixes, checked longest-first by the caller.
_PAGE_LABELS: dict[str, str] = {
    "/dashboard/calls": "All Calls History",
    "/dashboard/contacts": "Contacts",
    "/dashboard/billing": "Billing",
    "/dashboard/agents": "Agents",
    "/dashboard/voices": "Voices",
    "/dashboard/knowledge": "Knowledge Base",
    "/dashboard/inbound": "Inbound",
    "/dashboard/outbound": "Outbound",
    "/dashboard/integrations": "Integrations",
    "/dashboard/numbers": "Phone Numbers",
    "/dashboard/compliance": "Compliance",
    "/dashboard/settings": "Settings",
    "/dashboard": "Dashboard",
}


def _page_label(current_page: str | None) -> str | None:
    if not current_page:
        return None
    for prefix in sorted(_PAGE_LABELS, key=len, reverse=True):
        if current_page.startswith(prefix):
            return _PAGE_LABELS[prefix]
    return None


def _post_chat(api_key: str, body: dict) -> dict:
    request = urllib.request.Request(
        OPENAI_CHAT_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        logger.error("OpenAI help-chat call failed (%s): %s", exc.code, detail)
        raise RuntimeError(f"Help chat model returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        logger.error("OpenAI help-chat call unreachable: %s", exc)
        raise RuntimeError("Could not reach the help chat model") from exc


def answer_help_question(
    message: str, history: list[dict], account_id: int, current_page: str | None = None
) -> str:
    """history is [{"role": "user"|"assistant", "content": "..."}, ...] in
    chronological order. Raises RuntimeError with a human-readable message
    on any failure so the API route can 502 it."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured on the server")

    text = (message or "").strip()
    if not text:
        raise RuntimeError("Message is empty")
    text = text[:MAX_MESSAGE_CHARS]

    trimmed_history = [
        {"role": turn.get("role"), "content": str(turn.get("content", ""))[:MAX_MESSAGE_CHARS]}
        for turn in (history or [])[-MAX_HISTORY_TURNS:]
        if turn.get("role") in ("user", "assistant") and str(turn.get("content", "")).strip()
    ]

    page_label = _page_label(current_page)
    system_prompt = _SYSTEM_PROMPT_BASE
    if page_label:
        system_prompt += f"\n\nThe user is currently viewing: {page_label}."

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        *trimmed_history,
        {"role": "user", "content": text},
    ]

    payload = _post_chat(
        api_key,
        {"model": CHAT_MODEL, "temperature": 0.3, "messages": messages, "tools": TOOL_SCHEMAS, "tool_choice": "auto"},
    )

    try:
        choice_message = payload["choices"][0]["message"]
    except (KeyError, IndexError) as exc:
        logger.error("unexpected help-chat payload: %s", str(payload)[:500])
        raise RuntimeError("Help chat model returned an unexpected format") from exc

    tool_calls = choice_message.get("tool_calls") or []
    if tool_calls:
        # Single round: run every requested tool, feed results back, ask
        # once more for the final natural-language answer. No further tool
        # calls are honored — this is a lightweight panel, not an agent loop.
        messages.append(choice_message)
        for call in tool_calls:
            name = call.get("function", {}).get("name", "")
            try:
                args = json.loads(call.get("function", {}).get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            fn = TOOL_FUNCTIONS.get(name)
            result = fn(account_id, **args) if fn else {"error": f"unknown tool {name}"}
            messages.append(
                {"role": "tool", "tool_call_id": call.get("id", ""), "content": json.dumps(result)}
            )
        payload = _post_chat(api_key, {"model": CHAT_MODEL, "temperature": 0.3, "messages": messages})
        try:
            choice_message = payload["choices"][0]["message"]
        except (KeyError, IndexError) as exc:
            logger.error("unexpected help-chat follow-up payload: %s", str(payload)[:500])
            raise RuntimeError("Help chat model returned an unexpected format") from exc

    reply = (choice_message.get("content") or "").strip()
    if not reply:
        raise RuntimeError("Help chat model returned an empty reply")
    return reply
