"""Call-time resolution of a customer's cloned voice ("custom:vv_<id>").

server/custom_voices.py creates the clone (ElevenLabs and/or Sarvam) and
picks engine_default. Here the stored agent voice becomes the speaker string
_build_tts understands:
  - ElevenLabs clone -> "elevenlabs:<voice_id>" (Flash v2.5 path, unchanged)
  - Sarvam clone     -> SARVAM_CLONE_PREFIX + <voice_id> (SarvamCloneTTS)
The other engine is tried if the default one has no id or key. Anything
else - deleted, not ready, other account's id, DB down, no keys - falls back
to FALLBACK_VOICE with a warning: a call never fails over a clone.

The call record keeps "custom:..." (billing: standard voice tier) and the
AI disclosure is forced on for these calls (call_disclosure).
"""

from __future__ import annotations

import logging
import os
from typing import Callable

PREFIX = "custom:"
# Internal only, never stored or shown: tells _build_tts to use SarvamCloneTTS.
SARVAM_CLONE_PREFIX = "sarvam-clone:"
# The platform default voice (server/agent_builder.DEFAULT_VOICE): Chirp 3 HD
# covers every supported language, and _build_tts falls back to Sarvam when
# Google is unavailable.
FALLBACK_VOICE = "google:chirp3:Achernar"

logger = logging.getLogger("custom_voice")


def is_custom(voice: str | None) -> bool:
    return bool(voice) and str(voice).startswith(PREFIX)


def resolve(voice: str, account_id: int | None, lookup: Callable[[str, int | None], dict | None],
            eleven_key: str | None = None, sarvam_key: str | None = None) -> str:
    """The TTS speaker string for a "custom:" voice."""
    eleven_key = eleven_key if eleven_key is not None else os.environ.get("ELEVEN_API_KEY")
    sarvam_key = sarvam_key if sarvam_key is not None else os.environ.get("SARVAM_API_KEY")
    voice_id = voice[len(PREFIX):]
    try:
        row = lookup(voice_id, account_id)
    except Exception:
        logger.exception("cloned voice lookup failed for %s", voice_id)
        row = None
    if not row or row.get("status") != "ready":
        logger.warning("cloned voice %s unavailable for account %s (%s); using %s",
                       voice_id, account_id, (row or {}).get("status", "not found"), FALLBACK_VOICE)
        return FALLBACK_VOICE
    default = row.get("engine_default") or "elevenlabs"
    order = [default] + [e for e in ("sarvam", "elevenlabs") if e != default]
    for engine in order:
        if engine == "elevenlabs" and row.get("elevenlabs_voice_id") and eleven_key:
            return "elevenlabs:" + row["elevenlabs_voice_id"]
        if engine == "sarvam" and row.get("sarvam_voice_id") and sarvam_key:
            return SARVAM_CLONE_PREFIX + row["sarvam_voice_id"]
    logger.warning("cloned voice %s has no usable engine (keys missing?); using %s", voice_id, FALLBACK_VOICE)
    return FALLBACK_VOICE
