"""Single source of truth for the platform's available voices.

Historically the voice roster lived hardcoded in the frontend
(web-demo/src/pages/Agents.tsx, four separate arrays). It now lives here so
one place defines every voice, its display name, tier, and gender — the
dashboard's Voices page and the agent voice picker both read this via the
API, and the preview synthesizer (voice_preview.py) derives provider/model
from the same `value` string.

`value` IS the exact string stored on an agent's `voice` column, passed to
agent/main.py's _build_tts, AND classified for billing by
calls_db.voice_tier() — the prefix convention there and here must agree:
  - "elevenlabs:<id>"     → ElevenLabs Flash v2.5  → tier "premium"      (2x credits)
  - "elevenlabs-v3:<id>"  → ElevenLabs v3          → tier "premium_plus" (2x credits)
  - bare Sarvam bulbul:v2 speaker (abhilash/anushka) → tier "lite"       (0.5x credits)
  - any other bare name (Sarvam bulbul:v3)           → tier "standard"   (1x credits)

Adding a new voice here makes it appear in the catalog automatically; no
frontend deploy or billing change is needed (voice_tier keys off the prefix,
not the specific id). Vendor names (ElevenLabs, Sarvam) are deliberately not
exposed to operators — they see a Vistrow tier, same convention as the model
picker.
"""

from __future__ import annotations

# Display order + credit signalling per tier. tier -> (label, credits_note).
TIER_META: dict[str, dict] = {
    "premium": {"label": "Premium", "note": "2x credits · most expressive, reacts to caller emotion live", "rank": 0},
    "standard": {"label": "Standard", "note": "1x credits", "rank": 1},
    "lite": {"label": "Lite", "note": "0.5x credits · economy", "rank": 2},
}

# The master catalog. Keep display names free of vendor branding.
# gender: "male" | "female" | "neutral".
#
# There used to be a separate "Premium+" tier on ElevenLabs v3 (audio-
# direction tags like [laughs]/[warmly]). v3's realtime streaming endpoint
# 403s in production (see agent/main.py's _build_tts docstring) — the only
# way to use it at all was a non-streaming per-sentence workaround with a
# gap before every sentence, which isn't good enough to keep selling as a
# tier. Folded back into Premium (Flash v2.5, real streaming) on 2026-07-14:
# every v3 voice ID already existed here too under a Premium name (same
# ElevenLabs voice, offered under two names/models) except Abhi/Monika/Saavi,
# which are added below. calls_db.init_tables() rewrites any agent or
# account-voice-menu row still holding the old "elevenlabs-v3:" prefix over
# to "elevenlabs:" for the same ID, so nothing an account already configured
# silently disappears.
CATALOG: list[dict] = [
    # --- Premium (ElevenLabs Flash v2.5) ------------------------------------
    {"value": "elevenlabs:zT03pEAEi0VHKciJODfn", "name": "Saurabh", "gender": "male", "tier": "premium"},
    {"value": "elevenlabs:zmh5xhBvMzqR4ZlXgcgL", "name": "Siya", "gender": "female", "tier": "premium"},
    {"value": "elevenlabs:FmBhnvP58BK0vz65OOj7", "name": "Viraj", "gender": "male", "tier": "premium"},
    {"value": "elevenlabs:cFvQm3lZl5miSWHxawFj", "name": "Aarush", "gender": "male", "tier": "premium"},
    # Always previewed in English (forcePreviewLang) regardless of the
    # dashboard's Hindi/English toggle — the whole point of this voice is its
    # UK English accent, which the Hindi audition line doesn't demonstrate.
    {
        "value": "elevenlabs:UgBBYS2sOqTuMpoF3BR0",
        "name": "Mark (English)",
        "gender": "male",
        "tier": "premium",
        "note": "UK English accent",
        "force_lang": "en",
    },
    {"value": "elevenlabs:7b9mYhmnp0y2qSH1FnBL", "name": "Abhi", "gender": "male", "tier": "premium"},
    {"value": "elevenlabs:1qEiC6qsybMkmnNdVMbK", "name": "Monika", "gender": "female", "tier": "premium"},
    {"value": "elevenlabs:9lx2GDtpvyyNBM7O9Mmx", "name": "Saavi", "gender": "female", "tier": "premium"},
    {"value": "elevenlabs:mActWQg9kibLro6Z2ouY", "name": "Riya", "gender": "female", "tier": "premium"},
    # --- Standard (Sarvam bulbul:v3) ----------------------------------------
    {"value": "shubh", "name": "Shubh", "gender": "male", "tier": "standard"},
    {"value": "priya", "name": "Priya", "gender": "female", "tier": "standard"},
    {"value": "aditya", "name": "Aditya", "gender": "male", "tier": "standard"},
    {"value": "ritu", "name": "Ritu", "gender": "female", "tier": "standard"},
    {"value": "rohan", "name": "Rohan", "gender": "male", "tier": "standard"},
    {"value": "simran", "name": "Simran", "gender": "female", "tier": "standard"},
    {"value": "kavya", "name": "Kavya", "gender": "female", "tier": "standard"},
    {"value": "amit", "name": "Amit", "gender": "male", "tier": "standard"},
    {"value": "pooja", "name": "Pooja", "gender": "female", "tier": "standard"},
    # --- Lite (Sarvam bulbul:v2) --------------------------------------------
    {"value": "abhilash", "name": "Abhilash", "gender": "male", "tier": "lite"},
    {"value": "hitesh", "name": "Hitesh", "gender": "male", "tier": "lite"},
    {"value": "karun", "name": "Karun", "gender": "male", "tier": "lite"},
    {"value": "anushka", "name": "Anushka", "gender": "female", "tier": "lite"},
    {"value": "arya", "name": "Arya", "gender": "female", "tier": "lite"},
    {"value": "manisha", "name": "Manisha", "gender": "female", "tier": "lite"},
]

