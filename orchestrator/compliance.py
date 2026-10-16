"""Compliance gates for the orchestrator pipeline: Do-Not-Call list,
calling window, and the recording settings.

The LiveKit path enforces these in server/calls_db.py (check_call_allowed,
before every dial) and agent/ (record_calls, announce_recording). Calls
placed through this service skipped all of it: the dashboard's "Call now",
its test-call button and the campaign dialer POST straight to
/telephony/enablex/outbound-test-call, and every call here was recorded and
uploaded whatever the tenant had set. This service is built from its own
folder and cannot import server/ or agent/, so the rules are reproduced here.

Settings are the same row server/calls_db.py owns: settings key
'compliance.config' (one JSON blob per account), merged over the defaults
below exactly as calls_db.get_compliance does.
"""

from __future__ import annotations

import datetime
import json
import logging
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import dbconn

logger = logging.getLogger("orchestrator-compliance")

# Mirrors server/calls_db.py's _COMPLIANCE_DEFAULTS (the keys this module
# reads). Keep in step with it.
_COMPLIANCE_DEFAULTS = {
    "enforce_window": True,
    "window_start": "09:00",
    "window_end": "21:00",
    "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    "timezone": "Asia/Kolkata",
    "honor_dnc": True,
    "require_consent": False,
    "record_calls": False,
    "announce_recording": True,
    "recording_notice": "",
}
_DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def get_compliance(account_id: int) -> dict:
    """calls_db.get_compliance: the stored blob merged over the defaults.
    Raises on a DB failure — each caller decides which way to fail."""
    conn = dbconn.connect()
    try:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = 'compliance.config' AND account_id = ?",
            (account_id,),
        ).fetchone()
    finally:
        conn.close()
    cfg = dict(_COMPLIANCE_DEFAULTS)
    if row and row["value"]:
        try:
            stored = json.loads(row["value"])
            if isinstance(stored, dict):
                cfg.update({k: v for k, v in stored.items() if k in _COMPLIANCE_DEFAULTS})
        except (ValueError, TypeError):
            pass
    return cfg


def within_calling_window(cfg: dict, at: datetime.datetime | None = None) -> tuple[bool, str]:
    """calls_db.within_calling_window, given an already-read config."""
    if not cfg.get("enforce_window", True):
        return True, ""
    try:
        tz = ZoneInfo(cfg.get("timezone") or "Asia/Kolkata")
    except Exception:
        tz = ZoneInfo("Asia/Kolkata")
    now = (at or datetime.datetime.now(datetime.timezone.utc)).astimezone(tz)
    day = _DAY_ABBR[now.weekday()]
    active = cfg.get("active_days") or _COMPLIANCE_DEFAULTS["active_days"]
    if day not in active:
        return False, f"Outside allowed calling days ({', '.join(active)}) — today is {day}."
    start_s, end_s = str(cfg.get("window_start") or ""), str(cfg.get("window_end") or "")
    if not (_HHMM.match(start_s) and _HHMM.match(end_s)):
        start_s, end_s = _COMPLIANCE_DEFAULTS["window_start"], _COMPLIANCE_DEFAULTS["window_end"]
    sh, sm = (int(x) for x in start_s.split(":"))
    eh, em = (int(x) for x in end_s.split(":"))
    start = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
    end = now.replace(hour=eh, minute=em, second=0, microsecond=0)
    if start <= now <= end:
        return True, ""
    win = f"{cfg.get('window_start')}–{cfg.get('window_end')} {cfg.get('timezone')}"
    return False, f"Outside the allowed calling window ({win})."


