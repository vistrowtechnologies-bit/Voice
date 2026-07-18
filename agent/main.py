import asyncio
import json
import logging
import os
import random
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from livekit import api
from livekit.agents import (
    Agent,
    AgentSession,
    JobContext,
    RoomInputOptions,
    TurnHandlingOptions,
    WorkerOptions,
    cli,
    llm,
    tokenize,
)
from livekit.agents.tts import StreamAdapter
from livekit.agents.stt import FallbackAdapter as SttFallbackAdapter
from livekit.agents.tts import FallbackAdapter as TtsFallbackAdapter
from livekit.agents.types import NOT_GIVEN
from livekit.plugins import elevenlabs, google, noise_cancellation, openai, sarvam

import db
import recording
import voice_catalog  # a byte-identical copy of server/voice_catalog.py (the
# agent build context can't reach ../server), kept in sync the same way
# dbconn.py is duplicated into agent/. Used here only to resolve a voice's
# gender so the LLM self-refers with the right grammatical gender.
from emotion import ELEVENLABS_EMOTION_DELTAS, EMOTION_TONE_DELTAS, detect_caller_emotion
from language import ELEVENLABS_SUPPORTED_LANGUAGES, LANGUAGE_NAMES, detect_reply_language
from prompts.generic_assistant import build_generic_assistant_prompt
from prompts.platform_assistant import build_platform_assistant_prompt
from prompts.voice_style import ELEVENLABS_EXPRESSIVE_PROMPT, VOICE_STYLE_PROMPT
from tools import (
    TAVILY_API_KEY,
    _deliver_to_integrations,
    book_appointment,
    build_custom_function_tools,
    capture_platform_lead,
    check_calendar_availability,
    end_call,
    log_lead,
    switch_reply_language,
    transfer_call,
    web_search,
)

load_dotenv()
db.init_db()

logger = logging.getLogger("real-estate-voice-agent")
logger.setLevel(logging.INFO)

# A single code-switched word/phrase shouldn't flip the reply language —
# require the same candidate language across this many consecutive turns
# (roughly "a couple of sentences") before actually switching.
LANGUAGE_SWITCH_CONFIRMATION_TURNS = 3

# The LLM has no built-in notion of "today" — without this, it resolves
# "next Sunday" / "tomorrow" against whatever date feels plausible from its
# training data, which is how a real production call booked a site visit for
# 2023-11-05. India-focused product, so IST rather than the room's UTC clock.
_IST = timezone(timedelta(hours=5, minutes=30))

# Fixed opening lines spoken verbatim (session.say(), no LLM round-trip) for
# the Vistrow marketing site's live demo widget only — a first-time visitor
# clicking "Talk to Artha live" was waiting 6-7s of dead air for
# generate_reply() to produce a dynamic greeting before saying a word. One
# is picked at random per call so it still varies, without paying that
# latency every time. Deliberately scoped to is_platform_demo — the
# button-click self-aware humor here is wrong for a tenant's paying
# customers on their own agent, who should keep the LLM-generated dynamic
# opener (or an operator's own welcome_message).
#
# Hinglish (code-mixed Hindi/English) written in Devanagari script rather
# than Latin transliteration — Sarvam's bulbul TTS (see voice_catalog.py's
# sample_text notes) code-switches mid-sentence far more reliably when the
# English loanwords are spelled out phonetically in Devanagari than when
# they're left in Latin script inside an otherwise-Devanagari sentence.
_PLATFORM_DEMO_OPENERS = [
    "हे, आपने क्लिक किया है, तो अब मुझे प्रूव करना पड़ेगा कि मैं रोबोट जैसी साउंड नहीं करती। मैं आर्था हूँ, विस्ट्रो वॉइस से। आप इंग्लिश, हिंदी या हिंग्लिश में बात कर सकते हैं—बताइए, आपका बिज़नेस किस इंडस्ट्री में है?",
    "हे, आपने 'टॉक टू आर्था' क्लिक किया, तो मैं ऑफिशियली ड्यूटी पर आ गई। बताइए, आपका बिज़नेस क्या करता है?",
    "हाय, मैं आर्था हूँ, विस्ट्रो वॉइस से। मुझे 30 सेकंड्स दीजिए, मैं दिखाती हूँ कि एआई कन्वर्सेशन कितनी नैचुरल हो सकती है। आप किस बिज़नेस में हैं?",
    "ओके, यूज़ुअली यहाँ एआई एक बोरिंग रोबोटिक लाइन बोलता है। मैं वो नहीं करूँगी। सीधा बताइए—आपका बिज़नेस क्या करता है?",
    "हाय, मैं आर्था हूँ। आप इंग्लिश, हिंदी या हिंग्लिश में बात कर सकते हैं—जो कम्फर्टेबल लगे। तो बताइए, आपका बिज़नेस किस फील्ड में है?",
    "हे, मैं आर्था हूँ। सोचिए, आपकी हर कस्टमर कॉल इंस्टेंटली आंसर हो—ईवन आफ्टर ऑफिस आवर्स। अभी जब कॉल मिस होती है, तो आपकी टीम क्या करती है?",
]

# Same "skip generate_reply(), speak a fixed line instantly" fix as the demo
# opener above, generalized to every tenant agent that hasn't written its own
# welcome_message — today, silently falling through to generate_reply() below
# means EVERY such agent pays that 6-7s round-trip on every single call, not
# just the demo. {agent_name}/{first_name} are filled in on_enter(); an
# operator who wants a fully custom (or perfectly-translated) opener should
# just set welcome_message, which already short-circuits before this.
# Keyed by the dashboard's reply-language codes (see LANGUAGE_NAMES) — only
# Hindi gets a dedicated line since it's the default reply_language and the
# most common one left unset; every other language falls back to the English
# line below rather than risk a mistranslated greeting, and the caller's own
# first turn still drives the real language the call proceeds in.
_DEFAULT_OPENER_HI = "{greeting} नमस्ते! ये {agent_name} है। बताइए, आपकी क्या मदद करूँ?"
_DEFAULT_OPENER_EN = "{greeting} this is {agent_name}. Thanks for calling — how can I help you today?"
_DEFAULT_OPENERS = {"hi-IN": _DEFAULT_OPENER_HI}


# Sarvam bulbul:v3's own `pace`/`temperature`/`pitch` govern how the voice is
# actually delivered (speaking speed and prosodic variation) — separate from
# and complementary to the LLM's temperature, which only affects word choice.
# A flat/robotic-sounding voice is a TTS delivery problem, not a wording one,
# so tone presets live here rather than as an LLM sampling-temperature knob.
TONE_PRESETS: dict[str, dict[str, float]] = {
    # Measured and steady — a bit slower and low-variation, for formal/
    # informational agents (banking, legal, official notices).
    "professional": {"pace": 0.95, "temperature": 0.4, "pitch": 0.0},
    # Sarvam bulbul:v3's own defaults — natural conversational delivery.
    "balanced": {"pace": 1.0, "temperature": 0.6, "pitch": 0.0},
    # Faster and more expressive/varied prosody — addresses "slow and
    # robotic" by injecting more natural pitch/pace variation per line.
    "casual": {"pace": 1.08, "temperature": 0.85, "pitch": 0.05},
}
DEFAULT_TONE = "balanced"

