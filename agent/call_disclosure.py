"""The spoken "this call is recorded / you are talking to an AI" line.

Until 2026-10-14 nothing told a phone caller either fact unless the tenant
wrote it into their own welcome message (docs/PRIVACY-AUDIT-2026-10-12.md,
gap 7). Now, whenever the account records calls, the opening line carries a
short disclosure in the call's language. Owners control it from Compliance:
`announce_recording` (default on, including for accounts whose stored config
predates the key) and `recording_notice` (their own wording; "" = the
built-in line below).

Text only: the line is folded into the opener the agent already speaks, so
no extra TTS request or pipeline change is involved.
"""

import re

# Kept short on purpose: it is spoken before the caller's first turn.
DEFAULT_NOTICES = {
    "hi": "यह कॉल रिकॉर्ड हो रही है और आप AI असिस्टेंट से बात कर रहे हैं।",
    "en": "Just so you know, this call is recorded and I'm an AI assistant.",
}

# An opener that already talks about recording was written by an owner who
# disclosed it themselves; adding ours would say it twice.
_MENTIONS_RECORDING = re.compile(r"record|रिकॉर्ड|रेकॉर्ड", re.IGNORECASE)
# Sentence ends (Latin and Devanagari danda) and the " — " the built-in
# English openers use between the greeting and "how can I help you".
_BOUNDARY = re.compile(r"(?<=[.!?।])\s+|\s+—\s+")
_ENDS_SENTENCE = re.compile(r"[.!?।]$")


def recording_disclosure(compliance: dict | None, reply_language: str, is_platform_demo: bool = False) -> str:
    """The sentence to speak, or "" when nothing should be announced.

    Only while the account records calls: an account with recording off
    must never hear "this call is recorded". The marketing demo is left out
    (its widget shows a written notice and consent screen first, and its
    pre-rendered greetings are cached audio)."""
    compliance = compliance or {}
    if is_platform_demo or not compliance.get("record_calls"):
        return ""
    if not compliance.get("announce_recording", True):
        return ""
    custom = " ".join(str(compliance.get("recording_notice") or "").split())
    if custom:
        return custom
    lang = (reply_language or "").lower()
    return DEFAULT_NOTICES["hi"] if lang.startswith("hi") else DEFAULT_NOTICES["en"]


def mentions_recording(text: str) -> bool:
    return bool(_MENTIONS_RECORDING.search(text or ""))


def with_disclosure(opener: str, disclosure: str) -> str:
    """Fold the disclosure into an opening line.

    It goes just before a closing question ("how can I help you?") so the
    caller is still answering the question, not the disclosure; otherwise it
    is appended. Unchanged when there is nothing to say or the opener already
    mentions recording."""
    opener = (opener or "").strip()
    if not disclosure or not opener or mentions_recording(opener):
        return opener
    if opener.endswith("?"):
        boundaries = list(_BOUNDARY.finditer(opener))
        if boundaries:
            last = boundaries[-1]
            head, tail = opener[: last.start()].rstrip(), opener[last.end():].lstrip()
            if not _ENDS_SENTENCE.search(head):
                head += "."
            if tail[:1].isascii():
                tail = tail[:1].upper() + tail[1:]
            return f"{head} {disclosure} {tail}"
    if not _ENDS_SENTENCE.search(opener):
        opener += "."
    return f"{opener} {disclosure}"


def instruction(disclosure: str) -> str:
    """For openings the model words itself (no fixed opener to edit)."""
    if not disclosure:
        return ""
    return (
        " In that same opening, also tell them, in their language and in a few words, that this call "
        f"is recorded and that they are speaking with an AI assistant, for example: \"{disclosure}\""
    )
