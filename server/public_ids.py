"""Neutral public ids for models and voices (runtime's vendor-leak request,
issue #2, Layers 1-2; owner 24 Oct).

The database, the call runtime and the orchestrator keep the internal ids
("sarvam/...", "google:chirp3:...", "gemini-live:..."), which name our
vendors. Every tenant-facing API response translates them OUT here, and every
request that carries one translates it back IN before the guards run, so the
guards, the database and the preview cache never see a public id.

- Models: an explicit table of readable neutral slugs ("vistrow-bharat-1").
- Voices: "vv_v_" + 12 base32 chars of an HMAC of the internal id under a
  server secret, so the vendor id cannot be worked back from it. Cloned
  voices ("custom:vv_<id>") are already neutral and pass through.
- STT provider: "standard" / "alt".

Input accepts the public id AND the legacy internal id (the public API docs
taught the internal ones). An id this server never issued is refused.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from functools import lru_cache

import voice_catalog

# internal -> public. Retired ids stay so an old agent or call still renders.
MODELS: dict[str, str] = {
    "sarvam/sarvam-105b-conversations": "vistrow-bharat-1",
    "gemini-live:gemini-3.8-live": "vistrow-live-3-8",
    "gemini-live:gemini-3.1-flash-live-preview": "vistrow-live-3-1",
    "gemini-live": "vistrow-live-2-5",
    "duplex:live-1": "vistrow-duplex-1",
    "gpt-5-nano": "vistrow-nano-lab",
    "gpt-5.4-nano": "vistrow-swift-2",
    "gpt-5.4-mini": "vistrow-prime-2",
    "gpt-4.1-mini": "vistrow-swift",
    "gpt-4.1": "vistrow-prime",
    "gpt-4o": "vistrow-pro",
    "gpt-4o-mini": "vistrow-standard",
    "gemini-3.6-flash": "vistrow-flash",
    "gemini-3.5-flash-lite": "vistrow-lite",
    "groq/openai/gpt-oss-20b": "vistrow-lab-20b",
    "groq/openai/gpt-oss-120b": "vistrow-lab-120b",
    "groq/qwen/qwen3.6-27b": "vistrow-lab-27b",
    "groq/qwen/qwen3.8-27b": "vistrow-lab-27b-2",
}
_MODELS_BACK = {public: internal for internal, public in MODELS.items()}

STT_PROVIDERS = {"sarvam": "standard", "google-chirp3": "alt"}
_STT_BACK = {public: internal for internal, public in STT_PROVIDERS.items()}

VOICE_PREFIX = "vv_v_"
CUSTOM_PREFIX = "custom:"

# The voices Gemini Live can speak with (same set as token_api's guard and
# agent/main.py _gemini_live_voice).
LIVE_PERSONAS = frozenset({
    "achernar", "achird", "algenib", "algieba", "alnilam", "aoede", "autonoe", "callirrhoe",
    "charon", "despina", "enceladus", "erinome", "fenrir", "gacrux", "iapetus", "kore",
    "laomedeia", "leda", "orus", "pulcherrima", "puck", "rasalgethi", "sadachbia",
    "sadaltager", "schedar", "sulafat", "umbriel", "vindemiatrix", "zephyr", "zubenelgenubi",
})


class UnknownId(ValueError):
    """A public id this server never issued."""


def _secret() -> bytes:
    explicit = os.environ.get("PUBLIC_ID_SECRET", "")
    if explicit:
        return explicit.encode()
    import auth

    return hashlib.sha256(auth._secret() + b"|public-voice-id-v1").digest()


def _digest(value: str) -> str:
    raw = hmac.new(_secret(), value.encode(), hashlib.sha256).digest()
    return base64.b32encode(raw).decode().lower().rstrip("=")[:12]


# ------------------------------------------------------------------ models

def model_out(internal: str | None) -> str:
    internal = str(internal or "")
    if not internal:
        return ""
    return MODELS.get(internal) or f"vistrow-model-{_digest('model|' + internal)[:8]}"


def model_in(value: str | None, current: str | None = None) -> str:
    """Internal model id for a request value: a public id, a legacy internal
    id, or the public form of the agent's current model (an id outside the
    table, e.g. a model retired before this module)."""
    value = str(value or "").strip()
    if not value:
        return ""
    if value in _MODELS_BACK:
        return _MODELS_BACK[value]
    if current and value == model_out(current):
        return str(current)
    if value.startswith("vistrow-"):
        raise UnknownId(f"Unknown model: {value}")
    return value  # legacy internal id; the guards decide whether it is allowed


# ------------------------------------------------------------------ voices

@lru_cache(maxsize=None)
def _voice_back() -> dict[str, str]:
    return {voice_out(entry["value"]): entry["value"] for entry in voice_catalog.CATALOG}


def voice_out(internal: str | None) -> str:
    internal = str(internal or "")
    if not internal or internal.startswith(CUSTOM_PREFIX):
        return internal
    return VOICE_PREFIX + _digest("voice|" + internal)


def voice_in(value: str | None, current: str | None = None) -> str:
    value = str(value or "").strip()
    if not value or value.startswith(CUSTOM_PREFIX):
        return value
    if value.startswith(VOICE_PREFIX):
        internal = _voice_back().get(value)
        if internal is None and current and voice_out(current) == value:
            internal = str(current)
        if internal is None:
            raise UnknownId(f"Unknown voice: {value}")
        return internal
    return value  # legacy internal id


def live_persona(internal: str) -> str | None:
    """The Gemini Live persona a voice maps to ("Aoede"), or None when a Live
    agent cannot speak with it. Same resolution as token_api's guard."""
    persona = voice_catalog.chirp3_persona(internal or "") or (internal or "").split(":")[-1].strip()
    persona = (persona or "").lower()
    return persona.capitalize() if persona in LIVE_PERSONAS else None