# ElevenLabs equivalent of TONE_PRESETS above, keyed by the same tone names
# so an operator's Tone choice still means something on an ElevenLabs voice
# instead of being silently ignored. stability/style/speed are
# VoiceSettings fields (elevenlabs.TTS, imported below); similarity_boost
# is fixed at ElevenLabs' own recommended default rather than exposed here.
_ELEVENLABS_TONE_PRESETS: dict[str, dict[str, float]] = {
    "professional": {"stability": 0.6, "style": 0.15, "speed": 0.97},
    "balanced": {"stability": 0.5, "style": 0.3, "speed": 1.0},
    "casual": {"stability": 0.4, "style": 0.45, "speed": 1.05},
}
_ELEVENLABS_SIMILARITY_BOOST = 0.75

# Dashboard-facing "Emotion intensity" dial (see Agents.tsx) — scales
# EMOTION_TONE_DELTAS/ELEVENLABS_EMOTION_DELTAS deltas before they're applied
# in on_user_turn_completed. "strong" (1.0) reproduces today's behavior
# exactly; "off" (0.0) always reproduces the base tone regardless of detected
# caller emotion.
_EMOTION_INTENSITY_MULTIPLIERS = {"off": 0.0, "subtle": 0.5, "strong": 1.0}


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _build_llm(model: str):
    """Picks the LLM plugin by model-name prefix, so an operator can switch
    an agent between OpenAI and Gemini from the dashboard's model dropdown
    without any other config change. GEMINI_API_KEY is the name Google AI
    Studio labels its key with; fall back to GOOGLE_API_KEY (the google-genai
    SDK's own default env var) since either may already be set."""
    if model.startswith("gemini"):
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        return google.LLM(model=model, api_key=api_key)
    return openai.LLM(model=model)


def _google_credentials_info() -> dict | None:
    """Google Cloud Speech-to-Text/Text-to-Speech need a service-account
    credential (a different Google auth surface than GEMINI_API_KEY, which
    only covers the Gemini LLM) — not configured by default. Reads the
    account's full JSON key from an env var (Railway-friendly: no file to
    mount) rather than a credentials_file path. Returns None — and every
    caller below falls back to Sarvam-only — if it's absent or malformed,
    so this feature is opt-in and never breaks a deployment that hasn't set
    it up."""
    raw = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        logger.warning("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON — Google STT/TTS fallback disabled")
        return None


_GOOGLE_CREDENTIALS = _google_credentials_info()
# Google Cloud's billing account is currently blocked ("Your project has
# been denied access" on Speech-to-Text/Text-to-Speech AND the Gemini LLM),
# so the Google STT/TTS path — however well it works once that's fixed — is
# actively making calls worse right now (crashes, dead air) rather than
# providing a safety net. This flag is the single switch to flip back to
# True once Google Cloud billing is resolved; until then _build_stt/
# _build_tts below always return Sarvam only, ignoring _GOOGLE_CREDENTIALS
# even if it's configured.
_GOOGLE_VOICE_ENABLED = False


def _build_stt():
    """Sarvam saaras:v3 is the primary — Indian-language quality/latency it
    was actually chosen for. If GOOGLE_APPLICATION_CREDENTIALS_JSON is set,
    wraps it in a FallbackAdapter so a Sarvam outage or exhausted credit
    balance (observed in production as "Insufficient credits", which
    AgentSession treats as unrecoverable and closes the whole call) retries
    against Google Cloud STT instead of killing the session."""
    sarvam_stt = sarvam.STT(
        # "unknown" is a first-class value on saaras:v3 covering 20+ Indian
        # languages (Hindi, Marathi, Malayalam, Gujarati, Tamil, Telugu,
        # Kannada, Bengali, Punjabi, Odia, English, and more) — needed since
        # we support more than just Hindi/English. "codemix" mode is
        # Hindi-English-specific; plain "transcribe" is Sarvam's
        # general-purpose multi-language mode.
        language="unknown",
        model="saaras:v3",
        mode="transcribe",
        flush_signal=True,
    )
    if _GOOGLE_CREDENTIALS is None or not _GOOGLE_VOICE_ENABLED:
        return sarvam_stt
    google_stt = google.STT(
        languages=["hi-IN", "en-IN"],
        detect_language=True,
        credentials_info=_GOOGLE_CREDENTIALS,
    )
    return SttFallbackAdapter([sarvam_stt, google_stt])


# bulbul:v3 is ~94% of Sarvam spend by character count (v3's per-character
# rate is higher than v2's). These bulbul:v2 speakers are offered in the
# dashboard voice picker as the cheaper "Lite" tier, to let an operator
# compare quality against v3 before switching. v2 and v3 have entirely
# separate, non-overlapping speaker rosters, so picking the right TTS model
# per speaker (below) is required, not optional. Full v2 roster per Sarvam/
# LiveKit's own plugin docs — do not add a name here without confirming it
# against that roster first, since an unlisted name 404s against v2.
_SARVAM_V2_SPEAKERS = {"abhilash", "hitesh", "karun", "anushka", "arya", "manisha"}

_GOOGLE_VOICE_PREFIX = "google:"
# Google's own streaming TTS path (livekit-plugins-google 1.6.4) has a real
# concurrency bug: on cancellation it can call aclose() on its internal
# request generator while that generator is still being iterated by the
# in-flight gRPC call, raising "RuntimeError: aclose(): asynchronous
# generator is already running" and killing the call (seen in production
# logs the moment Sarvam ran out of credits and TTS fell over to Google).
# use_streaming=False routes through the plugin's non-streaming
# synthesize_speech call instead, which doesn't share that code path —
# slightly higher per-utterance latency, but it doesn't crash.
_GOOGLE_TTS_KWARGS = {"use_streaming": False}
# Gemini's prebuilt multilingual voice personas — unlike a locale-tagged
# voice name (e.g. "hi-IN-Neural2-A", good for exactly one language), these
# generate natural speech in whatever language the input text is actually
# in, so one voice can carry a call across Hindi, English, and every other
# language this platform supports without swapping voices. Keyed by the
# bare persona name (no locale prefix) — see
# https://docs.cloud.google.com/text-to-speech/docs/gemini-tts#voice_options
_GOOGLE_MULTILINGUAL_VOICES = {"charon", "kore"}

_ELEVENLABS_VOICE_PREFIX = "elevenlabs:"
# Experimental — see _build_tts's docstring. Distinct prefix so it's an
# explicit, separately-labeled opt-in in the dashboard picker rather than
# silently replacing the working Flash path.
_ELEVENLABS_V3_VOICE_PREFIX = "elevenlabs-v3:"
# Unlike Google above, there's no known outage/billing blocker for
# ElevenLabs — it's simply on whenever a key is configured, same as Sarvam.
_ELEVENLABS_API_KEY = os.environ.get("ELEVEN_API_KEY")


