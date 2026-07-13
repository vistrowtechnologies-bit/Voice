"""Answers a single turn of the in-dashboard help chatbot, grounded in
help_content.HELP_DOC.

Same stdlib-urllib OpenAI call as kb_extract/call_intelligence (no openai
package in the image), same cheap mini model — one call per user message,
multi-turn via a messages array instead of single-shot JSON extraction.
"""

import json
import logging
import os
import urllib.error
import urllib.request

from help_content import HELP_DOC

logger = logging.getLogger("help-chat")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
CHAT_MODEL = "gpt-4.1-mini"
# Cap history sent to the model — this is a support-chat panel, not a
# long-running conversation; the last few turns are enough context.
MAX_HISTORY_TURNS = 6
MAX_MESSAGE_CHARS = 2_000

_SYSTEM_PROMPT = f"""You are the help assistant embedded in the Vistrow Voice dashboard — a \
small text chat panel, not the voice product. You help logged-in users understand and use the \
platform. Answer in plain text, no markdown headers, at most a short paragraph or a few bullet \
points.

{HELP_DOC}"""


def answer_help_question(message: str, history: list[dict]) -> str:
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

    messages = [{"role": "system", "content": _SYSTEM_PROMPT}, *trimmed_history, {"role": "user", "content": text}]

    body = json.dumps({"model": CHAT_MODEL, "temperature": 0.3, "messages": messages}).encode("utf-8")

    request = urllib.request.Request(
        OPENAI_CHAT_URL,
        data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        logger.error("OpenAI help-chat call failed (%s): %s", exc.code, detail)
        raise RuntimeError(f"Help chat model returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        logger.error("OpenAI help-chat call unreachable: %s", exc)
        raise RuntimeError("Could not reach the help chat model") from exc

    try:
        reply = payload["choices"][0]["message"]["content"].strip()
        assert reply
    except (KeyError, IndexError, ValueError, AssertionError) as exc:
        logger.error("unexpected help-chat payload: %s", str(payload)[:500])
        raise RuntimeError("Help chat model returned an unexpected format") from exc

    return reply
