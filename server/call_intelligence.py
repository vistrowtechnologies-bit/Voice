"""Conversation intelligence — one LLM pass over a finished call transcript.

Turns the raw transcript we already store into the things an operator actually
wants: a short summary, sentiment, a normalized outcome, an agent QA score, why
a lead didn't qualify, and follow-up actions. Same stdlib-urllib OpenAI call as
kb_extract (no openai package in the image), same cheap mini model — one call
per conversation, run on demand and cached on the calls row.
"""

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("call-intelligence")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
INTEL_MODEL = "gpt-4.1-mini"
MAX_TRANSCRIPT_CHARS = 30_000

# Normalized outcome vocabulary — a small closed set so the aggregate ROI
# dashboard can group across calls instead of drowning in free text.
OUTCOMES = ["qualified", "not_qualified", "callback", "not_interested", "wrong_number", "voicemail", "other"]
SENTIMENTS = ["positive", "neutral", "negative"]

_SYSTEM_PROMPT = """You analyze a single sales/support phone-call transcript between an AI voice agent and a customer, for an Indian business. Transcripts may mix English and Indian languages (Hindi, Tamil, etc.) — understand them but write your output in English.

Return ONLY a JSON object with exactly these keys:
- "summary": 2-3 sentence plain summary of what happened.
- "sentiment": one of "positive", "neutral", "negative" — the customer's overall mood.
- "outcome": one of "qualified", "not_qualified", "callback", "not_interested", "wrong_number", "voicemail", "other".
- "qa_score": integer 0-100 rating how well the AGENT handled the call (clarity, listening, staying on task, politeness, compliance). 100 = flawless.
- "disqualification_reason": if outcome is not "qualified", a short phrase why (e.g. "budget too low", "wrong location", "not decision maker"); else "".
- "key_points": array of up to 4 short bullet strings — the facts worth remembering.
- "action_items": array of up to 3 short next-step strings for the human team (e.g. "call back after 6pm", "send pricing on WhatsApp"); [] if none.

No prose outside the JSON."""


def _transcript_text(transcript: list[dict]) -> str:
    lines = []
    for turn in transcript or []:
        role = turn.get("role", "?")
        speaker = "Agent" if role in ("assistant", "agent") else "Customer"
        text = (turn.get("text") or turn.get("content") or "").strip()
        if text:
            lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def analyze_transcript(transcript: list[dict]) -> dict:
    """Returns the intelligence dict. Raises RuntimeError (human-readable) on
    any failure so the route can surface it — callers treat it as best-effort."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured on the server")

    text = _transcript_text(transcript)
    if len(text) < 20:
        raise RuntimeError("This call has too little conversation to analyze")
    if len(text) > MAX_TRANSCRIPT_CHARS:
        text = text[:MAX_TRANSCRIPT_CHARS]

    body = json.dumps(
        {
            "model": INTEL_MODEL,
            "response_format": {"type": "json_object"},
            "temperature": 0,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": f"Transcript:\n\n{text}"},
            ],
        }
    ).encode("utf-8")

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
        logger.error("intelligence failed (%s): %s", exc.code, detail)
        raise RuntimeError(f"Analysis model returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        logger.error("intelligence unreachable: %s", exc)
        raise RuntimeError("Could not reach the analysis model") from exc

    try:
        parsed = json.loads(payload["choices"][0]["message"]["content"])
    except (KeyError, IndexError, ValueError) as exc:
        raise RuntimeError("Analysis model returned an unexpected format") from exc

    return _normalize(parsed)


def _normalize(raw: dict) -> dict:
    """Clamp/whitelist the model's output so downstream aggregation can trust
    the shape regardless of what the model returned."""
    sentiment = str(raw.get("sentiment", "neutral")).lower()
    if sentiment not in SENTIMENTS:
        sentiment = "neutral"
    outcome = str(raw.get("outcome", "other")).lower()
    if outcome not in OUTCOMES:
        outcome = "other"
    try:
        qa = max(0, min(100, int(raw.get("qa_score", 0))))
    except (ValueError, TypeError):
        qa = 0
    def _strlist(v, limit):
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if str(x).strip()][:limit]
    return {
        "summary": str(raw.get("summary", "")).strip()[:1000],
        "sentiment": sentiment,
        "outcome": outcome,
        "qa_score": qa,
        "disqualification_reason": str(raw.get("disqualification_reason", "")).strip()[:200],
        "key_points": _strlist(raw.get("key_points"), 4),
        "action_items": _strlist(raw.get("action_items"), 3),
    }