def _build_tts(reply_language: str, speaker: str, tone: dict[str, float], tone_name: str):
    """Same fallback pattern as _build_stt, for TTS. Returns (tts, provider)
    — provider is "elevenlabs" or "sarvam", telling the caller which
    update_options kwarg shape to use for mid-call prosody/language updates
    (see on_user_turn_completed: ElevenLabs takes voice_settings/language,
    Sarvam takes pace+pitch/target_language_code — passing the wrong shape
    raises rather than silently no-op-ing).

    Google's voice catalog doesn't map to Sarvam speaker names
    (shubh/priya) — the automatic fallback just uses Google's own default
    voice for the reply language rather than trying to match timbre, since
    it only ever fires when Sarvam is already failing and *a* voice beats a
    dropped call.

    A dashboard-selected voice can also explicitly name a Google voice
    (stored verbatim as the agent's `voice` field, prefixed "google:") so
    an operator can try Google's TTS on purpose, not just as an outage
    fallback. Two forms are recognized:
    - "google:<persona>" (e.g. "google:charon") — one of Gemini's
      multilingual voice personas, primary model, speaks whatever language
      the text is in.
    - "google:<locale>-<model>-<voice>" (e.g. "google:hi-IN-Neural2-A") — a
      locale-specific voice; the voice name's own language prefix (its
      first two hyphen-separated segments) is used for `language=` rather
      than reply_language, since these are locked to one specific locale.

    A third form, "elevenlabs:<voice_id>" (a voice ID from the operator's
    own ElevenLabs account), routes to ElevenLabs' TTS instead — also
    standalone, not wrapped in a fallback adapter, since it's an explicit
    choice rather than an outage safety net. eleven_flash_v2_5 is the
    lowest-latency multilingual model, matching this product's real-time
    call latency bar.

    eleven_v3 (which supports [emotion] bracket tags) is confirmed broken
    on ElevenLabs' own streaming endpoint for live calls — the LiveKit
    plugin's v3 WebSocket handshake gets a hard 403
    (aiohttp.WSServerHandshakeError, "Invalid response status" on the
    multi-stream-input endpoint), so a plain elevenlabs.TTS(model="eleven_v3")
    has NO TTS output at all. Confirmed against production logs on
    2026-07-13. A fourth form, "elevenlabs-v3:<voice_id>", makes v3 usable
    anyway by wrapping it in agents.tts.StreamAdapter — the same fallback
    the framework itself uses automatically for any TTS that can't stream,
    tokenizing text into sentences and calling ElevenLabs' plain non-
    streaming HTTP endpoint (elevenlabs.TTS.synthesize(), not the
    WebSocket) per sentence. This genuinely produces audio, but with two
    real costs an operator should know before picking it: (1) a network
    round-trip gap before each sentence starts playing instead of Flash's
    continuous stream — audibly less smooth; (2) StreamAdapter has no
    update_options, so agent/emotion.py's live per-turn reactivity (see
    on_user_turn_completed) silently can't reach it — a v3 call uses one
    fixed voice_settings for the whole call. Kept as a separate,
    clearly-labeled experimental option rather than replacing Flash."""
    if speaker.startswith(_ELEVENLABS_V3_VOICE_PREFIX) and _ELEVENLABS_API_KEY:
        voice_id = speaker[len(_ELEVENLABS_V3_VOICE_PREFIX) :]
        base = _ELEVENLABS_TONE_PRESETS.get(tone_name, _ELEVENLABS_TONE_PRESETS[DEFAULT_TONE])
        raw_tts = elevenlabs.TTS(
            voice_id=voice_id,
            model="eleven_v3",
            language=reply_language.split("-")[0],
            voice_settings=elevenlabs.VoiceSettings(
                stability=base["stability"],
                similarity_boost=_ELEVENLABS_SIMILARITY_BOOST,
                style=base["style"],
                speed=base["speed"],
                use_speaker_boost=True,
            ),
        )
        adapted = StreamAdapter(tts=raw_tts, sentence_tokenizer=tokenize.blingfire.SentenceTokenizer(retain_format=True))
        return adapted, "elevenlabs-v3"
    if speaker.startswith(_ELEVENLABS_VOICE_PREFIX) and _ELEVENLABS_API_KEY:
        voice_id = speaker[len(_ELEVENLABS_VOICE_PREFIX) :]
        base = _ELEVENLABS_TONE_PRESETS.get(tone_name, _ELEVENLABS_TONE_PRESETS[DEFAULT_TONE])
        # eleven_flash_v2_5 hard-rejects a `language` code outside its own
        # 32-language list (confirmed live: "does not support language_code
        # 'mr'" kills the WebSocket, code 1008, and the agent goes silently
        # dead for the rest of the call) — see language.py's
        # ELEVENLABS_SUPPORTED_LANGUAGES for the full story. Only enforce a
        # language ElevenLabs actually accepts; otherwise omit the kwarg so
        # it auto-detects from the text instead of crashing the connection.
        eleven_language = (
            reply_language.split("-")[0] if reply_language in ELEVENLABS_SUPPORTED_LANGUAGES else NOT_GIVEN
        )
        tts = elevenlabs.TTS(
            voice_id=voice_id,
            model="eleven_flash_v2_5",
            language=eleven_language,
            voice_settings=elevenlabs.VoiceSettings(
                stability=base["stability"],
                similarity_boost=_ELEVENLABS_SIMILARITY_BOOST,
                style=base["style"],
                speed=base["speed"],
                use_speaker_boost=True,
            ),
        )
        return tts, "elevenlabs"
    if speaker.startswith(_GOOGLE_VOICE_PREFIX) and _GOOGLE_CREDENTIALS is not None and _GOOGLE_VOICE_ENABLED:
        voice_name = speaker[len(_GOOGLE_VOICE_PREFIX) :]
        if voice_name.lower() in _GOOGLE_MULTILINGUAL_VOICES:
            google_tts = google.TTS(
                language=reply_language,
                voice_name=voice_name.capitalize(),
                model_name="gemini-2.5-flash-tts",
                credentials_info=_GOOGLE_CREDENTIALS,
                **_GOOGLE_TTS_KWARGS,
            )
            return google_tts, "sarvam"
        voice_language = "-".join(voice_name.split("-")[:2])
        google_tts = google.TTS(
            language=voice_language,
            voice_name=voice_name,
            credentials_info=_GOOGLE_CREDENTIALS,
            **_GOOGLE_TTS_KWARGS,
        )
        return google_tts, "sarvam"
    # A Google or ElevenLabs voice selected with no credentials/key
    # configured falls back to the default Sarvam speaker rather than
    # passing the raw "google:..."/"elevenlabs:..." string through as an
    # invalid Sarvam speaker name.
    sarvam_speaker = (
        "shubh"
        if speaker.startswith((_GOOGLE_VOICE_PREFIX, _ELEVENLABS_VOICE_PREFIX, _ELEVENLABS_V3_VOICE_PREFIX))
        else speaker
    )
    sarvam_tts = sarvam.TTS(
        target_language_code=reply_language,
        # bulbul:v2 speakers (added to compare quality/cost against v3,
        # which is ~94% of Sarvam spend per usage — see
        # _SARVAM_V2_SPEAKERS) only work with the v2 model; every other
        # speaker uses the current default, v3.
        model="bulbul:v2" if sarvam_speaker in _SARVAM_V2_SPEAKERS else "bulbul:v3",
        speaker=sarvam_speaker,
        **tone,
    )
    if _GOOGLE_CREDENTIALS is None or not _GOOGLE_VOICE_ENABLED:
        return sarvam_tts, "sarvam"
    google_tts = google.TTS(
        language=reply_language, credentials_info=_GOOGLE_CREDENTIALS, **_GOOGLE_TTS_KWARGS
    )
    return TtsFallbackAdapter([sarvam_tts, google_tts]), "sarvam"


def _parse_json_config(raw, default):
    """agent/db.py returns config as a raw row dict, so JSON columns
    (custom_functions, post_call_fields) arrive as strings — parse defensively."""
    if isinstance(raw, (list, dict)):
        return raw
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return default


