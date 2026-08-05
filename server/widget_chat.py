"""Answers a single turn of the embeddable widget's text-chat mode -
grounded in the site's own configured agent (its persona/instructions and
knowledge base), not a fixed help-bot persona. Same shape as help_chat.py
(stateless: the caller resends the full history each turn) but built
against a customer's agent config instead of HELP_DOC.

Deliberately no tool-calling in this first version - a customer's voice
agent can book appointments and capture leads via agent/tools.py's
LiveKit-bound handlers, which assume a live call context (ctx.room, a
warm LiveKit session) this plain HTTP request/response flow doesn't have.
Wiring that up is real follow-on work; this ships grounded Q&A now rather
than waiting on it.
"""

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("widget-chat")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_CHAT_MODEL = "gpt-4.1-mini"
MAX_HISTORY_TURNS = 12
MAX_MESSAGE_CHARS = 2_000


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
        logger.error("OpenAI widget-chat call failed (%s): %s", exc.code, detail)
        raise RuntimeError(f"Chat model returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        logger.error("OpenAI widget-chat call unreachable: %s", exc)
        raise RuntimeError("Could not reach the chat model") from exc


def _build_system_prompt(agent: dict, kb_content: str, kb_strict: bool) -> str:
    persona = (agent.get("systemPrompt") or "").strip()
    base = persona or "You are a helpful assistant for this business, answering questions from a website visitor."
    prompt = (
        f"{base}\n\n"
        "You're answering in a text chat widget on this business's website, not a phone call - "
        "keep replies short and conversational, a sentence or two, no markdown formatting."
    )
    if kb_content:
        if kb_strict:
            prompt += (
                "\n\nThe knowledge base below is your ONLY source for concrete facts about this "
                "business - prices, hours, policies, specifics. Don't guess or make up details it "
                "doesn't cover; if it's missing something, say you'll have the team follow up.\n\n"
                f"{kb_content}"
            )
        else:
            prompt += f"\n\nBackground on this business:\n\n{kb_content}"
    return prompt


def answer_widget_chat(message: str, history: list[dict], agent: dict, kb_content: str, kb_strict: bool) -> str:
    """history is [{"role": "user"|"assistant", "content": "..."}, ...] in
    chronological order. Raises RuntimeError with a human-readable message
    on any failure so the API route can surface it cleanly."""
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

    messages: list[dict] = [
        {"role": "system", "content": _build_system_prompt(agent, kb_content, kb_strict)},
        *trimmed_history,
        {"role": "user", "content": text},
    ]

    # Always the cheapest OpenAI chat model, deliberately ignoring the
    # agent's own configured voice model (which may be gpt-4.1/gpt-4o) -
    # chat-only mode exists specifically to cut cost, so it shouldn't
    # inherit an expensive model choice made for voice quality.
    payload = _post_chat(api_key, {"model": DEFAULT_CHAT_MODEL, "temperature": 0.4, "messages": messages})

    try:
        choice_message = payload["choices"][0]["message"]
    except (KeyError, IndexError) as exc:
        logger.error("unexpected widget-chat payload: %s", str(payload)[:500])
        raise RuntimeError("Chat model returned an unexpected format") from exc

    reply = (choice_message.get("content") or "").strip()
    if not reply:
        raise RuntimeError("Chat model returned an empty reply")
    return reply
