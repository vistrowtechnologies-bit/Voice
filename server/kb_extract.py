"""Auto-extract draft Q&A pairs from a knowledge source's raw text.

One OpenAI chat call turns a pasted brochure / extracted PDF into structured
question-answer pairs the operator reviews in the dashboard before saving —
extraction is deliberately review-first, never auto-published, because an LLM
reading a design-heavy price sheet occasionally misreads a number and a wrong
price must never reach a live agent unreviewed.

Uses stdlib urllib rather than the openai package: the server venv/image only
ships fastapi+livekit-api, and one JSON POST doesn't justify a new dependency.
"""

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("kb-extract")

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
# Mini is plenty for structured extraction and ~10x cheaper than gpt-4.1 —
# this runs on whole brochures (tens of thousands of input tokens).
EXTRACT_MODEL = "gpt-4.1-mini"
# Brochure text beyond this is truncated to keep one extraction cheap and
# well under the model context; ~60k chars ≈ 15k tokens.
MAX_SOURCE_CHARS = 60_000

_SYSTEM_PROMPT = """You extract FAQ-style question/answer pairs from real business documents \
(real-estate brochures, price sheets, service catalogs) for a voice agent's knowledge base.

Rules:
- Extract 8-20 pairs covering the facts a caller actually asks about: prices, sizes, \
location/distances, amenities, legal status (RERA, 7/12, NA), payment plans, possession dates, \
contact details.
- Each answer must be 1-2 short spoken-style sentences, complete on its own, and contain ONLY \
facts stated in the document. Never invent, round, or "improve" a number.
- Copy prices, dates, measurements and registration numbers EXACTLY as written, including \
currency symbols and units.
- Write questions the way a caller would ask them ("What's the starting price?", not \
"Pricing information").
- If the document has both English and an Indian language, write the pairs in English but keep \
proper nouns / project names as-is.
- Return ONLY a JSON object: {"pairs": [{"question": "...", "answer": "..."}, ...]}. No prose."""


def extract_qa_pairs(source_name: str, content: str) -> list[dict]:
    """Returns [{"question", "answer"}, ...] drafts. Raises RuntimeError with a
    human-readable message on any failure so the API route can 502 it."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured on the server")

    text = (content or "").strip()
    if len(text) < 40:
        raise RuntimeError("This source has almost no text to extract from")
    if len(text) > MAX_SOURCE_CHARS:
        logger.info("truncating source '%s' from %d to %d chars", source_name, len(text), MAX_SOURCE_CHARS)
        text = text[:MAX_SOURCE_CHARS]

    body = json.dumps(
        {
            "model": EXTRACT_MODEL,
            "response_format": {"type": "json_object"},
            "temperature": 0,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": f"Document: {source_name}\n\n{text}"},
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
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        logger.error("OpenAI extraction failed (%s): %s", exc.code, detail)
        raise RuntimeError(f"Extraction model returned HTTP {exc.code}") from exc
    except urllib.error.URLError as exc:
        logger.error("OpenAI extraction unreachable: %s", exc)
        raise RuntimeError("Could not reach the extraction model") from exc

    try:
        parsed = json.loads(payload["choices"][0]["message"]["content"])
        pairs = parsed["pairs"]
        assert isinstance(pairs, list)
    except (KeyError, IndexError, ValueError, AssertionError) as exc:
        logger.error("unexpected extraction payload: %s", str(payload)[:500])
        raise RuntimeError("Extraction model returned an unexpected format") from exc

    cleaned = [
        {"question": str(p.get("question", "")).strip(), "answer": str(p.get("answer", "")).strip()}
        for p in pairs
        if isinstance(p, dict) and str(p.get("question", "")).strip() and str(p.get("answer", "")).strip()
    ]
    if not cleaned:
        raise RuntimeError("No Q&A pairs could be extracted from this source")
    logger.info("extracted %d Q&A pairs from '%s'", len(cleaned), source_name)
    return cleaned
