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
# gpt-4o-mini over gpt-4.1-mini specifically for this path — first-token
# latency matters more than anything else here (a website visitor watching
# a typing indicator), and 4o-mini is the faster of the two at this size.
DEFAULT_CHAT_MODEL = "gpt-4o-mini"
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


def _stream_chat(api_key: str, body: dict):
    """Yields text deltas from an OpenAI streaming chat completion as they
    arrive. urllib's response object is a file-like stream, so this reads it
    line-by-line rather than buffering the whole body like _post_chat does —
    that buffering is exactly what streaming is meant to avoid."""
    request = urllib.request.Request(
        OPENAI_CHAT_URL,
        data=json.dumps({**body, "stream": True}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            for raw_line in response:
                line = raw_line.decode("utf-8", "replace").strip()
                if not line or not line.startswith("data:"):
                    continue
                data = line[len("data:"):].strip()
                if data == "[DONE]":
                    return
                try:
                    chunk = json.loads(data)
                except ValueError:
                    continue
                delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
                if delta:
                    yield delta
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        logger.error("OpenAI widget-chat stream failed (%s): %s", exc.code, detail)
        raise RuntimeError(f"Chat model returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        logger.error("OpenAI widget-chat stream unreachable: %s", exc)
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


def _prepare_messages(message: str, history: list[dict], agent: dict, kb_content: str, kb_strict: bool) -> list[dict]:
    text = (message or "").strip()
    if not text:
        raise RuntimeError("Message is empty")
    text = text[:MAX_MESSAGE_CHARS]

    trimmed_history = [
        {"role": turn.get("role"), "content": str(turn.get("content", ""))[:MAX_MESSAGE_CHARS]}
        for turn in (history or [])[-MAX_HISTORY_TURNS:]
        if turn.get("role") in ("user", "assistant") and str(turn.get("content", "")).strip()
    ]

    return [
        {"role": "system", "content": _build_system_prompt(agent, kb_content, kb_strict)},
        *trimmed_history,
        {"role": "user", "content": text},
    ]


def answer_widget_chat(message: str, history: list[dict], agent: dict, kb_content: str, kb_strict: bool) -> str:
    """history is [{"role": "user"|"assistant", "content": "..."}, ...] in
    chronological order. Raises RuntimeError with a human-readable message
    on any failure so the API route can surface it cleanly."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured on the server")

    messages = _prepare_messages(message, history, agent, kb_content, kb_strict)

    # Always the cheapest/fastest OpenAI chat model, deliberately ignoring the
    # agent's own configured voice model (which may be gpt-4.1/gpt-4o) -
    # chat-only mode exists specifically to cut cost and latency, so it
    # shouldn't inherit a model choice made for voice quality.
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


def stream_widget_chat(message: str, history: list[dict], agent: dict, kb_content: str, kb_strict: bool):
    """Same as answer_widget_chat, but yields text deltas as they arrive
    instead of returning the full reply at once — lets the widget render
    tokens as they're generated rather than waiting for the whole
    completion, which is most of what "the chat feels slow" actually is."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured on the server")

    messages = _prepare_messages(message, history, agent, kb_content, kb_strict)
    yield from _stream_chat(api_key, {"model": DEFAULT_CHAT_MODEL, "temperature": 0.4, "messages": messages})
