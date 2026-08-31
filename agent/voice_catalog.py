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
  - "google:<voice>"      → Google Cloud locale voice → tier "lite"     (0.75x credits)
  - "google31:<voice>"    → next-generation TTS preview → tier "standard" (1x credits)
  - bare Sarvam bulbul:v2 speaker (abhilash/anushka) → tier "lite"      (0.75x credits)
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
    "premium": {"label": "Premium", "note": "2x credits · most expressive, widest language range", "rank": 0},
    "standard": {"label": "Standard", "note": "1x credits", "rank": 1},
    "lite": {"label": "Lite", "note": "0.75x credits · economy", "rank": 2},
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
    {"value": "elevenlabs:zT03pEAEi0VHKciJODfn", "name": "Raju", "gender": "male", "tier": "premium"},
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
    {"value": "elevenlabs:7qBNUtXRGP0jPi0H4r8k", "name": "Bunty Conversational", "gender": "male", "tier": "premium"},
    {"value": "elevenlabs:1qEiC6qsybMkmnNdVMbK", "name": "Monika", "gender": "female", "tier": "premium"},
    {"value": "elevenlabs:9lx2GDtpvyyNBM7O9Mmx", "name": "Saavi", "gender": "female", "tier": "premium"},
    {"value": "elevenlabs:mActWQg9kibLro6Z2ouY", "name": "Riya", "gender": "female", "tier": "premium"},
    {"value": "elevenlabs:OtEfb2LVzIE45wdYe54M", "name": "Zara", "gender": "female", "tier": "premium"},
    {"value": "elevenlabs:6MoEUz34rbRrmmyxgRm4", "name": "Manav", "gender": "male", "tier": "premium"},
    {"value": "elevenlabs:RDWdsTU6N02BFftbIEAp", "name": "Tara", "gender": "female", "tier": "premium"},
    {"value": "elevenlabs:7b9mYhmnp0y2qSH1FnBL", "name": "Bunty", "gender": "male", "tier": "premium"},
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
    {"value": "ishita", "name": "Ishita", "gender": "female", "tier": "standard"},
    # Gemini TTS personas keep the same voice identity while the reply
    # language changes during a call. They use Cloud Text-to-Speech directly,
    # so the existing service-account credential is sufficient.
    {"value": "google:kore", "name": "Mira", "gender": "female", "tier": "premium", "multilingual": True, "note": "One voice, every language · switches mid-call"},
    {"value": "google:charon", "name": "Arin", "gender": "male", "tier": "premium", "multilingual": True, "note": "One voice, every language · switches mid-call"},
    # Explicit opt-in test voices for the newer preview model. Keep a distinct
    # value prefix so existing Mira/Arin agents remain on the stable 2.5 model.
    {"value": "google31:kore", "name": "Mira Next (Preview)", "gender": "female", "tier": "standard", "multilingual": True, "preview": True, "note": "Next-generation multilingual preview · testing only"},
    {"value": "google31:charon", "name": "Arin Next (Preview)", "gender": "male", "tier": "standard", "multilingual": True, "preview": True, "note": "Next-generation multilingual preview · testing only"},
    # Google Cloud Standard — locale-specific economy alternatives.
    {"value": "google:en-IN-Standard-D", "name": "Aarav (English)", "gender": "female", "tier": "lite", "force_lang": "en"},
    {"value": "google:en-IN-Standard-B", "name": "Kabir (English)", "gender": "male", "tier": "lite", "force_lang": "en"},
    {"value": "google:hi-IN-Standard-A", "name": "Aditi (Hindi)", "gender": "female", "tier": "lite", "force_lang": "hi"},
    {"value": "google:hi-IN-Standard-B", "name": "Vihaan (Hindi)", "gender": "male", "tier": "lite", "force_lang": "hi"},
    {"value": "google:mr-IN-Standard-A", "name": "Isha (Marathi)", "gender": "female", "tier": "lite", "force_lang": "mr"},
    {"value": "google:mr-IN-Standard-B", "name": "Om (Marathi)", "gender": "male", "tier": "lite", "force_lang": "mr"},
    {"value": "google:ta-IN-Standard-A", "name": "Nila (Tamil)", "gender": "female", "tier": "lite", "force_lang": "ta"},
    {"value": "google:ta-IN-Standard-B", "name": "Arjun (Tamil)", "gender": "male", "tier": "lite", "force_lang": "ta"},
    {"value": "google:te-IN-Standard-A", "name": "Ananya (Telugu)", "gender": "female", "tier": "lite", "force_lang": "te"},
    {"value": "google:te-IN-Standard-B", "name": "Karthik (Telugu)", "gender": "male", "tier": "lite", "force_lang": "te"},
    {"value": "google:kn-IN-Standard-A", "name": "Nandini (Kannada)", "gender": "female", "tier": "lite", "force_lang": "kn"},
    {"value": "google:kn-IN-Standard-B", "name": "Vikram (Kannada)", "gender": "male", "tier": "lite", "force_lang": "kn"},
    {"value": "google:ml-IN-Standard-A", "name": "Diya (Malayalam)", "gender": "female", "tier": "lite", "force_lang": "ml"},
    {"value": "google:ml-IN-Standard-B", "name": "Nikhil (Malayalam)", "gender": "male", "tier": "lite", "force_lang": "ml"},
    {"value": "google:gu-IN-Standard-A", "name": "Hetal (Gujarati)", "gender": "female", "tier": "lite", "force_lang": "gu"},
    {"value": "google:gu-IN-Standard-B", "name": "Harsh (Gujarati)", "gender": "male", "tier": "lite", "force_lang": "gu"},
    {"value": "google:bn-IN-Standard-A", "name": "Mrittika (Bengali)", "gender": "female", "tier": "lite", "force_lang": "bn"},
    {"value": "google:bn-IN-Standard-B", "name": "Arindam (Bengali)", "gender": "male", "tier": "lite", "force_lang": "bn"},
    {"value": "google:pa-IN-Standard-A", "name": "Gurleen (Punjabi)", "gender": "female", "tier": "lite", "force_lang": "pa"},
    {"value": "google:pa-IN-Standard-B", "name": "Armaan (Punjabi)", "gender": "male", "tier": "lite", "force_lang": "pa"},
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
# A language's sample is either one genderless string (English) OR a
# {"male", "female"} pair for languages that inflect first-person verbs by the
# speaker's gender (Hindi: "देता हूँ" vs "देती हूँ"). Playing the masculine line
# for a female voice like Monika is grammatically wrong — sample_text() below
# picks the right variant from the voice's catalog gender. Bump
# SAMPLE_TEXT_VERSION (regenerates cached audio) whenever any line changes.
SAMPLE_TEXT_VERSION = 3
SAMPLE_TEXTS: dict[str, str | dict[str, str]] = {
    "mr": "नमस्कार! Vistrow Voice मध्ये आपले स्वागत आहे. हा आमच्या मराठी एआय आवाजाचा नमुना आहे.",
    "ta": "வணக்கம்! Vistrow Voice-க்கு வரவேற்கிறோம். இது எங்கள் தமிழ் செயற்கை நுண்ணறிவு குரலின் மாதிரி.",
    "te": "నమస్కారం! Vistrow Voice‌కు స్వాగతం. ఇది మా తెలుగు ఏఐ వాయిస్ నమూనా.",
    "kn": "ನಮಸ್ಕಾರ! Vistrow Voice‌ಗೆ ಸ್ವಾಗತ. ಇದು ನಮ್ಮ ಕನ್ನಡ ಎಐ ಧ್ವನಿಯ ಮಾದರಿ.",
    "ml": "നമസ്കാരം! Vistrow Voice-ലേക്ക് സ്വാഗതം. ഇത് ഞങ്ങളുടെ മലയാളം എഐ ശബ്ദത്തിന്റെ മാതൃകയാണ്.",
    "gu": "નમસ્તે! Vistrow Voiceમાં આપનું સ્વાગત છે. આ અમારા ગુજરાતી એઆઈ અવાજનો નમૂનો છે.",
    "bn": "নমস্কার! Vistrow Voice-এ স্বাগতম। এটি আমাদের বাংলা এআই কণ্ঠের নমুনা।",
    "pa": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! Vistrow Voice ਵਿੱਚ ਤੁਹਾਡਾ ਸੁਆਗਤ ਹੈ। ਇਹ ਸਾਡੀ ਪੰਜਾਬੀ ਏਆਈ ਆਵਾਜ਼ ਦਾ ਨਮੂਨਾ ਹੈ।",
    "en": (
        "Hi! I'm a Vistrow Voice AI agent. I can answer your calls, qualify "
        "leads, and book appointments — all in your customer's own language."
    ),
    "hi": {
        "male": (
            "नमस्ते! मैं Vistrow Voice का एआई एजेंट हूँ। मैं आपकी कॉल्स का जवाब देता हूँ, "
            "लीड्स क्वालिफाई करता हूँ और अपॉइंटमेंट बुक करता हूँ — वो भी आपके ग्राहक की अपनी भाषा में।"
        ),
        "female": (
            "नमस्ते! मैं Vistrow Voice का एआई एजेंट हूँ। मैं आपकी कॉल्स का जवाब देती हूँ, "
            "लीड्स क्वालिफाई करती हूँ और अपॉइंटमेंट बुक करती हूँ — वो भी आपके ग्राहक की अपनी भाषा में।"
        ),
    },
}
DEFAULT_SAMPLE_LANG = "hi"