def _build_tools(config: dict) -> list:
    """The agent's live tool set. Core lead-capture + KB tools are always on
    (they're how the call does its job); enabled_functions only gates the
    optional built-ins (end_call, transfer_call). Custom webhook tools and a
    transfer tool (only if a transfer number is set) are appended."""
    tools = [
        check_calendar_availability,
        book_appointment,
        log_lead,
        capture_platform_lead,
        switch_reply_language,
    ]
    enabled_raw = (config.get("enabled_functions") or "").strip()
    enabled = {e.strip() for e in enabled_raw.split(",") if e.strip()} if enabled_raw else None

    def _on(name: str) -> bool:
        # No explicit list configured → every optional tool defaults on.
        return True if enabled is None else name in enabled

    if _on("end_call"):
        tools.append(end_call)
    if (config.get("transfer_phone") or "").strip() and _on("transfer_call"):
        tools.append(transfer_call)
    if TAVILY_API_KEY and _on("web_search"):
        tools.append(web_search)
    tools.extend(build_custom_function_tools(_parse_json_config(config.get("custom_functions"), [])))
    return tools


class RealEstateAgent(Agent):
    def __init__(
        self,
        config: dict | None = None,
        visitor_name: str | None = None,
        visitor_phone: str | None = None,
    ) -> None:
        # Dashboard-managed settings (agents table, edited via the web UI)
        # override the code defaults, so prompt/voice/model/KB changes apply
        # on the next call without a redeploy. Missing table or empty fields
        # fall back to the in-code defaults.
        config = config or {}
        agent_name = config.get("name") or "Artha"
        voice_value = config.get("voice") or "shubh"
        self._is_platform_demo = bool(config.get("is_platform_demo"))
        self._agent_name = agent_name
        self._visitor_first_name = visitor_name.strip().split()[0] if visitor_name else None
        if config.get("system_prompt"):
            instructions = config["system_prompt"]
        elif config.get("is_platform_demo"):
            instructions = build_platform_assistant_prompt(agent_name)
        else:
            instructions = build_generic_assistant_prompt(agent_name)
        if visitor_name and visitor_phone:
            # Website-widget calls collect these in a pre-call form, so the
            # agent already has them — this both stops it re-asking (the
            # built-in prompt's own goal list says "if not already known
            # from the call context") and guarantees log_call() below has a
            # name/phone to save even if the agent's log_lead tool never
            # fires during a short or abandoned call. Explicitly demanding
            # the name in the opening line, not just "you know it" — the
            # model won't reliably use it unprompted otherwise.
            first_name = visitor_name.strip().split()[0]
            instructions += (
                f"\n\n# Caller context\nThe caller already gave their name ({visitor_name}) and phone "
                f"number ({visitor_phone}) before this call started. Greet them by name — start your very "
                f'first sentence of the call with their first name (e.g. "Hi {first_name}, ..."). You '
                "already know their name and number, so don't ask for either again unless you need to "
                "confirm one of them."
            )
        if config.get("kb_id"):
            kb = db.get_kb_content(config["kb_id"])
            if kb:
                if db.is_kb_strict(config["kb_id"]):
                    # Strict mode: the KB (especially its operator-approved
                    # Q&A pairs) is the only permitted source for concrete
                    # facts — prices, sizes, dates, distances, legal status.
                    # This is what stops the model improvising a plausible
                    # but wrong number on a live sales call.
                    instructions += (
                        "\n\n# Knowledge base — THE authoritative facts for this call\n"
                        "The knowledge base below is your ONLY source for concrete facts about "
                        "this business and its projects: prices, sizes, distances, dates, legal "
                        "status, amenities, payment plans, contact details. Follow it strictly:\n"
                        "- When a caller's question matches an approved answer below, give that "
                        "answer (naturally rephrased for speech and translated into the caller's "
                        "language, but with every number, price, and name kept exactly as written).\n"
                        "- Never state a concrete fact about this business that is not in the "
                        "knowledge base — no guessing, no rounding, no 'approximately' around a "
                        "number that isn't there, even if you believe you know the answer.\n"
                        "- If the knowledge base doesn't cover something, say you'll have the team "
                        "confirm it, offer to note the question down, and move the conversation "
                        "forward — that is always better than an invented answer.\n"
                        "- Your general real-estate expertise is still fine for generic concepts "
                        "(what RERA is, how home loans work); strictness applies to THIS "
                        "business's specific facts.\n\n" + kb
                    )
                else:
                    instructions += (
                        "\n\n# Knowledge base — verified project facts you may rely on\n" + kb
                    )
        # Lead capture and default-language instructions are appended here,
        # unconditionally, rather than living only inside build_generic_assistant_prompt
        # — an operator-written custom system_prompt (config["system_prompt"])
        # REPLACES that built-in prompt entirely, and previously took its lead
        # -capture and language instructions down with it: a custom-prompted
        # agent would never call log_lead/book_appointment (tools are bound
        # either way, but the LLM was never told to use them) and would open
        # every call in whatever language it defaulted to, ignoring the
        # dashboard's configured language, since reply_language below only
        # ever fed the TTS pronunciation hint, never the LLM's own text.
        # Master voice-style layer — appended to EVERY agent (built-in,
        # generic, and custom system_prompt) so tight turn-taking, fillers,
        # and language-mirroring hold no matter what the business content is.
        # A custom system_prompt replaces the persona/content above, never
        # these conversation rules.
        now_ist = datetime.now(_IST)
        instructions += (
            f"\n\n# Current date and time\nRight now it is {now_ist.strftime('%A, %d %B %Y')}, "
            f"{now_ist.strftime('%H:%M')} IST. This is the ONLY source of truth for \"today\", "
            "\"tomorrow\", \"next Monday\", \"this weekend\", etc. — never resolve a relative date "
            "from memory or assumption. When calling check_calendar_availability or "
            "book_appointment, compute the date argument (YYYY-MM-DD) from this real date."
        )
        instructions += "\n\n" + VOICE_STYLE_PROMPT
        if voice_value.startswith(_ELEVENLABS_VOICE_PREFIX):
            instructions += ELEVENLABS_EXPRESSIVE_PROMPT
        instructions += (
            "\n\n# Lead capture (do this regardless of the persona/rules above)\n"
            "Use whichever of these tools actually matches what this call is about — "
            "your persona/system prompt above tells you which one applies, and you "
            "only ever need one of the two:\n"
            "- Any per-tenant business call (this is the default): as the conversation "
            "naturally reveals the caller's name and a way to reach them, plus whatever "
            "context is actually relevant (budget/pricing, location, timing/urgency — "
            "use \"not applicable\" for any of these that don't fit this business), call "
            "log_lead to record what you've learned so far — call it again with the "
            "fuller picture EVERY time the caller gives you a new detail (a budget, a "
            "location preference, a timeline), even seconds later in the same turn — "
            "don't wait until every field is known, and don't let booking an appointment "
            "become the end of the call before you've re-logged whatever they just told "
            "you. This is not optional and not a low-priority background task: the moment "
            "a number, price, or figure leaves the caller's mouth in answer to a "
            "budget/pricing question (in any language or unit — \"एक करोड़\", \"50 lakh\", "
            "\"around 2 crore\" all count), call log_lead with that value in the very next "
            "tool call you make, before you say anything else back to them. The same rule "
            "applies the instant they name a location or a timeline — log it immediately, "
            "don't hold multiple details in your head to log together later.\n"
            "- Booking an appointment (any business — clinic, salon, consultation, "
            "property site visit): when the caller wants to book a time, first call "
            "check_calendar_availability for their preferred date to see real open "
            "slots, offer those slots, and once they pick one call book_appointment to "
            "confirm it. Never promise a specific slot before check_calendar_availability "
            "confirms it's free.\n"
            "- Vistrow Voice platform-assistant calls (explaining Vistrow Voice itself "
            "to a prospective customer): once you have the caller's name plus at least "
            "one more of company/contact/use case/team size, call "
            "capture_platform_lead — call it again if more comes up later in the same "
            "call.\n"
            "These tool calls are silent to the caller — never mention or narrate that "
            "you're saving, logging, or recording anything.\n\n"
            "Call the end_call tool once the caller clearly signals the conversation is "
            "over — they thank you with nothing further to ask, say goodbye, or otherwise "
            "indicate they're done. Don't call it for a mere pause or a one-word \"okay\" "
            "— only on a clear end-of-call signal.\n\n"
            "# Speak numbers and units naturally (do this regardless of the persona/rules above)\n"
            "Everything you write is converted directly to speech by a TTS engine that reads bare "
            "digits and abbreviations LITERALLY, one character at a time — it cannot expand them "
            "the way a human would. So:\n"
            "- Write every number out in words appropriate to the reply language (e.g. \"eighteen "
            "seventeen\", not \"1817\"), including in ranges — never leave a range like \"1817-3000\" "
            "as bare digits with a hyphen; say it naturally, e.g. \"eighteen seventeen to three "
            "thousand\".\n"
            "- Expand every abbreviation and unit into full words: \"sq.ft\" → \"square feet\", "
            "\"km\" → \"kilometers\", \"%\" → \"percent\". Never let an abbreviation reach TTS as "
            "literal text.\n"
            "- This only changes HOW a number/unit is written for speech, never the underlying value "
            "— the figure itself must stay exactly what the knowledge base or caller said."
        )
        # Returning-caller memory: if this agent has memory on and we know the
        # caller's phone (widget pre-call form, or an inbound caller id), pull
        # the rolling summary of past calls and let the agent open with real
        # continuity instead of treating them as a stranger.
        self._memory_enabled = bool(config.get("memory_enabled"))
        self._caller_phone = (visitor_phone or "").strip()
        if self._memory_enabled and self._caller_phone and config.get("id"):
            prior = db.get_caller_memory(config["id"], self._caller_phone)
            if prior:
                instructions += (
                    "\n\n# What you remember about this caller\n"
                    "You've spoken with this caller before. Here's what you know from last time — "
                    "greet them like someone you recognize and use this naturally, don't recite it "
                    "back verbatim:\n" + prior
                )

        reply_language = config.get("language") or "hi-IN"
        language_name = LANGUAGE_NAMES.get(reply_language, "Hindi")
        instructions += (
            f"\n\n# Default language\nOpen the call and speak first in {language_name} "
            "(native script, not romanized) — there's no caller input yet to mirror, so "
            f"{language_name} is the default until the caller's own language is clear. "
            "Once they speak, follow the multilingual rules above and match them.\n\n"
            "If the caller EXPLICITLY asks you to switch languages — in any phrasing, in "
            "any language (\"let's speak in Marathi\", \"मराठीत बोलूया\", \"can you do Tamil "
            "instead\") — call switch_reply_language with that language's name BEFORE your "
            "next reply, every single time, with no exceptions. This is not optional: your "
            "voice's pronunciation is driven entirely by that tool call, not by which script "
            "you happen to write your reply in — some Indian languages (Hindi and Marathi "
            "above all) are written in the identical script, so if you switch to writing "
            "Marathi without calling the tool, your voice keeps speaking with Hindi "
            "pronunciation and the caller hears an accent, even though your words are "
            "correct. Call the tool first, then write your reply in the new language."
        )
        # Grammatical gender: many Indian languages (Hindi, Marathi, Gujarati,
        # Punjabi, Bhojpuri…) inflect first-person verbs by the SPEAKER's
        # gender, so the LLM must know whether this agent's voice is a woman or
        # a man — otherwise it defaults to masculine forms and a female voice
        # says "बताता हूँ" instead of "बताती हूँ". Derived from the voice's
        # catalog gender so it's automatic for every voice, no per-agent config.
        _gender = (voice_catalog.get_voice(voice_value) or {}).get("gender")
        if _gender in ("male", "female"):
            _woman = _gender == "female"
            instructions += (
                f"\n\n# Your voice and gender\nYou, {agent_name}, speak with a "
                f"{'woman' if _woman else 'man'}'s voice — you ARE {'a woman' if _woman else 'a man'}. "
                "In every language that marks the speaker's grammatical gender (Hindi, Marathi, "
                "Gujarati, Punjabi, and others), always refer to yourself with the correct "
                f"{'feminine' if _woman else 'masculine'} forms and never mix genders. For example in "
                "Hindi say " + (
                    "\"मैं बताती हूँ\", \"मैं करती हूँ\", \"मैं आई हूँ\" (feminine) — never the masculine "
                    "\"बताता / करता / आया हूँ\"."
                    if _woman else
                    "\"मैं बताता हूँ\", \"मैं करता हूँ\", \"मैं आया हूँ\" (masculine) — never the feminine "
                    "\"बताती / करती / आई हूँ\"."
                )
            )
        tone_name = config.get("tone") or DEFAULT_TONE
        base_tone = TONE_PRESETS.get(tone_name, TONE_PRESETS[DEFAULT_TONE])
        tts, tts_provider = _build_tts(reply_language, voice_value, base_tone, tone_name)
        super().__init__(
            instructions=instructions,
            stt=_build_stt(),
            llm=_build_llm(config.get("model") or "gpt-4.1"),
            tts=tts,
            tools=_build_tools(config),
        )
        self._reply_language = reply_language
        self._pending_language: str | None = None
        self._pending_language_streak = 0
        # Which update_options kwarg shape on_user_turn_completed should use
        # for mid-call prosody/language changes — see _build_tts's docstring.
        self._tts_provider = tts_provider
        # The exact voice string this call used — saved with the call record
        # (see log_call in the module-level entrypoint) for per-voice-tier
        # credit billing (server/calls_db.py's voice_tier()), captured here
        # rather than read back from the agent's current config later so a
        # later voice change on the agent never retroactively reclassifies
        # this call's cost.
        self._voice = voice_value
        # Prosody-adaptation baseline (see on_user_turn_completed) — deltas
        # from a detected caller emotion apply on top of these, never replace
        # them, so the agent's configured base personality always shows through.
        self._base_pace = base_tone.get("pace", 1.0)
        self._base_pitch = base_tone.get("pitch", 0.0)
        self._base_elevenlabs = _ELEVENLABS_TONE_PRESETS.get(tone_name, _ELEVENLABS_TONE_PRESETS[DEFAULT_TONE])
        # Scales how strongly a detected caller emotion moves delivery away
        # from the base tone above — 0 ("off") always reproduces the base
        # tone regardless of detected emotion, 1.0 ("strong") is today's
        # full-strength default. Same dial for both providers.
        self._emotion_intensity = _EMOTION_INTENSITY_MULTIPLIERS.get(
            config.get("emotion_intensity") or "strong", 1.0
        )
        self._current_emotion: str | None = None
        # Conversation-start behavior (see on_enter).
        self._first_speaker = (config.get("first_speaker") or "agent").lower()
        self._welcome_message = (config.get("welcome_message") or "").strip()
        # Post-call structured extraction fields (parsed from the agent's JSON).
        self._post_call_fields = _parse_json_config(config.get("post_call_fields"), [])

    async def on_enter(self) -> None:
        # first_speaker == 'user' means wait silently for the caller to open.
        if self._first_speaker == "user":
            return
        if self._welcome_message:
            # Operator wrote an exact opening line — speak it verbatim rather
            # than letting the model improvise a greeting.
            await self.session.say(self._welcome_message)
            return
        if self._is_platform_demo:
            # A dynamic LLM-generated greeting sounds better, but costs a full
            # generate_reply() round-trip (LLM + TTS) before the very first
            # word — 6-7s of dead air a first-time website visitor wasn't
            # expecting. Speaking a fixed line via say() skips straight to
            # TTS. Picked at random per call so repeat visitors don't hear the
            # same line every time.
            await self.session.say(random.choice(_PLATFORM_DEMO_OPENERS))
            return
        # Same fix, generalized: every tenant agent without its own
        # welcome_message used to fall through to generate_reply() here and
        # pay the identical 6-7s round-trip on every call. A fast, lightly
        # personalized default (agent name + caller's first name, if the
        # widget already collected it) covers the vast majority of that gap;
        # an operator who wants a fully custom line still sets welcome_message
        # above, which short-circuits before this.
        greeting = f"Hi {self._visitor_first_name}," if self._visitor_first_name else "Hi,"
        template = _DEFAULT_OPENERS.get(self._reply_language, _DEFAULT_OPENER_EN)
        await self.session.say(template.format(greeting=greeting, agent_name=self._agent_name))

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        text = new_message.text_content

        emotion = detect_caller_emotion(text)
        if emotion != self._current_emotion:
            self._current_emotion = emotion
            if self._tts_provider == "elevenlabs":
                delta = ELEVENLABS_EMOTION_DELTAS.get(emotion, {}) if emotion else {}
                new_style = _clamp(
                    self._base_elevenlabs["style"] + delta.get("style", 0.0) * self._emotion_intensity, 0.0, 1.0
                )
                new_speed = _clamp(
                    self._base_elevenlabs["speed"] + delta.get("speed", 0.0) * self._emotion_intensity, 0.8, 1.2
                )
                self.tts.update_options(
                    voice_settings=elevenlabs.VoiceSettings(
                        stability=self._base_elevenlabs["stability"],
                        similarity_boost=_ELEVENLABS_SIMILARITY_BOOST,
                        style=new_style,
                        speed=new_speed,
                        use_speaker_boost=True,
                    )
                )
                logger.info(
                    "caller tone -> %s (style %.2f, speed %.2f) from turn: %r",
                    emotion or "neutral", new_style, new_speed, text,
                )
            elif self._tts_provider == "elevenlabs-v3":
                # StreamAdapter (see _build_tts) has no update_options — v3
                # runs one fixed voice_settings for the whole call, so there's
                # nothing to push here. Still log the detected emotion so
                # it's visible it just isn't reaching the voice.
                logger.info(
                    "caller tone -> %s (no-op: elevenlabs-v3 can't adapt mid-call) from turn: %r",
                    emotion or "neutral", text,
                )
            else:
                delta = EMOTION_TONE_DELTAS.get(emotion, {}) if emotion else {}
                new_pace = self._base_pace + delta.get("pace", 0.0) * self._emotion_intensity
                new_pitch = self._base_pitch + delta.get("pitch", 0.0) * self._emotion_intensity
                self.tts.update_options(pace=new_pace, pitch=new_pitch)
                logger.info(
                    "caller tone -> %s (pace %.2f, pitch %.2f) from turn: %r",
                    emotion or "neutral", new_pace, new_pitch, text,
                )

        candidate = detect_reply_language(text)
        if candidate == "hi-IN" and self._reply_language == "mr-IN":
            # Devanagari is shared by Hindi and Marathi — detect_reply_language()
            # can only report the script it saw, not which of the two the
            # caller meant (see language.py), so on a Marathi-configured call
            # a "hi-IN" reading is not real signal that the caller switched
            # languages. Treating it as one used to force every Marathi call
            # to Hindi mid-conversation after a few caller turns, corrupting
            # the TTS language hint the operator explicitly configured.
            candidate = None
        if candidate is None or candidate == self._reply_language:
            # Ambiguous turn, or already the current language — nothing to
            # confirm. Reset the streak so a one-off stray word elsewhere
            # doesn't half-count toward a future switch.
            self._pending_language = None
            self._pending_language_streak = 0
            return

        if candidate == self._pending_language:
            self._pending_language_streak += 1
        else:
            self._pending_language = candidate
            self._pending_language_streak = 1
        logger.info(
            "language candidate %s (streak %s/%s) from turn: %r",
            candidate, self._pending_language_streak, LANGUAGE_SWITCH_CONFIRMATION_TURNS, text,
        )

        if self._pending_language_streak >= LANGUAGE_SWITCH_CONFIRMATION_TURNS:
            self._reply_language = candidate
            self._pending_language = None
            self._pending_language_streak = 0
            if self._tts_provider == "elevenlabs":
                # Only enforce a language ElevenLabs' eleven_flash_v2_5
                # actually accepts (see language.py's
                # ELEVENLABS_SUPPORTED_LANGUAGES) — an unsupported code here
                # is a confirmed live crash: ElevenLabs rejects the request,
                # kills the TTS WebSocket, and the agent goes silently dead
                # for the rest of the call.
                if candidate in ELEVENLABS_SUPPORTED_LANGUAGES:
                    self.tts.update_options(language=candidate.split("-")[0])
            elif self._tts_provider != "elevenlabs-v3":
                # elevenlabs-v3 (StreamAdapter) has no update_options — the
                # call keeps the language it opened with. Sarvam and Flash
                # both support switching mid-call.
                self.tts.update_options(target_language_code=candidate)
            logger.info("switching reply language to %s", candidate)


