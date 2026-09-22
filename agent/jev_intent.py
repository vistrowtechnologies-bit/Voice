"""Second opinion on "did the caller ask for a person", from a decision model.

transfer_intent.py decides this from the words themselves, and on 95 real
utterances taken from our own transcripts it catches 11 of 17 genuine requests
(recall 0.65, precision 0.85). Its misses are all one shape — a request to be
connected with no person-word in the sentence, which a token matcher cannot
see:

    जी कनेक्ट कीजिए मुझे आप।
    नहीं, आप कॉल ट्रांसफर कीजिए डायरेक्ट मेरा।
    क्या आप मुझे कनेक्ट कर सकते हो शिवमन के साथ?

Measured on the same 95 utterances (2026-09-22), Jev catches all 17 at a 0.60
threshold with one false alarm, and rejects every one of the 78 hard negatives
that share the same vocabulary — the eleven "मेरा दोस्त बन के बात कर" variants
all score 0.05-0.10. A single-utterance re-run of the decisive cases agreed
within ±0.05, so the batched figure was not an artefact of batching.

THIS RUNS ON THE CRITICAL PATH. on_user_turn_completed awaits the handoff
check before the model gets the turn, so every millisecond here is silence the
caller hears. Three rules follow from that, and none of them are optional:

  1. transfer_intent runs first and costs nothing. Jev is only asked when the
     regex is silent AND the utterance contains a connect/transfer word.
     Across all 5,063 user turns we have on record that is 9 turns — 0.18%,
     about one turn in 562. The wider net (including "बात कर") would send 56
     of 78 negatives here for no recall gain, which is why it is not used.
  2. One attempt, hard timeout, no retries. A 429 from a busy carrier of a
     model is not worth a second of dead air.
  3. Every failure means False — the exact behaviour we have today. A model
     that is down, throttled, slow or talking nonsense must never be able to
     make the agent worse than it was before this file existed.

Inert unless JEV_API_KEY is set, so nothing changes on a deployment that has
not opted in.
"""

import asyncio
import logging
import os
import re

logger = logging.getLogger(__name__)

_API_URL = os.environ.get("JEV_API_URL", "https://www.jevai.org/api/v1/decisions")
_THRESHOLD = float(os.environ.get("JEV_INTENT_THRESHOLD", "0.60") or 0.60)
_TIMEOUT_S = float(os.environ.get("JEV_TIMEOUT_MS", "1500") or 1500) / 1000.0

# Only these utterances are worth a network call. Deliberately narrower than
# transfer_intent's own vocabulary: no "बात कर", which appears in 56 of our 78
# hard negatives ("मेरा दोस्त बन के बात कर", "हिंदी में बात कर सकते हैं") and in
# none of the requests the regex actually misses.
#
# The boundaries are not decoration. Without them "Location or connectivity."
# matches on "connect" and "जोड़ी बना दो।" (make a pair) matches on "जोड़" —
# both real turns from our transcripts, and both a wasted second of the
# caller's time. Jev scores them 0.42 and 0.30, so they were never going to
# cause a wrong transfer; they were going to cause silence for nothing.
_WORTH_ASKING = re.compile(
    r"\bconnect(?:s|ed|ing)?\b|\btransfer(?:s|ed|ring)?\b|\bpatch\b"
    r"|\bforward\b|\bput\s+me\b"
    r"|कनेक्ट|कनैक्ट|कनेक|कमेंट|ट्रांसफर|ट्रान्सफर|जोड़(?!ी)",
    re.IGNORECASE,
)

_QUESTION = (
    "The caller is asking to be connected or transferred to a human being right "
    "now — a real person, an agent, a representative, the sales team, or a named "
    "colleague. Asking the assistant to switch language, to act friendly like a "
    "friend, to demonstrate an emotion, asking whether the assistant is an AI or "
    "a human, stating the size of their own team, or saying they will talk later "
    "are NOT requests to be connected to a human."
)


def worth_asking(text: str) -> bool:
    """Cheap, synchronous gate — is this utterance even a candidate?"""
    if not text:
        return False
    cleaned = " ".join(str(text).split())
    # Same ceiling transfer_intent uses: a monologue is not a request.
    if not cleaned or len(cleaned) > 300:
        return False
    return bool(_WORTH_ASKING.search(cleaned))


async def asks_for_human(text: str) -> bool:
    """True only when Jev is confident this utterance is a handoff request.

    Returns False for every other outcome, including every failure: no key,
    not a candidate, throttled, timed out, malformed reply, or below the
    threshold. The caller can treat False as "carry on exactly as before".
    """
    key = os.environ.get("JEV_API_KEY")
    if not key or not worth_asking(text):
        return False

    try:
        import aiohttp
    except ImportError:
        return False

    body = {
        "state": "Caller said on a live phone call with an AI voice agent: " + text,
        "questions": {"wants_human": {"type": "noul", "instructions": _QUESTION}},
    }
    try:
        timeout = aiohttp.ClientTimeout(total=_TIMEOUT_S)
        async with aiohttp.ClientSession(timeout=timeout) as http:
            async with http.post(
                _API_URL, json=body, headers={"Authorization": "Bearer " + key}
            ) as response:
                if response.status != 200:
                    logger.info("jev declined to answer: HTTP %s", response.status)
                    return False
                payload = await response.json()
    except asyncio.TimeoutError:
        logger.info("jev did not answer within %.0fms", _TIMEOUT_S * 1000)
        return False
    except Exception:
        logger.warning("jev lookup failed", exc_info=True)
        return False

    try:
        score = float(payload["data"]["answers"]["wants_human"]["noul"])
    except (KeyError, TypeError, ValueError):
        logger.warning("jev returned an unusable answer: %r", str(payload)[:200])
        return False

    logger.info("jev wants_human=%.2f for %r", score, (text or "")[:60])
    return score >= _THRESHOLD
