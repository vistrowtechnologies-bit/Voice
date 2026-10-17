"""Call-time resolution of a customer's cloned voice ("custom:vv_<id>").

server/custom_voices.py creates the clone (ElevenLabs and/or Sarvam) and
picks engine_default. Here the stored agent voice becomes the speaker string
_build_tts understands:
  - ElevenLabs clone -> "elevenlabs:<voice_id>" (Flash v2.5 path, unchanged)
  - Sarvam clone     -> SARVAM_CLONE_PREFIX + <voice_id> (SarvamCloneTTS)
The other engine is tried if the default one has no id or key. Anything
else - deleted, not ready, other account's id, DB down, no keys, a plan that
no longer includes cloned voices, or this worker already running its limit
of Sarvam clone calls - falls back to a stock voice of the clone's gender
with a warning: a call never fails over a clone.

The call record keeps "custom:..." (billing: standard voice tier) and the
AI disclosure is forced on for these calls (call_disclosure).
"""

from __future__ import annotations

import errno
import fcntl
import logging
import os
import tempfile
from dataclasses import dataclass
from typing import Callable

PREFIX = "custom:"
# Internal only, never stored or shown: tells _build_tts to use SarvamCloneTTS.
SARVAM_CLONE_PREFIX = "sarvam-clone:"
# The platform default voice (server/agent_builder.DEFAULT_VOICE): Chirp 3 HD
# covers every supported language, and _build_tts falls back to Sarvam when
# Google is unavailable. A male clone falls back to a male Chirp 3 persona
# (Charon, "Chirag HD": Google's standard male persona) so the agent's
# grammatical gender and its voice still agree.
FALLBACK_VOICE = "google:chirp3:Achernar"
FALLBACK_VOICES = {"female": FALLBACK_VOICE, "male": "google:chirp3:Charon"}

# Concurrent Sarvam clone calls per worker (Sarvam rate-limits the whole
# account: 10 requests/min, burst 50, on Pay as you go). Each LiveKit job is
# its own process, so the count is kept with file locks that the kernel
# releases when the call's process exits.
MAX_CONCURRENT_ENV = "VOICE_CLONE_MAX_CONCURRENT"
DEFAULT_MAX_CONCURRENT = 2
SLOT_DIR_ENV = "VOICE_CLONE_SLOT_DIR"

logger = logging.getLogger("custom_voice")


@dataclass(frozen=True)
class Resolved:
    speaker: str             # what _build_tts is given
    gender: str | None       # the speaking voice's gender ("male"/"female")
    fallback: str            # the gender-matched stock voice
    reason: str = ""         # why the fallback speaks ("" when the clone does)


def is_custom(voice: str | None) -> bool:
    return bool(voice) and str(voice).startswith(PREFIX)


def fallback_for(gender: str | None) -> str:
    return FALLBACK_VOICES.get(gender or "", FALLBACK_VOICE)


def _fallback_gender(gender: str | None) -> str:
    return gender if gender in FALLBACK_VOICES else "female"


# ------------------------------------------------------------- slot locks

_held_slot = None  # this process's open lock file, if it holds a slot


def max_concurrent() -> int:
    try:
        return max(0, int(os.environ.get(MAX_CONCURRENT_ENV, DEFAULT_MAX_CONCURRENT)))
    except ValueError:
        return DEFAULT_MAX_CONCURRENT


def acquire_clone_slot() -> bool:
    """One of the worker's VOICE_CLONE_MAX_CONCURRENT Sarvam clone slots for
    this call's process. Idempotent within a process; never blocks."""
    global _held_slot
    if _held_slot is not None:
        return True
    directory = os.environ.get(SLOT_DIR_ENV) or tempfile.gettempdir()
    for index in range(max_concurrent()):
        path = os.path.join(directory, f"vistrow-voice-clone-slot-{index}.lock")
        try:
            handle = open(path, "a+")
        except OSError:
            logger.warning("cloned voice slot file %s unavailable", path, exc_info=True)
            continue
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            handle.close()
            if e.errno not in (errno.EAGAIN, errno.EACCES, errno.EWOULDBLOCK):
                logger.warning("cloned voice slot lock failed", exc_info=True)
            continue
        _held_slot = handle
        return True
    return False


def release_clone_slot() -> None:
    global _held_slot
    handle, _held_slot = _held_slot, None
    if handle is not None:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()


# ---------------------------------------------------------------- resolve

def resolve_row(voice: str, account_id: int | None, row: dict | None,
                eleven_key: str | None = None, sarvam_key: str | None = None,
                acquire_slot: Callable[[], bool] = acquire_clone_slot) -> Resolved:
    """The speaking voice for a "custom:" agent voice, given its
    db.get_custom_voice row (already fetched off the event loop)."""
    eleven_key = eleven_key if eleven_key is not None else os.environ.get("ELEVEN_API_KEY")
    sarvam_key = sarvam_key if sarvam_key is not None else os.environ.get("SARVAM_API_KEY")
    voice_id = voice[len(PREFIX):]
    gender = (row or {}).get("gender")
    gender = gender if gender in FALLBACK_VOICES else None
    fallback = fallback_for(gender)

    def fall_back(reason: str) -> Resolved:
        logger.warning("cloned voice %s not used for account %s (%s); using %s",
                       voice_id, account_id, reason, fallback)
        return Resolved(fallback, _fallback_gender(gender), fallback, reason)

    if not row or row.get("status") != "ready":
        return fall_back((row or {}).get("status") or "not found")
    if row.get("plan_allows") is False:
        return fall_back("plan does not include cloned voices")
    default = row.get("engine_default") or "elevenlabs"
    order = [default] + [e for e in ("sarvam", "elevenlabs") if e != default]
    slot_refused = False
    for engine in order:
        if engine == "elevenlabs" and row.get("elevenlabs_voice_id") and eleven_key:
            return Resolved("elevenlabs:" + row["elevenlabs_voice_id"], gender, fallback)
        if engine == "sarvam" and row.get("sarvam_voice_id") and sarvam_key:
            if acquire_slot():
                return Resolved(SARVAM_CLONE_PREFIX + row["sarvam_voice_id"], gender, fallback)
            slot_refused = True
    if slot_refused:
        return fall_back(f"worker at its limit of {max_concurrent()} concurrent cloned-voice calls")
    return fall_back("no usable engine (keys missing?)")


def resolve(voice: str, account_id: int | None, lookup: Callable[[str, int | None], dict | None],
            eleven_key: str | None = None, sarvam_key: str | None = None,
            acquire_slot: Callable[[], bool] = acquire_clone_slot) -> Resolved:
    """resolve_row with a synchronous lookup (a failing lookup = no row)."""
    try:
        row = lookup(voice[len(PREFIX):], account_id)
    except Exception:
        logger.exception("cloned voice lookup failed for %s", voice[len(PREFIX):])
        row = None
    return resolve_row(voice, account_id, row, eleven_key, sarvam_key, acquire_slot)