def _call_context_from_job(ctx: JobContext) -> dict:
    """Room metadata names which dashboard agent should handle this call, and
    (for phone/widget calls) which number or site it came in on:

    - Phone: {"agent_id", "phone_number"} — stamped by the SIP dispatch rule
      in server/livekit_sip.py.
    - Website widget: {"agent_id", "site_id", "visitor_name", "visitor_phone",
      "visitor_email"} — stamped by /widget/token in server/token_api.py from
      its pre-call name/phone/email form.
    - Dashboard "Browser test": {"agent_id"} only — from /token.
    - Public demo call page: no metadata at all.

    Returns {"agent_id": int|None, "call_type": "phone"|"widget"|"browser",
    "site_id": int|None, "visitor_name": str|None, "visitor_phone": str|None,
    "visitor_email": str|None}, defaulting to the "browser" catch-all on
    anything unexpected so the call still gets handled by the default agent.
    """
    default = {
        "agent_id": None,
        "call_type": "browser",
        "site_id": None,
        "visitor_name": None,
        "visitor_phone": None,
        "visitor_email": None,
    }
    try:
        raw = ctx.job.room.metadata
    except Exception:
        return default
    if not raw:
        return default
    try:
        meta = json.loads(raw)
    except ValueError:
        return default

    agent_id = meta.get("agent_id")
    site_id = meta.get("site_id")
    call_type = "phone" if meta.get("phone_number") else "widget" if site_id is not None else "browser"
    return {
        "agent_id": int(agent_id) if agent_id is not None else None,
        "call_type": call_type,
        "site_id": int(site_id) if site_id is not None else None,
        "visitor_name": meta.get("visitor_name"),
        "visitor_phone": meta.get("visitor_phone"),
        "visitor_email": meta.get("visitor_email"),
    }