def sample_text(lang: str, gender: str | None = None) -> str | None:
    """Audition line for a language, in the speaker's grammatical gender when
    that language marks it. `gender` is the voice's catalog gender
    ("male"/"female"/None); a genderless language ignores it, and an unknown
    gender falls back to the masculine form."""
    entry = SAMPLE_TEXTS.get(lang)
    if isinstance(entry, dict):
        return entry.get(gender) or entry.get("male")
    return entry


# Voices withheld from the pickers entirely. Unlike "preview" (which shows a
# voice in its own testing section and gates selection to the platform
# owner), a hidden voice is not listed to anyone. get_voice()/tier_of()
# deliberately still resolve it, so an agent or saved menu row that already
# points at one keeps working - correct gender for the prompt's gendered
# verb forms, correct credit tier for billing - rather than silently
# degrading. Nothing is deleted; clearing this tuple restores them.
# Only the v3 prefix stays hidden: its realtime streaming endpoint 403s in
# production (see agent/main.py's _build_tts), so those voices cannot be
# sold. The Flash v2.5 voices under "elevenlabs:" work and are back in the
# picker — ElevenLabs is the vendor behind Razorpay's own Hinglish outbound
# agent, which makes them a credibility argument as much as a quality one.
_HIDDEN_VOICE_PREFIXES = ("elevenlabs-v3:",)