def is_dnc(account_id: int, phone: str) -> bool:
    """Is `phone` on this account's Do-Not-Call list?

    calls_db.is_dnc compares phone_format.match_key (libphonenumber E.164 in
    the account's country) against dnc_list.phone_norm. libphonenumber is
    not in this service's image, so this matches on a superset instead:
    the stored key equals one of the forms the number can take, or — for a
    number of 10+ digits — its last 10 digits equal the number's (the same
    tail rule env_guard uses). Every number match_key would match is still
    matched; the only extra matches are numbers sharing their last 10 digits
    with a listed one, which errs towards not calling.
    """
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if not digits:
        return False
    keys = {digits, "+" + digits}
    if str(phone).strip().startswith("00"):
        keys.add("+" + digits[2:])
    tail = digits[-10:] if len(digits) >= 10 else ""
    conn = dbconn.connect()
    try:
        row = conn.execute(
            "SELECT 1 FROM dnc_list WHERE account_id = ? AND (phone_norm = ANY(?) "
            "OR (? <> '' AND right(regexp_replace(phone_norm, '[^0-9]', '', 'g'), 10) = ?)) LIMIT 1",
            (account_id, sorted(keys), tail, tail),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def check_call_allowed(account_id: int, phone: str) -> tuple[bool, str]:
    """calls_db.check_call_allowed: DNC first, then the calling window.
    Raises on a DB failure; the dial endpoint refuses the call then."""
    cfg = get_compliance(account_id)
    if cfg.get("honor_dnc", True) and is_dnc(account_id, phone):
        return False, "This number is on your Do-Not-Call list."
    return within_calling_window(cfg)


# --- Recording --------------------------------------------------------------

def recording_config(account_id: int | None) -> dict:
    """Compliance config for the recording decisions, failing closed like
    agent/db.py's get_compliance_config: a DB problem means recording OFF
    (and so no announcement), never an unconsented recording."""
    if not account_id:
        return dict(_COMPLIANCE_DEFAULTS)
    try:
        return get_compliance(account_id)
    except Exception:
        logger.exception("could not read compliance config for account %s; not recording", account_id)
        return dict(_COMPLIANCE_DEFAULTS)


def records_call(cfg: dict) -> bool:
    """record_calls, except while "Require spoken consent" is on.

    agent/ asks for consent through the LLM and logs the answer with its
    record_consent tool; this pipeline has neither, so a caller here is
    never asked. Recording them anyway would be recording without the
    consent the owner said is required, so the safe default is to not
    record such calls at all."""
    return bool(cfg.get("record_calls")) and not cfg.get("require_consent")


class _NoRecorder:
    """Stands in for recording.CallRecorder when the call must not be
    recorded: drops audio, and stop() returns no file, so nothing uploads."""

    def append_caller_audio(self, pcm16_mono: bytes) -> None:
        pass

    def append_agent_audio(self, pcm16_mono: bytes) -> None:
        pass

    def stop(self) -> None:
        return None


def call_recorder(cfg: dict, recorder_factory):
    return recorder_factory() if records_call(cfg) else _NoRecorder()


# The spoken "this call is recorded / you are talking to an AI" line — a copy
# of agent/call_disclosure.py (recording_disclosure, with_disclosure,
# instruction). Keep the two in step.
DEFAULT_NOTICES = {
    "hi": "यह कॉल रिकॉर्ड हो रही है और आप AI असिस्टेंट से बात कर रहे हैं।",
    "en": "Just so you know, this call is recorded and I'm an AI assistant.",
}
_MENTIONS_RECORDING = re.compile(r"record|रिकॉर्ड|रेकॉर्ड", re.IGNORECASE)
_BOUNDARY = re.compile(r"(?<=[.!?।])\s+|\s+—\s+")
_ENDS_SENTENCE = re.compile(r"[.!?।]$")


def recording_disclosure(cfg: dict | None, reply_language: str, is_platform_demo: bool = False) -> str:
    """The sentence to speak, or "" — only while this call is actually
    recorded (records_call), so a caller never hears "this call is recorded"
    on a call that isn't."""
    cfg = cfg or {}
    if is_platform_demo or not records_call(cfg):
        return ""
    if not cfg.get("announce_recording", True):
        return ""
    custom = " ".join(str(cfg.get("recording_notice") or "").split())
    if custom:
        return custom
    lang = (reply_language or "").lower()
    return DEFAULT_NOTICES["hi"] if lang.startswith("hi") else DEFAULT_NOTICES["en"]


def with_disclosure(opener: str, disclosure: str) -> str:
    """Fold the disclosure into an opening line, before a closing question
    when there is one; unchanged when the opener already mentions recording."""
    opener = (opener or "").strip()
    if not disclosure or not opener or _MENTIONS_RECORDING.search(opener):
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


def first_reply_instruction(disclosure: str) -> str:
    """agent/main.py's _disclosure_first_reply_instructions: an agent set to
    let the caller speak first has no opener, so its first reply says it."""
    if not disclosure:
        return ""
    return (
        "\n\n# Recording notice\n"
        "In your very first reply, before anything else, tell the caller in a few words, in their "
        f"language, that this call is recorded and that they are speaking with an AI assistant, "
        f"for example: \"{disclosure}\". Say it once only."
    )