async def _hang_up(room_name: str) -> None:
    """Ends the call for both sides once the agent's goodbye has finished
    playing. room.disconnect() would only drop the agent's own participant,
    leaving the caller alone in a now-agent-less room — deleting the room
    via the LiveKit API actually disconnects everyone, which is what a
    caller expects "the call ended" to mean."""
    try:
        async with api.LiveKitAPI() as lkapi:
            await lkapi.room.delete_room(api.DeleteRoomRequest(room=room_name))
    except Exception:
        logger.warning("failed to end call gracefully for room %s", room_name, exc_info=True)


async def _post_call_analysis(
    transcript: list[dict], post_call_fields: list[dict], want_summary: bool
) -> tuple[dict, str]:
    """One post-call LLM pass over the transcript: pull the operator-defined
    structured fields, and (for memory-enabled agents) a short summary to
    recall this caller next time. Best-effort — returns ({}, "") on any
    failure so call teardown never breaks."""
    field_specs = [f for f in (post_call_fields or []) if f.get("key")]
    if not transcript or (not field_specs and not want_summary):
        return {}, ""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {}, ""
    convo = "\n".join(f"{t['role']}: {t['text']}" for t in transcript if t.get("text"))[:6000]
    directives = ["Respond with ONLY a compact JSON object."]
    if field_specs:
        lines = "\n".join(f"- {f['key']}: {f.get('description') or f.get('type', 'string')}" for f in field_specs)
        directives.append(
            'Include a "fields" object with exactly these keys, filled from the transcript '
            "(use null when the transcript doesn't cover one):\n" + lines
        )
    if want_summary:
        directives.append(
            'Include a "summary" string of 1-3 sentences capturing who the caller is and what '
            "they wanted, written to help recognize and help them on a future call."
        )
    system = (
        "You extract structured data from a voice-call transcript. " + " ".join(directives)
    )
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": convo}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
        fields = data.get("fields") if field_specs else {}
        summary = data.get("summary") if want_summary else ""
        return (fields if isinstance(fields, dict) else {}), (summary if isinstance(summary, str) else "")
    except Exception:
        logger.warning("post-call analysis failed", exc_info=True)
        return {}, ""