# Which languages a voice can actually SPEAK, and whether it can switch
# between them mid-call. This is the decision an operator is really making
# and the catalog never expressed it: a "lite" locale voice looks like the
# cheap option next to Sarvam, but hi-IN-Standard-A speaks Hindi and only
# Hindi - put it on a caller who slips into English and it cannot follow,
# which is the one thing this product is sold on. Surfacing it stops that
# being discovered on a live call.
LANGUAGE_LABELS = {
    "hi-IN": "Hindi", "en-IN": "English", "mr-IN": "Marathi", "ta-IN": "Tamil",
    "te-IN": "Telugu", "kn-IN": "Kannada", "ml-IN": "Malayalam",
    "gu-IN": "Gujarati", "bn-IN": "Bengali", "pa-IN": "Punjabi", "od-IN": "Odia",
}
# Sarvam bulbul (v2 and v3) accept exactly these - matches the plugin's own
# SarvamTTSLanguages literal. Spelled out rather than derived from
# LANGUAGE_LABELS: that dict now also has to carry labels for Gemini's
# non-Indian locales, and deriving from it would have silently told Sarvam it
# speaks German.
_SARVAM_LANGUAGES = (
    "hi-IN", "en-IN", "mr-IN", "ta-IN", "te-IN", "kn-IN",
    "ml-IN", "gu-IN", "bn-IN", "pa-IN", "od-IN",
)

