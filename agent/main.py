import asyncio
import json
import logging
import os
import random
import re
import threading
import time
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents.beta.tools import send_dtmf_events
from livekit.agents.inference import eot
from livekit.agents import (
    Agent,
    AgentSession,
    AudioConfig,
    BackgroundAudioPlayer,
    BuiltinAudioClip,
    CloseReason,
    EndpointingOptions,
    JobContext,
    JobProcess,
    RoomInputOptions,
    StopResponse,
    TurnHandlingOptions,
    WorkerOptions,
    cli,
    llm,
    tokenize,
)
from livekit.agents.tts import StreamAdapter
from livekit.agents.stt import FallbackAdapter as SttFallbackAdapter
from livekit.agents.tts import FallbackAdapter as TtsFallbackAdapter
from livekit.agents.types import NOT_GIVEN, APIConnectOptions
from livekit.agents.voice.agent_session import SessionConnectOptions
from livekit.plugins import elevenlabs, google, noise_cancellation, openai, sarvam

import db
import recording
import voice_catalog  # a byte-identical copy of server/voice_catalog.py (the
# agent build context can't reach ../server), kept in sync the same way
# dbconn.py is duplicated into agent/. Used here only to resolve a voice's
# gender so the LLM self-refers with the right grammatical gender.
from google_tts_streaming_patch import PatchedGeminiTTS
from emotion import (
    GEMINI_EMOTION_PROMPT_DELTAS,
    GEMINI_TONE_PROMPTS,
    detect_caller_emotion,
)
from language import (
    ELEVENLABS_SUPPORTED_LANGUAGES,
    LANGUAGE_NAMES,
    detect_reply_language,
    to_google_code,
)
from prompts.generic_assistant import build_generic_assistant_prompt
from prompts.human_speech import build_human_speech_manner
from prompts.industry_demo_style import (
    build_industry_demo_style,
    industry_demo_empathy_nudge,
    industry_demo_turn_nudge,
)
from prompts.platform_assistant import build_platform_assistant_prompt
from prompts.voice_style import ELEVENLABS_EXPRESSIVE_PROMPT, VOICE_STYLE_PROMPT
from tools import (
    TAVILY_API_KEY,
    _deliver_to_integrations,
    _find_sip_participant,
    book_appointment,
    build_custom_function_tools,
    capture_platform_lead,
    check_calendar_availability,
    end_call,
    log_lead,
    request_callback,
    switch_reply_language,
    transfer_call,
    lookup_catalog,
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
# Keyed by voice gender ("female"/"male") — the fixed lines below all use a
# first-person Hindi verb ("करती/करता", "आ गई/गया", "दिखाती/दिखाता",
# "करूँगी/करूँगा"), so a single shared list silently mismatches whenever the
# demo agent's voice isn't the female default (e.g. switched to Abhi) —
# random.choice() would keep speaking feminine grammar through a male voice.
# Lines without a gendered verb ("मैं आर्था हूँ" doesn't inflect) are shared.
_PLATFORM_DEMO_OPENERS: dict[str, list[str]] = {
    "female": [
        "हे, आपने क्लिक किया है, तो अब मुझे प्रूव करना पड़ेगा कि मैं रोबोट जैसी साउंड नहीं करती। मैं आर्था हूँ, विस्ट्रो वॉइस से। आप इंग्लिश, हिंदी या हिंग्लिश में बात कर सकते हैं—बताइए, आपका बिज़नेस किस इंडस्ट्री में है?",
        "हे, आपने 'टॉक टू आर्था' क्लिक किया, तो मैं ऑफिशियली ड्यूटी पर आ गई। बताइए, आपका बिज़नेस क्या करता है?",
        "हाय, मैं आर्था हूँ, विस्ट्रो वॉइस से। मुझे 30 सेकंड्स दीजिए, मैं दिखाती हूँ कि एआई कन्वर्सेशन कितनी नैचुरल हो सकती है। आप किस बिज़नेस में हैं?",
        "ओके, यूज़ुअली यहाँ एआई एक बोरिंग रोबोटिक लाइन बोलता है। मैं वो नहीं करूँगी। सीधा बताइए—आपका बिज़नेस क्या करता है?",
        "हाय, मैं आर्था हूँ। आप इंग्लिश, हिंदी या हिंग्लिश में बात कर सकते हैं—जो कम्फर्टेबल लगे। तो बताइए, आपका बिज़नेस किस फील्ड में है?",
        "हे, मैं आर्था हूँ। सोचिए, आपकी हर कस्टमर कॉल इंस्टेंटली आंसर हो—ईवन आफ्टर ऑफिस आवर्स। अभी जब कॉल मिस होती है, तो आपकी टीम क्या करती है?",
        # The next five lean on the pre-warmed instant-connect itself as the
        # hook, rather than another "I'm Artha" self-intro — a visitor who's
        # used a few AI demos doesn't expect the call to just... already be
        # live. Kept gender-neutral where possible; "मान लेती हूँ"/"पाई" are
        # the two that needed an explicit feminine form (male list below).
        "अरे, आपने अभी क्लिक किया और मैं पहले से ही यहाँ हूँ — कोई लोडिंग नहीं, कोई अजीब सी चुप्पी नहीं। बताइए, ये आपके लिए कितना सरप्राइज़िंग है?",
        "एक सेकंड रुकिए — इससे पहले कि मैं कुछ बोलूं, आप बताइए: आपने आखिरी बार किसी कंपनी को कॉल किया था और वो असल में हेल्पफुल थी, कब?",
        "ठीक है, ऑनेस्टली बताऊं? मुझे पता है आप सोच रहे हैं 'ये कितनी देर तक रोबोट जैसा साउंड करेगी।' तो चलिए वही टेस्ट करते हैं — बताइए आपका बिज़नेस क्या है।",
        "आपने अभी टैप किया, तो मैं मान लेती हूँ आप सीरियस हैं, कैज़ुअली ब्राउज़ नहीं कर रहे। तो सीधा बताइए — आपकी कॉल्स का सबसे बड़ा सिरदर्द क्या है?",
        "मुझे बीस सेकंड्स दीजिए — अगर मैं आपको कन्विंस ना कर पाई कि ये असली कन्वर्सेशन है, तो आप हँस सकते हैं मुझ पर। डील? पहले बताइए, आप किस इंडस्ट्री में हैं?",
    ],
    "male": [
        "हे, आपने क्लिक किया है, तो अब मुझे प्रूव करना पड़ेगा कि मैं रोबोट जैसी साउंड नहीं करता। मैं आर्था हूँ, विस्ट्रो वॉइस से। आप इंग्लिश, हिंदी या हिंग्लिश में बात कर सकते हैं—बताइए, आपका बिज़नेस किस इंडस्ट्री में है?",
        "हे, आपने 'टॉक टू आर्था' क्लिक किया, तो मैं ऑफिशियली ड्यूटी पर आ गया। बताइए, आपका बिज़नेस क्या करता है?",
        "हाय, मैं आर्था हूँ, विस्ट्रो वॉइस से। मुझे 30 सेकंड्स दीजिए, मैं दिखाता हूँ कि एआई कन्वर्सेशन कितनी नैचुरल हो सकती है। आप किस बिज़नेस में हैं?",
        "ओके, यूज़ुअली यहाँ एआई एक बोरिंग रोबोटिक लाइन बोलता है। मैं वो नहीं करूँगा। सीधा बताइए—आपका बिज़नेस क्या करता है?",
        "हाय, मैं आर्था हूँ। आप इंग्लिश, हिंदी या हिंग्लिश में बात कर सकते हैं—जो कम्फर्टेबल लगे। तो बताइए, आपका बिज़नेस किस फील्ड में है?",
        "हे, मैं आर्था हूँ। सोचिए, आपकी हर कस्टमर कॉल इंस्टेंटली आंसर हो—ईवन आफ्टर ऑफिस आवर्स। अभी जब कॉल मिस होती है, तो आपकी टीम क्या करती है?",
        "अरे, आपने अभी क्लिक किया और मैं पहले से ही यहाँ हूँ — कोई लोडिंग नहीं, कोई अजीब सी चुप्पी नहीं। बताइए, ये आपके लिए कितना सरप्राइज़िंग है?",
        "एक सेकंड रुकिए — इससे पहले कि मैं कुछ बोलूं, आप बताइए: आपने आखिरी बार किसी कंपनी को कॉल किया था और वो असल में हेल्पफुल थी, कब?",
        "ठीक है, ऑनेस्टली बताऊं? मुझे पता है आप सोच रहे हैं 'ये कितनी देर तक रोबोट जैसा साउंड करेगा।' तो चलिए वही टेस्ट करते हैं — बताइए आपका बिज़नेस क्या है।",
        "आपने अभी टैप किया, तो मैं मान लेता हूँ आप सीरियस हैं, कैज़ुअली ब्राउज़ नहीं कर रहे। तो सीधा बताइए — आपकी कॉल्स का सबसे बड़ा सिरदर्द क्या है?",
        "मुझे बीस सेकंड्स दीजिए — अगर मैं आपको कन्विंस ना कर पाया कि ये असली कन्वर्सेशन है, तो आप हँस सकते हैं मुझ पर। डील? पहले बताइए, आप किस इंडस्ट्री में हैं?",
    ],
}

# English equivalents of the above, used instead whenever the demo agent's
# own "Default language" is explicitly set to English (or any non-Hindi
# language) — previously this branch ignored reply_language entirely and
# always spoke the Hinglish lines regardless of that setting.
_PLATFORM_DEMO_OPENERS_EN: dict[str, list[str]] = {
    "female": [
        "Hey, you clicked the button, so now I have to prove I don't sound like a robot. I'm Artha, from Vistrow Voice. What industry is your business in?",
        "Hey, you hit 'Talk to Artha,' so I'm officially on duty now. So, what does your business do?",
        "Hi, I'm Artha, from Vistrow Voice. Give me 30 seconds and I'll show you how natural an AI conversation can sound. What business are you in?",
        "Okay, usually this is where an AI says some boring robotic line. I'm not going to do that. Just tell me — what does your business do?",
        "Hi, I'm Artha. So, what field is your business in?",
        "Hey, I'm Artha. Imagine every customer call getting answered instantly — even after hours. Right now, when you miss a call, what happens on your end?",
        "Okay, you just clicked and I'm already talking — no loading spinner, no awkward pause. Kind of unsettling, right? What's got you checking this out?",
        "Hold on, before I say anything — when's the last time you called a business and the person on the other end actually helped, fast?",
        "Real talk — I know you're waiting to catch me sounding like a robot. Let's just get that test over with. What's your business?",
        "You actually tapped the button, so I'm going to assume you're serious, not just browsing. Straight up — what's the biggest headache with your calls right now?",
        "Give me twenty seconds — if I don't convince you this is a real conversation, you get to laugh at me. Deal? What industry are you in?",
    ],
    "male": [
        "Hey, you clicked the button, so now I have to prove I don't sound like a robot. I'm Artha, from Vistrow Voice. What industry is your business in?",
        "Hey, you hit 'Talk to Artha,' so I'm officially on duty now. So, what does your business do?",
        "Hi, I'm Artha, from Vistrow Voice. Give me 30 seconds and I'll show you how natural an AI conversation can sound. What business are you in?",
        "Okay, usually this is where an AI says some boring robotic line. I'm not going to do that. Just tell me — what does your business do?",
        "Hi, I'm Artha. So, what field is your business in?",
        "Hey, I'm Artha. Imagine every customer call getting answered instantly — even after hours. Right now, when you miss a call, what happens on your end?",
        "Okay, you just clicked and I'm already talking — no loading spinner, no awkward pause. Kind of unsettling, right? What's got you checking this out?",
        "Hold on, before I say anything — when's the last time you called a business and the person on the other end actually helped, fast?",
        "Real talk — I know you're waiting to catch me sounding like a robot. Let's just get that test over with. What's your business?",
        "You actually tapped the button, so I'm going to assume you're serious, not just browsing. Straight up — what's the biggest headache with your calls right now?",
        "Give me twenty seconds — if I don't convince you this is a real conversation, you get to laugh at me. Deal? What industry are you in?",
    ],
}

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
# Every tenant-agent opener above named the AGENT ("this is Artha") and
# never the actual business — confirmed real failure on a live healthcare
# demo call: a caller asked "your clinic is where?" one turn after an
# opener that never said which clinic they'd reached at all. For a real
# front desk, confirming the caller dialed the right place matters more
# than the agent introducing itself by name; if they want the agent's
# name, "who am I speaking to" is already answered elsewhere in the
# prompt. Gendered (कर रही/रहा हूँ) per the same self._voice_gender used
# throughout this file, so a male-voiced agent isn't misgendered on its
# very first line.
_DEFAULT_OPENER_HI_BUSINESS_FEMALE = "{greeting}{business_name} से बात कर रही हूँ। मैं आपकी कैसे मदद कर सकती हूँ?"
_DEFAULT_OPENER_HI_BUSINESS_MALE = "{greeting}{business_name} से बात कर रहा हूँ। मैं आपकी कैसे मदद कर सकता हूँ?"
_DEFAULT_OPENER_EN_BUSINESS = "{greeting}thanks for calling {business_name} — how can I help you today?"


# Sarvam bulbul:v3's own `pace`/`temperature`/`pitch` govern how the voice is
# actually delivered (speaking speed and prosodic variation) — separate from
# and complementary to the LLM's temperature, which only affects word choice.
# A flat/robotic-sounding voice is a TTS delivery problem, not a wording one,
# so tone presets live here rather than as an LLM sampling-temperature knob.
TONE_PRESETS: dict[str, dict[str, float]] = {
    # Measured and steady — a bit slower and low-variation, for formal/
    # informational agents (banking, legal, official notices).
    "professional": {"pace": 0.95, "temperature": 0.4, "pitch": 0.0, "loudness": 1.0},
    # Sarvam bulbul:v3's own defaults — natural conversational delivery.
    "balanced": {"pace": 1.0, "temperature": 0.6, "pitch": 0.0, "loudness": 1.0},
    # Faster and more expressive/varied prosody — addresses "slow and
    # robotic" by injecting more natural pitch/pace variation per line.
    # loudness slightly up — bulbul:v3's own "loudness" param (never wired
    # up before this), a genuinely separate dimension from pace/pitch that
    # reads as more present/engaged rather than just faster.
    "casual": {"pace": 1.08, "temperature": 0.85, "pitch": 0.05, "loudness": 1.1},
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

# Dashboard-facing "Emotion intensity" dial (see Agents.tsx). Emotion-
# reactive delivery is now Google-TTS-only (see on_user_turn_completed) —
# this multiplier is read into self._emotion_intensity below but currently
# has no effect on any provider's delivery; kept so the dashboard setting
# still round-trips cleanly if a future Google-side intensity control is
# added, rather than orphaning the DB column/UI control silently.
_EMOTION_INTENSITY_MULTIPLIERS = {"off": 0.0, "subtle": 0.5, "strong": 1.0}


# Deliberately narrow and low-ambiguity — a false positive here just adds a
# harmless system nudge the model can ignore, but a word like "बस" ("enough"/
# "just") shows up constantly in ordinary sentences and would nudge on
# nearly every turn, so it's left out.
_FAREWELL_WORDS = (
    "bye", "goodbye", "good bye", "bye bye",
    "बाय", "अलविदा",
    # "Thank you" alone (not mid-sentence gratitude for a specific answer)
    # is one of the most common real ways a caller actually signals a call
    # is over — observed live where the agent replied warmly to "Okay,
    # thank you" and just kept talking instead of ending the call.
    "thank you", "thanks", "थैंक यू", "धन्यवाद", "शुक्रिया",
)


def _looks_like_farewell(text: str) -> bool:
    lowered = (text or "").lower()
    return any(word in lowered for word in _FAREWELL_WORDS)


# capture_platform_lead/log_lead (tools.py) both write into userdata["lead_data"]
# already — this just reflects that dict back into the model's own context each
# turn instead of leaving it to re-derive "what did I already ask" from
# scrollback. Confirmed real failures this fixes: a caller's team-size answer
# landed across three fragmented turns and got asked again; a caller confirmed
# their sales focus in Hindi and got asked again in Marathi after a language
# switch — cross-language re-asking scrollback can't catch, a structured
# snapshot can.
_LEAD_FACT_LABELS = {
    "name": "name",
    "phone": "phone",
    "email": "email",
    "company": "company",
    "use_case": "use case",
    "team_size": "team size",
    "budget": "budget",
    "location": "preferred location(s)",
    "timeline": "timeline",
    # The three below were missing entirely, so the facts a property caller
    # opens with had nowhere to live and could not be reflected back. Call
    # 825: "वाकड़ में। 2 BHK apartment" in turn 3, dropped on the floor.
    "property_type": "property type",
    "configuration": "configuration",
    "purpose": "purpose",
}


# Unicode blocks for the scripts Sarvam can return. Used to catch the STT
# assigning a turn to the wrong language outright — confirmed on 4 of the 4
# longest recent agent-13 calls: Kannada on 825 ("ಹ್ಞೂ. ನೀವು ಎಷ್ಟರಲ್ಲಿ?"), Odia
# on 805, Bengali on 814, Malayalam on 813, every one of them from a Hindi
# speaker mid-Hindi call. _build_stt runs language="unknown" for the whole
# call, so each utterance is re-detected across 20+ languages with no bias
# toward the one already established, and short turns — the most common ones
# — carry the least acoustic evidence to detect from.
_SCRIPT_RANGES = {
    "devanagari": (0x0900, 0x097F),
    "bengali": (0x0980, 0x09FF),
    "gurmukhi": (0x0A00, 0x0A7F),
    "gujarati": (0x0A80, 0x0AFF),
    "odia": (0x0B00, 0x0B7F),
    "tamil": (0x0B80, 0x0BFF),
    "telugu": (0x0C00, 0x0C7F),
    "kannada": (0x0C80, 0x0CFF),
    "malayalam": (0x0D00, 0x0D7F),
}

_LANGUAGE_SCRIPT = {
    "hi": "devanagari", "mr": "devanagari", "ne": "devanagari",
    "bn": "bengali", "pa": "gurmukhi", "gu": "gujarati", "or": "odia",
    "ta": "tamil", "te": "telugu", "kn": "kannada", "ml": "malayalam",
}

# A real mid-call language switch by a caller is normally a full sentence; every
# drift observed in production was a fragment. Capping at 60 characters keeps
# the check off genuine multilingual switching, which is a product feature and
# must not be broken to fix an STT bug. Longest observed drift was 20 chars.
_MAX_SUSPECT_TRANSCRIPT_CHARS = 60


def _dominant_indic_script(text: str) -> str | None:
    counts: dict[str, int] = {}
    for ch in text or "":
        code = ord(ch)
        for script, (lo, hi) in _SCRIPT_RANGES.items():
            if lo <= code <= hi:
                counts[script] = counts.get(script, 0) + 1
                break
    if not counts:
        return None
    return max(counts, key=counts.get)


# "I already told you" in the phrasings that actually turn up on Indian calls.
# Call 825 got three of these in a row — अभी तो बताया मैंने / यह भी बताया मैंने /
# नहीं बता दिया था मैंने आपको पहले ही — and kept going as though none had
# happened. The complaint is the strongest possible signal that the facts
# block and the question just asked have diverged, and it was being ignored.
_REPEAT_COMPLAINT_PATTERN = re.compile(
    r"(बता\s*दिया|बताया\s*(मैंने|था|है)|मैंने\s*बता|बोल\s*दिया|कहा\s*था|सांगितल|"
    r"already\s+(told|said|mentioned|gave)|just\s+(told|said)\s+you|"
    r"bata\s*diya|maine\s*bata|i\s+said\s+(that|it)\s+already)",
    re.IGNORECASE,
)


# Content-free openers: the caller picking up and inviting you to speak, not
# telling you anything. Deliberately an exact whole-string match — "जी बोलिए"
# is an acknowledgement, "जी, Baner mein flat chahiye" is a requirement, and
# only the first may be dropped.
_OPENING_ACK_PATTERN = re.compile(
    r"^(?:\s*(?:जी|हाँ|हां|हा|हैलो|हेलो|नमस्ते|नमस्कार|बोलिए|बोलिये|बताइए|बताइये|"
    r"hello|hello\?|hi|hey|yes|yeah|yep|ok|okay|ji|haan|namaste|bolo|boliye|bataiye)"
    r"[\s,.।!?\-]*)+$",
    re.IGNORECASE,
)


def _looks_like_opening_ack(text: str) -> bool:
    text = (text or "").strip()
    # Length cap as a second guard: anything long enough to carry a
    # requirement is not an acknowledgement no matter what it starts with.
    return bool(text) and len(text) <= 40 and bool(_OPENING_ACK_PATTERN.match(text))


def _foreign_indic_scripts(text: str, expected: str) -> set[str]:
    """Indic scripts present in the text that are not the expected one."""
    found: set[str] = set()
    for ch in text or "":
        code = ord(ch)
        for script, (lo, hi) in _SCRIPT_RANGES.items():
            if lo <= code <= hi:
                if script != expected:
                    found.add(script)
                break
    return found


def _transcript_script_anomaly(text: str, reply_language: str) -> str | None:
    """Classify a turn by how its script relates to the language being spoken.

    Two anomalies, needing OPPOSITE handling, which an earlier version of this
    conflated into one boolean and got wrong on call 834:

    "garbled" — the WHOLE turn came back in another Indic script and is short.
    Call 825's "ಹ್ಞೂ. ನೀವು ಎಷ್ಟರಲ್ಲಿ?" from a Hindi speaker. Nothing in it can
    be trusted, so the agent should say it did not catch that and ask again.

    "fragment" — a stray foreign-script token sits inside an otherwise correct
    turn. Call 834's "ಹ್ಮ್. फ्लैट देख रहा हूँ मैं। मेरा बजट दो करोड़ है।", where
    "ಹ್ಮ್" is a mis-scripted "hmm" and the rest is a perfectly good sentence
    stating a budget. Treating that as garbled would throw away the budget;
    the only thing it must NOT do is count as evidence of a language switch.
    Two such fragments accumulated into a switch_reply_language on call 834
    and the agent answered three turns in Kannada while the caller asked in
    Hindi to switch back.

    Majority-vote on script cannot separate these — both of 834's turns are
    dominantly Devanagari, which is why the original check never fired.
    Latin is deliberately not a script here: Hinglish is constant and
    legitimate.
    """
    text = (text or "").strip()
    if not text:
        return None
    expected = _LANGUAGE_SCRIPT.get((reply_language or "").split("-")[0].lower())
    if expected is None:
        return None
    if not _foreign_indic_scripts(text, expected):
        return None
    if _dominant_indic_script(text) == expected:
        # Expected script still carries the turn — a stray token, not a switch.
        return "fragment"
    # Whole turn is in another script. Short means drift; a caller genuinely
    # switching language writes a full sentence, so leave those alone.
    return "garbled" if len(text) <= _MAX_SUSPECT_TRANSCRIPT_CHARS else None


def _transcript_looks_misrecognized(text: str, reply_language: str) -> bool:
    """Whether the turn is untrustworthy enough to ask the caller to repeat."""
    return _transcript_script_anomaly(text, reply_language) == "garbled"


# Only name/phone/email/budget/location/timeline/company/use_case/team_size
# have real `calls` columns (see db.save_call). The property fields log_lead
# now captures ride along in extracted_data rather than growing the schema
# for one vertical.
_EXTRA_LEAD_FACT_KEYS = ("property_type", "configuration", "purpose")


def _extra_lead_facts(lead_data: dict) -> dict:
    return {k: lead_data[k] for k in _EXTRA_LEAD_FACT_KEYS if lead_data.get(k)}


def _facts_reminder(lead_data: dict, fact_status: dict | None = None) -> str:
    """Reflect known facts back into the model's context, split by how much
    they can be trusted.

    The split exists because the two failure modes need opposite treatment.
    A fact the caller actually stated must NEVER be asked again — that is the
    repeated-question bug. A fact captured from a turn the ASR mangled must
    NOT be asserted back as settled — that is the unsupported-inference bug
    (call 825 turn 12, where an unintelligible turn became a confident "so
    you're looking at this for self-use"). One flat list cannot do both.
    """
    fact_status = fact_status or {}
    known, unconfirmed = [], []
    for key, label in _LEAD_FACT_LABELS.items():
        value = lead_data.get(key)
        if not value:
            continue
        (unconfirmed if fact_status.get(key) == "unconfirmed" else known).append(f"{label}: {value}")
    blocks = []
    if known:
        blocks.append(
            "# What you already know about this caller — NEVER ask for any of this again\n"
            + "\n".join(known)
            + "\nIf the caller says they already told you something, they are right: it is in "
            "this list. Acknowledge once, briefly, and move to a fact you do NOT have."
        )
    if unconfirmed:
        blocks.append(
            "# Heard, but NOT confirmed — you may verify these, and must not state them as fact\n"
            + "\n".join(unconfirmed)
            + "\nAsk about these as a question (\"...self-use ke liye?\"), never as a summary "
            "(\"...so you want self-use.\")."
        )
    return "\n\n".join(blocks)


# A label + one line of guidance per funnel stage. Deliberately advisory,
# not enforced — nothing blocks a tool call or a reply based on this; it's
# read the same way _appointment_instruction/_intake_instruction etc. are,
# as one more thing the model sees, not a gate. Stored as an index in
# userdata["funnel_stage"] (see _advance_funnel_stage below) so a call
# never regresses to an earlier-sounding stage just because one turn's
# signals happened to be weaker than the turn before it — same "first
# department wins, then never changes" reasoning as self._chosen_department.
_FUNNEL_STAGES = [
    ("OPENING", "Just started — greeting only so far."),
    ("DISCOVERY", "Still learning what they need. Ask, don't pitch yet."),
    ("PAIN", "They've named a use case — dig into what's actually costing them time or money today."),
    (
        "IMPACT",
        "You know roughly their scale (team/budget/location) — connect that to real cost/effort, "
        "don't just log the number. You do NOT yet have their name or a way to reach them — do not "
        "let the call end here. Confirmed real failure: a caller gave their team size and the call "
        "just ended right after with a goodbye, name and phone never asked for at all.",
    ),
    (
        "SOLUTION_FIT",
        "Enough is known to explain specifically how Vistrow Voice fits THEIR situation — not a "
        "generic feature list. Once you've made that case, the next thing you need is their name and "
        "a way to reach them — start working toward asking, one at a time. Ending the call here "
        "without ever asking is the same failure as ending it at IMPACT.",
    ),
    ("INTEREST", "They've asked about cost or plans, or sounded genuinely enthusiastic — this is the moment to offer a next step, don't keep pitching."),
    ("DEMO", "A demo/appointment is being discussed — check real availability, don't invent times."),
    ("CONTACT", "You have their name and a way to reach them — capture_platform_lead/log_lead now if you have not already this call."),
    ("CLOSE", "The appointment is confirmed. Wrap up, don't reopen discovery."),
]


def _advance_funnel_stage(
    userdata: dict,
    lead_data: dict,
    text: str,
    emotion: str | None,
    appointment_turn: bool,
    appointment_booked: bool,
    lead_captured: bool,
) -> int:
    """Computes the furthest stage THIS turn's signals reach, then stores
    the max ever seen this call — monotonic, so it only moves forward."""
    stage = 1  # any turn reaching on_user_turn_completed is past the opening
    # property_type/configuration are the property-call equivalent of a B2B
    # use_case: they are what the caller opens with. Without them a real-estate
    # call could not leave DISCOVERY at all, so the objective line never told
    # the agent it was time to stop asking and start recommending — call 825
    # sat at stage 1 for its full 218 seconds.
    if lead_data.get("use_case") or lead_data.get("property_type") or lead_data.get("configuration"):
        stage = 2
    if lead_data.get("team_size") or lead_data.get("budget") or lead_data.get("location"):
        stage = 4  # impact known implies solution-fit territory the same turn
    if _PRICING_INTEREST_PATTERN.search(text or "") or emotion == "excited":
        stage = max(stage, 5)
    if appointment_turn:
        stage = max(stage, 6)
    if lead_data.get("name") and (lead_data.get("phone") or lead_data.get("email")):
        stage = max(stage, 7)
    if appointment_booked or lead_captured:
        stage = 8
    prior = userdata.get("funnel_stage", 0)
    userdata["funnel_stage"] = max(prior, stage)
    return userdata["funnel_stage"]


def _current_objective(stage_index: int) -> str:
    name, guidance = _FUNNEL_STAGES[stage_index]
    return f"# Current objective: {name}\n{guidance}"


# The cadence cap ("max one filler every 3-5 turns") only holds if something
# counts fillers used, since "use fillers sparingly" is prose the model does
# not reliably self-track over a multi-turn call — the same lesson as the
# severity-once and post-booking rules elsewhere in this file. Checked
# against the START of the reply, where a filler actually lands; mid-sentence
# words like "actually" inside an unrelated sentence would false-positive.
_FILLER_MARKERS = (
    "हम्म", "हाँ,", "अच्छा", "मतलब", "देखिए", "अरे वाह", "अरे",
    "right,", "got it", "honestly", "actually", "well,", "so,",
)


def _reply_used_filler(text: str) -> bool:
    lowered = (text or "").strip().lower()
    return any(lowered.startswith(marker.lower()) for marker in _FILLER_MARKERS)


# Explicit self-identification only — deliberately not inferring gender from
# a name, tone, or anything indirect, since a wrong guess is worse than no
# guess at all. Covers common phrasing across English/Hindi/Hinglish.
_MALE_SELF_ID = ("i'm male", "i am male", "main male", "i'm a man", "i am a man", "main ladka", "मैं लड़का", "मैं पुरुष")
_FEMALE_SELF_ID = ("i'm female", "i am female", "main female", "i'm a woman", "i am a woman", "main ladki", "मैं लड़की", "मैं महिला")

# Deliberately narrow, same bar as detect_caller_emotion — a false negative
# here just means the static "search, don't dodge" prompt instruction is the
# only thing carrying that turn (today's status quo), not a regression. No
# \b on the Devanagari terms — see emotion.py's comment for why \b silently
# fails on combining vowel signs in these scripts.
_FACT_LOOKUP_PATTERN = re.compile(
    r"\b(hospital|school|college|nearby|near by|how far|distance|closest|nearest|"
    r"which (?:project|company|bank|branch|hospital|school)|current price|latest|"
    r"address of|located)\b|"
    r"अस्पताल|स्कूल|कॉलेज|नज़दीक|नजदीक|पास में|कितनी दूर|नज़दीकी|नजदीकी|कौन सा|कौनसा|"
    r"कहाँ है|कहां है|पता|कीमत",
    re.IGNORECASE,
)

# High-confidence appointment/availability language seen in real transcripts.
# This does not itself perform the lookup; it adds a last-moment instruction
# that makes the model call check_calendar_availability instead of treating a
# doctor's published working hours as proof that a real slot is free.
# A caller asking to be spoken to in another language. Same reinforcement
# pattern as _APPOINTMENT_INTENT_PATTERN below, for a failure confirmed three
# times in one day: the prompt says never to claim a fixed number of
# languages and never to fall back to Hindi or English, and the model refused
# anyway — "I'm sorry, but I can only respond in Hindi" to a caller asking for
# ENGLISH, which is one of the eleven native languages, on a voice that
# speaks 87. Instructions did not carry it; a last-moment instruction on the
# exact turn does.
_LANGUAGE_REQUEST_PATTERN = re.compile(
    r"\b(speak|talk|say|reply|respond|switch)\b[^.?!]{0,30}\b(in|to)\b[^.?!]{0,20}"
    r"(english|hindi|marathi|tamil|telugu|kannada|malayalam|gujarati|bengali|bangla|"
    r"punjabi|odia|french|german|spanish|japanese|korean|arabic|mandarin|chinese|"
    r"russian|italian|portuguese|dutch|urdu|nepali)\b|"
    r"\b(in|into)\s+(english|hindi|marathi|french|japanese|bengali|marathi)\b|"
    r"में\s*(बात|बोल)|"
    r"(अंग्रेज़ी|अंग्रेजी|हिंदी|हिन्दी|मराठी|तमिल|तेलुगु|कन्नड़|मलयालम|गुजराती|बंगाली|बांग्ला|"
    r"पंजाबी|उड़िया|फ्रेंच|जर्मन|स्पेनिश|जापानी|अरबी|चीनी|रूसी)|"
    r"मध्ये\s*बोला|বলুন|பேசு",
    re.IGNORECASE,
)

# Which department a complaint belongs to. Deterministic because the prompt
# got this exactly backwards: the healthcare nudge below used to end with
# "offer the one relevant general physician ... not a directory of
# pediatrics, dermatology, or orthopedics", written to stop the agent
# reciting a specialty list, and it read as "always send them to the GP".
# Call 725: a caller with two days of lower-tooth pain was told to see the
# general physician, mid-way through a dental booking he had already chosen.
_DEPARTMENT_PATTERNS: list[tuple[str, "re.Pattern[str]"]] = [
    ("Dentistry", re.compile(
        r"\b(tooth|teeth|dental|dentist|gum|cavity|molar)\b|दांत|दाँत|दात|मसूड़|डेंट", re.I)),
    ("Dermatology", re.compile(
        r"\b(skin|rash|acne|eczema|derma|pimple|itch)\b|त्वचा|स्किन|खुजली|दाने|मुँहासे", re.I)),
    ("Orthopaedics", re.compile(
        r"\b(bone|joint|knee|back pain|fracture|sprain|ortho|shoulder)\b|"
        r"हड्डी|घुटन|जोड़|कमर दर्द|कंधा|मोच", re.I)),
    ("Paediatrics", re.compile(
        r"\b(child|kid|baby|infant|paediatric|pediatric|son|daughter)\b|"
        r"बच्च|बेटा|बेटी|शिशु", re.I)),
]


def _department_for(text: str) -> str | None:
    for name, pattern in _DEPARTMENT_PATTERNS:
        if pattern.search(text or ""):
            return name
    return None


_APPOINTMENT_INTENT_PATTERN = re.compile(
    r"\b(appointment|availability|available|slot|book|booking|schedule|site visit|"
    r"come at|visit at|doctor available)\b|"
    r"अपॉइंटमेंट|अवेलेबल|अवेलेबिलिटी|स्लॉट|बुक|समय लेना|आ सकता|आ सकती|"
    r"कितने बजे|कोणत्या वेळी|अपॉइंटमेंट|उपलब्ध|वेळ|बुकिंग|"
    r"\d{1,2}(?::\d{2})?\s*(?:am|pm|बजे)|"
    r"(?:एक|दो|तीन|चार|पाँच|पांच|छह|सात|आठ|नौ|दस|ग्यारह|बारह)\s*बजे",
    re.IGNORECASE,
)

_BOOKING_AFFIRMATIVE_PATTERN = re.compile(
    r"^\s*(?:yes|yeah|yep|okay|ok|sure|please do|do it|go ahead|"
    r"जी(?:\s*[,，]?\s*(?:हाँ|हा|हां|ठीक है|कीजिए|कर दीजिए|कर दो|बुक कर(?:ो| दीजिए)?))?|"
    r"हाँ|हा|हां|ठीक है|कीजिए|कर दीजिए|कर दो|बुक कर(?:ो| दीजिए)?|"
    r"हो|होय|चालेल|करा)\s*[.!?।]*\s*$",
    re.IGNORECASE,
)
_BOOKING_CONTEXT_PATTERN = re.compile(
    r"appointment|availability|slot|book|schedule|doctor|time|"
    r"अपॉइंटमेंट|अवेलेबल|स्लॉट|बुक|डॉक्टर|समय|बजे|वेळ|उपलब्ध",
    re.IGNORECASE,
)
_HEALTHCARE_SYMPTOM_PATTERN = re.compile(
    r"pain|hurt|ache|symptom|fever|bleed|vomit|dizzy|breath|"
    r"दर्द|तकलीफ|पेट|बुखार|खून|उल्टी|चक्कर|साँस|सांस|"
    r"वेदना|ताप|रक्त|வலி|காய்ச்சல்|నొప్పి|ಜ್ವರ|വേദന|പനി|ব্যথা|জ্বর|ਦਰਦ|ਬੁਖਾਰ|ଦରଦ|ଜ୍ୱର",
    re.IGNORECASE,
)
# Deliberately narrow and high-precision: an outbound call's first "user"
# turn is the callee's own line, which on a real answer is a live human,
# but on an unanswered/forwarded line is an answering machine/carrier
# voicemail box reciting its own greeting. False positives here would cut
# the agent off on a live prospect mid-greeting, so this only fires on
# phrasing that's essentially unique to a recorded voicemail prompt (never
# said by a live human in casual conversation) rather than loose overlap
# terms like "not available" that a real person says constantly.
_VOICEMAIL_GREETING_PATTERN = re.compile(
    r"(leave|record).{0,25}(a\s+)?message.{0,25}(after the (tone|beep)|at the (tone|beep))|"
    r"after the (tone|beep).{0,25}(leave|record)|"
    r"voice ?mail(box)?|voicemail|"
    r"mailbox is full|"
    r"वॉइस ?मेल|आवाज़ संदेश|संदेश छोड़ें|टोन के बाद",
    re.IGNORECASE,
)

# Marks the funnel's DISCOVERY->PAIN->IMPACT->SOLUTION_FIT->INTEREST jump in
# _current_objective below — a caller asking about cost/plans is the
# clearest signal they've moved from "understanding the product" to
# "considering buying it," same idea as _APPOINTMENT_INTENT_PATTERN marking
# the DEMO jump.
_PRICING_INTEREST_PATTERN = re.compile(
    r"\b(price|pricing|cost|costly|costs|plan|plans|discount|expensive|afford|budget)\b|"
    r"कीमत|दाम|प्लान|खर्च|महंगा|सस्ता|छूट|डिस्काउंट",
    re.IGNORECASE,
)


def _detect_caller_gender(text: str) -> str | None:
    lowered = (text or "").lower()
    if any(phrase in lowered for phrase in _FEMALE_SELF_ID):
        return "female"
    if any(phrase in lowered for phrase in _MALE_SELF_ID):
        return "male"
    return None


# Deterministic backstop for a stubborn LLM bias: despite an explicit
# per-turn instruction (see on_user_turn_completed's gender reinforcement)
# telling the model this is ONLY about its own self-reference and must never
# be mirrored onto the caller, it has repeatedly done exactly that anyway —
# confirmed live across multiple real calls (both Sarvam and Gemini voices)
# after three separate rounds of prompt tuning failed to fully suppress it.
# Rather than trust the model to comply a fourth time, this rewrites the
# caller-directed feminine verb form to the neutral/masculine-plural default
# in the actual output text, unconditionally, whenever the caller hasn't
# explicitly told us they're a woman (_caller_gender != "female").
#
# Hindi's feminine present-tense marker before a formal/plural auxiliary is a
# trailing "ी" (सकती, चाहती, करती, बताती, रही, गई…) immediately followed by
# " हैं"/" थीं"; the masculine-plural/formal equivalent swaps that "ी" for "े"
# (सकते, चाहते, करते, बताते, रहे, गए).
#
# v1 of this only fired when "आप" appeared explicitly nearby — missed a real
# case live: "एकदम फ्रेश नज़र से देख रही हैं!" addresses the caller with no
# subject pronoun at all, which is completely normal Hindi (pro-drop) but
# meant the guard let it straight through. Fixed by firing on every such verb
# UNLESS the nearest preceding subject-like marker in the same sentence is
# explicitly third-person (वो/वह/वे/उसकी/उसका/उसके/उनकी/उनका/उनके/उस/उन) —
# a caller-facing call defaults to being about the caller, not some third
# party, so an unmarked/pro-dropped subject is treated as "आप" too. This can
# still mis-fire on a subject-less third-party NOUN reference the regex has
# no way to see ("मेरी दोस्त अच्छी हैं" — my friend is nice) since it isn't a
# pronoun at all — accepted tradeoff: misgendering the caller is the
# confirmed, repeat, user-facing failure; occasionally over-correcting a
# rare third-party mention is a much smaller cost.
# No \b here — same Devanagari word-boundary bug as emotion.py's keyword
# patterns (see that file's comment): combining vowel signs like ो/े/ी/ा
# aren't \w, so \b silently fails to match right after most of these words
# (e.g. "वो", "उनकी") — confirmed live: an earlier version of this exact
# regex used \b and let "वो बहुत अच्छी हैं" (a legitimate third-person
# reference) slip past the "is this third-person" check entirely.
# "डॉक्टर मीरा आएंगी" is about her, not the caller, but carries none of the
# pronouns below — so it was being rewritten to "आएंगे" and misgendering a
# named female doctor. A title is as good a third-person marker as a
# pronoun, and this clinic talks about its doctors constantly.
_THIRD_PERSON_SUBJECT = re.compile(
    r"(?:वो|वह|वे|उसकी|उसका|उसके|उनकी|उनका|उनके|उस|उन|डॉक्टर|डाक्टर|डॉ\.?|Dr\.?|Doctor)",
    re.IGNORECASE,
)
_APP_SUBJECT = re.compile(r"आप")
_GENDERED_VERB = re.compile(r"(\S*)ी(\s+(?:हैं|थीं))")
# Future tense is the other half, and it was missed entirely: the pattern
# above needs "ी" followed by हैं/थीं, so "क्या आप बुक करना चाहेंगी?" — no
# हैं anywhere — reached the caller unchanged. Matching the inflection
# itself (ेंगी / एंगी / ोगी) catches चाहेंगी, चुनेंगी, पाएंगी, करेंगी and
# the rest, while leaving nouns that merely end in गी alone: ज़िंदगी and
# सादगी have no े or ए before the गी, so they never match.
# No \\b — this codebase already learned that it silently fails after a
# Devanagari combining vowel sign (see emotion.py). With \\b appended these
# patterns matched nothing at all.
_GENDERED_FUTURE = re.compile(r"(ेंगी|एंगी|ोगी)")
_FUTURE_MASCULINE = {"ेंगी": "ेंगे", "एंगी": "एंगे", "ोगी": "ोगे"}


def _neutralize_caller_directed_gender(text: str) -> str:
    def _repl(m: re.Match) -> str:
        prefix = text[: m.start()]
        last_third = max((tm.end() for tm in _THIRD_PERSON_SUBJECT.finditer(prefix)), default=None)
        last_app = max((am.end() for am in _APP_SUBJECT.finditer(prefix)), default=None)
        # Most recent subject-like marker before this verb is third-person
        # and more recent than any "आप" — this is almost certainly about
        # that other person, leave it alone. Otherwise (most recent is
        # "आप", or no marker at all — pro-dropped) — caller-directed.
        if last_third is not None and (last_app is None or last_third > last_app):
            return m.group(0)
        return f"{m.group(1)}े{m.group(2)}"

    text = _GENDERED_VERB.sub(_repl, text)

    def _repl_future(m: re.Match) -> str:
        prefix = text[: m.start()]
        last_third = max((tm.end() for tm in _THIRD_PERSON_SUBJECT.finditer(prefix)), default=None)
        last_app = max((am.end() for am in _APP_SUBJECT.finditer(prefix)), default=None)
        # Same subject test as above: "वो कल आएंगी" is about her, not the
        # caller, and must not be touched.
        if last_third is not None and (last_app is None or last_third > last_app):
            return m.group(0)
        return _FUTURE_MASCULINE[m.group(1)]

    return _GENDERED_FUTURE.sub(_repl_future, text)


def _make_caller_gender_guard_transform(agent: "RealEstateAgent"):
    """Correct caller-directed gender without holding a whole long sentence.

    The first version buffered until ``।.!?`` so the correction regex could
    see a complete Hindi verb phrase.  That was safe, but it accidentally
    defeated streaming: a long first sentence did not reach TTS until its
    final punctuation, adding seconds of perceived latency for every tenant.

    Natural phrase punctuation is released immediately.  Long unpunctuated
    text is force-flushed near 88 characters while retaining its final two
    words; keeping that small tail is enough for a split ``सकती`` + ``हैं``
    sequence to be corrected after the next LLM delta arrives.  We therefore
    preserve the production gender guard without making callers wait for a
    paragraph-sized sentence."""

    phrase_boundary = re.compile(r"(?<=[।.!?,;:])")

    def _ready_chunks(buffer: str) -> tuple[list[str], str]:
        chunks: list[str] = []
        *complete, remainder = phrase_boundary.split(buffer)
        chunks.extend(part for part in complete if part)
        buffer = remainder

        # The LLM occasionally emits a long run without punctuation.  Keep
        # two trailing words so a gendered verb and its auxiliary can never
        # be separated across the correction boundary.
        while len(buffer) > 112:
            spaces = [m.start() for m in re.finditer(r"\s+", buffer[:96])]
            if len(spaces) < 3:
                break
            split_at = spaces[-3]
            chunks.append(buffer[:split_at])
            buffer = buffer[split_at:]
        return chunks, buffer

    async def _transform(text):
        buffer = ""
        async for chunk in text:
            buffer += chunk
            complete, buffer = _ready_chunks(buffer)
            for phrase in complete:
                yield phrase if agent._caller_gender == "female" else _neutralize_caller_directed_gender(phrase)
        if buffer:
            yield buffer if agent._caller_gender == "female" else _neutralize_caller_directed_gender(buffer)

    return _transform


# End-of-turn thresholds for the languages this product actually serves.
#
# The endpointing delay below only escalates from min_delay to max_delay when
# end_of_turn_probability < unlikely_threshold, so this threshold — not
# max_delay — is what decides HOW OFTEN a caller waits the full 4s. Measured
# on real calls: eouMs median 401ms but p90 4001ms, i.e. roughly one turn in
# ten was paying the ceiling.
#
# LiveKit ships per-language thresholds for 14 languages (see
# livekit.agents.inference.eot.languages.LOCAL_LANGUAGES). Hindi is tuned
# there at 0.3050, but Marathi, Bengali, Tamil, Telugu, Kannada, Malayalam,
# Gujarati, Punjabi and Odia are absent — 9 of the 11 languages we sell. An
# unlisted (or unreported) language falls back to LiveKit's OWN English
# default of 0.3600 — the single most conservative value in their table —
# which maximises escalation on exactly the calls we care about.
#
# English itself is explicitly listed at that same 0.3600, so a caller
# who code-switches into English (common mid-call — see call 803's
# transcript, "could you please speak in English?") pays the ceiling too,
# even though it's not one of the "unlisted" languages this comment
# originally covered. Confirmed against real call data (calls 802/803, both
# hit the 4001ms ceiling specifically on English turns) rather than assumed.
#
# So: apply LiveKit's own Indic-tuned Hindi value everywhere it doesn't
# already have deliberate coverage — the 9 unlisted Indic languages AND
# English. This is not a guessed number — it is the one value LiveKit tuned
# for an Indian language. The failure mode if it is slightly too low is the
# agent replying a shade early, which is recoverable; that is deliberately
# the opposite direction from lowering max_delay, which previously dropped
# whole transcripts (see the comment on EndpointingOptions below).
# The self-gender instruction injected every turn (see
# on_user_turn_completed) only ever talks about Hindi, Marathi, Gujarati and
# Punjabi verb forms - those are the languages this product speaks where a
# first-person verb is gendered. It was nonetheless sent on EVERY turn in
# every language, so an English, Tamil, Telugu, Kannada, Malayalam, Bengali
# or Odia call paid 687 uncached tokens per turn for an instruction that is
# a no-op there. Gating on the language actually being spoken keeps the
# reinforcement exactly where it was proven necessary (a female-voiced agent
# still drifting to "बताता हूँ") and drops it where it never applied.
# Self-correcting on a mid-call switch: _reply_language updates first, so
# the very next turn carries the instruction again.
_GENDERED_VERB_LANGUAGES = {"hi-IN", "mr-IN", "gu-IN", "pa-IN"}

# Lowered from LiveKit's tuned Hindi value (0.3050) to 0.25 on measurement:
# across 368 real turns since 25 August, end-of-utterance is BINARY — 82.3%
# finish at ~400ms and 17.7% pay the full 4s ceiling, with literally nothing
# in between. So max_delay only controls how long the bad case lasts; this
# threshold controls how OFTEN it happens, and moving a turn out of the
# ceiling bucket saves 3.6s rather than the ~1.5s that lowering max_delay
# could offer.
#
# 0.25 is not invented: LiveKit ships thresholds from 0.2 (Dutch) to 0.4
# (Korean), so this sits inside their own tuned range, between German (0.245)
# and Turkish (0.255), rather than below anything they consider safe.
#
# Direction of failure matters here. Too low means replying a shade early,
# which a caller talks over and recovers from. Lowering max_delay instead
# reintroduces the STT-finalization race that dropped whole transcripts twice
# in production (see EndpointingOptions below) — the caller's question never
# reaches the LLM and they get "are you still there?". That is why max_delay
# stays at 4.0.
# Held at 0.25. This was briefly lowered to 0.20 and reverted the same day
# once the change was actually measured instead of argued for — recording the
# negative result here so the next person does not spend the afternoon
# rediscovering it.
#
# eouMs is not a distribution. Across 1471 turns it is quantized to the
# configured constants and nothing else: 400ms x904, 450ms x137, 0ms x144 in
# the fast bucket; 4000ms x263 and 3000ms x20 (livekit's old default max_delay)
# in the slow one. Spread inside the slow bucket is 3001-4004ms. So the
# endpointer makes a BINARY choice between min_delay and max_delay, and this
# threshold only decides which branch — it cannot shave a partial second off
# anything.
#
# Which means the only question that matters is whether moving the threshold
# reallocates turns between the two buckets, and on the evidence it does not.
# Comparing the 0.3050 era against the 0.25 era, per agent, holding the agent
# constant to control for the traffic mix:
#
#   agent 4    15.8% of 749 turns at the ceiling  ->  27.0% of 163   (p<0.001, WORSE)
#   agent 13   27.3% of  33 turns                 ->  16.8% of 113   (p~0.18, n.s.)
#   agent 18   18.0% of 233 turns                 ->  18.8% of  96   (flat)
#
# No consistent direction, and the one statistically significant movement is
# in the wrong one. An earlier read of this data claimed 26.9% -> 18.2% as
# proof the lever worked; that was wrong — both of those periods already ran
# at 0.25 and the difference was English being added to the map, which is a
# different change entirely.
#
# The real gap is instrumentation: nothing logs the end-of-turn probability,
# so there is no way to see whether any threshold sits near the mass of the
# distribution. Log that first; tuning this blind is guessing.
#
# max_delay stays at 4.0 for the reason it always has — lowering it
# reintroduced the STT-finalization race that dropped whole transcripts twice,
# and transcriptionMs cannot detect that because it only records turns that
# succeeded.
_EOT_HINDI_THRESHOLD = 0.25
_EOT_UNLIKELY_THRESHOLDS = {
    lang: _EOT_HINDI_THRESHOLD
    for lang in ("hi", "mr", "bn", "ta", "te", "kn", "ml", "gu", "pa", "or", "en")
}


def _build_llm(model: str, *, max_output_tokens: int = 220):
    """Picks the LLM plugin by model-name prefix, so an operator can switch
    an agent between OpenAI and Gemini from the dashboard's model dropdown
    without any other config change. GEMINI_API_KEY is the name Google AI
    Studio labels its key with; fall back to GOOGLE_API_KEY (the google-genai
    SDK's own default env var) since either may already be set."""
    if model.startswith("gemini"):
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError(f"{model} is selected, but GEMINI_API_KEY is not configured.")
        # Gemini 3 Flash models otherwise use dynamic/high thinking, which is
        # useful for difficult reasoning but needlessly delays the first word
        # in a live phone conversation.  Minimal thinking is the intended
        # low-latency mode for chat/voice; the 3.5 Flash-Lite model already
        # defaults to it, but setting it explicitly keeps every Gemini voice
        # model on the same latency budget.
        return google.LLM(
            model=model,
            api_key=api_key,
            thinking_config={"thinking_level": "MINIMAL"},
            max_output_tokens=max_output_tokens,
        )
    if model.startswith("groq/"):
        # Groq runs open-weight models on its own LPU hardware and is the
        # fastest time-to-first-token available (~120-180ms in public
        # benchmarks vs ~900ms for gpt-4.1-mini at our prompt size), which is
        # why it is worth having even though the model list is narrower. Its
        # API is OpenAI-compatible, so the same plugin works with a base_url
        # swap — no separate client. Admin-gated in server/token_api.py until
        # it has been evaluated for Hindi/Marathi quality, not just speed.
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError(f"{model} is selected, but GROQ_API_KEY is not configured.")
        return openai.LLM(
            model=model.split("/", 1)[1],
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
            max_completion_tokens=max_output_tokens,
        )
    # Bound spoken replies and give OpenAI a stable cache-routing key.  The
    # exact prompt prefix still has to match before it can be reused, so this
    # does not mix one tenant's instructions or KB with another tenant's.
    return openai.LLM(
        model=model,
        max_completion_tokens=max_output_tokens,
        prompt_cache_key="vistrow-voice-agent-v1",
    )


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


def _env_enabled(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


# The recovered Google Cloud billing account is active again. Presence of a
# valid service-account JSON therefore enables Google speech by default;
# GOOGLE_VOICE_ENABLED=false remains an emergency kill switch that can be
# changed in deployment secrets without another code release.
_GOOGLE_VOICE_ENABLED = _GOOGLE_CREDENTIALS is not None and _env_enabled(
    "GOOGLE_VOICE_ENABLED", default=True
)


# Substring that marks a Google Chirp 3 HD voice name (e.g.
# "hi-IN-Chirp3-HD-Aoede"). Matched case-insensitively, the same way
# the Google plugin's own model auto-detection does it.
_CHIRP3_VOICE_MARKER = "chirp3"


def _speech_context_prompt(config: dict) -> str | None:
    """Domain vocabulary handed to Sarvam as a biasing hint at connect time.

    The script-mismatch check catches a turn dropped into the wrong language
    outright. It cannot catch the other half of the problem, which stays in
    the right script and so looks perfectly valid: "महिंद्रा सैटरडेल" for
    Mahindra Citadel, "Simpri Chinchwad" for Pimpri-Chinchwad. Proper nouns
    the recognizer has never seen are exactly what a prompt is for.

    Sent once in the initial config message (saaras models only — see the
    plugin's _send_initial_config), so it costs nothing per turn and never
    forces a reconnect. Deliberately NOT a language pin: the plugin exposes
    update_options only on the stream, it triggers a websocket reconnect, and
    SttFallbackAdapter does not forward it — so mid-call pinning would mean
    reaching past the adapter to restart the socket mid-conversation.
    """
    terms: list[str] = []
    business = (config.get("business_name") or config.get("account_name") or "").strip()
    if business:
        terms.append(business)
    # Titles and localities are the words callers actually say back.
    for line in (config.get("catalog_index") or "").splitlines():
        for bit in line.lstrip("- ").split(" | "):
            bit = bit.strip()
            # Skip the price/status columns — digits help nothing here.
            if bit and not any(c.isdigit() for c in bit) and bit not in terms:
                terms.append(bit)
    if not terms:
        return None
    # Kept short: this is a hint, not a dictionary, and an over-long prompt
    # biases the recognizer toward these words even when nobody said them.
    prompt = ", ".join(terms)[:400]
    return f"Indian real-estate and business call. Names likely to occur: {prompt}."


def _build_stt(speech_context: str | None = None):
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
        prompt=speech_context,
        flush_signal=True,
        # Sarvam's server-side VAD decides when END_SPEECH fires, which is
        # what releases the final transcript. Every one of its ten VAD knobs
        # was left unset, i.e. at Sarvam's defaults: negative_frames_count=18
        # over a negative_frames_window=24, and one frame is 512 samples =
        # 32ms at our 16kHz sample_rate. So Sarvam sat through 576ms of
        # silence before declaring the turn over, on every single turn.
        #
        # high_vad_sensitivity is Sarvam's own documented preset for
        # conversational voice agents: it drops count/window to 2/2, a ~64ms
        # boundary — 512ms sooner, every turn. It matters for more than the
        # 512ms: the plugin only waits EOS_FALLBACK_TIMEOUT (1.0s) after
        # END_SPEECH for the final transcript before giving up and emitting a
        # bare end-of-speech, which is the "transcript arrives after turn has
        # been committed" drop this file's EndpointingOptions comment
        # describes. Firing END_SPEECH earlier moves the whole exchange
        # further inside that budget rather than racing the edge of it.
        #
        # Deliberately the documented preset rather than hand-picked frame
        # counts: max_delay has already been lowered twice on latency
        # reasoning and reintroduced that drop both times. This changes only
        # the STT side and leaves max_delay=4.0 alone until measurement shows
        # finalization actually got faster.
        high_vad_sensitivity=True,
    )
    if _GOOGLE_CREDENTIALS is None or not _GOOGLE_VOICE_ENABLED:
        return sarvam_stt
    google_stt = google.STT(
        languages=["hi-IN", "en-IN"],
        detect_language=True,
        credentials_info=_GOOGLE_CREDENTIALS,
    )
    return SttFallbackAdapter([sarvam_stt, google_stt])


# bulbul:v2 was retired by Sarvam — every request returns "400: Model
# 'bulbul:v2' has been deprecated. Please use 'bulbul:v3'". Its six speakers
# are gone from the catalog (see voice_catalog.py), but a stale agent or
# account-voice-menu row can still name one, and sarvam.TTS RAISES at
# construction for a speaker the model does not know ("Speaker 'anushka' is
# not compatible with model 'bulbul:v3'"), which would kill the call before
# a word is spoken. So the speaker is validated against the plugin's own live
# roster and dropped to a gender-matched default if it is not on it — the
# rosters do not overlap, so an old v2 name can never be re-pointed directly.
try:
    from livekit.plugins.sarvam.tts import MODEL_SPEAKER_COMPATIBILITY as _SARVAM_ROSTER
except Exception:  # plugin internals are not API — never break startup over it
    _SARVAM_ROSTER = {}

_SARVAM_V3_DEFAULTS = {"male": "shubh", "female": "ritu"}


def _sarvam_v3_speaker(speaker: str, gender: str | None = None) -> str:
    roster = _SARVAM_ROSTER.get("bulbul:v3") or {}
    allowed = set(roster.get("all") or [])
    if not allowed:
        allowed = set(roster.get("male") or []) | set(roster.get("female") or [])
    if not allowed or speaker in allowed:
        return speaker
    replacement = _SARVAM_V3_DEFAULTS["male" if gender == "male" else "female"]
    logger.warning(
        "speaker %r is not on the bulbul:v3 roster (retired v2 voice?) — using %r",
        speaker, replacement,
    )
    return replacement

_GOOGLE_VOICE_PREFIX = "google:"
_GOOGLE_31_VOICE_PREFIX = "google31:"
_GOOGLE_25_MODEL = "gemini-2.5-flash-tts"
_GOOGLE_31_MODEL = "gemini-3.1-flash-tts-preview"
# Every google.TTS() construction in this file goes through PatchedGeminiTTS
# (google_tts_streaming_patch.py) for real streaming — see that module's
# docstring for the two real bugs it works around (an aclose() race on
# cancellation, and a barge-in Cancelled/499 being miscounted as a provider
# failure). Despite the class name, the fix isn't Gemini-specific.
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


# Monika (ElevenLabs) — the only safety net when BOTH Gemini models are
# down at once. Not a persona match for every Google voice (nothing is,
# short of the two Gemini models themselves), but a deliberate, one-time
# product choice for the rare full-Google-TTS-outage case, not per-tenant
# configurable — see _google_fallback_tts.
_GEMINI_OUTAGE_SAFETY_NET_VOICE_ID = "1qEiC6qsybMkmnNdVMbK"


def _google_fallback_tts(primary_tts, fallback_tts, primary_model: str, reply_language: str, tone_name: str):
    """Keep Gemini calls inside the same voice persona during failover.

    A 2.5-selected tenant voice temporarily uses the identical 3.1 persona;
    a 3.1 admin/marketing voice temporarily uses its identical 2.5 persona.
    FallbackAdapter continues probing an unavailable primary and restores it
    automatically. This avoids the conspicuous Google -> Sarvam speaker swap
    that callers previously heard in the middle of one conversation.

    max_retry_per_tts=5 (not 1): real Google Cloud Monitoring data showed
    genuine 504 timeouts on Gemini TTS, not just transient blips — a single
    retry gives up on calls that would have succeeded a moment later,
    reintroducing the mid-call Google->Sarvam voice swap this adapter exists
    to prevent. Paired with the 20s tts_conn_options timeout below.

    A third tier (ElevenLabs Monika) only engages if BOTH Gemini models are
    down at the same time — a genuine Google-wide TTS outage, not just one
    model's issue. That's rare, but the alternative (no third tier at all)
    was dead air for the rest of the call, which is worse for a caller than
    one more voice swap. Requires ELEVEN_API_KEY; silently 2-tier without it.
    """
    tts_chain = [primary_tts, fallback_tts]
    safety_net = None
    if _ELEVENLABS_API_KEY:
        eleven_base = _ELEVENLABS_TONE_PRESETS.get(tone_name, _ELEVENLABS_TONE_PRESETS[DEFAULT_TONE])
        eleven_language = (
            reply_language.split("-")[0] if reply_language in ELEVENLABS_SUPPORTED_LANGUAGES else NOT_GIVEN
        )
        safety_net = elevenlabs.TTS(
            voice_id=_GEMINI_OUTAGE_SAFETY_NET_VOICE_ID,
            model="eleven_flash_v2_5",
            language=eleven_language,
            voice_settings=elevenlabs.VoiceSettings(
                stability=eleven_base["stability"],
                similarity_boost=_ELEVENLABS_SIMILARITY_BOOST,
                style=eleven_base["style"],
                speed=eleven_base["speed"],
                use_speaker_boost=True,
            ),
        )
        tts_chain.append(safety_net)
    adapter = TtsFallbackAdapter(tts_chain, max_retry_per_tts=5)
    fallback_model = _GOOGLE_25_MODEL if primary_model == _GOOGLE_31_MODEL else _GOOGLE_31_MODEL

    def _on_availability_changed(ev):
        if ev.tts is primary_tts:
            if ev.available:
                logger.info("Google TTS %s recovered — restoring selected model", primary_model)
            else:
                logger.warning(
                    "Google TTS %s unavailable — silently using %s with the same persona until recovery",
                    primary_model,
                    fallback_model,
                )
        elif safety_net is not None and ev.tts is safety_net:
            if ev.available:
                logger.info("Gemini outage safety net (Monika) no longer needed")
            else:
                logger.error(
                    "Both Gemini TTS models unavailable — falling back to Monika (ElevenLabs) until either recovers"
                )

    adapter.on("tts_availability_changed", _on_availability_changed)
    # LiveKit's FallbackAdapter intentionally exposes no update_options().
    # Forward runtime language/style changes to both Gemini instances so the
    # backup remains an exact same-persona substitute after code switching or
    # emotion adaptation, rather than being frozen at the call's first turn.
    # The Monika safety net only understands `language` — Gemini-specific
    # kwargs (prompt/voice_name/model_name) don't apply to it, so those are
    # never forwarded there; best-effort only, since it's an emergency
    # backup voice, not the primary experience.
    def _update_all(**kwargs):
        primary_tts.update_options(**kwargs)
        fallback_kwargs = dict(kwargs)
        if "model_name" in fallback_kwargs:
            selected_model = fallback_kwargs["model_name"]
            fallback_kwargs["model_name"] = (
                _GOOGLE_25_MODEL if selected_model == _GOOGLE_31_MODEL else _GOOGLE_31_MODEL
            )
        fallback_tts.update_options(**fallback_kwargs)
        if safety_net is not None and "language" in kwargs:
            try:
                safety_net.update_options(language=kwargs["language"].split("-")[0])
            except Exception:
                logger.warning("Monika safety-net language update failed", exc_info=True)

    adapter.update_options = _update_all
    return adapter


def _build_tts(reply_language: str, speaker: str, tone: dict[str, float], tone_name: str):
    """Same fallback pattern as _build_stt, for TTS. Returns (tts, provider)
    — provider identifies the active TTS family, telling the caller which
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
    google_prefix = next(
        (prefix for prefix in (_GOOGLE_31_VOICE_PREFIX, _GOOGLE_VOICE_PREFIX) if speaker.startswith(prefix)),
        None,
    )
    if google_prefix and _GOOGLE_CREDENTIALS is not None and _GOOGLE_VOICE_ENABLED:
        voice_name = speaker[len(google_prefix) :]
        google_model = _GOOGLE_31_MODEL if google_prefix == _GOOGLE_31_VOICE_PREFIX else _GOOGLE_25_MODEL
        # Google's non-streaming synthesize_speech (forced by _GOOGLE_TTS_KWARGS
        # to dodge the streaming crash, see its own comment) has its own
        # confirmed live failure mode: it silently drops a chunk mid-reply
        # ("no audio frames were pushed for text" — upstream livekit/agents
        # issue #3347, unresolved) even though the LLM already produced the
        # full text. An operator who explicitly picked a Google voice still
        # gets it as primary; TtsFallbackAdapter catches that failure and
        # finishes the utterance on the other Gemini model instead of either
        # going silent or changing to a visibly different speaker family.
        if voice_name.lower() in _GOOGLE_MULTILINGUAL_VOICES:
            # TEST AGENT ONLY as of 2026-08-06 — see google_tts_streaming_patch.py.
            # Real streaming (default use_streaming=True, PCM encoding — the
            # opposite of _GOOGLE_TTS_KWARGS below) restored for just these two
            # Gemini personas via a subclass that guards the specific
            # cancel-time aclose() race that originally forced non-streaming
            # here. Not yet applied to the google-native branch below.
            google_prompt = GEMINI_TONE_PROMPTS.get(tone_name, GEMINI_TONE_PROMPTS[DEFAULT_TONE])
            google_tts = PatchedGeminiTTS(
                # Our own codes are Sarvam's spelling; Gemini wants or-IN for
                # Odia and bn-BD for Bengali, and rejects od-IN/bn-IN as
                # unknown locales. Every Gemini handoff goes through this.
                language=to_google_code(reply_language),
                voice_name=voice_name.capitalize(),
                model_name=google_model,
                credentials_info=_GOOGLE_CREDENTIALS,
                # Was never wired up before — every Google voice spoke at a
                # fixed 1.0x regardless of the agent's Tone preset, unlike
                # Sarvam/ElevenLabs below which both already read "pace" via
                # **tone. Same TONE_PRESETS pace values now apply here too
                # (professional=0.95, balanced=1.0, casual=1.08).
                speaking_rate=tone.get("pace", 1.0),
                # Gemini-TTS' real emotion mechanism — see GEMINI_TONE_PROMPTS
                # in emotion.py. Reinforced per-turn with the caller's
                # detected emotion in on_user_turn_completed.
                prompt=google_prompt,
            )
            fallback_model = _GOOGLE_25_MODEL if google_model == _GOOGLE_31_MODEL else _GOOGLE_31_MODEL
            google_model_fallback = PatchedGeminiTTS(
                language=to_google_code(reply_language),
                voice_name=voice_name.capitalize(),
                model_name=fallback_model,
                credentials_info=_GOOGLE_CREDENTIALS,
                speaking_rate=tone.get("pace", 1.0),
                prompt=google_prompt,
            )
            provider = "google-multilingual-31" if google_model == _GOOGLE_31_MODEL else "google-multilingual"
            return _google_fallback_tts(google_tts, google_model_fallback, google_model, reply_language, tone_name), provider
        # "google:chirp3:<Persona>" is a persona, not a voice id — resolve it
        # against the language this call opens in. The persona survives a
        # mid-call switch by swapping only the locale prefix (see
        # switch_reply_language), which is what makes one Chirp 3 voice cover
        # all ten Indian languages.
        _chirp_persona = voice_catalog.chirp3_persona(speaker)
        if _chirp_persona:
            voice_name = voice_catalog.chirp3_voice_name(_chirp_persona, reply_language)
        voice_language = "-".join(voice_name.split("-")[:2])
        # Real streaming, same as the Gemini-persona branch above — despite
        # its name, PatchedGeminiTTS's fix (aclose() race + the Cancelled/499
        # barge-in miscount, see google_tts_streaming_patch.py) is generic to
        # google.TTS's SynthesizeStream, not Gemini-specific, and this branch
        # was only ever left on non-streaming because it hadn't been
        # exercised against that same race yet. TtsFallbackAdapter +
        # max_retry_per_tts below already handle genuine failures.
        # NOT PatchedGeminiTTS/streaming here, and not by oversight. Google
        # Cloud rejects these outright on the streaming endpoint —
        # "Currently, only Chirp 3: HD voices are supported for streaming
        # synthesis." google.TTS nonetheless advertises
        # capabilities.streaming = True, so AgentSession calls .stream(),
        # every request 400s, TtsFallbackAdapter burns its five retries, and
        # the caller silently gets the Sarvam safety net instead of the voice
        # the operator picked. Confirmed on call 836 (agent 13 set to
        # google:hi-IN-Standard-A, whole call recorded Sarvam/bulbul:v3) and
        # reproduced directly against Google with real credentials.
        #
        # This is the whole "Vistrow Native" tier — Aditi, Aarav, Kabir,
        # Vihaan, Isha, Om, Nila, Arjun, Ananya. It has been broken since the
        # voices were added, not since streaming was switched on: plain
        # google.TTS fails the same way for the same reason.
        #
        # StreamAdapter routes them through synthesize(), which these voices
        # DO support, chunked per sentence. Measured against Google: raw
        # synthesize 940ms to first audio, StreamAdapter 524ms, versus the
        # streaming endpoint's outright failure.
        if _CHIRP3_VOICE_MARKER in voice_name.lower():
            # Chirp 3 HD is the one Google family the streaming endpoint DOES
            # accept — it is literally what the error above names. So these
            # stream natively and skip the StreamAdapter round-trip entirely:
            # measured 278ms to first audio against 360-670ms for the Standard
            # voices below. The plugin picks model_name="chirp_3" on its own
            # from the voice name, so nothing needs passing here.
            google_tts = PatchedGeminiTTS(
                language=voice_language,
                voice_name=voice_name,
                credentials_info=_GOOGLE_CREDENTIALS,
                speaking_rate=tone.get("pace", 1.0),
            )
        else:
            google_tts = StreamAdapter(
                tts=google.TTS(
                    language=voice_language,
                    voice_name=voice_name,
                    credentials_info=_GOOGLE_CREDENTIALS,
                    speaking_rate=tone.get("pace", 1.0),
                ),
                sentence_tokenizer=tokenize.blingfire.SentenceTokenizer(retain_format=True),
            )
        # Locale-specific Google Standard voices are not Gemini personas, so
        # 3.1 cannot preserve their identity. Keep their existing gender-
        # matched Sarvam safety net; the same-persona 2.5 <-> 3.1 routing
        # above applies to Mira/Arin, which are the tenant/marketing Flash
        # voices requested here.
        safety_speaker = "ritu" if (voice_catalog.get_voice(speaker) or {}).get("gender") == "female" else "shubh"
        sarvam_safety_net = sarvam.TTS(
            target_language_code=reply_language,
            model="bulbul:v3",
            speaker=safety_speaker,
            **tone,
        )
        # max_retry_per_tts=5: see _google_fallback_tts docstring above —
        # real Google-side 504s need real retries, not a single attempt.
        _adapter = TtsFallbackAdapter([google_tts, sarvam_safety_net], max_retry_per_tts=5)
        # FallbackAdapter has no update_options, so a mid-call language switch
        # cannot reach the Google TTS through it. Stash the primary: this is
        # the only handle switch_reply_language has for swapping a Chirp 3
        # persona's locale without tearing down the session's TTS.
        _adapter._vistrow_primary = google_tts
        return _adapter, "google-native"
    # A Google or ElevenLabs voice selected with no credentials/key
    # configured falls back to the default Sarvam speaker rather than
    # passing the raw "google:..."/"elevenlabs:..." string through as an
    # invalid Sarvam speaker name.
    sarvam_speaker = (
        "shubh"
        if speaker.startswith((_GOOGLE_VOICE_PREFIX, _GOOGLE_31_VOICE_PREFIX, _ELEVENLABS_VOICE_PREFIX, _ELEVENLABS_V3_VOICE_PREFIX))
        else speaker
    )
    sarvam_tts = sarvam.TTS(
        target_language_code=reply_language,
        # v2 is retired vendor-side; v3 is the only model left.
        model="bulbul:v3",
        speaker=_sarvam_v3_speaker(
            sarvam_speaker, (voice_catalog.get_voice(speaker) or {}).get("gender")
        ),
        **tone,
    )
    if _GOOGLE_CREDENTIALS is None or not _GOOGLE_VOICE_ENABLED:
        return sarvam_tts, "sarvam"
    # Same streaming fix as the two branches above — see the comment on the
    # google-native branch for why PatchedGeminiTTS applies here too.
    google_tts = PatchedGeminiTTS(
        language=to_google_code(reply_language), credentials_info=_GOOGLE_CREDENTIALS
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
    transfer tool (only if a transfer number is set) are appended.

    The appointment/booking tools are for a real calendar — either a real
    TENANT business's own (check_calendar_availability, book_appointment,
    request_callback, log_lead — the real-estate-shaped budget/location/
    timeline capture), or Vistrow's own sales calendar for the plain
    marketing demo booking an actual product-demo meeting. An industry
    ROLE-PLAY demo (is_platform_demo AND a public_demo_slug — healthcare,
    real estate, etc., answering as a fictional business) must never get
    them: registering them let the model call check_calendar_availability on
    its own initiative mid-pitch (confirmed live, call 762: customer was
    still describing their use case, never asked about a demo or next step,
    and got offered specific calendar slots out of nowhere), and any
    booking it DID make would land on Vistrow's real calendar under a made-up
    business's name. The plain marketing demo (is_platform_demo, no slug —
    the actual homepage Artha) has no such fictional-business problem: "book
    my demo" there means a real meeting with Vistrow's own sales team, so it
    keeps the real booking tools, just without log_lead (the budget/
    location/timeline shape doesn't fit a product-demo booking).
    """
    is_industry_roleplay_demo = bool(config.get("is_platform_demo")) and bool(
        (config.get("public_demo_slug") or "").strip()
    )
    is_plain_platform_demo = bool(config.get("is_platform_demo")) and not is_industry_roleplay_demo
    if is_industry_roleplay_demo:
        tools = [capture_platform_lead, switch_reply_language]
    elif is_plain_platform_demo:
        tools = [
            check_calendar_availability,
            book_appointment,
            request_callback,
            capture_platform_lead,
            switch_reply_language,
        ]
    else:
        tools = [
            check_calendar_availability,
            book_appointment,
            # Always on, never optional: it is the only thing standing between a
            # caller who could not be given a slot and being forgotten entirely.
            request_callback,
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
    # Offered only when this specific agent has been assigned the tenant's
    # live catalog and the catalog contains data.
    if config.get("has_live_catalog"):
        tools.append(lookup_catalog)
    if _on("send_dtmf"):
        # Lets the agent press digits when it reaches an automated phone
        # tree instead of the person it dialled — an outbound call to a
        # business landline before a personal cell. Built into the LiveKit
        # SDK (livekit.agents.beta.tools) — publishes real DTMF tones over
        # the SIP leg via room.local_participant.publish_dtmf, a no-op on a
        # browser/widget call (the tool's own try/except returns an error
        # string rather than raising), so no call-type gating is needed here.
        tools.append(send_dtmf_events)
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
        # Kept for the greeting audio cache's key — a cached clip is only ever
        # replayed for the exact voice it was synthesized with.
        self._voice_value = voice_value
        self._is_platform_demo = bool(config.get("is_platform_demo"))
        self._public_demo_slug = (config.get("public_demo_slug") or "").strip().lower()
        # tools.py needs the knowledge base to enforce a named practitioner's
        # working days against the calendar's business-wide slots.
        self._kb_id = config.get("kb_id")
        self._healthcare_symptom_mentioned = False
        # Set from the caller's first recognisable complaint; see the capture
        # in on_user_turn_completed.
        self._chosen_department: str | None = None
        # The severity/urgency question is a one-shot; see the per-turn block.
        self._severity_asked = False
        # Set by book_appointment. Once true the booking is done and the
        # call closes: no more clinical questions.
        self._appointment_booked = False
        self._booking_confirmed_this_turn = False
        # Starts allowed (>=4) so the opening line isn't penalised for having
        # no prior turn to compare against. Updated once per turn in
        # on_user_turn_completed from the previous reply, then read by the
        # personality instruction below to gate whether a filler is allowed
        # this turn — "use fillers sparingly" alone did not hold a cadence.
        self._turns_since_filler = 4
        self._agent_name = agent_name
        self._visitor_first_name = visitor_name.strip().split()[0] if visitor_name else None
        # Resolve this before choosing built-in vs custom instructions. Public
        # industry demos use focused custom prompts, but their opening still
        # needs to say which fictional business the caller reached (the exact
        # healthcare transcript bug fixed for generic tenant agents). The
        # platform sales demo has its own opener and simply ignores this.
        business_name = (
            (config.get("business_name") or "").strip()
            or (config.get("account_name") or "").strip()
            or "this business"
        )
        self._business_name = business_name
        # A custom system_prompt REPLACES the built-in persona wholesale, so
        # it also loses all of that persona's human-delivery guidance —
        # fillers, self-correction, fragments, varied turn length. Measured
        # on the live database: 8 of 14 agents were custom-prompt, including
        # real tenant agents, i.e. the majority of production traffic was
        # getting the flat, obviously-synthetic delivery. Those agents get
        # the shared layer appended below instead; the two built-in personas
        # already carry it inline and must not have it stacked twice.
        # Whether this agent's voice speaks past the Indian set. Computed
        # before the prompts are built because the closed "fluent in eleven
        # languages" list inside them has to change, not be argued with
        # afterwards — see build_generic_assistant_prompt's docstring.
        _vc_entry = voice_catalog.get_voice(voice_value) or {}
        speaks_global = bool(_vc_entry.get("multilingual")) and voice_value.startswith(
            ("google:", "google31:")
        )
        needs_human_speech_layer = bool(config.get("system_prompt"))
        if config.get("system_prompt"):
            instructions = config["system_prompt"]
        elif config.get("is_platform_demo"):
            instructions = build_platform_assistant_prompt(
                agent_name, speaks_global, can_book_real_demo=not self._public_demo_slug
            )
        else:
            # build_generic_assistant_prompt has always taken a business_name,
            # but nothing ever passed one — so every tenant on the built-in
            # persona introduced itself as the literal words "this business".
            # Order: the agent's own override (multi-brand tenants, and the
            # public industry demos, which run on the operator's account but
            # must answer as their demo business), then the tenant's company
            # name from signup, then the old placeholder.
            instructions = build_generic_assistant_prompt(agent_name, business_name, speaks_global)
        if needs_human_speech_layer:
            # Appended AFTER the tenant's own prompt so their content and
            # rules read first and win any conflict — this layer is delivery
            # only and says so explicitly.
            instructions += "\n\n" + build_human_speech_manner()
        if self._public_demo_slug:
            # Public role-play callers often repeat the business name after
            # the greeting, while multilingual STT returns a close phonetic
            # spelling (the finance demo heard "Saarthi" as "Earth"). That
            # is confirmation, not a request about a different company. This
            # runtime rule applies even to demo prompts already stored in the
            # database, which the seeder deliberately does not overwrite.
            instructions += (
                "\n\n# Business-name recognition\n"
                f"The business in this call is {business_name}. If the caller repeats, shortens, "
                "or slightly mispronounces that name, assume it is a normal speech-recognition "
                "variation. Briefly confirm the business name and ask how you can help. Never say "
                "you have no information about a close-sounding version of the same name, and do "
                "not correct or lecture the caller unless they clearly ask about another company."
            )
            instructions += "\n\n" + build_industry_demo_style(self._public_demo_slug, business_name)
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
        elif visitor_phone:
            # Inbound phone call: the caller's number came from caller ID
            # (see _caller_number_from_sip), not from anything they typed or
            # said, so there's no name yet — only skip re-asking the number.
            instructions += (
                f"\n\n# Caller context\nThis call arrived from {visitor_phone} (caller ID), so you "
                "already have the caller's phone number — never ask for it. If you need their name "
                "for the brochure/callback/site-visit, ask for that only."
            )
        # Optional structured inventory/service/catalog data assigned to this
        # agent. Only a compact index enters the prompt; full details are
        # retrieved on demand so catalog size does not slow every call.
        catalog_index = config.get("catalog_index") or ""
        if catalog_index:
            instructions += (
                "\n\n# This business's live catalog\n"
                "These are the catalog items currently available from this business. Never invent an item "
                "or quote a figure that isn't here or returned by lookup_catalog.\n"
                f"{catalog_index}\n"
                "For exact variants, prices, availability, specifications, amenities, or descriptions, call "
                "lookup_catalog — don't guess, and don't tell the caller you're looking it up "
                "unless it takes a moment."
            )
        if config.get("kb_id"):
            _kb_t0 = time.monotonic()
            kb = db.get_kb_content(config["kb_id"])
            logger.info("[latency] get_kb_content(%s) took %.2fs", config["kb_id"], time.monotonic() - _kb_t0)
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
                        "business's specific facts.\n"
                        "- OPENING HOURS AND WORKING DAYS are facts like any other. Asked the same "
                        "question twice, give the SAME answer — a real call answered \"Monday, "
                        "Wednesday, Friday 10-1\" (correct, from the knowledge base) and then, asked "
                        "again, \"Monday to Friday 10-1 and 4-7, Saturday 10-1\", which appears "
                        "nowhere in it. Never widen hours, add an evening session, or add a day.\n"
                        "- Asked which doctors, staff, services or departments exist, name ALL of "
                        "them from the knowledge base, not only the one you already suggested — a "
                        "real call named a single doctor when asked which others the clinic "
                        "had, then produced a second one a turn later when asked about a "
                        "different specialty. Withholding what you know reads as not "
                        "having it.\n"
                        "- Never add an opinion the knowledge base does not contain. Declining to "
                        "give a doctor's experience and then calling her \"a good doctor\" in the "
                        "same breath is still inventing a fact. Distances and travel times are "
                        "facts too — do not state them unless they are written down.\n"
                        "- check_calendar_availability returns the BUSINESS's open slots. It does "
                        "not know which staff member works which days. If the knowledge base gives "
                        "a specific person's days or hours, a slot outside them is NOT bookable "
                        "with that person — say which days they actually work and offer one of "
                        "those instead.\n\n" + kb
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
            "- Any per-tenant business call (this is the default): call log_lead the MOMENT "
            "the caller gives you any detail at all. Every one of its fields is optional — "
            "pass only what you just learned and leave the rest out; anything you omit keeps "
            "its previous value. You do NOT need their name first, you do NOT need a phone "
            "number first, and you must NEVER pass a placeholder like \"not applicable\" or "
            "\"unknown\" to fill a field in. Calling it eight separate times across one call "
            "with a single field each is exactly right. The moment a number, price, or figure "
            "leaves the caller's mouth in answer to a budget question (in any language or unit "
            "— \"एक करोड़\", \"50 lakh\", \"around 2 crore\" all count), call log_lead with "
            "that value in the very next tool call you make, before you say anything else back "
            "to them. Same the instant they name a locality, a timeline, a property type or a "
            "configuration — log it immediately, don't hold details in your head to log "
            "together later, and don't let booking an appointment end the call before you have "
            "logged what they just told you. If they name two localities, call it twice: "
            "locations accumulate, so both are kept.\n"
            "- Booking an appointment (any business — clinic, salon, consultation, "
            "property site visit): when the caller wants to book a time, first call "
            "check_calendar_availability for their preferred date to see real open "
            "slots, offer those slots, and once they pick one call book_appointment to "
            "confirm it. Never promise a specific slot before check_calendar_availability "
            "confirms it's free. Published business/doctor hours in the knowledge base tell "
            "you when someone normally works; they NEVER prove that an appointment slot is "
            "still open. Live availability questions must use the calendar tool. Before "
            "book_appointment, you must have the caller's real name, phone number, and a short "
            "purpose/reason for the visit. If any are missing, ask for them one at a time. "
            "Never say booked, confirmed, reserved, or saved unless book_appointment returned "
            "success in this call. A proposed time is not a booking.\n"
            "- Vistrow Voice platform-assistant calls (explaining Vistrow Voice itself "
            "to a prospective customer): once you have the caller's name plus at least "
            "one more of company/contact/use case/team size, call "
            "capture_platform_lead — call it again if more comes up later in the same "
            "call.\n"
            "These tool calls are silent to the caller — never mention or narrate that "
            "you're saving, logging, or recording anything.\n\n"
            "# Never claim something you have not actually done\n"
            "Do NOT tell the caller you have noted, saved, recorded, logged, sent, shared, "
            "forwarded, booked or arranged anything unless a tool returned success for it in "
            "THIS call. If you have not called the tool, describe what you WILL do, never what "
            "you have already done. If no tool exists for it at all, do not offer it — in "
            "particular, never promise to send a brochure, pricing, details or a message over "
            "WhatsApp, SMS or email unless you have a tool that actually sends it and it "
            "succeeded. A caller who hangs up waiting for something that will never arrive is "
            "worse off than one you told the truth to. Confirmed real failure (call 825): the "
            "agent said it had noted the caller's budget when nothing had been recorded, then "
            "promised a WhatsApp that no tool on this call could send.\n\n"
            "# Only state back what they actually said\n"
            "If the caller plainly told you something, treat it as settled and never ask again. "
            "If you are filling a gap by inference, put it as a question, not a summary: "
            "\"...self-use ke liye dekh rahe hain?\" — never \"...self-use ke liye dekh rahe "
            "hain.\" If they tell you they already answered something, they are right: "
            "acknowledge it once, briefly, without apologising twice, and move to something you "
            "genuinely do not know yet. If a message is garbled or makes no sense in context, "
            "say in one short line that you did not catch it and ask them to repeat it — never "
            "cover for it by asking a different question instead.\n\n"
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
        # Mirrors the flag _build_tools uses to bind lookup_catalog, so the
        # per-turn catalog nudge only fires on agents that actually have it.
        self._has_live_catalog = bool(config.get("has_live_catalog"))
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
        # A Gemini persona voice is not limited to the native 11 — it speaks
        # the full documented Gemini-TTS range. Without being told, the LLM
        # falls back on the built-in prompt's "you are fluent in <11 Indian
        # languages>" line and will refuse a caller who asks for French or
        # Japanese on a voice that can do both. Only appended for those
        # voices: a Sarvam voice handed "de-DE" fails outright, so promising
        # German there would be worse than saying nothing.
        if speaks_global:
            # Naming all 76 cost ~700 tokens of a prompt that is already
            # rate-limiting the account: OpenAI 429s at 200k tokens/minute
            # and every turn resends the whole thing. The roll-call bought
            # nothing — the model does not need to recite the catalogue, it
            # needs to know the range is wide and that switch_reply_language
            # is the thing that actually knows it.
            instructions += (
                "\n\n# Global languages — this voice speaks far more than the Indian set\n"
                "Your voice is one of the global multilingual ones. On top of Hindi, English, "
                "Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi and "
                "Odia, you speak ~76 more worldwide — French, German, Spanish, Italian, "
                "Portuguese, Dutch, Arabic, Japanese, Korean, Mandarin, Russian, Turkish, "
                "Vietnamese, Thai, Polish, Ukrainian, Urdu and Nepali among them. If a caller "
                "asks for a language you do not see named here, assume you HAVE it and call "
                "switch_reply_language anyway — that tool knows the real list, you do not.\n"
                "Treat every one of them exactly like the Indian languages: if the caller uses "
                "one, reply in it, in its own native script, and call switch_reply_language "
                "with its plain English name first so your pronunciation follows.\n"
                "THIS SUPERSEDES ANYTHING ABOVE. Earlier sections of this prompt list only the "
                "Indian languages — that list describes the other voices, not yours. Confirmed "
                "real failure: asked \"could you speak French?\", the agent answered that it "
                "speaks only some Indian languages and that the platform limits it, on a voice "
                "that speaks French perfectly well. Never say you cannot speak one of the "
                "languages above, never call it a platform limitation, and never offer to fall "
                "back to Hindi or English instead — just switch and speak it.\n"
                "A request to speak a language is an ACTION, not a question about this business, "
                "so the knowledge-base rules do not apply to it: never answer one with \"I don't "
                "have that information\" or \"I'll have the team confirm\". Call "
                "switch_reply_language and speak. And you are never locked into a language for "
                "the rest of a call — if you switched by mistake and the caller objects, apologise "
                "in one short line, switch to what they asked for, and carry on. Refusing every "
                "later switch because one earlier one was wrong is the failure, not the fix.\n"
                "Callers name languages in their OWN language, not in English — \"फ्रेंच\", "
                "\"जापानी\", \"बंगाली\", \"मराठीत\", \"ਪੰਜਾਬੀ\", \"french\", \"francais\". Treat "
                "any of those as the language itself and call switch_reply_language with its "
                "plain English name.\n"
                "Watch for this specific trap, seen on a real call: the caller had been "
                "discussing their FRENCH CUSTOMERS, then asked \"मुझे फ्रेंच में बात करके दिखाओ\" "
                "— show me by speaking French. Because the topic was French customers, the agent "
                "read it as more conversation about customers and answered \"आपके फ्रेंच ग्राहकों "
                "के लिए आपको क्या सर्विस चाहिए?\" three times while the caller kept asking. "
                "\"<language> में बात करो/बात करके दिखाओ/speak in <language>\" is ALWAYS a request "
                "to switch, never a question about that language's customers, however much the "
                "surrounding conversation is about them.\n"
                "Speech recognition also garbles language names — \"फ्रेंच\" comes back as "
                "\"फ्रेंड्स\" (friends). If a caller seems to be asking you to speak something "
                "and the word is close to a language name, ask \"क्या आप चाहते हैं मैं फ्रेंच में "
                "बात करूँ?\" — one short question. Never silently carry on with the old topic.\n"
                "Finally: never announce a restriction you do not have. Saying \"मैं सिर्फ हिंदी "
                "में बात करूंगी\" before switching anyway is wrong — you speak all of the above, "
                "so just switch."
            )
        # Grammatical gender: many Indian languages (Hindi, Marathi, Gujarati,
        # Punjabi, Bhojpuri…) inflect first-person verbs by the SPEAKER's
        # gender, so the LLM must know whether this agent's voice is a woman or
        # a man — otherwise it defaults to masculine forms and a female voice
        # says "बताता हूँ" instead of "बताती हूँ". Derived from the voice's
        # catalog gender so it's automatic for every voice, no per-agent config.
        _gender = (voice_catalog.get_voice(voice_value) or {}).get("gender")
        # Also reinforced per-turn in on_user_turn_completed — a single
        # system-prompt mention tends to drift over a long conversation
        # (masculine Hindi/Marathi/Gujarati verb forms are simply far more
        # frequent in training data, so the model's statistical default
        # fights this instruction turn after turn). Confirmed live on a
        # female voice (Ritu) still saying "बताता हूँ" (masculine) even with
        # a single mid-prompt mention — prepending this as the very FIRST
        # thing the model reads (highest-priority context, before persona/
        # content) and giving it a wider verb table across all four gendered
        # languages, not just three Hindi examples, measurably helps a model
        # that's fighting a strong statistical prior.
        self._voice_gender = _gender
        # Separate from the agent's OWN gender above — the caller's gender is
        # unknown by default and never assumed from the agent's voice. Set
        # only when the caller states it themselves (see
        # _detect_caller_gender in on_user_turn_completed), and used only to
        # correctly conjugate SECOND-PERSON verbs addressed to them (आप
        # करेंगे/करेंगी, चाहेंगे/चाहेंगी) — reported live as the agent
        # defaulting every caller to feminine address forms, apparently by
        # mirroring its own (female) voice gender onto the person it's
        # talking to, which is a different grammatical agreement than the
        # first-person self-reference the reminder below already covers.
        self._caller_gender: str | None = None
        if _gender in ("male", "female"):
            _woman = _gender == "female"
            _f = "feminine" if _woman else "masculine"
            _examples = (
                "Hindi: \"मैं बताती हूँ\", \"मैं करती हूँ\", \"मैं आई हूँ\", \"मैं समझती हूँ\", \"मैं देख रही हूँ\" "
                "— never \"बताता / करता / आया / समझता / देख रहा हूँ\".\n"
                "Marathi: \"मी सांगते\", \"मी करते\", \"मी आले\" — never \"सांगतो / करतो / आलो\".\n"
                "Gujarati: \"હું કહું છું\" stays the same, but \"હું આવી\" — never \"આવ્યો\".\n"
                "Punjabi: \"ਮੈਂ ਦੱਸਦੀ ਹਾਂ\", \"ਮੈਂ ਆਈ ਹਾਂ\" — never \"ਦੱਸਦਾ / ਆਇਆ ਹਾਂ\"."
                if _woman else
                "Hindi: \"मैं बताता हूँ\", \"मैं करता हूँ\", \"मैं आया हूँ\", \"मैं समझता हूँ\", \"मैं देख रहा हूँ\" "
                "— never \"बताती / करती / आई / समझती / देख रही हूँ\".\n"
                "Marathi: \"मी सांगतो\", \"मी करतो\", \"मी आलो\" — never \"सांगते / करते / आले\".\n"
                "Gujarati: \"હું કહું છું\" stays the same, but \"હું આવ્યો\" — never \"આવી\".\n"
                "Punjabi: \"ਮੈਂ ਦੱਸਦਾ ਹਾਂ\", \"ਮੈਂ ਆਇਆ ਹਾਂ\" — never \"ਦੱਸਦੀ / ਆਈ ਹਾਂ\"."
            )
            instructions = (
                f"# Your identity — read this first, it governs everything below\n"
                f"You, {agent_name}, ARE {'a woman' if _woman else 'a man'} — this is not a "
                f"persona detail buried in a longer prompt, it is who you are on every single "
                f"turn of this call, from your very first word to your last. In every language "
                f"that marks the speaker's grammatical gender (Hindi, Marathi, Gujarati, Punjabi, "
                f"and others), ALWAYS use {_f} first-person verb forms — never the opposite, "
                f"never mixed, not even once, not even under time pressure mid-sentence. This "
                f"holds even if a caller addresses you with the wrong gender or asks something "
                f"unrelated — your own self-reference never changes. Concretely:\n{_examples}\n\n"
            ) + instructions
        # Prepended LAST so it lands FIRST in the finished prompt. A tenant's
        # own system_prompt replaces the built-in persona wholesale and then
        # occupies the primacy position, while the platform's own rules are
        # appended thousands of tokens later, mixed in with delivery and
        # language guidance. These four are the ones that must survive
        # whatever a tenant writes, so they go where attention is highest.
        # Deliberately short: the value is position and brevity, and a long
        # block here would just recreate the problem at the other end. Same
        # shape as the identity block above ("read this first, it governs
        # everything below"), which was added for the same reason.
        instructions = (
            "# Platform rules — these come first and are never overridden\n"
            "1. Never say you have noted, saved, sent, shared, booked or arranged anything "
            "unless a tool returned success for it in THIS call. Say what you WILL do, not "
            "what you have done. If no tool exists for it, do not offer it.\n"
            "2. Never ask again for anything listed under what you already know. If the caller "
            "says they already told you, they are right — acknowledge once, briefly, and move "
            "on to something you genuinely do not know.\n"
            "3. If a message is garbled or makes no sense in context, say in one short line "
            "that you did not catch it and ask them to repeat it. Never guess at its meaning, "
            "and never cover for it by asking a different question instead.\n"
            "4. One question per turn. Ask it, then stop and let them answer.\n"
            "Everything below describes who you are and what this business does. It never "
            "overrides the four rules above.\n\n"
        ) + instructions
        tone_name = config.get("tone") or DEFAULT_TONE
        base_tone = TONE_PRESETS.get(tone_name, TONE_PRESETS[DEFAULT_TONE])
        tts, tts_provider = _build_tts(reply_language, voice_value, base_tone, tone_name)
        agent_tools = _build_tools(config)
        super().__init__(
            instructions=instructions,
            stt=_build_stt(_speech_context_prompt(config)),
            # The public demo is judged turn-by-turn. A hard generation cap
            # prevents a missed prompt instruction from becoming a spoken
            # sales monologue; Indian scripts consume more tokens than the
            # same sentence in English, so 160 still leaves room for two
            # short multilingual sentences plus a tool call.
            llm=_build_llm(
                config.get("model") or "gpt-4.1",
                max_output_tokens=120 if self._is_platform_demo else 220,
            ),
            tts=tts,
            tools=agent_tools,
        )
        # Gates the web_search per-turn reinforcement below — only meaningful
        # if this agent actually has the tool (TAVILY_API_KEY configured and
        # not excluded via enabled_functions), same as any tenant agent, not
        # just the platform demo.
        self._has_web_search = any(getattr(t, "__name__", None) == "web_search" for t in agent_tools)
        self._reply_language = reply_language
        self._pending_language: str | None = None
        self._pending_language_streak = 0
        # "garbled" / "fragment" / None for the turn being processed.
        self._turn_script_anomaly: str | None = None
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
        # Recorded on the call row for per-model credit billing, exactly as
        # _voice is for per-voice-tier billing. Must mirror the value handed
        # to _build_llm below - the fallback included - or billing would
        # attribute the call to the wrong model.
        self._model = config.get("model") or "gpt-4.1"
        # Prosody-adaptation baseline (see on_user_turn_completed) — deltas
        # from a detected caller emotion apply on top of these, never replace
        # them, so the agent's configured base personality always shows through.
        self._base_pace = base_tone.get("pace", 1.0)
        self._base_pitch = base_tone.get("pitch", 0.0)
        self._base_loudness = base_tone.get("loudness", 1.0)
        self._base_elevenlabs = _ELEVENLABS_TONE_PRESETS.get(tone_name, _ELEVENLABS_TONE_PRESETS[DEFAULT_TONE])
        self._gemini_base_prompt = GEMINI_TONE_PROMPTS.get(tone_name, GEMINI_TONE_PROMPTS[DEFAULT_TONE])
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

    def _warm_llm_prompt_cache(self) -> None:
        """Process this agent's system prompt once, in the background, while
        the greeting is still being spoken.

        Measured over 101 real calls: the FIRST reply of a call takes
        1398ms to first token vs 1027ms for every later reply (+371ms,
        1.36x), while TTS (+48ms) and endpointing (+1ms) are effectively
        identical between them. So the "first answer is slow" effect callers
        notice is almost entirely the LLM, not the voice.

        Cause is a cold prompt cache. prompt_cache_key is set on the OpenAI
        client, but caching only pays off once a prefix has been seen -
        the first call of a session processes the whole thing cold, and
        that prefix is 10,937 tokens for the platform demo persona (3,610
        for the built-in tenant persona). The greeting goes out via
        session.say(), which never touches the LLM, so that window is dead
        time from the model's point of view. Spending it warming the cache
        (and the HTTPS connection) means the caller's first real turn
        arrives on a warm path.

        Deliberately fire-and-forget and fully swallowed: this is an
        optimisation, and it must never delay the greeting, surface an
        error, or take the call down if the LLM is briefly unreachable. It
        must also send the IDENTICAL prefix - the agent's own instructions -
        or it would populate a different cache entry and buy nothing.
        """
        agent_llm = getattr(self, "llm", None)
        if agent_llm is None or not hasattr(agent_llm, "chat"):
            return

        async def _warm() -> None:
            try:
                ctx = llm.ChatContext.empty()
                ctx.add_message(role="system", content=self.instructions)
                # One throwaway token: the point is processing the prefix,
                # not the completion, so keep the generation as small as the
                # API allows.
                ctx.add_message(role="user", content="hi")
                stream = agent_llm.chat(chat_ctx=ctx)
                try:
                    async for _ in stream:
                        break  # first token is enough - prefix is now cached
                finally:
                    await stream.aclose()
            except Exception:
                logger.debug("llm prompt-cache warm failed (ignored)", exc_info=True)

        task = asyncio.create_task(_warm())
        # Held so it isn't garbage-collected mid-flight; never awaited.
        self._llm_warm_task = task
        task.add_done_callback(lambda _: setattr(self, "_llm_warm_task", None))

    async def on_enter(self) -> None:
        # first_speaker == 'user' means wait silently for the caller to open —
        # no greeting is ever queued, so away-tracking is valid immediately.
        if self._first_speaker == "user":
            self.session.userdata["greeting_played"] = True
            return
        # Runs concurrently with the greeting below, which is pure TTS and
        # leaves the LLM idle - see _warm_llm_prompt_cache for the measured
        # 371ms this is recovering. Started before the greeting so the two
        # overlap for the full duration of the spoken line.
        self._warm_llm_prompt_cache()
        # See the [latency] markers in entrypoint() — this is the last
        # segment: how long after dispatch the greeting's TTS call actually
        # starts, vs. how long the call itself (session.say(), which awaits
        # until the line is queued for playout) takes.
        dispatch_t0 = getattr(self, "_dispatch_t0", None)
        if dispatch_t0 is not None:
            logger.info("[latency] on_enter starting at +%.2fs", time.monotonic() - dispatch_t0)
        try:
            if self._welcome_message:
                # Operator wrote an exact opening line — speak it verbatim
                # rather than letting the model improvise a greeting.
                await self.session.say(self._welcome_message)
                # Same flag the fallback path sets below. Returning without
                # it left greeting_played False for the whole call on every
                # agent that has a custom welcome message, which
                # _on_user_state_changed reads as "the opener is still
                # playing" — so the away check-in never fired and a caller
                # who went quiet was met with silence instead of "are you
                # still there?".
                self.session.userdata["greeting_played"] = True
                return
            if self._is_platform_demo:
                # A dynamic LLM-generated greeting sounds better, but costs a
                # full generate_reply() round-trip (LLM + TTS) before the very
                # first word — 6-7s of dead air a first-time website visitor
                # wasn't expecting. Speaking a fixed line via say() skips
                # straight to TTS. Picked at random per call so repeat
                # visitors don't hear the same line every time.
                # Prefer a clip the background prewarm already rendered for
                # this exact voice/language/gender — same fixed lines, but
                # skipping the ~5.4s of synthesis that otherwise sits between
                # the agent joining and the visitor hearing anything. Misses
                # (unwarmed process, non-demo voice, warm still in progress)
                # fall straight through to normal synthesis below.
                cached = cached_greeting(self._voice_value, self._reply_language, self._voice_gender)
                if cached is not None:
                    text, frames = cached
                    logger.info("[latency] greeting served from pre-rendered cache (%s chars)", len(text))
                    await self.session.say(text, audio=_replay_frames(frames))
                    return
                opener_set = (
                    _PLATFORM_DEMO_OPENERS_EN if self._reply_language.startswith("en") else _PLATFORM_DEMO_OPENERS
                )
                openers = opener_set.get(self._voice_gender) or opener_set["female"]
                await self.session.say(random.choice(openers))
                return
            # Same fix, generalized: every tenant agent without its own
            # welcome_message used to fall through to generate_reply() here
            # and pay the identical 6-7s round-trip on every call. A fast,
            # lightly personalized default (agent name + caller's first name,
            # if the widget already collected it) covers the vast majority of
            # that gap; an operator who wants a fully custom line still sets
            # welcome_message above, which short-circuits before this.
            business_name = getattr(self, "_business_name", "") or ""
            is_hindi = self._reply_language == "hi-IN"
            if business_name and business_name != "this business":
                if is_hindi:
                    greeting = f"नमस्ते {self._visitor_first_name}, " if self._visitor_first_name else "नमस्ते, "
                    template = (
                        _DEFAULT_OPENER_HI_BUSINESS_MALE
                        if self._voice_gender == "male"
                        else _DEFAULT_OPENER_HI_BUSINESS_FEMALE
                    )
                else:
                    greeting = f"Hi {self._visitor_first_name}, " if self._visitor_first_name else "Hi, "
                    template = _DEFAULT_OPENER_EN_BUSINESS
                await self.session.say(template.format(greeting=greeting, business_name=business_name))
            else:
                # No real business name to say (e.g. resolved to the
                # placeholder) - fall back to the agent-name opener rather
                # than ever speaking the literal words "this business".
                greeting = f"Hi {self._visitor_first_name}," if self._visitor_first_name else "Hi,"
                template = _DEFAULT_OPENERS.get(self._reply_language, _DEFAULT_OPENER_EN)
                await self.session.say(template.format(greeting=greeting, agent_name=self._agent_name))
        finally:
            # Cold starts / slow TTS providers (Google) can push the opening
            # line's actual playback well past the away-timeout — without
            # this flag, _on_user_state_changed's "away" check-in fires while
            # the greeting is still being synthesized and gets queued right
            # behind it, so the caller hears the opener immediately followed
            # by "are you still there?" before they've had a chance to speak.
            self.session.userdata["greeting_played"] = True
            if dispatch_t0 is not None:
                logger.info("[latency] greeting say() returned at +%.2fs", time.monotonic() - dispatch_t0)

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        text = new_message.text_content
        self._booking_confirmed_this_turn = False
        _userdata = self.session.userdata
        _lead_data = _userdata.get("lead_data") or {}
        # Recomputed EVERY turn (not just when true) so a single bad
        # transcript cannot leave later, good facts marked unconfirmed.
        # Read by log_lead in tools.py when it decides a fact's status.
        # Call 834 opened with the caller saying "जी बोलिए।" while Mira's
        # scripted line was still playing. session.say() returns once the line
        # is QUEUED, not once it has been heard, so that turn reached the LLM
        # and produced a SECOND opening — "जी, कृपया बताएं कि आप किस" — which
        # was then cut off mid-sentence. The caller heard the agent start
        # twice and talk over itself before the call had really begun.
        #
        # Only the opening is guarded, and only for a content-free
        # acknowledgement: a caller who says something real over the greeting
        # ("Baner mein flat chahiye") still gets answered, and if the greeting
        # has already finished the agent is not speaking and this never fires.
        if not _userdata.get("opening_ack_checked"):
            _userdata["opening_ack_checked"] = True
            _still_greeting = (
                getattr(self.session, "agent_state", None) == "speaking"
                or bool(_userdata.get("agent_speaking"))
            )
            if _still_greeting and _looks_like_opening_ack(text):
                logger.info(
                    "caller acknowledged over the opening line — letting the greeting "
                    "finish instead of generating a second one: %r", text,
                )
                raise StopResponse()

        _script_anomaly = _transcript_script_anomaly(text, self._reply_language)
        _transcript_suspect = _script_anomaly == "garbled"
        _userdata["turn_transcript_suspect"] = _transcript_suspect
        # Read by the language-switch logic below: a mis-scripted token is
        # not the caller changing language.
        self._turn_script_anomaly = _script_anomaly
        if _transcript_suspect:
            logger.info(
                "transcript looks misrecognized (reply_language=%s) — turn: %r",
                self._reply_language, text,
            )
        elif _script_anomaly == "fragment":
            logger.info(
                "stray foreign-script token in an otherwise valid turn "
                "(reply_language=%s) — using the turn, ignoring it as language "
                "evidence: %r", self._reply_language, text,
            )

        # Voicemail detection — only checked once, on the FIRST thing the
        # other party says on a call WE placed (an inbound caller is by
        # definition a live human who dialled us). If it reads like a
        # recorded voicemail prompt, skip the normal LLM pitch entirely:
        # leave one short line and hang up rather than talking to a
        # machine for the rest of the call.
        if not _userdata.get("voicemail_checked") and _userdata.get("direction") == "outbound":
            _userdata["voicemail_checked"] = True
            if text and _VOICEMAIL_GREETING_PATTERN.search(text):
                _room = _userdata.get("room")
                logger.info("voicemail detected on outbound call (room=%s)", getattr(_room, "name", None))
                business_name = getattr(self, "_business_name", "") or ""
                closing = (
                    f"Hi, this is a call from {business_name}. Sorry we missed you — please call us back "
                    "when you're free, or we'll try again soon. Thanks, have a great day!"
                    if business_name and business_name != "this business"
                    else "Hi, sorry we missed you — we'll try reaching you again soon. Have a great day!"
                )
                # Set BEFORE speaking (not after) — _on_agent_state_changed's
                # hang-up watches for the "speaking" -> not-speaking edge, and
                # say() below can complete that transition before the line
                # after it would otherwise run.
                # The dialer recorded "placed" the moment the dial went
                # out — it has no way to know a machine picked up. Correct it
                # here, which also gives the contact the retry they should
                # get instead of being counted as reached.
                _contact_id = _userdata.get("campaign_contact_id")
                _campaign_id = _userdata.get("campaign_id")
                if _contact_id and _campaign_id:
                    try:
                        await asyncio.to_thread(
                            db.record_campaign_voicemail, int(_contact_id), int(_campaign_id)
                        )
                    except Exception:
                        # Never let campaign bookkeeping break the hang-up.
                        logger.exception("could not record voicemail for contact %s", _contact_id)
                _userdata["ending_call"] = True
                await self.session.say(closing)
                raise StopResponse()

        _last_assistant_text = ""
        for item in reversed(turn_ctx.items):
            if getattr(item, "role", None) == "assistant":
                _last_assistant_text = getattr(item, "text_content", None) or ""
                break

        if _last_assistant_text:
            if _reply_used_filler(_last_assistant_text):
                self._turns_since_filler = 0
            else:
                self._turns_since_filler += 1

        if self._public_demo_slug == "healthcare" and _HEALTHCARE_SYMPTOM_PATTERN.search(text):
            self._healthcare_symptom_mentioned = True
        # First department wins and then never changes. Call 725 took a dental
        # booking and three turns later talked the caller into a general
        # physician; a caller who has chosen a department should not be moved
        # out of it by anything said afterwards.
        if self._public_demo_slug == "healthcare" and self._chosen_department is None:
            # A complaint that matches no specialty is a general-medicine
            # complaint — it is not "no department". A headache returned None,
            # nothing locked, and the agent then offered a dermatologist and
            # then a paediatrician to an adult with a headache, purely because
            # they happened to be free. Anything unmatched pins to the general
            # physician instead.
            self._chosen_department = _department_for(text) or (
                "General Physician" if self._healthcare_symptom_mentioned else None
            )

        detected_gender = _detect_caller_gender(text)
        if detected_gender:
            self._caller_gender = detected_gender

        if _looks_like_farewell(text):
            # Belt-and-suspenders for end_call (tools.py): relying on the
            # model to both say goodbye AND remember to invoke the tool in
            # the same turn is unreliable in practice - observed live on a
            # real call where the agent spoke a full goodbye line but never
            # called end_call, so the room stayed open and the agent kept
            # talking (asked "are you still there?" a few turns later).
            # This doesn't force the hang-up itself - it just makes the
            # model's own end_call call far more likely to actually happen
            # on the turn where the caller said goodbye, instead of leaving
            # it to chance.
            turn_ctx.add_message(
                role="system",
                content=(
                    f"The caller's last message ({text!r}) sounds like a goodbye. If the "
                    "conversation is genuinely over, call the end_call tool THIS turn - don't just "
                    "reply with a goodbye in plain text without calling it."
                ),
            )
            if (
                (_lead_data.get("name") and (_lead_data.get("phone") or _lead_data.get("email")))
                and not _userdata.get("lead_captured")
            ):
                # Confirmed real failure (call 779): name and phone were both
                # given and read back to confirm, the caller asked to book a
                # demo — and the call ended with neither captured nor booked.
                # The farewell nudge above only reminds about end_call; this
                # is the same belt-and-suspenders shape for the tool that
                # actually saves the lead, which is useless to add AFTER the
                # call is already over.
                turn_ctx.add_message(
                    role="system",
                    content=(
                        "This caller looks like they're wrapping up, but you have their name and "
                        "contact info and have NOT saved it yet. Call capture_platform_lead or "
                        "log_lead THIS turn, before end_call — do not let this call close with an "
                        "uncaptured lead."
                    ),
                )

        # Language + gender are combined into ONE system message per turn,
        # deliberately, with gender LAST. Two earlier attempts added these as
        # SEPARATE messages (language added after gender) and the gender bug
        # still reproduced live on a real tenant call minutes after that
        # deploy (a caller named "Arvind Singh" — call 485 — still got
        # addressed with feminine "चाहती/करना चाहती हैं" throughout a female-
        # voiced agent's custom system prompt). Splitting the two nudges
        # across separate messages risks whichever lands LAST in context
        # (most recent = highest attention) diluting the other; a single
        # undiluted block with the harder-to-follow rule (gender) placed
        # last is a stronger bet than trusting message ordering to work out.
        _current_language_name = LANGUAGE_NAMES.get(self._reply_language, self._reply_language)
        _language_instruction = (
            f"Reply to THIS turn entirely in {_current_language_name} — every sentence, no "
            "exceptions, regardless of what language any example, filler word, or joke elsewhere "
            "in your instructions happened to be written in. Those are illustrations of a pattern, "
            f"not a signal to switch languages. Stay in {_current_language_name} UNLESS EITHER: (a) "
            "the caller's own words in the message you're replying to are themselves in a different "
            "language (they've actually switched), OR (b) the caller's message — in any language, any "
            "phrasing — is a REQUEST to switch, e.g. \"please speak in English\", \"can you do this in "
            "Hindi\", \"अंग्रेजी में बोलो\". A request counts exactly the same as switching outright — "
            "do not wait for them to demonstrate the new language before honoring it. In either case, "
            "call switch_reply_language with the requested/detected language BEFORE writing your reply, "
            "then write the reply itself in that new language, not this one. Absent (a) or (b), staying "
            f"in {_current_language_name} is not optional."
        )
        if self._voice_gender in ("male", "female") and self._reply_language in _GENDERED_VERB_LANGUAGES:
            _woman = self._voice_gender == "female"
            _gender_instruction = (
                f"You are {'a woman' if _woman else 'a man'} — in THIS reply, if you use Hindi, "
                "Marathi, Gujarati, or Punjabi, every first-person verb must be "
                + ("feminine: बताती/करती/आई/समझती/देख रही हूँ, मी सांगते/करते/आले, હું આવી, "
                   "ਮੈਂ ਦੱਸਦੀ/ਆਈ ਹਾਂ"
                   if _woman else
                   "masculine: बताता/करता/आया/समझता/देख रहा हूँ, मी सांगतो/करतो/आलो, હું આવ્યો, "
                   "ਮੈਂ ਦੱਸਦਾ/ਆਇਆ ਹਾਂ")
                + f" — the {'masculine' if _woman else 'feminine'} form is wrong every time, with no "
                "exceptions, no matter what was said in earlier turns. This is ONLY about verbs "
                "describing YOUR OWN actions (\"मैं बताती हूँ\") — it says NOTHING about the caller's "
                "gender, and must never be mirrored onto how you address them. "
                + (
                    f"The caller has told you they are {self._caller_gender} — when a verb addressed "
                    f"to them needs gender agreement (आप करेंगे/करेंगी, चाहेंगे/चाहेंगी), use the "
                    f"{'feminine' if self._caller_gender == 'female' else 'masculine'} form for that."
                    if self._caller_gender
                    else "RULE: caller's gender is UNKNOWN — every verb addressed to them "
                    "(करेंगे/करेंगी, चाहेंगे/चाहेंगी, सकते/सकती, चाहती/चाहते) MUST use सकते/चाहते/करेंगे, "
                    "NEVER सकती/चाहती/करेंगी. That is the whole rule; everything below is just why. "
                    "It must never be assumed from your own voice, "
                    "from their name (a caller named 'Arvind' or 'Priya' tells you NOTHING — a real call "
                    "with a caller named Arvind Singh still got wrongly addressed with feminine "
                    "'विजिट करना चाहती हैं', 'बताना चाहेंगी' throughout — do not repeat that mistake), OR "
                    "from any feminine/masculine verb form THEY happen to use about THEIR OWN actions "
                    "(e.g. them saying 'मैं ... कर रही हूँ' does NOT mean they are a woman — do not mirror "
                    "or infer gender from that). CONCRETE EXAMPLE: if the caller said something "
                    "gender-neutral like 'Many calls' or gave their name as 'Arvind', a reply of 'बिलकुल! "
                    "क्या आप बता सकती हैं...' or 'आप विजिट करना चाहती हैं...' is WRONG — 'सकती'/'चाहती' "
                    "assumes the caller is a woman for no reason, most likely by copying your OWN voice's "
                    "gender onto them. The correct reply uses 'सकते'/'चाहते', not 'सकती'/'चाहती'. The ONLY "
                    "thing that counts as knowing their gender is them explicitly stating it ('I'm male', "
                    "'मैं महिला हूँ', etc). Until then, every verb addressed to them needing gender "
                    "agreement (करेंगे/करेंगी, चाहेंगे/चाहेंगी, सकते/सकती, चाहती/चाहते) defaults to the "
                    "neutral/masculine-plural form (करेंगे, चाहेंगे, सकते, चाहते) with no exceptions, on "
                    "every single turn of this call, not just the first."
                )
            )
        else:
            _gender_instruction = ""
        # Personality is written up at length in platform_assistant.py, but
        # by generation time it's competing with everything ELSE in that
        # 480-line prompt (discovery arc, qualify-before-pushing, active
        # listening) that comes AFTER it and wins on recency — confirmed
        # live: real demo transcripts turned procedural (flat "ठीक है!"/
        # "Got it!" acks, repeated fillers, discovery questions back-to-back
        # with zero personality) despite the prompt explicitly asking for
        # humor and warmth. Same fix as the language/gender reinforcement
        # above — restate it fresh, last, every turn, so it isn't drowned
        # out by the structural rules.
        if self._is_platform_demo:
            _repeat_filler_warning = (
                "\nYour last reply already used an expressive opener. Start this reply directly "
                "unless a reaction is genuinely needed."
                if any(opener in _last_assistant_text.lower() for opener in ("अरे वाह", "wow", "honestly", "actually"))
                else ""
            )
            # A same-turn duplicate check alone let fillers land on every OTHER
            # turn instead of every 3-5, since each individual reply looked
            # fine on its own. This tracks actual spacing instead of asking
            # the model to remember it.
            _filler_cadence_warning = (
                f"\nDo NOT start this reply with any filler, reaction, or aside (हम्म, अच्छा, "
                f"actually, right, etc.) — begin directly with the content. One was already used "
                f"{self._turns_since_filler} turn(s) ago; the next is allowed only after turn "
                f"{4 - self._turns_since_filler} from now."
                if self._turns_since_filler < 4
                # Cadence alone only ever suppresses — it never nudges once spacing
                # clears, and a real call (762, real-estate demo) went the full 38
                # turns with zero fillers as a direct result: nothing was ever
                # pushing TOWARD one, only capping overuse that never happened.
                # This fires only when spacing allows it, and only asks for one on
                # a turn that's actually earned it (an objection, a comparison, an
                # explanation) — a plain fact-recall turn should still stay clean.
                else "\nIt's been a few turns since you used any natural hesitation or filler. "
                "If this reply is handling an objection, a comparison, or an explanation, a brief "
                "one now (हम्म, मतलब, actually) would sound more natural — skip it if this is a "
                "plain fact-recall answer."
            )
            _personality_instruction = (
                "HARD TURN LIMIT: reply with ONE short sentence by default and never more than TWO "
                "short sentences or about thirty-five spoken words. This limit overrides discovery, "
                "active-listening, sales, and personality guidance elsewhere. Give only the single "
                "most relevant point; the caller can ask for more. Do not repeat or summarize what "
                "the caller just said. Do not append a GENERIC follow-up such as 'anything else?' or "
                "'would you like to know more?' — but do not just stop talking either. Confirmed live: "
                "banning generic filler made replies dead-end instead, leaving the caller to restart "
                "momentum every single turn, which felt like the conversation was over. Unless this "
                "turn is genuinely closing the call (see the goodbye rule below), end with ONE short, "
                "SPECIFIC next question or beat that grows directly out of what you just said or what "
                "the caller just said — e.g. after explaining pricing, ask which plan fits their team "
                "size; after a feature answer, ask about the specific call type they'd use it for. "
                "That's advancing the conversation, not a generic closer, and it's required on most "
                "turns. If they asked to change language, switch it and give "
                "only a brief confirmation in that language. If they say they have no more questions, "
                "are done for now, thank you/bye, or otherwise close the conversation, give one short "
                "goodbye and call end_call—never reopen discovery. If they sound skeptical (for example "
                "'seriously?'), answer the concern directly in one sentence without repeating the pitch.\n"
                "This reply must sound like a witty, warm human friend on a call, not a form being "
                "filled out. Most replies should begin directly. Use at most one filler, reaction, "
                "self-correction, or playful aside, and only when the caller's words genuinely invite "
                "it; never add one merely to sound human. A short acknowledgement followed by one "
                "answer or one relevant question is allowed and often more natural than an artificial "
                "one-sentence restriction. Never force humour, and never use it on complaints, urgent "
                "requests, sensitive information, confirmations, or direct pricing questions.\n"
                "An excited/delighted opener like \"अरे वाह\" or \"wow\" is ONLY for when the caller "
                "said something genuinely positive or surprising — NEVER for a neutral fact, and "
                "especially never for a pain point or something manual/burdensome about how they work "
                "today. Confirmed wrong live: caller said \"manual callback karuchi\" (describing "
                "their current painful workflow) and got \"अरे वाह, मैन्युअल फॉलोअप!\" back — that reads "
                "as gleeful about their problem, not listening to it. The correct reaction there is "
                "empathetic acknowledgment (\"अरे, ये तो सच में टाइम खा जाता है\"), not delight."
                + _repeat_filler_warning
                + _filler_cadence_warning
            )
        else:
            _personality_instruction = ""
        emotion = detect_caller_emotion(text)
        _industry_turn_instruction = industry_demo_turn_nudge(self._public_demo_slug)
        _industry_empathy_instruction = industry_demo_empathy_nudge(
            self._public_demo_slug, text, emotion
        )
        _appointment_turn = bool(
            _APPOINTMENT_INTENT_PATTERN.search(text)
            or (
                _BOOKING_AFFIRMATIVE_PATTERN.search(text)
                and _BOOKING_CONTEXT_PATTERN.search(_last_assistant_text)
            )
        )
        _appointment_instruction = (
            "The caller's last message is about appointment availability, choosing a time, or "
            "booking. You MUST call check_calendar_availability before saying ANYTHING about whether a "
            "time is free — including saying it is NOT free. Replayed live, the agent answered "
            "\"that time is not free\" and offered two invented alternatives without ever "
            "calling the tool. Do not answer availability from working hours or memory. The tool itself immediately "
            "speaks a natural checking line to the caller, so call it silently without adding a "
            "second filler. If they are trying to finalize a slot, do not say it is booked until "
            "you have their name, phone number, and purpose and book_appointment returns success. "
            "Ask for the next missing detail instead of pretending the booking happened."
            if _appointment_turn
            else ""
        )
        _language_request_instruction = (
            "The caller's last message asks you to speak a different language. Call "
            "switch_reply_language with that language's plain English name BEFORE your next "
            "reply, then answer in it. You speak every language listed in your prompt — do NOT "
            "say you can only speak Hindi, do not claim a limited set, and do not offer to "
            "continue in the current language instead. If you genuinely cannot, the tool tells "
            "you so; you do not decide that yourself."
            if _LANGUAGE_REQUEST_PATTERN.search(text)
            else ""
        )
        # After the booking there is nothing clinical left to ask. Call 725
        # confirmed the appointment and then asked "क्या यह दर्द ज्यादा गंभीर
        # है?" three more times, which is what made it sound like a machine.
        _post_booking_instruction = (
            "The appointment is CONFIRMED. Stop asking clinical questions — no more asking whether "
            "the pain is severe, what the symptoms are, or which department they need; that is all "
            "settled. Do not re-open the booking or offer another department. Say EXACTLY this "
            "shape, filled in with the real name/department/day/date/time, and nothing more — "
            "describing the shape in prose was not holding, so this is the literal line: "
            "\"Thank you, {name}. Your {department} appointment is confirmed for {day}, {date} at "
            "{time}. Please arrive ten minutes early.\" — Hindi: \"धन्यवाद, {name}। आपकी {department} "
            "अपॉइंटमेंट {day}, {date} को {time} बजे के लिए कन्फर्म है। कृपया दस मिनट पहले पहुँचें।\" "
            "Do not add anything else to that turn — no 'anything else I can help with', no further "
            "questions. If the caller then says something themselves (a thanks, a new question), "
            "respond to that normally; otherwise this line IS the end of the call — treat it as the "
            "goodbye and call end_call once it's spoken."
            if self._appointment_booked
            else ""
        )
        # The intake order is prose in the industry block and the model does not
        # follow it: asked to book, it replies "which department or doctor do you
        # need?" in 3 of 3 replays, in both languages. The caller does not know
        # the department — that is the clinic's job to work out from the
        # complaint. Fired only while no symptom has been captured yet.
        _intake_instruction = (
            "They want an appointment and have not said what is wrong yet. Your NEXT question "
            "is what the problem is, ASKED IN THE LANGUAGE THEY JUST USED — an English caller "
            "gets \"what seems to be the trouble?\", a Hindi caller gets \"क्या परेशानी हो रही "
            "है?\". Replayed live, an English caller was answered in Hindi. Ask ONLY that one "
            "question in this turn — not what it is AND since when, not the problem AND how "
            "severe. Since-when and urgency come on LATER turns, one per turn. Do NOT ask "
            "which department or which doctor they want: a patient does not know that, and "
            "working it out from the complaint is your job."
            if (
                self._public_demo_slug == "healthcare"
                and not self._healthcare_symptom_mentioned
                and self._chosen_department is None
                and _APPOINTMENT_INTENT_PATTERN.search(text)
            )
            else ""
        )
        # The severity question is asked ONCE and then never again. This block
        # fires on every turn while a symptom is on the record, and the clause
        # that used to guard it — "if that has not been established" — is
        # prose the model does not act on: a live call asked whether the pain
        # was severe five times running, until the caller said "मैंने दो बार
        # तो बता दिया आपको" and then had to ask to be booked. The flag makes
        # it structural instead of a request.
        # Never on the same turn as the intake nudge. Both fired together and the
        # model merged them — "ये कब से है और क्या ये ज्यादा तेज़ है?" — two
        # questions in one breath, in 2 of 6 replays. Each nudge asks for one
        # question; the collision was what produced two.
        _ask_severity = (
            self._healthcare_symptom_mentioned
            and not self._severity_asked
            and not _intake_instruction
        )
        if _ask_severity:
            self._severity_asked = True
        _healthcare_safety_instruction = (
            "This healthcare caller has already described pain or symptoms. Treat that as the active "
            "reason for the visit: do not suggest unrelated specialties, and do not make them repeat it. "
            "Use one brief, calm acknowledgment. "
            + (
                "Ask exactly one short question: how bad it is. Nothing else in the same breath — "
                "not how bad AND whether it is urgent, not how bad AND whether anything else "
                "is wrong. Naming two things is how a live turn became \"कितना तेज है? क्या ये "
                "जल्दी देखना जरूरी है?\". This is the only turn on which you may ask it at all."
                if _ask_severity
                else "You have ALREADY asked whether it is severe or urgent and they answered. Do "
                     "NOT ask again in any form — not about severity, not about urgency, not "
                     "whether it is an emergency, not whether there is any other problem. Move to "
                     "the booking: offer a time, or ask for the next detail you still need."
            )
            + " Route to the department "
            "the COMPLAINT belongs to, taken from the knowledge base — never default everyone to the "
            "general physician, and never read out a list of specialties. Once a department is "
            "chosen, it is fixed for the rest of the call: do not move the caller to another one "
            "later, and never after an appointment is booked. NEVER offer a doctor from a "
            "different department because they happen to be free — a real call offered a "
            "dermatologist, and then a paediatrician, to an adult with a headache, and the caller "
            "had to ask why. If the right doctor has nothing free, the honest answer is their next "
            "working day, or taking a name and number for a callback. Never diagnose."
            + (
                f"\nThis caller's complaint is a {self._chosen_department} matter. Book them with "
                f"the {self._chosen_department} doctor named in the knowledge base and with nobody "
                f"else, however the conversation continues."
                if self._chosen_department
                else ""
            )
            if self._public_demo_slug == "healthcare" and self._healthcare_symptom_mentioned
            else ""
        )
        # Same reinforcement pattern again for a different failure: the
        # prompt already says "search, don't dodge" for a concrete factual
        # question, but confirmed live — asked to name real hospitals near a
        # real Pimpri project (mid a roleplay the caller explicitly asked
        # for), it invented two plausible-sounding but wrong hospital names
        # and a geographically-inconsistent answer instead of calling
        # web_search, with zero hedging. The static instruction isn't
        # landing reliably any more than language/gender/personality did
        # before their own per-turn nudges — so it gets one too, fired only
        # when this turn's text actually looks like it's asking for a
        # verifiable real-world fact.
        _search_instruction = (
            (
                "The caller's last message asks about a concrete, real-world fact you cannot "
                "possibly know from memory alone (a specific place, hospital, school, distance, "
                "price, or similar named detail). You MUST call web_search before answering this "
                "— do not guess, estimate, or invent a name or detail, even a plausible-sounding "
                "one. Answering without calling web_search first is fabricating information, which "
                "actively misleads a real prospect and is explicitly against your instructions."
            )
            if self._has_web_search and _FACT_LOOKUP_PATTERN.search(text)
            else ""
        )
        # The recovery the agent did not have on call 825: given nonsense, it
        # re-asked a question the caller had already answered instead of
        # saying it had not understood, which cost three turns and visibly
        # annoyed the caller.
        # Deliberately separate from the facts block: that one lists what is
        # known, this one fires on the caller's reaction and is the only
        # signal available when the fact was never recorded in the first
        # place — which, before log_lead accepted partial writes, was most
        # of the time.
        _repeat_complaint_instruction = (
            (
                "The caller has just told you they ALREADY answered something. Treat that as "
                "correct — do not defend it, do not ask them to repeat it, and do not ask that "
                "question again in any wording. Acknowledge it in a few words, once ("
                "\"जी, माफ़ कीजिए\" / \"Sorry about that\"), do not apologise twice, then ask "
                "about something you genuinely do not have yet, or move the call forward. If you "
                "cannot see the answer in what you already know, it is still not worth asking "
                "again — carry on without it."
            )
            if _REPEAT_COMPLAINT_PATTERN.search(text or "")
            else ""
        )
        _garbled_instruction = (
            (
                "The caller's last message came through garbled — the speech recognizer assigned "
                "it to the wrong language, so the words you are seeing are NOT what they said. Do "
                "not try to interpret it and do not guess at its meaning. Say in ONE short line "
                "that you did not catch it and ask them to repeat THAT question. Do NOT ask a "
                "different question, and do NOT ask again for anything listed under what you "
                "already know."
            )
            if _transcript_suspect
            else ""
        )
        # Call 834: with location, budget and configuration all known, the
        # agent offered "महिंद्रा सिटाडेल और Rohan Leher". Mahindra Citadel is
        # real; Rohan Leher is not in the tenant's nine listings, and
        # lookup_catalog was never called on that call at all — it recommended
        # from memory and invented a name to pad the list. The static "never
        # invent an item" line in the catalog prompt did not hold, the same way
        # the static no-fabrication rule did not hold before _search_instruction
        # was added for web_search. So it gets the same treatment: a nudge
        # fired only on the turns where recommending is actually in play.
        _catalog_tool_used = any(
            (t or {}).get("name") == "lookup_catalog" for t in (_userdata.get("tool_calls") or [])
        )
        _ready_to_recommend = bool(_lead_data.get("location")) and bool(
            _lead_data.get("budget") or _lead_data.get("configuration")
        )
        _catalog_instruction = (
            (
                "You now know enough about this caller to recommend something specific, and you "
                "have NOT called lookup_catalog on this call yet. Call it BEFORE you name any "
                "project, price, or availability. The only projects that exist are the ones "
                "lookup_catalog returns and the ones listed in your catalog index above — naming "
                "anything else invents inventory this business does not sell, which is worse than "
                "saying you have nothing in that area. If the catalog has nothing in their "
                "locality, say so plainly and offer the nearest thing it does have."
            )
            if (self._has_live_catalog and _ready_to_recommend and not _catalog_tool_used)
            else ""
        )
        _facts_reminder_text = _facts_reminder(_lead_data, _userdata.get("fact_status"))
        _funnel_stage = _advance_funnel_stage(
            _userdata,
            _lead_data,
            text,
            emotion,
            _appointment_turn,
            self._appointment_booked,
            bool(_userdata.get("lead_captured")),
        )
        _objective_text = _current_objective(_funnel_stage)
        turn_ctx.add_message(
            role="system",
            content=_language_instruction
            + ("\n\n" + _gender_instruction if _gender_instruction else "")
            + ("\n\n" + _personality_instruction if _personality_instruction else "")
            + ("\n\n" + _industry_turn_instruction if _industry_turn_instruction else "")
            + ("\n\n" + _industry_empathy_instruction if _industry_empathy_instruction else "")
            + ("\n\n" + _language_request_instruction if _language_request_instruction else "")
            + ("\n\n" + _appointment_instruction if _appointment_instruction else "")
            + ("\n\n" + _intake_instruction if _intake_instruction else "")
            + ("\n\n" + _healthcare_safety_instruction if _healthcare_safety_instruction else "")
            + ("\n\n" + _post_booking_instruction if _post_booking_instruction else "")
            + ("\n\n" + _search_instruction if _search_instruction else "")
            + ("\n\n" + _garbled_instruction if _garbled_instruction else "")
            + ("\n\n" + _repeat_complaint_instruction if _repeat_complaint_instruction else "")
            + ("\n\n" + _catalog_instruction if _catalog_instruction else "")
            + ("\n\n" + _facts_reminder_text if _facts_reminder_text else "")
            + "\n\n"
            + _objective_text,
        )

        if emotion != self._current_emotion:
            self._current_emotion = emotion
            if self._tts_provider == "elevenlabs":
                # Emotion-reactive delivery is a Google-TTS-only feature by
                # product decision, not a technical limitation (ElevenLabs'
                # VoiceSettings could do this) — logged so it's visible the
                # signal was detected but intentionally not applied here.
                logger.info(
                    "caller tone -> %s (no-op: emotion-reactive delivery is Google-TTS-only) from turn: %r",
                    emotion or "neutral", text,
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
            elif self._tts_provider in ("google-multilingual", "google-multilingual-31"):
                # Gemini-TTS' real emotion lever — see GEMINI_TONE_PROMPTS/
                # GEMINI_EMOTION_PROMPT_DELTAS in emotion.py. Composed fresh
                # each turn (base tone sentence + emotion sentence) rather
                # than a numeric delta, since `prompt` is itself natural-
                # language style guidance, not a pace/pitch knob. self.tts is
                # TtsFallbackAdapter-wrapped whenever Google credentials are
                # configured — FallbackAdapter has no update_options, so
                # guard the same way every other Google/Sarvam branch here does.
                emotion_line = GEMINI_EMOTION_PROMPT_DELTAS.get(emotion, "") if emotion else ""
                new_prompt = f"{self._gemini_base_prompt} {emotion_line}".strip()
                try:
                    self.tts.update_options(prompt=new_prompt)
                    logger.info("caller tone -> %s (prompt: %r) from turn: %r", emotion or "neutral", new_prompt, text)
                except AttributeError:
                    logger.warning("caller tone update_options failed (fallback-wrapped TTS)", exc_info=True)
            elif self._tts_provider == "google-native":
                # Classic Cloud TTS voices (Neural2/Chirp) don't support
                # Gemini's style-prompt mechanism — no per-turn emotion lever
                # exists for this branch. Multilingual language changes are
                # applied separately below without replacing the persona.
                logger.info(
                    "caller tone -> %s (no-op: google-native has no style-prompt support) from turn: %r",
                    emotion or "neutral", text,
                )
            else:
                # Sarvam branch. Same product decision as the elevenlabs
                # branch above — emotion-reactive delivery is Google-TTS-only
                # now, so this stays a no-op log rather than pushing
                # pace/pitch/loudness deltas.
                logger.info(
                    "caller tone -> %s (no-op: emotion-reactive delivery is Google-TTS-only) from turn: %r",
                    emotion or "neutral", text,
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
        elif candidate == "en-IN" and self._reply_language not in LANGUAGE_NAMES:
            # Same shape as the Devanagari case above, for Latin script.
            # detect_reply_language reports the SCRIPT, and Latin is shared by
            # English, French, German, Spanish, Portuguese, Dutch and most of
            # the global range — so on a call the caller has deliberately
            # moved to French, every French turn reads back as "en-IN" and
            # would drag them to English after a few turns. A caller who
            # actually wants English can say so: switch_reply_language now
            # accepts a bare "English" (see tools.py's short-utterance guard).
            candidate = None
        if candidate is not None and getattr(self, "_turn_script_anomaly", None) is not None:
            # Confirmed on call 834: two turns whose only non-Devanagari
            # content was a mis-scripted "hmm" ("ಹ್ಮ್") accumulated into a
            # switch to Kannada, and the agent then answered three turns in
            # Kannada while the caller asked in Hindi to switch back. A turn
            # the script check has already called anomalous cannot also be
            # trusted as proof the caller changed language. An explicit
            # spoken request ("please speak in Marathi") is unaffected — that
            # path runs through switch_reply_language, not this detector.
            logger.info(
                "ignoring language candidate %s from a %s turn: %r",
                candidate, self._turn_script_anomaly, text,
            )
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
            elif self._tts_provider == "google-native" and voice_catalog.chirp3_persona(self._voice):
                # A Chirp 3 persona follows the caller by changing locale and
                # keeping its name — hi-IN-Chirp3-HD-Aoede becomes
                # mr-IN-Chirp3-HD-Aoede, the same person speaking Marathi.
                # No Chirp 3 voice id carries two language codes (0 of them
                # do, per Google's list_voices), so this swap IS the mechanism;
                # there is no single id to switch to.
                #
                # Only the ten locales Chirp 3 actually covers. A caller who
                # moves to something outside that set keeps the current voice
                # rather than being handed a silently wrong one — the reply
                # language still changes, only the voice cannot follow.
                _persona = voice_catalog.chirp3_persona(self._voice)
                if candidate in voice_catalog.CHIRP3_LANGUAGES:
                    _primary = getattr(self.tts, "_vistrow_primary", None)
                    if _primary is None:
                        logger.warning("chirp3 language switch: no primary TTS handle")
                    else:
                        try:
                            _primary.update_options(
                                language=candidate,
                                voice_name=voice_catalog.chirp3_voice_name(_persona, candidate),
                            )
                        except Exception:
                            logger.warning("chirp3 language switch failed", exc_info=True)
                else:
                    logger.info(
                        "chirp3 persona %s does not cover %s — keeping the current voice",
                        _persona, candidate,
                    )
            elif self._tts_provider in ("google-multilingual", "google-multilingual-31"):
                # google.TTS.update_options rebuilds its VoiceSelectionParams,
                # so resend persona + model with the new language. Otherwise
                # a language switch would silently reset to the default voice.
                # self.tts is TtsFallbackAdapter-wrapped (see _build_tts) so
                # Google's own confirmed mid-reply failures don't kill the
                # call — FallbackAdapter has no update_options at all, so
                # guard the same way tools.py's switch_reply_language does.
                is_google_31 = self._voice.startswith(_GOOGLE_31_VOICE_PREFIX)
                prefix = _GOOGLE_31_VOICE_PREFIX if is_google_31 else _GOOGLE_VOICE_PREFIX
                voice_name = self._voice[len(prefix):]
                try:
                    self.tts.update_options(
                        language=to_google_code(candidate),
                        voice_name=voice_name.capitalize(),
                        model_name=_GOOGLE_31_MODEL if is_google_31 else _GOOGLE_25_MODEL,
                    )
                except AttributeError:
                    logger.warning("language-switch update_options failed (fallback-wrapped TTS)", exc_info=True)
            elif self._tts_provider not in ("elevenlabs-v3", "google-native"):
                # elevenlabs-v3 (StreamAdapter) has no update_options — the
                # call keeps the language it opened with. Locale-specific
                # Google voices are also intentionally fixed. Sarvam and
                # ElevenLabs Flash both support switching mid-call. self.tts
                # is a TtsFallbackAdapter (not a raw sarvam.TTS) whenever
                # Google credentials are configured — see _build_tts's
                # default branch — and FallbackAdapter has no update_options.
                try:
                    self.tts.update_options(target_language_code=candidate)
                except AttributeError:
                    logger.warning("language-switch update_options failed (fallback-wrapped TTS)", exc_info=True)
            logger.info("switching reply language to %s", candidate)


_PHONE_RE = re.compile(r"^\+?\d[\d\s\-().]{5,}$")


def _caller_number_from_sip(attrs: dict, participant) -> str | None:
    """The caller's real phone number from an inbound SIP participant.

    Not simply sip.phoneNumber: that is the user-part of the From URI, and a
    provider is free to put its trunk credentials there instead of the
    caller. EnableX does exactly that — it sends
    From: "+918088394833" <sip:vistrow-4xfxv26j@...>, so sip.phoneNumber is
    the SIP username and the real number is only in the display name. Saving
    it blind stored "vistrow-4xfxv26j" as lead_phone on every inbound call.

    Try each place the number can appear and take the first that actually
    looks like one, so a provider putting it in the URI (the normal case)
    still works and a username can never be mistaken for a phone number:
      1. the From header's display name (needs the trunk's include_headers)
      2. the participant name LiveKit derived from the From header
      3. sip.phoneNumber, the From URI user-part
    """
    def clean(value: str | None) -> str | None:
        if not value:
            return None
        text = value.strip().strip('"').removeprefix("Phone ").strip()
        return text if _PHONE_RE.match(text) else None

    from_header = attrs.get("sip.h.from") or attrs.get("sip.h.From") or ""
    display = from_header.split("<", 1)[0] if "<" in from_header else ""
    for candidate in (display, getattr(participant, "name", None), attrs.get("sip.phoneNumber")):
        number = clean(candidate)
        if number:
            return number
    return None


async def _wait_for_sip_answer(ctx: JobContext, participant, t0: float, timeout: float = 90.0) -> bool:
    """Block until an outbound SIP callee actually picks up.

    ctx.wait_for_participant() returns as soon as the participant EXISTS in
    the room, which for an outbound call is when dialing starts — not when
    the phone is answered. Greeting off the back of that meant the opener
    played into a ringing handset (or, on calls that were declined outright,
    into nobody at all — confirmed live 2026-09-03: three outbound attempts
    logged a completed greeting while the SIP leg was still dialing or had
    already been rejected).

    Waiting here instead means the whole expensive setup above — config
    fetch, KB load, agent + session construction — happens during the ring,
    which is dead time anyway, and the greeting fires the moment the callee
    is actually on the line.

    No-ops for every non-outbound case: a browser/widget participant has no
    sip.callStatus at all, and an inbound SIP participant is already
    "active" when it joins (verified against a live inbound call).

    Returns True when the call is answered, False if it ended first or never
    got there inside the timeout.
    """
    def status_of() -> str | None:
        return dict(getattr(participant, "attributes", None) or {}).get("sip.callStatus")

    if status_of() in (None, "active"):
        return True

    logger.info("[latency] outbound leg still %s — holding greeting until answered", status_of())
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = status_of()
        if status == "active":
            logger.info("[latency] callee answered at +%.2fs (room=%s)", time.monotonic() - t0, ctx.room.name)
            # "active" means the SIP dialog is up (200 OK), NOT that audio is
            # flowing yet - RTP takes a moment more. Greeting on "active"
            # alone meant the opener went out before the path carried it:
            # confirmed on campaign call 820, where the transcript shows the
            # greeting spoken but the callee heard nothing, answered the
            # silence with "Hello", and the agent then talked itself into a
            # goodbye 76s later having never actually connected.
            #
            # Wait for their audio track to be subscribed - that is the first
            # moment we know the media path exists in the receive direction.
            # Bounded, because a caller who never publishes audio (muted
            # handset, odd carrier) must still get greeted rather than sit in
            # silence forever.
            audio_deadline = time.monotonic() + 3.0
            while time.monotonic() < audio_deadline:
                if any(
                    pub.subscribed and pub.kind == rtc.TrackKind.KIND_AUDIO
                    for pub in participant.track_publications.values()
                ):
                    logger.info("[latency] caller audio live at +%.2fs", time.monotonic() - t0)
                    break
                await asyncio.sleep(0.05)
            else:
                logger.info("greeting anyway: no caller audio track within 3s of answer")
            return True
        # Declined/hung up before answering, or the SIP leg dropped out of
        # the room entirely — either way there is nobody to greet.
        if status == "hangup" or participant.identity not in ctx.room.remote_participants:
            logger.info("outbound leg ended before it was answered (status=%s)", status)
            return False
        await asyncio.sleep(0.1)
    logger.warning("outbound leg never answered within %ss (status=%s)", timeout, status_of())
    return False


def _call_context_from_job(ctx: JobContext) -> dict:
    """Room metadata names which dashboard agent should handle this call, and
    (for phone/widget calls) which number or site it came in on:

    - Phone: {"agent_id", "phone_number"} — stamped by the SIP dispatch rule
      in server/livekit_sip.py.
    - Website widget: {"agent_id", "site_id", "visitor_name", "visitor_phone",
      "visitor_email"} — stamped by /widget/token in server/token_api.py from
      its pre-call name/phone/email form.
    - Dashboard "Browser test": {"agent_id"} only — from /token.
    - Testing Lab: {"agent_id", "test_run_id", "test_scenario_*"} — the
      same browser-call transport, tagged so its result can be correlated.
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
        "visitor_path": None,
        "company": "",
        "custom_fields": {},
        "campaign_contact_id": None,
        "campaign_id": None,
        "demo_language": None,
        "test_run_id": "",
        "test_scenario_id": None,
        "test_scenario_key": "",
        "test_scenario_name": "",
        # Set only by rooms we create directly for a call we ourselves placed
        # (see the new outbound-dial flow) - a real inbound call arriving via
        # the shared SIP trunk never has this in its room metadata, so the
        # dialled-number heuristic below stays authoritative for those.
        "direction": None,
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
    custom_fields = meta.get("custom_fields")
    if isinstance(custom_fields, str):
        try:
            custom_fields = json.loads(custom_fields)
        except ValueError:
            custom_fields = {}
    return {
        "agent_id": int(agent_id) if agent_id is not None else None,
        "call_type": call_type,
        "site_id": int(site_id) if site_id is not None else None,
        # Set only by /api/token's language picker on the public demos, and
        # only ever honoured for a demo agent (see entrypoint) — a tenant's
        # configured language is never overridable from the page.
        "demo_language": meta.get("demo_language"),
        "visitor_name": meta.get("visitor_name"),
        "visitor_phone": meta.get("visitor_phone"),
        "visitor_email": meta.get("visitor_email"),
        # location.pathname at widget-open time — stamped by /widget/token,
        # used only to answer "which page did this lead come from" later.
        "visitor_path": meta.get("visitor_path"),
        "direction": meta.get("direction"),
        "test_run_id": str(meta.get("test_run_id") or "")[:80],
        "test_scenario_id": int(meta["test_scenario_id"]) if meta.get("test_scenario_id") is not None else None,
        "test_scenario_key": str(meta.get("test_scenario_key") or "")[:80],
        "test_scenario_name": str(meta.get("test_scenario_name") or "")[:120],
        # Campaign-dial personalization (see livekit_sip.tag_newest_room) —
        # substituted into {{company}}/{{custom.X}} tokens in the agent's own
        # prompt below, right before RealEstateAgent is constructed.
        "company": meta.get("company") or "",
        "custom_fields": custom_fields if isinstance(custom_fields, dict) else {},
        # Which campaign contact this dial belongs to, so voicemail detection
        # below can correct the dialer's optimistic "placed".
        "campaign_contact_id": meta.get("campaign_contact_id"),
        "campaign_id": meta.get("campaign_id"),
    }


_TEMPLATE_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")


def _substitute_template_vars(text: str, values: dict) -> str:
    """Fill {{first_name}}/{{last_name}}/{{name}}/{{phone}}/{{company}}/
    {{custom.KEY}} tokens in an operator-authored agent prompt with this
    call's contact data (from a campaign dial's CSV import — see
    server/calls_db.py's import_contacts_mapped). An unmatched token (typo,
    or a {{custom.KEY}} the CSV never had) is left blank rather than as
    literal braces, since a stray "{{whatever}}" read aloud by the TTS would
    be far more jarring to a caller than a silently-dropped clause.

    A blank value still leaves the token's surrounding punctuation/spacing
    behind (e.g. "नमस्कार {{name}}! मैं..." -> "नमस्कार !" — a stray space
    before the "!" that reads as broken, not just quiet). The cleanup pass
    below collapses runs of whitespace and drops any space sitting directly
    before punctuation, so a skipped variable disappears cleanly instead of
    leaving the hole visible."""

    def repl(match: re.Match) -> str:
        key = match.group(1)
        if key.startswith("custom."):
            return str(values.get("custom", {}).get(key[7:], ""))
        return str(values.get(key, ""))

    filled = _TEMPLATE_VAR_RE.sub(repl, text)
    filled = re.sub(r"[ \t]{2,}", " ", filled)
    filled = re.sub(r" +([!?.,।])", r"\1", filled)
    return filled.strip()


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


# Upper bound on the post-call enrichment pass. It runs inside LiveKit's
# shutdown callback, so it must not be able to stall teardown; the durable
# call row is written before it either way, so exceeding this only costs the
# extracted fields and the returning-caller summary.
_POST_CALL_ANALYSIS_TIMEOUT_S = 8.0


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
    # Click-to-first-audio latency has real complaints behind it (marketing
    # demo felt like a 5-6s dead pause before the greeting), but the per-turn
    # provider metrics (session "metrics_collected") only cover the LLM/TTS
    # hops — they don't explain time spent before entrypoint even starts
    # doing anything, or between here and the greeting's first TTS call.
    # These markers exist to find out which segment (dispatch -> connect ->
    # caller-joins -> config-loaded -> greeting-TTS-starts) actually owns the
    # delay, instead of guessing.
    _t0 = time.monotonic()
    logger.info("starting session in room %s", ctx.room.name)
    call_context = _call_context_from_job(ctx)
    # The agent-config lookup is a synchronous psycopg call — run it in a
    # worker thread so it overlaps with connecting to the room and waiting
    # for the caller below, instead of blocking this process's event loop
    # (which also hosts every other concurrent call's session).
    config_task = asyncio.create_task(asyncio.to_thread(db.get_agent_config, call_context["agent_id"]))
    await ctx.connect()
    _room_connected_ms = round((time.monotonic() - _t0) * 1000)
    logger.info("[latency] room connected at +%.2fs (room=%s)", time.monotonic() - _t0, ctx.room.name)
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
    except RuntimeError:
        # "room disconnected while waiting for participant" — the room went
        # away before anyone joined: the visitor closed the tab, or the room
        # was deleted underneath us. Only TimeoutError was caught here, so
        # this escaped as an unhandled exception and crashed the job. Nothing
        # is wrong and there is nothing to tear down; the room is already gone.
        logger.info("room %s disconnected before anyone joined — nothing to do", ctx.room.name)
        return
    except asyncio.TimeoutError:
        # Returning here drops the agent out of the room but leaves the room
        # itself alive until LiveKit's empty_timeout expires — and every one
        # of those orphans showed up in the console as a 5-minute session with
        # a single participant. Prewarmed rooms nobody ever joins are common
        # (the widget warms on form-open, the demo orb on hover), so that tail
        # was the bulk of our agent-session minutes. Tear the room down now.
        logger.warning("no caller joined room %s within 90s — abandoning job", ctx.room.name)
        await _hang_up(ctx.room.name)
        return
    _caller_joined_ms = round((time.monotonic() - _t0) * 1000)
    logger.info("[latency] caller joined at +%.2fs (room=%s)", time.monotonic() - _t0, ctx.room.name)
    # /widget/warm pre-creates the room (to give the agent a head start
    # waking up) before the visitor has typed their name/phone/email, so
    # call_context above may have been read from a metadata snapshot that
    # predates /widget/token filling those fields in. ctx.room.metadata is
    # the live value (kept in sync by the SDK), so re-read it now that
    # someone has actually joined — by this point /widget/token has always
    # already run, since that's what hands the visitor their access token.
    try:
        live_meta = json.loads(ctx.room.metadata) if ctx.room.metadata else {}
    except ValueError:
        live_meta = {}
    for key in ("visitor_name", "visitor_phone", "visitor_email", "company"):
        if live_meta.get(key):
            call_context[key] = live_meta[key]
    if live_meta.get("custom_fields"):
        raw_custom = live_meta["custom_fields"]
        try:
            call_context["custom_fields"] = json.loads(raw_custom) if isinstance(raw_custom, str) else raw_custom
        except ValueError:
            pass

    # Inbound phone: trust the dialled number over the room metadata.
    #
    # One LiveKit inbound trunk pools every tenant's numbers, and a SIP
    # dispatch rule cannot filter on the dialled number — its inbound_numbers
    # field matches the CALLER (verified against a live call, 2026-08-21).
    # So the rule can only stamp ONE static agent_id, which stops being
    # correct the moment a second number is registered. The dialled number
    # does reach us, as the SIP participant's sip.trunkPhoneNumber, so
    # resolve the owning tenant from that instead. Without this, tenant #2's
    # callers would reach tenant #1's agent, prompt and knowledge base.
    sip_attrs = dict(getattr(first_participant, "attributes", None) or {})
    dialled_number = sip_attrs.get("sip.trunkPhoneNumber")
    # Skipped entirely when room metadata already set direction (a call WE
    # placed directly, with its own already-correct agent_id/account_id) -
    # this heuristic exists to resolve the tenant/direction for a call
    # arriving via the shared INBOUND trunk, which is meaningless for a
    # room we created ourselves. Whether an outbound-dialed SIP participant
    # even carries sip.trunkPhoneNumber the same way is unverified, so this
    # guard also protects against that heuristic misfiring on it.
    if dialled_number and call_context.get("direction") is None:
        call_context["call_type"] = "phone"
        # Caller ID — otherwise inbound phone leads save with a blank number.
        # Must not be sip.phoneNumber alone: see _caller_number_from_sip, which
        # rejects a provider's SIP username sitting in the From URI user-part.
        caller_number = _caller_number_from_sip(sip_attrs, first_participant)
        if caller_number and not call_context["visitor_phone"]:
            call_context["visitor_phone"] = caller_number
        # Direction: a real inbound caller's number is never our own dialled
        # number. The dashboard's "Test call" / campaign dialer path has
        # EnableX place the outbound leg, then bridge the ANSWERED leg back
        # to us over SIP with `from` set to our own tenant number (see
        # server/calls_db.py's enablex_connect_to_sip) — so on that bridged
        # leg, caller_number and dialled_number are the same number. No
        # separate SIP call-direction attribute exists to read instead; this
        # coincidence is the only signal available, verified against the
        # actual bridging code rather than assumed.
        call_context["direction"] = (
            "outbound"
            if caller_number and caller_number.lstrip("+") == dialled_number.lstrip("+")
            else "inbound"
        )
        owner = await asyncio.to_thread(db.get_phone_number_by_number, dialled_number)
        owner_agent_id = (owner or {}).get("agent_id")
        if owner_agent_id and owner_agent_id != call_context["agent_id"]:
            logger.info(
                "inbound to %s belongs to agent %s (room metadata said %s) — reloading config",
                dialled_number, owner_agent_id, call_context["agent_id"],
            )
            call_context["agent_id"] = owner_agent_id
            stale_task, config_task = config_task, asyncio.create_task(
                asyncio.to_thread(db.get_agent_config, owner_agent_id)
            )
            # The head-start lookup above is now for the wrong agent. Retrieve
            # its result so a failure inside it can't surface as an unhandled
            # "exception was never retrieved" warning on a call that succeeded.
            stale_task.add_done_callback(lambda t: t.cancelled() or t.exception())

    config = await config_task
    _config_ready_ms = round((time.monotonic() - _t0) * 1000)
    logger.info("[latency] config_task awaited at +%.2fs (room=%s)", time.monotonic() - _t0, ctx.room.name)
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
    # Per-account concurrent-call cap (starter/growth/scale) — claims a slot
    # now, before any STT/LLM/TTS spend, and releases it in log_call's
    # shutdown callback below. Declining here (no session ever built) is what
    # actually enforces the cap; the campaign dialer's own pre-check just
    # avoids placing outbound calls that would land here anyway.
    if not db.try_start_call(ctx.room.name, cfg.get("account_id"), cfg):
        logger.info(
            "call admission denied (plan, configuration, capacity or database) for account_id=%s — declining room %s",
            cfg.get("account_id"), ctx.room.name,
        )
        await _hang_up(ctx.room.name)
        return
    # Registered immediately after the claim above (rather than folded into
    # log_call's shutdown callback further down) so the slot is released on
    # EVERY exit path from here on, including a crash between this point and
    # wherever log_call itself gets registered — otherwise a mid-setup
    # exception would leak the row and permanently eat one of the account's
    # concurrent-call slots.
    ctx.add_shutdown_callback(lambda: asyncio.to_thread(db.end_call_room, ctx.room.name))
    if config and (
        ("{{" in (config.get("system_prompt") or "")) or ("{{" in (config.get("welcome_message") or ""))
    ):
        visitor_name = call_context["visitor_name"] or ""
        name_parts = visitor_name.split(None, 1)
        template_vars = {
            "first_name": name_parts[0] if name_parts else "",
            "last_name": name_parts[1] if len(name_parts) > 1 else "",
            "name": visitor_name,
            "phone": call_context["visitor_phone"] or "",
            "company": call_context["company"],
            "custom": call_context["custom_fields"],
        }
        config = {
            **config,
            "system_prompt": _substitute_template_vars(config.get("system_prompt") or "", template_vars),
            # welcome_message is spoken verbatim by on_enter() (see
            # RealEstateAgent.on_enter) — it never goes through the LLM, so
            # an unsubstituted {{name}} would be read aloud by the TTS
            # literally, e.g. "Hello Name" instead of the caller's name.
            "welcome_message": _substitute_template_vars(config.get("welcome_message") or "", template_vars),
        }
        cfg = config
    # "Try it in your language" on the marketing site: the visitor picks a
    # language before the call, so the agent has to OPEN in it rather than
    # opening in Hindi and waiting to be corrected. Restricted to the demo
    # agents — for a tenant, language is a dashboard setting and a public
    # page must not be able to change how their line answers.
    _requested_language = (call_context.get("demo_language") or "").strip()
    if _requested_language and cfg and (
        cfg.get("is_platform_demo") or cfg.get("public_demo_slug")
    ):
        config = {**(config or {}), "language": _requested_language}
        cfg = config
        logger.info("demo language override -> %s (room=%s)", _requested_language, ctx.room.name)
    agent = RealEstateAgent(config, call_context["visitor_name"], call_context["visitor_phone"])
    _agent_ready_ms = round((time.monotonic() - _t0) * 1000)
    logger.info("[latency] RealEstateAgent() constructed at +%.2fs (room=%s)", time.monotonic() - _t0, ctx.room.name)
    # See the [latency] markers above/below — lets on_enter() log its own
    # elapsed-since-dispatch time around the greeting's TTS call.
    agent._dispatch_t0 = _t0
    userdata = {
        "room": ctx.room,
        "lead_data": lead_data,
        "campaign_contact_id": call_context.get("campaign_contact_id"),
        "campaign_id": call_context.get("campaign_id"),
        # Set True by capture_platform_lead/log_lead once either succeeds —
        # lets on_user_turn_completed's farewell check tell a captured lead
        # apart from one that's known but never got saved (call 779).
        "lead_captured": False,
        "ending_call": False,
        # Read by the transfer_call tool.
        "transfer_phone": (cfg.get("transfer_phone") or "").strip(),
        "silence_reminders": 0,
        # Set True once the opening greeting has actually finished playing
        # (see RealEstateAgent.on_enter) — gates the "are you still there?"
        # away check-in so it can't fire while the greeting itself is still
        # mid-flight due to cold-start/TTS latency.
        "greeting_played": False,
        # Which tenant this call belongs to — lets the lead-capture tools fan
        # out to that tenant's connected integrations (Slack/Sheets/WhatsApp/CRM).
        "account_id": cfg.get("account_id"),
        # This agent's own id, so book_appointment can attribute the booking
        # to it (appointments.agent_id).
        "agent_id": cfg.get("id"),
        # Which of the tenant's connected integrations THIS agent fans out
        # to (empty = all connected, unchanged default behavior).
        "crm_integration_keys": cfg.get("crm_integration_keys") or [],
        # "inbound"/"outbound"/None — read by on_user_turn_completed's
        # voicemail check, which only makes sense on a call WE placed.
        "direction": call_context.get("direction"),
        # Call diagnostics, both flushed into the durable row by log_call.
        # Empty defaults mean "never recorded", which is what a call that
        # crashed before the close event should persist.
        "disconnect_reason": "",
        "tool_calls": [],
        # Ordered call timeline. Values are relative to the worker receiving
        # the dispatch, so startup latency and conversational latency share a
        # single clock instead of being guessed from unrelated timestamps.
        "diagnostic_events": [
            {"id": "dispatch", "kind": "lifecycle", "stage": "dispatch", "label": "Call dispatched", "status": "ok", "offsetMs": 0},
            {"id": "room-connected", "kind": "milestone", "stage": "connection", "label": "Media room connected", "status": "ok", "offsetMs": _room_connected_ms},
            {"id": "caller-joined", "kind": "milestone", "stage": "connection", "label": "Caller joined", "status": "ok", "offsetMs": _caller_joined_ms},
            {"id": "config-ready", "kind": "milestone", "stage": "agent", "label": "Agent configuration loaded", "status": "ok", "offsetMs": _config_ready_ms},
            {
                "id": "agent-ready",
                "kind": "milestone",
                "stage": "agent",
                "label": "Voice agent ready",
                "status": "ok",
                "offsetMs": _agent_ready_ms,
                "provider": getattr(agent, "_tts_provider", "") or "",
                "model": getattr(agent, "_model", "") or "",
            },
        ],
        # First user turn on an outbound call hasn't been checked for a
        # voicemail greeting yet.
        "voicemail_checked": False,
        # Raw per-turn timings are captured from LiveKit's provider metrics
        # below and persisted with the call for tenant/admin p50/p95 tuning.
        "latency_metrics": {
            "eouMs": [],
            "transcriptionMs": [],
            # Previously not captured at all, despite the framework providing
            # it on the same eou_metrics event as the two above — the one
            # piece of "why does it still feel slow after the caller stops
            # talking" that was completely invisible: how long our OWN
            # on_user_turn_completed callback (real synchronous work every
            # turn — building the language/gender instruction blocks) takes
            # before the LLM call can even begin. Added 2026-08-19 after
            # transcriptionMs turned out to likely be a correct ~0 (Sarvam's
            # streaming STT usually has the transcript finalized before
            # end-of-speech fires, per LiveKit's own EOUMetrics docstring),
            # not the blind spot it first looked like — this field is where
            # a real one might actually be hiding.
            "onTurnCompletedMs": [],
            "llmTtftMs": [],
            "ttsTtfbMs": [],
            "providers": [],
        },
    }

    def _record_diagnostic(kind: str, stage: str, label: str, status: str = "info", **detail) -> None:
        """Append one bounded diagnostic event without risking the call.

        Diagnostics are observability only. If an unexpected provider object
        contains a value we cannot serialize, dropping that field is always
        preferable to disturbing the conversation or its durable call row.
        """
        try:
            events = userdata.setdefault("diagnostic_events", [])
            if len(events) >= 500:
                return
            event = {
                "id": f"event-{len(events)}",
                "kind": kind,
                "stage": stage,
                "label": label,
                "status": status,
                "offsetMs": round((time.monotonic() - _t0) * 1000),
            }
            for key, value in detail.items():
                if value is None or isinstance(value, (str, int, float, bool)):
                    event[key] = value
            events.append(event)
        except Exception:
            logger.debug("could not record call diagnostic event", exc_info=True)

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
    # Six-and-a-half seconds is too eager for a public demo: a skeptical
    # prospect often pauses to think or composes a longer typed message, and
    # the resulting "are you still there?" lands as an interruption. Give
    # Artha callers a natural thinking window; tenant agents retain the
    # existing cadence unless their operator configures another value.
    away_timeout = (
        silence_reminder_ms / 1000
        if silence_reminder_ms > 0
        else (18.0 if cfg.get("is_platform_demo") else 6.5)
    )
    silence_reminder_max = int(cfg.get("silence_reminder_max") or 1)
    end_call_on_silence_ms = int(cfg.get("end_call_on_silence_ms") or 0)
    max_call_duration_s = int(cfg.get("max_call_duration_s") or 0)
    # Dialed by _on_session_close below when AgentSession itself reports the
    # call died from a pipeline error (CloseReason.ERROR) - a genuinely
    # unhandled STT/LLM/TTS/RealtimeModel failure that would otherwise just
    # silently end the call with no warning to the caller. Blank means no
    # fallback attempt, same as today.
    emergency_fallback_number = (cfg.get("emergency_fallback_number") or "").strip()

    session = AgentSession(
        userdata=userdata,
        # filter_markdown first: strips **bold**/bullets/etc before the
        # gender guard ever sees the text, since the LLM occasionally
        # ignores the "no markdown" prompt instruction (confirmed live -
        # asterisks and list dashes were read aloud verbatim) and prompt
        # compliance alone isn't a reliable guarantee for a live voice call.
        # LiveKit's own built-in transform (livekit.agents.voice.
        # transcription.filters.filter_markdown), not hand-rolled - already
        # buffers correctly across split ** markers mid-stream.
        tts_text_transforms=["filter_markdown", _make_caller_gender_guard_transform(agent)],
        turn_handling=TurnHandlingOptions(
            interruption={
                "min_words": min_words,
                # min_words alone is language-asymmetric and cut real callers
                # off mid-sentence: Hindi acknowledgements are almost all
                # exactly two words ("ठीक है", "जी बिल्कुल", "जी बताइए"), so
                # at min_words=2 a caller saying the equivalent of "mm-hmm"
                # barges in, while the English one-word "okay"/"right" does
                # not. Confirmed on a real call - four replies were cut
                # mid-sentence, each immediately after one of those phrases,
                # and the agent then re-stated the point it never finished,
                # which is where the repetition in that transcript came from.
                #
                # min_duration filters by how LONG the caller spoke instead of
                # how many words it parsed, which is language-neutral: a
                # dropped-in acknowledgement is short, a genuine interruption
                # runs longer. 0.8s clears typical two-word backchannels while
                # still yielding the floor to someone actually cutting in.
                #
                # The right fix is interruption_detection="adaptive", whose
                # backchannel_boundary suppresses exactly this - but it
                # requires stt.capabilities.aligned_transcript, and the Sarvam
                # plugin hardcodes that False ("chunk timestamps don't seem to
                # work despite the docs saying they do"), so adaptive cannot
                # run on this STT at all. Revisit if that changes.
                "min_duration": 0.8,
            },
            # Preemptive LLM generation (starting on the interim, not-yet-
            # finalized transcript) is already ON by default in this
            # livekit-agents version — nothing to change there. What's NOT
            # on by default is preemptive_tts: normally TTS waits for the
            # turn to actually be confirmed before starting synthesis, even
            # though the LLM already ran speculatively. Enabling it overlaps
            # TTS startup with that same confirmation wait too — shaves off
            # additional latency at the cost of occasionally synthesizing
            # (and discarding) audio for a transcript that turns out wrong.
            # Worth it here: a wrong discard just means a wasted TTS call,
            # never a wrong thing said aloud — the framework only speaks the
            # generation tied to the confirmed final transcript.
            preemptive_generation={"preemptive_tts": True},
            # Sarvam's saaras:v3 can take longer than livekit-agents' 3.0s
            # default max_delay to finalize a transcript on a longer
            # utterance. When that happens the framework commits the user's
            # turn as empty/stale and silently drops the late-arriving real
            # transcript ("transcript arrives after turn has been
            # committed" — confirmed live on a real call, job AJ_mCTsGQeHaBNf:
            # two real follow-up questions never reached the LLM, and with
            # no new content the away-timeout check-in below just repeated
            # "are you still there?" instead of ever answering).
            #
            # min_delay is left at its default (0.5s) deliberately — per
            # audio_recognition.py's _bounce_eou_task, min_delay is the wait
            # applied to EVERY turn, while max_delay only kicks in when the
            # turn-detector model isn't confident the caller has finished
            # speaking (endpointing_delay escalates from min_delay to
            # max_delay only when end_of_turn_probability < unlikely_threshold).
            # So raising max_delay alone fixes the slow/ambiguous-turn drop
            # above with zero added latency on normal, confident replies.
            #
            # 6.0 fully covered the transcript-drop bug but made every
            # low-confidence turn (common on Indian-English/code-mixed
            # speech, this product's core case) wait up to 6s before
            # replying — felt as "the agent is slow" in a 2026-07-30 client
            # demo. 4.0 keeps real buffer over the old 3.0s default that
            # caused the drop while roughly halving the worst-case reply lag.
            #
            # A later pass reverted this to 3.0 to shave latency further,
            # which reintroduced the exact transcript-drop bug this comment
            # describes — confirmed live again on 2026-08-13 (a real reply
            # never arrived; the caller just got repeated "are you still
            # there?" check-ins instead). 4.0 is the value actually proven
            # to fix that failure mode; don't lower it again without a real
            # fix for the underlying STT-finalization race, not just a
            # latency trade that brings the drop back.
            endpointing=EndpointingOptions(min_delay=0.4, max_delay=4.0),
        ),
        # See _EOT_UNLIKELY_THRESHOLDS: stops 9 of our 11 languages from
        # being judged with LiveKit's English end-of-turn threshold.
        turn_detection=eot.TurnDetector(unlikely_threshold=_EOT_UNLIKELY_THRESHOLDS),
        user_away_timeout=away_timeout,
        # Google's Gemini TTS backend (gemini-2.5-flash-tts) genuinely times
        # out under the framework's 10s default often enough to matter —
        # confirmed via Cloud Monitoring: ~12% of requests over 24h hit a
        # real 504 gateway timeout, not a client-cancelled 499. Each one
        # trips TtsFallbackAdapter into switching the caller's voice to
        # Sarvam for the rest of the call (see _google_fallback_tts). 20s
        # gives a genuinely-slow-but-alive response room to finish instead
        # of being cut off and treated as dead. This is a per-TTS-attempt
        # timeout, not a call-length limit — a successful streaming response
        # continues normally once its first frames arrive, so this doesn't
        # cost latency on the (large majority of) healthy requests.
        conn_options=SessionConnectOptions(tts_conn_options=APIConnectOptions(timeout=20.0)),
    )
    logger.info("[latency] AgentSession() constructed at +%.2fs (room=%s)", time.monotonic() - _t0, ctx.room.name)

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

    # Separate from the watchdog above: livekit-agents' own user_away_timeout
    # (default 15s) fires "away" exactly ONCE per silence stretch — it is an
    # edge, not a level, and re-arms only once the caller speaks again (see
    # AgentSession._update_user_state: "if self._user_state == state:
    # return"). So a caller who goes quiet and never speaks again produces
    # exactly one "away" event, ever — a second "still nothing back" branch
    # keyed off a second "away" event is unreachable dead code (confirmed
    # live: the call sat at "Listening…" for 2+ minutes after the one
    # check-in with no further action). This timer is what actually detects
    # "checked in and STILL silent": armed right after the check-in line is
    # sent, cancelled the moment the caller speaks.
    post_checkin_task: dict = {"handle": None}
    _POST_CHECKIN_TIMEOUT_S = 12.0

    def _cancel_post_checkin_timeout() -> None:
        if post_checkin_task["handle"]:
            post_checkin_task["handle"].cancel()
            post_checkin_task["handle"] = None

    def _arm_post_checkin_timeout() -> None:
        _cancel_post_checkin_timeout()

        async def _watch() -> None:
            try:
                await asyncio.sleep(_POST_CHECKIN_TIMEOUT_S)
                logger.info("hanging up room %s — silent after check-in", ctx.room.name)
                userdata["ending_call"] = True
                session.generate_reply(
                    instructions=(
                        "The caller still hasn't responded after you already checked in. Say one "
                        "short, warm line explaining you can't hear them so you'll go ahead and end "
                        "the call here — e.g. something like \"लगता है आवाज़ नहीं आ रही, मैं कॉल यहीं "
                        "खत्म करती हूँ\" — then stop. Do not ask another question."
                    )
                )
            except asyncio.CancelledError:
                pass

        post_checkin_task["handle"] = asyncio.create_task(_watch())

    def _on_user_state_changed(ev) -> None:
        _record_diagnostic(
            "state",
            "caller",
            f"Caller {str(ev.new_state).replace('_', ' ')}",
            "warning" if ev.new_state == "away" else "info",
            state=str(ev.new_state),
        )
        if ev.new_state == "speaking":
            # Caller is talking again — reset the reminder count and both
            # silence timers.
            userdata["silence_reminders"] = 0
            _reset_silence_hangup()
            _cancel_post_checkin_timeout()
        elif ev.new_state == "away":
            if not userdata.get("greeting_played", False):
                # Away fired before the opening line finished playing (slow
                # cold start / TTS) — not real caller silence, ignore it.
                return
            if userdata.get("agent_speaking", False):
                # Away fired while the AGENT's own reply is still generating
                # or playing — user_away_timeout only watches caller VOICE
                # activity, so a long agent turn (a multi-sentence answer,
                # slow TTS) leaves it counting straight through the agent's
                # own monologue. Confirmed live: this generate_reply()
                # call raced the in-flight turn and won, cutting the real
                # answer off mid-word and replacing it with "are you still
                # there?" — visible to the caller as the agent apparently
                # ignoring what it was just saying. It is never correct to
                # check in while the agent itself is mid-turn, so skip
                # entirely here; _on_agent_state_changed will let a real
                # away condition (caller silent after the agent finishes)
                # be caught by the next "away" event instead.
                return
            sent = userdata.get("silence_reminders", 0)
            if sent < silence_reminder_max:
                userdata["silence_reminders"] = sent + 1
                session.generate_reply(
                    instructions=(
                        "The caller has gone quiet for a few seconds. Check in warmly and briefly — "
                        "nothing else. Do NOT default to a stock \"are you still there?\" line — vary "
                        "it like a real person would: a soft filler first (\"हां\", \"तो\", \"अच्छा\"), "
                        "sometimes just their name with a questioning tone, sometimes referencing what "
                        "you just said (\"सुन पा रहे हैं?\", \"कुछ पूछना था?\"), sometimes a trailing "
                        "\"...?\" instead of a full question. Never repeat the same phrasing you used "
                        "earlier in this call."
                    )
                )
                # If the caller is still silent _POST_CHECKIN_TIMEOUT_S after
                # this check-in finishes, hang up with a spoken reason —
                # see _arm_post_checkin_timeout for why a second "away"
                # event can't be relied on to catch this instead.
                _arm_post_checkin_timeout()

    def _on_agent_state_changed(ev) -> None:
        _record_diagnostic(
            "state",
            "agent",
            f"Agent {str(ev.new_state).replace('_', ' ')}",
            "info",
            state=str(ev.new_state),
        )
        # Read by _on_user_state_changed's "away" branch above, so the
        # check-in can never fire mid-reply.
        userdata["agent_speaking"] = ev.new_state == "speaking"
        # end_call (tools.py) sets userdata["ending_call"] and returns
        # instructions for a goodbye line; this waits for that goodbye to
        # actually finish playing (agent state drops out of "speaking")
        # before tearing the room down, so the farewell is never cut off
        # mid-sentence.
        if userdata.get("ending_call") and ev.old_state == "speaking" and ev.new_state != "speaking":
            userdata["ending_call"] = False
            asyncio.create_task(_hang_up(ctx.room.name))

    def _on_function_tools_executed(ev) -> None:
        # One row per tool the agent actually invoked, with a real measured
        # latency: LiveKit stamps created_at on both the FunctionCall and its
        # FunctionCallOutput, so the difference is the true execution time
        # rather than an estimate. The event fires once per BATCH (parallel
        # tool calls arrive together), hence the loop over zipped pairs.
        # Wrapped whole: diagnostics must never be able to disturb a live call.
        try:
            for call, output in ev.zipped():
                entry = {"name": getattr(call, "name", "") or "unknown"}
                if output is not None:
                    entry["ok"] = not getattr(output, "is_error", False)
                    started = getattr(call, "created_at", None)
                    finished = getattr(output, "created_at", None)
                    if started and finished and finished >= started:
                        entry["ms"] = round((finished - started) * 1000)
                    if entry["ok"] is False:
                        # Truncated: a tool's error text can be a full
                        # provider payload, and this is stored per call.
                        entry["error"] = (getattr(output, "output", "") or "")[:200]
                else:
                    # A None output means the call produced nothing to send
                    # back to the LLM (e.g. it raised StopResponse) — that is
                    # not a failure, so don't record it as one.
                    entry["ok"] = True
                    entry["note"] = "no output returned to model"
                userdata.setdefault("tool_calls", []).append(entry)
                _record_diagnostic(
                    "tool",
                    "action",
                    "Agent action completed" if entry.get("ok", True) else "Agent action failed",
                    "ok" if entry.get("ok", True) else "error",
                    name=entry.get("name"),
                    durationMs=entry.get("ms"),
                )
        except Exception:
            logger.warning("could not record tool-call diagnostics", exc_info=True)

    def _on_session_close(ev) -> None:
        # Record why this call ended for EVERY reason, not just failures —
        # this runs before the emergency-fallback early-return below, which
        # only cares about CloseReason.ERROR. Read back by log_call when it
        # writes the durable row. CloseReason is a str Enum, so .value is the
        # stable wire string ("user_initiated", "error", …) rather than
        # "CloseReason.USER_INITIATED".
        try:
            userdata["disconnect_reason"] = getattr(ev.reason, "value", None) or str(ev.reason)
            _record_diagnostic(
                "lifecycle",
                "call",
                "Call ended",
                "error" if ev.reason == CloseReason.ERROR else "ok",
                reason=userdata["disconnect_reason"],
            )
            if ev.error is not None:
                # Class name only — the message can carry provider payloads.
                userdata["disconnect_error"] = type(ev.error).__name__
        except Exception:
            logger.warning("could not record disconnect reason", exc_info=True)

        # ev.reason == CloseReason.ERROR is AgentSession's own signal that
        # the call died from a genuine pipeline failure (an unrecoverable
        # STT/LLM/TTS/RealtimeModel error) — every provider already has its
        # own fallback/retry chain (TtsFallbackAdapter etc.), so by the time
        # this fires those have already been exhausted. Deliberately does
        # NOT trigger on the other CloseReason values (job_shutdown,
        # participant_disconnected, user_initiated, task_completed) — those
        # are normal call endings, not failures, and transferring on one
        # would hand a caller who simply hung up to a human for no reason.
        if ev.reason != CloseReason.ERROR or not emergency_fallback_number:
            return
        sip_identity = _find_sip_participant(ctx.room)
        if sip_identity is None:
            logger.warning(
                "emergency fallback: session closed with error but no SIP participant to transfer "
                "(room=%s, error=%s)", ctx.room.name, ev.error,
            )
            return
        transfer_to = (
            emergency_fallback_number
            if emergency_fallback_number.startswith(("tel:", "sip:"))
            else f"tel:{emergency_fallback_number}"
        )

        async def _do_transfer() -> None:
            try:
                lkapi = api.LiveKitAPI()
                try:
                    await lkapi.sip.transfer_sip_participant(
                        api.TransferSIPParticipantRequest(
                            participant_identity=sip_identity,
                            room_name=ctx.room.name,
                            transfer_to=transfer_to,
                            play_dialtone=True,
                        )
                    )
                finally:
                    await lkapi.aclose()
                logger.info(
                    "emergency fallback: transferred caller %s to %s after session error "
                    "(room=%s, error=%s)", sip_identity, transfer_to, ctx.room.name, ev.error,
                )
            except Exception:
                logger.exception("emergency fallback: transfer to %s failed (room=%s)", transfer_to, ctx.room.name)

        asyncio.create_task(_do_transfer())

    # Belt-and-suspenders for the OTHER direction of the same end-call bug:
    # on_user_turn_completed's _looks_like_farewell nudge only helps when
    # the CALLER says goodbye first. Observed live on a real tenant call —
    # the agent generated its OWN closing line ("...अब मैं कॉल समाप्त कर
    # रही हूँ") without ever calling the end_call tool, so
    # userdata["ending_call"] was never set, _on_agent_state_changed's
    # hangup above never fired, and the caller's silence afterward
    # (naturally — they thought the call had ended) got picked up by the
    # away-checker instead: the agent then asked "are you still there?"
    # right after saying goodbye. This inspects the agent's OWN
    # just-added message for the same closing signal and sets
    # ending_call directly when the tool call never happened, reusing
    # _on_agent_state_changed's existing "wait for speech to finish, then
    # hang up" logic above rather than a separate hangup path.
    _AGENT_CLOSING_PHRASES = (
        "समाप्त कर रही हूँ", "समाप्त कर रहा हूँ", "कॉल समाप्त", "कॉल खत्म",
        "अलविदा", "फिर मिलते हैं", "शुभ दिन",
        "have a great day", "goodbye", "bye for now", "take care",
        "i'll end the call", "i'll go ahead and end", "ending the call now",
    )

    def _on_conversation_item_added(ev) -> None:
        item = ev.item
        role = getattr(item, "role", None)
        if role in {"assistant", "user"}:
            _record_diagnostic(
                "turn",
                "agent" if role == "assistant" else "caller",
                "Agent response added" if role == "assistant" else "Caller turn captured",
                "info",
                role=role,
            )
        if getattr(item, "role", None) != "assistant" or userdata.get("ending_call"):
            return
        text = (item.text_content or "").lower()
        # Call 825 replayed its entire opening line inside a mid-conversation
        # reply, which reads to the caller as the system restarting. The cause
        # (the opener appearing twice more in the prompt) is fixed and rule 2
        # of the platform block now forbids it, but nothing would have TOLD us
        # it recurred — it was found by reading a transcript by chance. This
        # does not suppress the audio: catching it before playout would mean
        # buffering whole sentences inside tts_node, on the most
        # latency-sensitive path in the call. Detect and record instead.
        _opener = (getattr(agent, "_welcome_message", "") or "").strip().lower()
        if _opener and len(_opener) > 25 and userdata.get("greeting_played"):
            if _opener[:60] in text and not userdata.get("greeting_echo_seen"):
                userdata["greeting_echo_seen"] = True
                logger.warning("agent replayed its opening line mid-call: %r", item.text_content)
                _record_diagnostic(
                    "quality", "agent", "Agent replayed its opening line mid-call", "error",
                )
        if any(phrase.lower() in text for phrase in _AGENT_CLOSING_PHRASES):
            logger.info("agent's own reply looked like a goodbye without end_call being called — forcing hangup after it finishes")
            userdata["ending_call"] = True
            # Safety net: _on_agent_state_changed above only fires ON the
            # speaking -> not-speaking transition. If that transition
            # already happened by the time this event fires (this text
            # finalizes before TTS playback starts/ends), the flag would
            # otherwise sit unused until some future turn. Catch that case
            # directly rather than relying on the transition alone.
            if session.agent_state != "speaking":
                userdata["ending_call"] = False
                asyncio.create_task(_hang_up(ctx.room.name))

    last_provider_by_stage: dict[str, str] = {}

    def _on_metrics_collected(ev) -> None:
        metric = ev.metrics
        metric_type = getattr(metric, "type", "")
        timings = userdata["latency_metrics"]
        collected_offset_ms = round((time.monotonic() - _t0) * 1000)
        metadata = getattr(metric, "metadata", None)
        provider = getattr(metadata, "model_provider", None) if metadata else None
        model = getattr(metadata, "model_name", None) if metadata else None
        label = "/".join(part for part in (provider, model) if part)
        if metric_type == "eou_metrics":
            samples = (
                ("endpointing", "eouMs", "Caller turn detected", metric.end_of_utterance_delay),
                ("stt", "transcriptionMs", "Speech transcription finalized", metric.transcription_delay),
                ("turn", "onTurnCompletedMs", "Turn processing completed", metric.on_user_turn_completed_delay),
            )
            for stage, key, event_label, seconds in samples:
                duration_ms = round(max(0.0, seconds) * 1000)
                timings[key].append(duration_ms)
                _record_diagnostic("metric", stage, event_label, "warning" if duration_ms >= 1500 else "ok", durationMs=duration_ms, provider=provider, model=model)
        elif metric_type == "llm_metrics" and not metric.cancelled:
            duration_ms = round(max(0.0, metric.ttft) * 1000)
            timings["llmTtftMs"].append(duration_ms)
            # metrics_collected fires when the whole request completes, not
            # when the first token arrived. Anchor the milestone at the
            # measured request start + TTFT; stamping it at collection time
            # made the tenant timeline claim the response began seconds after
            # later agent-state events had already happened.
            request_duration_ms = round(max(0.0, metric.duration) * 1000)
            first_output_offset_ms = max(0, collected_offset_ms - request_duration_ms + duration_ms)
            _record_diagnostic(
                "metric", "llm", "AI response started",
                "warning" if duration_ms >= 1500 else "ok",
                durationMs=duration_ms,
                offsetMs=first_output_offset_ms,
                observedAtOffsetMs=collected_offset_ms,
                provider=provider,
                model=model,
            )
        elif metric_type == "tts_metrics" and not metric.cancelled:
            duration_ms = round(max(0.0, metric.ttfb) * 1000)
            timings["ttsTtfbMs"].append(duration_ms)
            # Same semantics as LLMMetrics: TTSMetrics is emitted after the
            # synthesis segment finishes. The first audio occurred at request
            # start + TTFB, which LiveKit exposes through duration and ttfb.
            request_duration_ms = round(max(0.0, metric.duration) * 1000)
            first_audio_offset_ms = max(0, collected_offset_ms - request_duration_ms + duration_ms)
            _record_diagnostic(
                "metric", "tts", "First audio generated",
                "warning" if duration_ms >= 1500 else "ok",
                durationMs=duration_ms,
                offsetMs=first_audio_offset_ms,
                observedAtOffsetMs=collected_offset_ms,
                provider=provider,
                model=model,
            )
        else:
            return

        if label and label not in timings["providers"]:
            timings["providers"].append(label)
        stage = "llm" if metric_type == "llm_metrics" else "tts" if metric_type == "tts_metrics" else "stt"
        previous = last_provider_by_stage.get(stage)
        if label and previous and label != previous:
            _record_diagnostic(
                "provider_switch",
                stage,
                f"{stage.upper()} provider changed",
                "warning",
                previousProvider=previous,
                provider=label,
                inferred=True,
            )
        if label:
            last_provider_by_stage[stage] = label

    session.on("user_state_changed", _on_user_state_changed)
    session.on("agent_state_changed", _on_agent_state_changed)
    session.on("close", _on_session_close)
    session.on("function_tools_executed", _on_function_tools_executed)
    session.on("conversation_item_added", _on_conversation_item_added)
    # Deprecated only for usage accounting; it remains LiveKit 1.6's public
    # event for detailed per-stage latency.  session_usage_updated does not
    # include EOU, TTFT or TTFB, which are the values we need here.
    session.on("metrics_collected", _on_metrics_collected)

    # Held in a dict (not read at shutdown time) because by the time the job
    # drains and the shutdown callback runs, the visitor has already left the
    # participant list. wait_for_participant above guarantees we have them.
    visitor_holder: dict[str, str | None] = {"identity": first_participant.identity}
    # Same reasoning as visitor_holder above — set once the recorder actually
    # starts (after session.start(), below), read here once the call ends.
    recorder_holder: dict[str, recording.CallRecorder | None] = {"recorder": None}
    # Same pattern again for the optional background-ambience track.
    background_audio_holder: dict[str, BackgroundAudioPlayer | None] = {"player": None}

    async def log_call() -> None:
        ended_at = datetime.now(timezone.utc)
        # The caller-directed gender guard runs as a TTS text transform, so
        # the AUDIO has always been correct — but the stored transcript is the
        # model's raw text, which still reads "आप ... बता सकती हैं" to a male
        # caller. Every review of a call is done on the transcript, so it read
        # as a live bug that had in fact only ever existed on the page. Same
        # function, so the record now matches what was actually said.
        transcript = [
            {
                "role": item.role,
                "text": (
                    item.text_content
                    if item.role != "assistant" or agent._caller_gender == "female"
                    else _neutralize_caller_directed_gender(item.text_content)
                ),
            }
            for item in session.history.items
            if getattr(item, "text_content", None)
        ]
        resolved_agent_id = call_context["agent_id"] or cfg.get("id")
        # A demo caller is not someone to remember between visits — that is
        # CRM state about a real customer, and the demos are a shop window.
        want_memory = (
            agent._memory_enabled
            and bool(agent._caller_phone)
            and not (agent._public_demo_slug or agent._is_platform_demo)
        )
        # The post-call LLM pass used to run HERE, before save_call, and gate
        # it. It is an optional enrichment (operator-defined fields + a
        # returning-caller summary) but an un-timeouted OpenAI request, so a
        # slow or hung one took the transcript, the recording AND the billing
        # row down with it. Observed live 2026-08-21: a real ~60s conversation
        # left no `calls` row at all, while trivial 2-turn calls either side of
        # it saved fine. Write the durable record first; enrich it afterwards.
        extracted: dict = {}
        memory_summary = ""
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
                    "model": agent._model,
                    "transcript": transcript,
                    "call_type": call_context["call_type"],
                    "direction": call_context.get("direction"),
                    "site_id": call_context["site_id"],
                    "page_path": call_context.get("visitor_path") or "",
                    # Which dashboard agent took the call — explicit from room
                    # metadata when routed, otherwise whichever agent config
                    # actually loaded (the default/first one).
                    "agent_id": resolved_agent_id,
                    "account_id": cfg.get("account_id"),
                    # Seeded with what log_lead captured during the call, so the
                    # property fields survive even if post-call analysis times out.
                    "extracted_data": {**_extra_lead_facts(lead_data), **extracted},
                    "latency_metrics": userdata["latency_metrics"],
                    "diagnostic_events": userdata.get("diagnostic_events") or [],
                    # Diagnostics collected during the call. .get() rather
                    # than [] — a call that died before userdata was fully
                    # populated must still save its transcript.
                    "disconnect_reason": userdata.get("disconnect_reason") or "",
                    "tool_calls": userdata.get("tool_calls") or [],
                    "test_run_id": call_context.get("test_run_id") or "",
                    "test_scenario_id": call_context.get("test_scenario_id"),
                    "test_scenario_key": call_context.get("test_scenario_key") or "",
                    "test_scenario_name": call_context.get("test_scenario_name") or "",
                    **lead_data,
                }
            )
            logger.info("saved call log for room %s (%d turns)", ctx.room.name, len(transcript))
        except Exception:
            logger.exception("failed to save call log for room %s", ctx.room.name)
        # Enrichment, now that the record is safely on disk. Bounded so a
        # stalled provider can only cost the extracted fields/memory summary,
        # never the call itself.
        if transcript:
            try:
                extracted, memory_summary = await asyncio.wait_for(
                    _post_call_analysis(transcript, agent._post_call_fields, want_memory),
                    timeout=_POST_CALL_ANALYSIS_TIMEOUT_S,
                )
            except asyncio.TimeoutError:
                logger.warning(
                    "post-call analysis timed out after %ss for room %s — call already saved",
                    _POST_CALL_ANALYSIS_TIMEOUT_S, ctx.room.name,
                )
            except Exception:
                logger.exception("post-call analysis failed for room %s — call already saved", ctx.room.name)
            if extracted:
                # Re-merge: this OVERWRITES the column, so dropping the
                # in-call facts here would silently undo the seed above.
                db.set_call_extracted_data(
                    saved_call_id, {**_extra_lead_facts(lead_data), **extracted}
                )

        # ORDER MATTERS. The recorder used to stop AFTER the ambience player
        # was closed, and aclose() can hang: on an ambience-enabled call the
        # shutdown callback never reached recorder.stop() at all — no
        # "recording: stop() called" line in the logs, just "process did not
        # exit in time, killing process" — and the audio was lost. Recordings
        # saved 7/7 with ambience off and 11/36 with it on, which is the same
        # fact from the other side. The recording is the durable artifact, so
        # it is finalised first and the ambience player is torn down after.
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

        background_audio = background_audio_holder["player"]
        if background_audio is not None:
            try:
                # Bounded: an aclose() that never returns must not be able to
                # hold the whole shutdown callback open. The worker is going
                # away anyway, so a leaked player costs nothing.
                await asyncio.wait_for(background_audio.aclose(), timeout=3)
            except asyncio.TimeoutError:
                logger.warning("background audio aclose() timed out for room %s", ctx.room.name)
            except Exception:
                logger.exception("failed to close background audio for room %s", ctx.room.name)
        # A separate, comprehensive delivery at call end — unlike the
        # mid-call capture_lead/book_appointment fan-outs (small structured
        # events for fast CRM visibility during the call), this one carries
        # the full transcript, which is only known once the call is over.
        await _deliver_to_integrations(
            cfg.get("account_id"),
            allowed_keys=cfg.get("crm_integration_keys") or None,
            lead={
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
    # Lets the widget's in-call "type instead" fallback (a noisy-environment
    # visitor who can't reliably be heard by STT) inject a turn as if it had
    # been spoken — generate_reply(user_input=...) runs it through the same
    # LLM/tool pipeline as a normal utterance and speaks the reply aloud, so
    # the caller never has to know it arrived as text instead of audio.
    #
    # user_away_timeout above only ever watches for VOICE activity — a
    # visitor who's deliberately typing instead of speaking produces zero
    # audio, so AgentSession independently decides they've gone silent and
    # fires its own "are you still there?" check-in (_on_user_state_changed
    # below) completely unaware that a real conversation is happening via
    # text. Confirmed live: that generic reminder was winning the race
    # against the actual grounded reply, making typed messages look
    # ignored. Both handlers below treat typed activity exactly like real
    # speech for presence-tracking purposes, resetting the same counters
    # _on_user_state_changed resets on ev.new_state == "speaking".
    def _mark_present() -> None:
        userdata["silence_reminders"] = 0
        _reset_silence_hangup()

    def _on_data_received(data_packet) -> None:
        if data_packet.topic == "typing-presence":
            # Lightweight, reply-free keep-alive the widget sends on an
            # interval while its type-instead row is open (see widget.ts) -
            # suppresses the away check-in while the visitor is composing a
            # message, before they've even hit send.
            _mark_present()
            return
        if data_packet.topic != "typed-utterance":
            return
        try:
            text = data_packet.data.decode("utf-8").strip()[:500]
        except UnicodeDecodeError:
            return
        if not text:
            return
        logger.info("typed utterance received in room %s: %r", ctx.room.name, text)
        _mark_present()
        # generate_reply() alone doesn't stop speech already in flight - real
        # voice barge-in works because VAD detecting the caller talking
        # triggers session.interrupt() before the new reply starts, but a
        # typed message skips that path entirely. Without this, typing while
        # the agent is mid-sentence just queued a reply behind the current
        # one instead of actually cutting in, reported live as "text
        # barge-in doesn't work" on the widget's type-instead fallback.
        session.interrupt()
        session.generate_reply(user_input=text)

    ctx.room.on("data_received", _on_data_received)

    # Everything above (config, KB, agent/session construction) is safe to do
    # while an outbound call is still ringing, and that is exactly the point:
    # it turns ring time into warm-up time. Only the greeting has to wait for
    # a human to actually be there.
    #
    # Gated on direction == "outbound" (set in room metadata by
    # livekit_sip.place_outbound_call, so it is only ever true for a call WE
    # placed). Waiting on ANY sip.callStatus deadlocked real inbound calls:
    # an inbound leg can sit at "ringing" until the session answers it, so
    # holding session.start() until it reached "active" meant each side
    # waiting on the other - the caller heard ringing for ~28s and the call
    # then died without ever connecting.
    if call_context.get("direction") == "outbound" and not await _wait_for_sip_answer(
        ctx, first_participant, _t0
    ):
        await _hang_up(ctx.room.name)
        return
    logger.info("[latency] session.start() beginning at +%.2fs (room=%s)", time.monotonic() - _t0, ctx.room.name)
    await session.start(
        agent=agent,
        room=ctx.room,
        room_input_options=RoomInputOptions(noise_cancellation=noise_filter),
    )
    logger.info("[latency] session.start() returned at +%.2fs (room=%s)", time.monotonic() - _t0, ctx.room.name)
    # Started only after the session (and therefore both the caller's and
    # the agent's audio tracks) is actually up — see recording.py for why
    # this taps tracks directly instead of LiveKit's own record=True/Egress.
    # Honour the tenant's record_calls setting. Until now the agent recorded
    # unconditionally: the dashboard toggle existed, defaulted to False, and
    # nothing read it — 357 recordings were stored on this account under a
    # False flag. Reads through the prewarmed cache, so this costs nothing on
    # the call path, and get_compliance_config fails closed (recording OFF) so
    # a DB problem can never become the reason a call was recorded.
    _compliance = db.get_compliance_config(cfg.get("account_id"))
    if not _compliance.get("record_calls"):
        logger.info(
            "recording disabled by compliance settings for account %s (room=%s)",
            cfg.get("account_id"), ctx.room.name,
        )
    else:
        try:
            recorder = recording.CallRecorder(ctx.room)
            recorder.start()
            recorder_holder["recorder"] = recorder
        except Exception:
            logger.exception("failed to start call recorder for room %s", ctx.room.name)

    # Opt-in per agent (see calls_db.py's ambient_noise column) - a low,
    # looping office-ambience bed mixed into the agent's own audio track via
    # LiveKit's own BackgroundAudioPlayer/BuiltinAudioClip, not a hand-rolled
    # mixer. A synthetic voice with zero room tone is itself one of the
    # tells that gives away an AI caller; kept deliberately quiet (5%) so it
    # reads as "someone in an office" rather than drawing attention to
    # itself. Off by default, so existing agents don't change behavior
    # until an operator turns it on.
    # Phone calls were excluded here for a real reason: BackgroundAudioPlayer
    # publishes ambience as a *second* room track, and the SIP bridge used to
    # subscribe to it right after roomio_audio, relaying the very quiet
    # ambience instead of the agent's voice - a connected but apparently
    # muted PSTN call.
    #
    # Re-tested on a live inbound call 2026-09-03 against livekit-agents
    # 1.6.4: both tracks publish (roomio_audio + background_audio) and the
    # caller hears the agent with ambience underneath, so the bridge now
    # mixes subscribed tracks correctly. Exclusion removed rather than
    # writing a custom mixing AudioOutput, which would have put hand-rolled
    # code in the live audio path for a cosmetic feature.
    #
    # If muted-PSTN reports ever come back, this is the first thing to
    # suspect - re-add `and call_context["call_type"] != "phone"`.
    if cfg.get("ambient_noise") == "on":
        try:
            background_audio = BackgroundAudioPlayer(
                # volume here is a raw gain multiplier, NOT the 0.0-1.0 range
                # AudioConfig's docstring implies: it is applied as
                # `samples *= volume` and then clipped. Values above 1.0 are
                # both legal and necessary here, because the bundled clip is
                # itself very quiet - measured by decoding it: peak amplitude
                # 435 of int16's 32767, RMS 55, i.e. -55.5 dBFS at volume=1.0.
                # So 0.05 (-81 dBFS) and 0.3 (-66 dBFS) were both inaudible on
                # real calls. 3.0 lands near -46 dBFS: present under the voice
                # without competing with it. Clipping only starts around 75x,
                # so there is plenty of headroom to raise this further.
                ambient_sound=AudioConfig(
                    BuiltinAudioClip.OFFICE_AMBIENCE, volume=3.0, fade_in=1.5
                )
            )
            await background_audio.start(room=ctx.room, agent_session=session)
            background_audio_holder["player"] = background_audio
        except Exception:
            logger.exception("failed to start background audio for room %s", ctx.room.name)


def _prewarm(proc: JobProcess) -> None:
    """Runs once per idle subprocess, before any job/call is assigned to it —
    LiveKit's own mechanism for paying an expensive one-time cost in the
    background instead of during a real caller's wait. num_idle_processes
    below already keeps warm Python subprocesses ready, but that alone only
    covers interpreter/import cost — it does nothing to warm a provider
    client's own connection.

    Confirmed live 2026-08-19 (platform-demo, real calls, real
    [latency]-tagged logs): the greeting's TTS call — Gemini 3.1 Flash,
    the FIRST TTS call a fresh process ever makes — took ~10.5s across
    every call checked (session.start() returned at ~5-6s, greeting say()
    didn't return until ~16-19s). Compare that to the ~1s average
    ttsTtfbMs already measured for a mid-conversation turn in an
    already-warm process (see calls.latency_metrics_json). The gap is
    Google Cloud TTS client/credential/gRPC connection setup, not
    synthesis itself being slow — a cost every idle process was paying
    for the first time exactly when a real caller was waiting on it.

    Uses the identical PatchedGeminiTTS streaming path the real greeting
    call uses (not a different, cheaper Google API), so this pays down
    the actual cost the greeting would otherwise pay, not a different one.
    Best-effort: any failure here just means the first real call pays the
    cost it always used to — never worth failing worker startup over.
    """
    # Agent config + knowledge base, from this process's own empty caches.
    # Measured on a real inbound call (2026-08-21): 2.86s for the config and
    # 1.51s for the KB, both paid after the caller was already in the room and
    # while LiveKit held the SIP leg at 180 Ringing — i.e. ~4.4s of the answer
    # delay the SIP provider complained about was two database round-trips.
    # The caches are per-process, so their TTLs never helped a process's first
    # call; doing the lookups here moves that cost to an idle process instead.
    # Started on a background thread, NOT awaited: LiveKit kills a subprocess
    # whose prewarm overruns its init window, and doing these lookups inline
    # timed out every process and took inbound calls down (2026-08-21, rolled
    # back). This returns immediately; the cache fills a moment later, and a
    # call arriving first just does the lookups itself as it always did.
    try:
        db.start_cache_prewarm()
        logger.info("prewarm: cache warm started in background (pid=%s)", proc.pid)
    except Exception:
        logger.exception("prewarm: could not start cache warm — calls pay the lookups instead")

    if not _GOOGLE_CREDENTIALS:
        return
    # Must not block, same reasoning and same fix shape as start_cache_prewarm
    # above. A first version of this (2026-09-01) called asyncio.run() on the
    # warm-up directly here, inline — synthesizing several real opener lines
    # instead of one throwaway word pushed every process past LiveKit's init
    # window and took the demo agent down (0 processes ever finished
    # initializing, confirmed via `error initializing process` / TimeoutError
    # in every process's logs). A background thread with its own event loop
    # returns in microseconds regardless of how long the warm-up itself
    # takes; a call landing before it finishes just synthesizes its greeting
    # normally, exactly as before this existed.
    threading.Thread(
        target=_run_google_tts_prewarm, name="tts-prewarm", args=(proc.pid,), daemon=True
    ).start()
    logger.info("prewarm: Google TTS warm-up started in background (pid=%s)", proc.pid)


# Confirmed live (2026-09-01): with num_idle_processes=4, a fresh deploy
# spins all 4 idle processes up together, and each independently started its
# opener warm-up at the same instant — enough concurrent Gemini TTS requests
# to hit Google's own rate limit (429 RESOURCE_EXHAUSTED) on most of them.
# The openers themselves now load from disk (see _load_cached_greetings,
# no API call, no rate limit possible), but this stagger is kept for the
# one remaining live call below (warming the gRPC/credential connection) —
# even a single request per process can still collide if all 4 fire at once.
_TTS_PREWARM_STAGGER_MAX_S = 20.0


async def _warm_google_tts_client() -> None:
    """Pays the Google Cloud TTS client/credential/gRPC connection setup
    cost (measured ~10.5s on a fresh process) via one throwaway synthesis,
    so a real call's first live Google TTS request — a greeting-cache miss,
    or any mid-call turn — doesn't pay that setup cost itself."""
    tts = PatchedGeminiTTS(
        language="hi-IN", voice_name="Kore", model_name=_GOOGLE_31_MODEL, credentials_info=_GOOGLE_CREDENTIALS
    )
    await _synthesize_frames(tts, "ठीक है")


def _run_google_tts_prewarm(pid: int) -> None:
    _load_cached_greetings()
    time.sleep(random.uniform(0, _TTS_PREWARM_STAGGER_MAX_S))
    try:
        asyncio.run(_warm_google_tts_client())
        logger.info("prewarm: Google TTS client warmed (pid=%s)", pid)
    except Exception:
        logger.exception("prewarm: Google TTS warm-up failed — first real call pays the cost instead")


# Pre-synthesized opening lines, keyed by (voice_value, language, gender) ->
# [(text, [audio frames])].
#
# The platform demo's openers are a FIXED, finite set of strings (see
# _PLATFORM_DEMO_OPENERS above) — the same handful of lines, synthesized
# from scratch on every single call. Measured on real widget calls: the
# agent joins the room ~0.75s after the visitor clicks, then the first word
# doesn't land for another ~5.4s, essentially all of it TTS for one of these
# known lines. Synthesizing them once per process during prewarm and
# replaying the frames turns that into playback of audio that already
# exists.
#
# Only ever used on an EXACT (voice, language, gender, text) match, so an
# agent on a different voice can never be handed another voice's audio —
# it just misses the cache and synthesizes normally, exactly as before.
_GREETING_AUDIO_CACHE: dict[tuple[str, str, str], list[tuple[str, list[rtc.AudioFrame]]]] = {}

# How many of the openers to pre-render per (voice, language, gender). The
# random pick that keeps repeat visitors from hearing the same line every
# time still works, just across the cached subset — synthesizing all ~11
# would cost proportionally more prewarm time and per-process memory for a
# variety nobody notices inside one visit.
_GREETING_CACHE_PER_SET = 3


async def _replay_frames(frames: list[rtc.AudioFrame]):
    """A fresh async iterator over already-synthesized frames — session.say()
    consumes its `audio` argument, so each call needs its own iterator over
    the same underlying (immutable, reusable) frame list."""
    for frame in frames:
        yield frame


def cached_greeting(voice_value: str, language: str, gender: str) -> tuple[str, list[rtc.AudioFrame]] | None:
    """A random pre-rendered opener for this exact voice/language/gender, or
    None when nothing was cached for it (any non-demo agent, an unwarmed
    process, or a prewarm that failed or hasn't finished yet) — callers fall
    back to normal TTS."""
    entries = _GREETING_AUDIO_CACHE.get((voice_value, language, gender))
    if not entries:
        return None
    return random.choice(entries)


async def _synthesize_frames(tts, text: str) -> list[rtc.AudioFrame]:
    stream = tts.stream()
    stream.push_text(text)
    stream.end_input()
    frames: list[rtc.AudioFrame] = []
    try:
        async for event in stream:
            frames.append(event.frame)
    finally:
        await stream.aclose()
    return frames


_GREETING_CACHE_DIR = Path(__file__).resolve().parent / "greeting_cache"


def _load_cached_greetings() -> None:
    """Loads the platform demo's opener clips from disk into
    _GREETING_AUDIO_CACHE, rendered once offline by scripts/render_greetings.py.

    This used to synthesize these same lines live, via Google TTS, on every
    idle process at every deploy — with num_idle_processes=4, that's several
    processes independently firing the same handful of TTS requests at once,
    which reliably hit Google's per-minute rate limit (429 RESOURCE_EXHAUSTED)
    and left most processes with 0-1 of the intended clips cached. Loading
    pre-rendered WAV files from disk has no such ceiling and is effectively
    instant, so there's no need to stagger or thread this off any more.
    """
    manifest_path = _GREETING_CACHE_DIR / "manifest.json"
    if not manifest_path.exists():
        logger.warning("prewarm: no greeting_cache/manifest.json — run scripts/render_greetings.py")
        return
    manifest = json.loads(manifest_path.read_text())
    for entry in manifest:
        wav_path = _GREETING_CACHE_DIR / entry["file"]
        try:
            with wave.open(str(wav_path), "rb") as wf:
                num_channels = wf.getnchannels()
                sample_rate = wf.getframerate()
                data = wf.readframes(wf.getnframes())
            samples_per_channel = len(data) // (2 * num_channels)
            frame = rtc.AudioFrame(
                data=data, sample_rate=sample_rate, num_channels=num_channels, samples_per_channel=samples_per_channel
            )
        except Exception:
            logger.exception("prewarm: could not load cached greeting %s", wav_path)
            continue
        key = (entry["voice"], entry["language"], entry["gender"])
        _GREETING_AUDIO_CACHE.setdefault(key, []).append((entry["text"], [frame]))
    logger.info(
        "prewarm: loaded %s greeting clip(s) from disk",
        sum(len(v) for v in _GREETING_AUDIO_CACHE.values()),
    )


if __name__ == "__main__":
    # num_idle_processes = how many warm subprocesses sit ready before a job
    # ever arrives — a call landing when every idle slot is already claimed
    # gets a fully cold subprocess: Python interpreter start + importing
    # livekit-agents plus the openai/google/elevenlabs/sarvam plugin stack,
    # a real multi-second cost on top of the greeting latency fixed above.
    # Raised from 2 to 4 after moving to LiveKit Cloud's Ship plan (confirmed
    # via the project dashboard: no fixed per-replica CPU/memory cap anymore,
    # fully-managed autoscaling, average load sitting at ~2% with real
    # headroom) — still livekit-agents' own default, not a stretch. Watch
    # `lk agent status`/the dashboard's join-latency and load graphs after
    # deploy and raise further if load stays comfortable under real
    # concurrent-call volume.
    # Empty (the default) means implicit/automatic dispatch — this worker
    # picks up any room nobody explicitly named an agent for, exactly like
    # today. Set to a specific name (e.g. "platform-demo") to run this same
    # codebase as a SEPARATE, dedicated LiveKit Cloud Agent that only
    # receives rooms explicitly dispatched to it by name (see
    # server/token_api.py's _demo_dispatch_kwargs) — used to give the
    # marketing site's own demo traffic its own permanently-warm replica,
    # isolated from autoscaling driven by tenant call volume.
    agent_name = os.environ.get("LIVEKIT_AGENT_NAME", "")
    cli.run_app(
        WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=_prewarm, num_idle_processes=4, agent_name=agent_name)
    )