def voice_family(entry: dict) -> str:
    """The Voices page tab / agent picker group a catalog voice belongs to
    (the rules the dashboard used to apply to the internal id itself)."""
    value = entry.get("value", "")
    tier = entry.get("tier")
    if value.startswith(CUSTOM_PREFIX):
        return "custom"
    if value.startswith(voice_catalog.GEMINI_38_FLASH_PREFIX):
        return "studio"
    if value.startswith(voice_catalog.GEMINI_38_PREFIX):
        return "studio-lite"
    if tier == "lite" and value.startswith("google:") and not entry.get("multilingual"):
        return "native"
    if tier == "standard":
        return "hd" if "chirp3" in value.lower() else "bharat"
    if tier == "premium":
        return "expressive" if entry.get("multilingual") and value.startswith("google:") else "premium"
    return "other"


def public_voice(entry: dict) -> dict:
    """A voice_catalog.public_entry() dict with its id made neutral and the
    facts the dashboard needs instead of reading the id."""
    internal = entry["value"]
    out = {**entry, "value": voice_out(internal), "family": voice_family(entry),
           "livePersona": live_persona(internal),
           # One model speaks every language, so the preview can play any of them.
           "previewAnyLanguage": internal.startswith((voice_catalog.SARVAM_V4_PREFIX,
                                                      voice_catalog.CHIRP3_PERSONA_PREFIX))}
    if internal.startswith(voice_catalog.GEMINI_38_PREFIX):
        # The HD voice with the same persona, whose Indian name the Live
        # model's voice is shown under.
        out["hdTwin"] = voice_out(voice_catalog.CHIRP3_PERSONA_PREFIX + internal[len(voice_catalog.GEMINI_38_PREFIX):].capitalize())
    return out


# ------------------------------------------------------------------ agents

def agent_out(agent: dict | None) -> dict | None:
    """An agent dict as a tenant may see it."""
    if not agent:
        return agent
    out = dict(agent)
    raw_voice = str(agent.get("voice") or "")
    out["model"] = model_out(agent.get("model"))
    out["voice"] = voice_out(raw_voice)
    out["sttProvider"] = STT_PROVIDERS.get(agent.get("sttProvider") or "sarvam", "standard")
    if out.get("voiceName") == raw_voice and (":" in raw_voice or "/" in raw_voice):
        out["voiceName"] = "Earlier voice"  # not in the catalog; never the raw id
    return out


def agent_in(data: dict | None, current: dict | None = None) -> dict:
    """Request fields made internal again. `current` is the saved agent (its
    internal model/voice), so an id outside the tables still round-trips."""
    data = dict(data or {})
    current = current or {}
    if "model" in data:
        data["model"] = model_in(data["model"], current.get("model"))
    if "voice" in data:
        data["voice"] = voice_in(data["voice"], current.get("voice"))
    for key in ("sttProvider", "stt_provider"):
        if key in data and data[key] in _STT_BACK:
            data[key] = _STT_BACK[data[key]]
    return data