# Gemini-TTS speaks a much wider set than Sarvam - these voices were
# previously reported as speaking exactly the 11 Sarvam languages, which hid
# French/German/Japanese/Spanish and ~60 others. Gemini covers every language
# Sarvam does, so this is a superset for the Indian market, not a trade-off.
#
# Note Odia: Sarvam calls it "od-IN", Google calls it "or-IN" (or/ory is the
# ISO 639 code; od-IN is Sarvam-specific). Same language, different spelling -
# do not read one vendor's list against the other's codes.
#
# Sources: cloud.google.com/text-to-speech/docs/gemini-tts (95 locales for
# gemini-2.5-flash-tts, which is what _GOOGLE_25_MODEL uses) and
# ai.google.dev/gemini-api/docs/speech-generation (92 languages for the
# preview models). The two pages count locale variants differently; both are
# far past the 11 we used to claim.
GOOGLE_TTS_GA_LANGUAGES = {
    "ar-EG": "Arabic (Egypt)", "bn-BD": "Bangla", "nl-NL": "Dutch",
    "en-IN": "English (India)", "en-US": "English (US)", "fr-FR": "French",
    "de-DE": "German", "hi-IN": "Hindi", "id-ID": "Indonesian",
    "it-IT": "Italian", "ja-JP": "Japanese", "ko-KR": "Korean",
    "mr-IN": "Marathi", "pl-PL": "Polish", "pt-BR": "Portuguese (Brazil)",
    "ro-RO": "Romanian", "ru-RU": "Russian", "es-ES": "Spanish",
    "ta-IN": "Tamil", "te-IN": "Telugu", "th-TH": "Thai", "tr-TR": "Turkish",
    "uk-UA": "Ukrainian", "vi-VN": "Vietnamese",
}
GOOGLE_TTS_PREVIEW_LANGUAGES = {
    "af-ZA": "Afrikaans", "sq-AL": "Albanian", "am-ET": "Amharic",
    "ar-001": "Arabic (World)", "hy-AM": "Armenian", "az-AZ": "Azerbaijani",
    "eu-ES": "Basque", "be-BY": "Belarusian", "bg-BG": "Bulgarian",
    "my-MM": "Burmese", "ca-ES": "Catalan", "ceb-PH": "Cebuano",
    "cmn-CN": "Chinese (Mandarin)", "cmn-tw": "Chinese (Taiwan)",
    "hr-HR": "Croatian", "cs-CZ": "Czech", "da-DK": "Danish",
    "en-AU": "English (Australia)", "en-GB": "English (UK)",
    "et-EE": "Estonian", "fil-PH": "Filipino", "fi-FI": "Finnish",
    "fr-CA": "French (Canada)", "gl-ES": "Galician", "ka-GE": "Georgian",
    "el-GR": "Greek", "gu-IN": "Gujarati", "ht-HT": "Haitian Creole",
    "he-IL": "Hebrew", "hu-HU": "Hungarian", "is-IS": "Icelandic",
    "jv-JV": "Javanese", "kn-IN": "Kannada", "kok-IN": "Konkani",
    "lo-LA": "Lao", "la-VA": "Latin", "lv-LV": "Latvian",
    "lt-LT": "Lithuanian", "lb-LU": "Luxembourgish", "mk-MK": "Macedonian",
    "mai-IN": "Maithili", "mg-MG": "Malagasy", "ms-MY": "Malay",
    "ml-IN": "Malayalam", "mn-MN": "Mongolian", "ne-NP": "Nepali",
    "nb-NO": "Norwegian (Bokmal)", "nn-NO": "Norwegian (Nynorsk)",
    "or-IN": "Odia", "ps-AF": "Pashto", "fa-IR": "Persian",
    "pt-PT": "Portuguese (Portugal)", "pa-IN": "Punjabi", "sr-RS": "Serbian",
    "sd-IN": "Sindhi", "si-LK": "Sinhala", "sk-SK": "Slovak",
    "sl-SI": "Slovenian", "es-419": "Spanish (Latin America)",
    "es-MX": "Spanish (Mexico)", "sw-KE": "Swahili", "sv-SE": "Swedish",
    "ur-PK": "Urdu",
}
GOOGLE_TTS_LANGUAGES = {**GOOGLE_TTS_GA_LANGUAGES, **GOOGLE_TTS_PREVIEW_LANGUAGES}