async def entrypoint(ctx: JobContext) -> None:
    logger.info("starting session in room %s", ctx.room.name)
    call_context = _call_context_from_job(ctx)
    # The agent-config lookup is a synchronous psycopg call — run it in a
    # worker thread so it overlaps with connecting to the room and waiting
    # for the caller below, instead of blocking this process's event loop
    # (which also hosts every other concurrent call's session).
    config_task = asyncio.create_task(asyncio.to_thread(db.get_agent_config, call_context["agent_id"]))
    await ctx.connect()
    # Don't say a word until the caller is actually in the room. Widget
    # rooms are pre-created at token-issuance time (to carry visitor
    # metadata), so this job usually starts BEFORE the visitor's browser
    # finishes mic permission + WebRTC setup — greeting immediately meant
    # the opener played into an empty room, the visitor joined to silence,
    # and the first thing they actually heard was the 6.5s away-timeout
    # "are you still there?" check-in. The same ordering protects outbound
    # SIP calls from greeting into ringing before the callee picks up.
    try:
        first_participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=90)
    except asyncio.TimeoutError:
        logger.warning("no caller joined room %s within 90s — abandoning job", ctx.room.name)
        return
    config = await config_task
    if config and config.get("status") == "paused":
        # Paused from the dashboard — don't take the call.
        logger.info("agent '%s' is paused; skipping room %s", config.get("name"), ctx.room.name)
        return
    # After the caller joins, not at job start — duration (and therefore
    # credit billing) shouldn't include dispatch/connect/ring time.
    started_at = datetime.now(timezone.utc)
    # Pre-seed with whatever the visitor already typed into the widget's
    # pre-call form, so the call log has a name/phone even if the agent's
    # own log_lead tool never runs (call ends early, visitor hangs up, etc).
    # The agent's own log_lead call later still overwrites these if it
    # captures something more specific during the conversation.
    lead_data: dict = {}
    if call_context["visitor_name"]:
        lead_data["name"] = call_context["visitor_name"]
    if call_context["visitor_phone"]:
        lead_data["phone"] = call_context["visitor_phone"]
    if call_context["visitor_email"]:
        lead_data["email"] = call_context["visitor_email"]
    cfg = config or {}
    agent = RealEstateAgent(config, call_context["visitor_name"], call_context["visitor_phone"])
    userdata = {
        "room": ctx.room,
        "lead_data": lead_data,
        "ending_call": False,
        # Read by the transfer_call tool.
        "transfer_phone": (cfg.get("transfer_phone") or "").strip(),
        "silence_reminders": 0,
        # Which tenant this call belongs to — lets the lead-capture tools fan
        # out to that tenant's connected integrations (Slack/Sheets/WhatsApp/CRM).
        "account_id": cfg.get("account_id"),
    }

    # interruption_sensitivity 0-1 → how many real words it takes to interrupt
    # the agent. High sensitivity yields the floor on a single word; low
    # sensitivity ignores stray noise and needs a few words. Default 0.5 ≈ the
    # previous fixed min_words=2.
    sensitivity = cfg.get("interruption_sensitivity")
    sensitivity = 0.5 if sensitivity is None else max(0.0, min(1.0, float(sensitivity)))
    min_words = max(1, round(4 - sensitivity * 3))
    # Silence check-in cadence: how long the caller can be quiet before the
    # session marks user_state "away" and the agent checks in (see below).
    silence_reminder_ms = int(cfg.get("silence_reminder_ms") or 0)
    away_timeout = silence_reminder_ms / 1000 if silence_reminder_ms > 0 else 6.5
    silence_reminder_max = int(cfg.get("silence_reminder_max") or 1)
    end_call_on_silence_ms = int(cfg.get("end_call_on_silence_ms") or 0)
    max_call_duration_s = int(cfg.get("max_call_duration_s") or 0)

    session = AgentSession(
        userdata=userdata,
        turn_handling=TurnHandlingOptions(interruption={"min_words": min_words}),
        user_away_timeout=away_timeout,
    )

    # --- End-call-on-silence watchdog ---------------------------------------
    # A resettable timer: if the caller produces no speech for
    # end_call_on_silence_ms, hang up. Reset every time the user speaks.
    silence_task: dict = {"handle": None}

    def _reset_silence_hangup() -> None:
        if end_call_on_silence_ms <= 0:
            return
        if silence_task["handle"]:
            silence_task["handle"].cancel()

        async def _watch() -> None:
            try:
                await asyncio.sleep(end_call_on_silence_ms / 1000)
                logger.info("hanging up room %s after %dms of silence", ctx.room.name, end_call_on_silence_ms)
                await _hang_up(ctx.room.name)
            except asyncio.CancelledError:
                pass

        silence_task["handle"] = asyncio.create_task(_watch())

    def _on_user_state_changed(ev) -> None:
        if ev.new_state == "speaking":
            # Caller is talking again — reset both the reminder count and the
            # end-of-call silence timer.
            userdata["silence_reminders"] = 0
            _reset_silence_hangup()
        elif ev.new_state == "away":
            sent = userdata.get("silence_reminders", 0)
            if sent < silence_reminder_max:
                userdata["silence_reminders"] = sent + 1
                session.generate_reply(
                    instructions=(
                        "The caller has gone quiet for a few seconds. Check in warmly and briefly — "
                        "one short question like asking if they're still there — and nothing else."
                    )
                )

    def _on_agent_state_changed(ev) -> None:
        # end_call (tools.py) sets userdata["ending_call"] and returns
        # instructions for a goodbye line; this waits for that goodbye to
        # actually finish playing (agent state drops out of "speaking")
        # before tearing the room down, so the farewell is never cut off
        # mid-sentence.
        if userdata.get("ending_call") and ev.old_state == "speaking" and ev.new_state != "speaking":
            userdata["ending_call"] = False
            asyncio.create_task(_hang_up(ctx.room.name))

    session.on("user_state_changed", _on_user_state_changed)
    session.on("agent_state_changed", _on_agent_state_changed)

    # Held in a dict (not read at shutdown time) because by the time the job
    # drains and the shutdown callback runs, the visitor has already left the
    # participant list. wait_for_participant above guarantees we have them.
    visitor_holder: dict[str, str | None] = {"identity": first_participant.identity}
    # Same reasoning as visitor_holder above — set once the recorder actually
    # starts (after session.start(), below), read here once the call ends.
    recorder_holder: dict[str, recording.CallRecorder | None] = {"recorder": None}

    async def log_call() -> None:
        ended_at = datetime.now(timezone.utc)
        transcript = [
            {"role": item.role, "text": item.text_content}
            for item in session.history.items
            if getattr(item, "text_content", None)
        ]
        resolved_agent_id = call_context["agent_id"] or cfg.get("id")
        want_memory = agent._memory_enabled and bool(agent._caller_phone)
        extracted, memory_summary = await _post_call_analysis(
            transcript, agent._post_call_fields, want_memory
        )
        saved_call_id: int | None = None
        try:
            saved_call_id = db.save_call(
                {
                    "room_name": ctx.room.name,
                    "visitor_identity": visitor_holder["identity"],
                    "started_at": started_at.isoformat(),
                    "ended_at": ended_at.isoformat(),
                    "duration_seconds": (ended_at - started_at).total_seconds(),
                    "reply_language": agent._reply_language,
                    "voice": agent._voice,
                    "transcript": transcript,
                    "call_type": call_context["call_type"],
                    "site_id": call_context["site_id"],
                    # Which dashboard agent took the call — explicit from room
                    # metadata when routed, otherwise whichever agent config
                    # actually loaded (the default/first one).
                    "agent_id": resolved_agent_id,
                    "account_id": cfg.get("account_id"),
                    "extracted_data": extracted,
                    **lead_data,
                }
            )
            logger.info("saved call log for room %s (%d turns)", ctx.room.name, len(transcript))
        except Exception:
            logger.exception("failed to save call log for room %s", ctx.room.name)
        recorder = recorder_holder["recorder"]
        if recorder is not None:
            try:
                local_path = await recorder.stop()
                if local_path:
                    # boto3's upload is blocking network I/O — run it off the
                    # event loop so it doesn't stall every other concurrent
                    # call's session while this one uploads.
                    key = await asyncio.to_thread(
                        recording.upload_recording, local_path, cfg.get("account_id"), saved_call_id
                    )
                    if key and saved_call_id is not None:
                        db.set_call_recording(saved_call_id, key)
            except Exception:
                logger.exception("failed to finalize recording for room %s", ctx.room.name)
        # A separate, comprehensive delivery at call end — unlike the
        # mid-call capture_lead/book_appointment fan-outs (small structured
        # events for fast CRM visibility during the call), this one carries
        # the full transcript, which is only known once the call is over.
        await _deliver_to_integrations(
            cfg.get("account_id"),
            {
                "type": "call_completed",
                "name": lead_data.get("name"),
                "phone": lead_data.get("phone"),
                "email": lead_data.get("email"),
                "channel": call_context["call_type"],
                "duration_seconds": (ended_at - started_at).total_seconds(),
                "transcript": transcript,
                "extracted_data": extracted,
                "language": agent._reply_language,
                "agent_name": cfg.get("name"),
            },
            call_id=saved_call_id,
        )
        # Persist returning-caller memory after the log (independent of it).
        if want_memory and memory_summary and resolved_agent_id:
            db.save_caller_memory(cfg.get("account_id"), resolved_agent_id, agent._caller_phone, memory_summary)

    ctx.add_shutdown_callback(log_call)

    # Hard call-length ceiling: tear the room down after max_call_duration_s.
    if max_call_duration_s > 0:

        async def _max_duration_guard() -> None:
            try:
                await asyncio.sleep(max_call_duration_s)
                logger.info("hanging up room %s after max duration %ds", ctx.room.name, max_call_duration_s)
                await _hang_up(ctx.room.name)
            except asyncio.CancelledError:
                pass

        asyncio.create_task(_max_duration_guard())
    # Arm the end-call-on-silence watchdog for the opening stretch (no-ops if
    # end_call_on_silence_ms is 0); it re-arms whenever the caller speaks.
    _reset_silence_hangup()

    # Strips steady background noise (traffic, crowd chatter, AC hum) from
    # the caller's mic before it ever reaches STT — Krisp's model via
    # LiveKit's noise-cancellation plugin, already bundled with
    # livekit-agents[sarvam] so no separate install or paid plan is
    # needed. Telephony audio (8kHz, already compressed by the carrier)
    # needs the dedicated telephony-tuned model, not the general one.
    noise_filter = (
        noise_cancellation.BVCTelephony() if call_context["call_type"] == "phone" else noise_cancellation.BVC()
    )
    await session.start(
        agent=agent,
        room=ctx.room,
        room_input_options=RoomInputOptions(noise_cancellation=noise_filter),
    )
    # Started only after the session (and therefore both the caller's and
    # the agent's audio tracks) is actually up — see recording.py for why
    # this taps tracks directly instead of LiveKit's own record=True/Egress.
    try:
        recorder = recording.CallRecorder(ctx.room)
        recorder.start()
        recorder_holder["recorder"] = recorder
    except Exception:
        logger.exception("failed to start call recorder for room %s", ctx.room.name)


if __name__ == "__main__":
    # num_idle_processes = how many warm subprocesses sit ready before a job
    # ever arrives — with only 1 (the prior value), any call that lands while
    # the single idle slot is already claimed by another call gets a fully
    # cold subprocess: Python interpreter start + importing livekit-agents
    # plus the openai/google/elevenlabs/sarvam plugin stack, which is a real
    # multi-second cost on its own, on top of the greeting latency fixed
    # above. That value was set low (see git history) to avoid the OS
    # OOM-killer on a memory-constrained Railway trial container — this
    # worker now runs on LiveKit Cloud with a dedicated 2 CPU / 4GB replica
    # (see agent/livekit.toml), which has real headroom for more than one
    # warm process. 2 is a conservative step up from 1, not livekit-agents'
    # own default of 4 — watch `lk agent status`/logs after deploy and raise
    # further if memory stays comfortable under real concurrent-call load.
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, num_idle_processes=2))