_BY_VALUE: dict[str, dict] = {v["value"]: v for v in CATALOG}

# Which voice tiers each plan may add to its menu. Premium tiers are gated to
# Scale, matching plans.ts ("Premium ElevenLabs voice" is a Scale-only
# feature; Starter/Growth show it locked). The platform-owner account bypasses
# this entirely (handled in calls_db). Unknown/blank plan → the safe base set.
PLAN_ALLOWED_TIERS: dict[str, set[str]] = {
    "starter": {"lite", "standard"},
    "growth": {"lite", "standard"},
    "scale": {"lite", "standard", "premium"},
}
_BASE_TIERS = {"lite", "standard"}

# Voices auto-added to a brand-new (or never-configured) account's menu so the
# agent picker is never empty. Both are free-tier Standard voices.
DEFAULT_ACCOUNT_VOICES = ["shubh", "priya"]

# Fixed audition script, per language. Because it's fixed, each voice is
# synthesized at most once per language ever (then cached in Postgres) — see
# voice_preview.py. Bump SAMPLE_TEXT_VERSION when editing any line to force
# regeneration of stale cached audio.
#
# The Hindi line spells "AI" as "एआई" (Devanagari), not the Latin acronym.
# bulbul:v3 and ElevenLabs code-switch mid-sentence well enough to read a bare
# "AI" correctly, but bulbul:v2 (the Lite tier) doesn't — it sounds out the
# two Latin letters as if they were Hindi syllables, audible as something
# like "vi" instead of "AI" (reported directly against production: every
# /voices/preview request for the new Lite voices returned 200 OK, so this
# was never an error, just bad pronunciation from feeding v2 mixed-script
# text it can't code-switch on). एआई is proper Hindi script for the same two
# letters, so every model — including v2 — reads it correctly.
SAMPLE_TEXT_VERSION = 2
SAMPLE_TEXTS: dict[str, str] = {
    "en": (
        "Hi! I'm a Vistrow Voice AI agent. I can answer your calls, qualify "
        "leads, and book appointments — all in your customer's own language."
    ),
    "hi": (
        "नमस्ते! मैं Vistrow Voice का एआई एजेंट हूँ। मैं आपकी कॉल्स का जवाब देता हूँ, "
        "लीड्स क्वालिफाई करता हूँ और अपॉइंटमेंट बुक करता हूँ — वो भी आपके ग्राहक की अपनी भाषा में।"
    ),
}
DEFAULT_SAMPLE_LANG = "hi"


def get_voice(value: str) -> dict | None:
    """Catalog entry for a voice string, or None if not a known catalog voice."""
    return _BY_VALUE.get(value)


def tier_of(value: str) -> str | None:
    entry = _BY_VALUE.get(value)
    return entry["tier"] if entry else None


def allowed_tiers_for_plan(plan: str | None, is_owner: bool = False) -> set[str]:
    if is_owner:
        return set(TIER_META.keys())
    return PLAN_ALLOWED_TIERS.get((plan or "").lower(), _BASE_TIERS)


def public_entry(entry: dict, allowed_tiers: set[str]) -> dict:
    """Catalog entry shaped for the API, with plan-gating annotations."""
    tier = entry["tier"]
    meta = TIER_META[tier]
    addable = tier in allowed_tiers
    return {
        "value": entry["value"],
        "name": entry["name"],
        "gender": entry.get("gender", "neutral"),
        "note": entry.get("note", ""),
        "tier": tier,
        "tierLabel": meta["label"],
        "tierNote": meta["note"],
        "tierRank": meta["rank"],
        "addable": addable,
        "lockedReason": "" if addable else f"{meta['label']} voices need the Scale plan",
        # When set, the audition preview always uses this language for this
        # voice regardless of the picker's own Hindi/English toggle — for a
        # voice whose whole point is a specific accent (e.g. Mark's UK
        # English), the Hindi sample line wouldn't demonstrate it.
        "forceLang": entry.get("force_lang", ""),
    }