# Sarvam spells Odia "od-IN"; Google spells it "or-IN". Same language. Any
# code heading for a Google voice goes through here first, otherwise an Odia
# caller on a Gemini voice would be sent a locale Google does not recognise.
# bn-IN is the second entry for the same reason: Google's table names Bengali
# only as bn-BD (Bangladesh). Same language, different regional accent, and a
# documented locale is safer to send than one Google never lists. FLAGGED: the
# accent difference on Indian-Bengali calls has not been checked on a real
# call yet.
SARVAM_TO_GOOGLE_CODE = {"od-IN": "or-IN", "bn-IN": "bn-BD"}


def to_google_code(code: str) -> str:
    """A reply-language code in the spelling Gemini-TTS expects."""
    return SARVAM_TO_GOOGLE_CODE.get(code, code)


# Derived, never hand-maintained: the badge can then only ever claim what the
# table above actually names. Google's own pages quote 92, 95 and 99 on
# different URLs (they count locale variants differently and the summary lines
# disagree with their own tables), so the enumerated count is the honest one.
GOOGLE_TTS_TOTAL_LOCALES = len(GOOGLE_TTS_LANGUAGES)

# Labels for anything either engine can speak, so public_entry can name a
# locale regardless of which engine produced it.
_ALL_LANGUAGE_LABELS = {**LANGUAGE_LABELS, **GOOGLE_TTS_LANGUAGES}

_GOOGLE_PREFIXES = ("google:", "google31:")


def languages_for(entry: dict) -> tuple[list[str], bool]:
    """(language codes this voice speaks, can_switch_mid_call).

    A Google locale voice encodes its one language in the value itself
    ("google:hi-IN-Standard-A"); everything multilingual is a single voice
    that carries across all of them. Which set "all of them" means depends on
    the engine - Gemini and Sarvam do not overlap cleanly.
    """
    value = entry.get("value", "")
    if value.startswith(_GOOGLE_PREFIXES):
        part = value.split(":", 1)[1]
        code = "-".join(part.split("-")[:2])
        # A locale-specific Google voice (google:hi-IN-Standard-A).
        if code in LANGUAGE_LABELS and not entry.get("multilingual"):
            return [code], False
        # Gemini persona (kore/charon) - one voice across Gemini's own list.
        return list(GOOGLE_TTS_LANGUAGES.keys()), True
    # Sarvam: bare speaker name, or anything else flagged multilingual.
    return list(_SARVAM_LANGUAGES), True


def is_hidden(value: str) -> bool:
    """Whether this voice should be withheld from voice pickers."""
    return bool(value) and value.startswith(_HIDDEN_VOICE_PREFIXES)


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
    _langs, _can_switch = languages_for(entry)
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
        "multilingual": bool(entry.get("multilingual")),
        "preview": bool(entry.get("preview")),
        # See languages_for(): what this voice can speak, and whether it can
        # follow a caller who switches language mid-sentence.
        "languages": _langs,
        # Gemini's docs claim 95 locales but only name a subset explicitly, so
        # _langs holds the named ones while this reports the real total. The
        # badge should not undersell the voice by counting only what we could
        # enumerate without guessing.
        "languageCount": (
            GOOGLE_TTS_TOTAL_LOCALES
            if _can_switch and entry.get("value", "").startswith(_GOOGLE_PREFIXES)
            else len(_langs)
        ),
        "languageLabels": [_ALL_LANGUAGE_LABELS[c] for c in _langs if c in _ALL_LANGUAGE_LABELS],
        "canSwitchLanguage": _can_switch,
    }
