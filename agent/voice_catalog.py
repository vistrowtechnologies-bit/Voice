"""Single source of truth for the platform's available voices.

DUPLICATED FILE — agent/voice_catalog.py and server/voice_catalog.py must
stay byte-identical. They are two copies rather than one import because the
agent's Docker image does not ship the server package (and vice versa), so
neither can import the other. Nothing enforces this: on 2026-09-04 only the
agent copy was edited, and the result was that new voices worked on live
calls while the dashboard's Voices page still listed six voices that had
been deleted and none of the twenty that had been added. Change one, copy it
to the other, in the same commit:

    cp agent/voice_catalog.py server/voice_catalog.py

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
  - "google:<voice>"      → Google Cloud locale voice → tier "lite"     (0.5x credits)
  - "google31:<voice>"    → next-generation TTS preview → tier "standard" (1x credits)
  - "google38:<voice>"    → Gemini 3.8 Flash-Lite TTS    → tier "premium"  (2x credits)
  - "google38flash:<voice>" → Gemini 3.8 Flash TTS       → tier "premium"  (2x credits)
  - bare Sarvam bulbul:v2 speaker (abhilash/anushka) → tier "lite"      (0.5x credits)
  - "sarvam4:<id>"        → Sarvam bulbul:v4-flash  → tier "standard"     (1x credits; ~Rs0.37/min, owner decision 2026-10-13)
  - any other bare name (Sarvam, spoken by bulbul:v4-flash via SARVAM_V3_TO_V4) → tier "standard" (1x credits)

Adding a new voice here makes it appear in the catalog automatically; no
frontend deploy or billing change is needed (voice_tier keys off the prefix,
not the specific id). Vendor names (ElevenLabs, Sarvam) are deliberately not
exposed to operators — they see a Vistrow tier, same convention as the model
picker.
"""

from __future__ import annotations

# Display order + credit signalling per tier. tier -> (label, credits_note).
TIER_META: dict[str, dict] = {
    # "Premium" spans more than one provider family. Product-specific UI
    # labels Google Gemini personas as the most expressive; do not attach
    # that claim to every Premium voice (including ElevenLabs) here.
    "premium": {"label": "Premium", "note": "2x credits · advanced natural voices", "rank": 0},
    "standard": {"label": "Standard", "note": "1x credits", "rank": 1},
    "lite": {"label": "Lite", "note": "1x credits · economy", "rank": 2},  # 1x since minute pricing, 2026-10-17
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
    {"value": "google:kore", "preview": True, "name": "Mira Expressive", "gender": "female", "tier": "premium", "multilingual": True, "note": "Expressive · follows caller emotion · about 0.7 s slower than HD"},
    {"value": "google:charon", "preview": True, "name": "Arin Expressive", "gender": "male", "tier": "premium", "multilingual": True, "note": "Expressive · follows caller emotion · about 0.7 s slower than HD"},
    # Explicit opt-in test voices for the newer preview model. Keep a distinct
    # value prefix so existing Mira/Arin agents remain on the stable 2.5 model.
    {"value": "google31:kore", "name": "Mira Next (Preview)", "gender": "female", "tier": "standard", "multilingual": True, "preview": True, "note": "Prompt emotion + modulation · testing only"},
    {"value": "google31:charon", "name": "Arin Next (Preview)", "gender": "male", "tier": "standard", "multilingual": True, "preview": True, "note": "Prompt emotion + modulation · testing only"},
    # Google Cloud Standard — locale-specific economy alternatives.
    {"value": "google:en-IN-Standard-D", "name": "Anika (English)", "gender": "female", "tier": "lite", "force_lang": "en"},
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
    # --- Google Chirp 3 HD ---------------------------------------------------
    # The only Google family the streaming endpoint accepts, which makes these
    # the fastest Google voices available: ~360ms to first audio against
    # 483ms for the Standard voices below (which must go through
    # StreamAdapter/synthesize) and ~1036ms for the Gemini personas.
    #
    # No Chirp 3 voice ID carries more than one language code — checked
    # against Google's own list_voices, 0 of them do. But all 30 personas
    # exist in all 52 CHIRP3_LANGUAGES locales, so a persona survives a language switch
    # by swapping the locale prefix and keeping the name:
    # hi-IN-Chirp3-HD-Aoede -> mr-IN-Chirp3-HD-Aoede. That is what the
    # "google:chirp3:<Persona>" value means, and _build_tts resolves it
    # against the call's current language. The older per-locale form
    # ("google:hi-IN-Chirp3-HD-Aoede") still works if anything holds one, it
    # is simply not offered in the menu.
    {"value": "google:chirp3:Aoede", "name": "Kiara HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Achernar", "name": "Myra HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Callirrhoe", "name": "Sana HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Achird", "name": "Advik HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Algenib", "name": "Rehan HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Alnilam", "name": "Vivaan HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Autonoe", "name": "Anika HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Despina", "name": "Devika HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Erinome", "name": "Esha HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Gacrux", "name": "Gauri HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Kore", "name": "Kirti HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Laomedeia", "name": "Lavanya HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Leda", "name": "Leela HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Pulcherrima", "name": "Pallavi HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Sulafat", "name": "Suhana HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Vindemiatrix", "name": "Vani HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Zephyr", "name": "Zoya HD", "gender": "female", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Algieba", "name": "Aryan HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Charon", "name": "Chirag HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Enceladus", "name": "Eshan HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Fenrir", "name": "Farhan HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Iapetus", "name": "Ishaan HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Orus", "name": "Omkar HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Puck", "name": "Pranav HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Rasalgethi", "name": "Rudra HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Sadachbia", "name": "Samar HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Sadaltager", "name": "Sahil HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Schedar", "name": "Shaurya HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Umbriel", "name": "Uday HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},
    {"value": "google:chirp3:Zubenelgenubi", "name": "Zubin HD", "gender": "male", "tier": "standard", "multilingual": True, "note": "One voice, 52 languages incl. 11 Indian · switches mid-call"},

    # --- Lite (Sarvam bulbul:v2) — REMOVED 2026-09-04 ------------------------
    # Sarvam retired the model: every request now returns
    # "400: Model 'bulbul:v2' has been deprecated. Please use 'bulbul:v3'".
    # Abhilash, Hitesh, Karun, Anushka, Arya and Manisha were six menu entries
    # that could not produce audio, and anushka/karun are not on the v3 roster
    # either, so they cannot simply be re-pointed. No agent was using one (the
    # only trace anywhere was a stale 'arya' row in one account's voice menu),
    # so removing them strands nobody. _build_tts drops any speaker that is
    # not on the live v3 roster to a gender-matched one rather than letting a
    # stale row raise at construction time and kill the call.
]

# --- Gemini 3.8 Flash-Lite TTS (testing) ------------------------------------
# Google's replacement for gemini-3.1-flash-tts-preview, released 2026-09-23.
# Every one of Google's 30 prebuilt Gemini voices, each multilingual like
# Mira/Arin. preview=True keeps them owner-only in their own picker section
# until they are proven on real calls. Billed "premium" (2x credits) because
# Google charges per audio token for this model, same family as the 2x
# Gemini 2.5 personas; the credit rate is in each name so it cannot be missed.
# (persona, gender, Google's own style descriptor)
GEMINI_PREBUILT_VOICES = (
    ("Zephyr", "female", "Bright"), ("Puck", "male", "Upbeat"),
    ("Charon", "male", "Informative"), ("Kore", "female", "Firm"),
    ("Fenrir", "male", "Excitable"), ("Leda", "female", "Youthful"),
    ("Orus", "male", "Firm"), ("Aoede", "female", "Breezy"),
    ("Callirrhoe", "female", "Easy-going"), ("Autonoe", "female", "Bright"),
    ("Enceladus", "male", "Breathy"), ("Iapetus", "male", "Clear"),
    ("Umbriel", "male", "Easy-going"), ("Algieba", "male", "Smooth"),
    ("Despina", "female", "Smooth"), ("Erinome", "female", "Clear"),
    ("Algenib", "male", "Gravelly"), ("Rasalgethi", "male", "Informative"),
    ("Laomedeia", "female", "Upbeat"), ("Achernar", "female", "Soft"),
    ("Alnilam", "male", "Firm"), ("Schedar", "male", "Even"),
    ("Gacrux", "female", "Mature"), ("Pulcherrima", "female", "Forward"),
    ("Achird", "male", "Friendly"), ("Zubenelgenubi", "male", "Casual"),
    ("Vindemiatrix", "female", "Gentle"), ("Sadachbia", "male", "Lively"),
    ("Sadaltager", "male", "Knowledgeable"), ("Sulafat", "female", "Warm"),
)
GEMINI_38_PREFIX = "google38:"
GEMINI_38_FLASH_PREFIX = "google38flash:"
# Customer-facing names never show the vendor (owner decision 2026-10-15):
# each Gemini persona is named after its HD voice (Achernar -> Myra), and the
# 3.8 Flash / Flash-Lite models are "Studio" / "Studio Lite".
_HD_NAMES = {
    e["value"].rsplit(":", 1)[-1].lower(): e["name"].removesuffix(" HD")
    for e in CATALOG if e["value"].startswith("google:chirp3:")
}
CATALOG += [
    {
        "value": f"{prefix}{persona.lower()}",
        "name": f"{_HD_NAMES.get(persona.lower(), persona)} {edition}",
        "gender": gender,
        "tier": "premium",
        "multilingual": True,
        "preview": True,
        "note": f"{style} · {edition} · test before live calls",
    }
    for prefix, edition in ((GEMINI_38_PREFIX, "Studio Lite"),
                            (GEMINI_38_FLASH_PREFIX, "Studio"))
    for persona, gender, style in GEMINI_PREBUILT_VOICES
]

# --- Expressive: Gemini 2.5 Flash TTS personas (Cloud TTS) ---------------
# The same 30 Gemini personas as Chirp 3 HD, on gemini-2.5-flash-tts through
# Cloud Text-to-Speech. Unlike Chirp they take a style prompt in its own field
# (never read aloud), which the worker rewrites every turn from the caller's
# detected emotion. Measured 2026-10-13 on real calls: first audio 0.78-1.15 s
# vs Chirp 3 HD 0.14-0.17 s (turn 1.40-1.49 s vs 0.68 s). Cloud TTS limits are
# per minute (1,000 requests), but Gemini voices also count against Vertex AI
# "global generate content requests per minute per base model", which is 5 for
# gemini-2.5-flash-tts on this project (verified 2026-10-13: the 9th request in
# a burst got 429). One call can use that, so they stay preview (owner-only)
# until the quota is raised. Price $10 per 1M audio tokens,
# 25 tokens/s: about $0.0082 per call minute at the measured 373 agent
# characters/min and 12.1 characters/s - below Chirp 3 HD's list price.
# Named after each persona's HD voice (_HD_NAMES above); Kore/Charon keep
# their Mira/Arin names.
CATALOG += [
    {
        "value": f"google:{persona.lower()}",
        "name": f"{_HD_NAMES.get(persona.lower(), persona)} Expressive",
        "gender": gender,
        "tier": "premium",
        "multilingual": True,
        "preview": True,
        "note": "Expressive · follows caller emotion · about 0.7 s slower than HD",
    }
    for persona, gender, _style in GEMINI_PREBUILT_VOICES
    if persona.lower() not in ("kore", "charon")
]
EXPRESSIVE_VOICES = frozenset(f"google:{p.lower()}" for p, _g, _s in GEMINI_PREBUILT_VOICES)


# --- Sarvam Bulbul v4 Flash (premium) ------------------------------------
# bulbul:v4-flash persona voices, "<name>_<language>_<style>". The list is the
# one the API itself accepts (2026-10-13: 224 ids, 3 docs ids rejected, 2
# Assamese ids need beta access - all excluded). aravind_ta_ads/_suspense are
# accepted by the API but rejected by livekit-plugins-sarvam 1.8.6's own list,
# which would fail the call at construction, so they are left out too. Sarvam publishes no genders;
# each speaker's gender is used only where Sarvam's v3 label, measured pitch
# and an audio classifier agree (67 of 79 names). The other 12 names (19 ids)
# are held until someone listens. A Hindi-tagged id was verified speaking
# Tamil, Bengali and English correctly, so these follow language switches.
SARVAM_V4_PREFIX = "sarvam4:"
SARVAM_V4_MODEL = "bulbul:v4-flash"
SARVAM_V4_VOICES = (
    ("aarti_hi_customer", "f"),
    ("aayan_hi_conversational", "m"),
    ("aditya_hi_conversational", "m"),
    ("aditya_hi_sales", "m"),
    ("amelia_en_conversational", "f"),
    ("amit_hi_conversational", "m"),
    ("anand_hi_documentary", "m"),
    ("anand_hi_news", "m"),
    ("anand_pa_conversation", "m"),
    ("anand_pa_customer", "m"),
    ("ashutosh_hi_conversational", "m"),
    ("ashwin_en_sports", "f"),
    ("ashwin_en_sports_energetic", "f"),
    ("bhavik_gu_conversation", "m"),
    ("bimal_bn_suspense", "m"),
    ("chaitra_hi_customer", "f"),
    ("chaitra_kn_conversation", "f"),
    ("chaitra_kn_narration", "f"),
    ("chhavi_hi_kids", "f"),
    ("girish_en_devotional", "m"),
    ("girish_en_documentary", "m"),
    ("girish_hi_devotional", "m"),
    ("gokul_ta_narration", "m"),
    ("harpreet_pa_narration", "m"),
    ("ishita_en_customer", "f"),
    ("ishita_en_medical", "f"),
    ("ishita_en_numbers", "f"),
    ("ishita_en_social", "f"),
    ("ishita_en_stories", "f"),
    ("ishita_enhi_companion", "f"),
    ("ishita_enhi_customer", "f"),
    ("ishita_enhi_customer_expressive", "f"),
    ("ishita_hi_ads", "f"),
    ("ishita_hi_ads_informal", "f"),
    ("ishita_hi_banking", "f"),
    ("ishita_hi_devotional", "f"),
    ("ishita_hi_edtech", "f"),
    ("ishita_hi_numbers", "f"),
    ("ishita_hi_social", "f"),
    ("ishita_mr_conversational", "f"),
    ("jaspal_pa_banking", "m"),
    ("kabir_hi_conversational", "m"),
    ("kavitha_te_conversation", "f"),
    ("kavitha_te_narration", "f"),
    ("kavya_hi_conversational", "f"),
    ("kunal_hi_kids", "m"),
    ("mahesh_hi_documentary", "m"),
    ("manan_hi_conversational", "m"),
    ("mani_hi_conversational", "m"),
    ("mani_hi_devotional", "m"),
    ("mohit_hi_conversational", "m"),
    ("mrunal_mr_narration", "f"),
    ("mukul_hi_ads", "m"),
    ("mukul_hi_suspense", "m"),
    ("mukul_mr_stories", "m"),
    ("nachiket_en_ads", "m"),
    ("nachiket_hi_devotional", "m"),
    ("neha_en_customer", "f"),
    ("neha_en_latenight", "f"),
    ("neha_mr_narration", "f"),
    ("nilesh_mr_conversation", "m"),
    ("nupur_en_kids", "f"),
    ("ojas_en_social", "m"),
    ("pooja_gu_conversational", "f"),
    ("pooja_gu_customer", "f"),
    ("pooja_te_conversation", "f"),
    ("priya_hi_recovery", "f"),
    ("rahul_hi_conversational", "m"),
    ("ratan_hi_customer_expressive", "m"),
    ("ratan_hi_devotional", "m"),
    ("ratan_hi_documentary", "m"),
    ("ratan_hi_latenight", "m"),
    ("ratan_hi_latenight_warm", "m"),
    ("ratan_hi_recovery", "m"),
    ("ratan_hi_social", "m"),
    ("ratan_hi_sports", "m"),
    ("rehan_hi_social", "m"),
    ("ritu_en_edtech", "f"),
    ("ritu_en_latenight", "f"),
    ("ritu_en_medical", "f"),
    ("ritu_en_reels", "f"),
    ("ritu_hi_ads_formal", "f"),
    ("ritu_hi_ads_informal", "f"),
    ("ritu_hi_banking", "f"),
    ("ritu_hi_conversation", "f"),
    ("ritu_hi_customer", "f"),
    ("ritu_hi_customer_utility", "f"),
    ("ritu_hi_customer_warm", "f"),
    ("ritu_hi_edtech", "f"),
    ("ritu_hi_edtech_bot", "f"),
    ("ritu_hi_insurance", "f"),
    ("ritu_hi_kids", "f"),
    ("ritu_hi_medical", "f"),
    ("ritu_hi_reels", "f"),
    ("ritu_hi_sales", "f"),
    ("ritu_hi_social", "f"),
    ("ritu_hi_social_lively", "f"),
    ("ritu_mr_insurance", "f"),
    ("ritu_mr_narration", "f"),
    ("rohan_en_recovery", "m"),
    ("roopa_bn_conversational", "f"),
    ("roopa_en_conversational", "f"),
    ("roopa_hi_companion", "f"),
    ("roopa_hi_conversational", "f"),
    ("roopa_hi_market", "f"),
    ("roopa_hi_narration", "f"),
    ("roopa_hi_recovery", "f"),
    ("rupali_mr_stories", "f"),
    ("rustom_en_suspense", "m"),
    ("sanchita_en_companion", "f"),
    ("sanchita_en_insurance", "f"),
    ("sanchita_en_market", "f"),
    ("sanchita_en_recovery", "f"),
    ("sanchita_en_social", "f"),
    ("sanchita_enhi_companion", "f"),
    ("sanchita_hi_ads_formal", "f"),
    ("sanchita_hi_ads_informal", "f"),
    ("sanchita_hi_assistant", "f"),
    ("sanchita_hi_banking", "f"),
    ("sanchita_hi_edtech", "f"),
    ("sanchita_hi_feedback", "f"),
    ("sanchita_hi_interview", "f"),
    ("sanchita_hi_kyc", "f"),
    ("sanchita_hi_market", "f"),
    ("sanchita_hi_romantic", "f"),
    ("sanchita_hi_social", "f"),
    ("sarang_en_narration", "m"),
    ("sarika_hi_conversation", "f"),
    ("shabana_en_edtech", "f"),
    ("shalini_en_companion", "f"),
    ("shalini_en_customer", "f"),
    ("shalini_enhi_companion", "f"),
    ("shalini_enhi_customer", "f"),
    ("shalini_hi_companion", "f"),
    ("shalini_hi_social", "f"),
    ("shilpa_hi_narration", "f"),
    ("shreya_hi_conversational", "f"),
    ("shreya_hi_news", "f"),
    ("shruti_hi_edtech", "f"),
    ("shubh_en_ads", "m"),
    ("shubh_en_audiobook", "m"),
    ("shubh_en_narration", "m"),
    ("shubh_en_narration_gentle", "m"),
    ("shubh_en_numbers", "m"),
    ("shubh_en_recovery", "m"),
    ("shubh_en_sports", "m"),
    ("shubh_enhi_ads", "m"),
    ("shubh_enhi_banking", "m"),
    ("shubh_enhi_companion", "m"),
    ("shubh_hi_ads", "m"),
    ("shubh_hi_customer", "m"),
    ("shubh_hi_devotional", "m"),
    ("shubh_hi_ecomm", "m"),
    ("shubh_hi_recovery", "m"),
    ("shubh_hi_stories_dramatic", "m"),
    ("shubh_hi_stories_mixed", "m"),
    ("simran_en_ads", "f"),
    ("simran_en_automobile", "f"),
    ("simran_en_conversation", "f"),
    ("simran_en_customer", "f"),
    ("simran_en_edtech", "f"),
    ("simran_en_edtech_bot", "f"),
    ("simran_en_narration", "f"),
    ("simran_en_recovery", "f"),
    ("simran_en_sales", "f"),
    ("simran_en_therapist", "f"),
    ("simran_enhi_banking_expressive", "f"),
    ("simran_enhi_companion", "f"),
    ("simran_enhi_customer", "f"),
    ("simran_hi_assistant", "f"),
    ("simran_hi_automobile", "f"),
    ("simran_hi_conversation", "f"),
    ("simran_hi_latenight", "f"),
    ("simran_hi_narration", "f"),
    ("simran_hi_news", "f"),
    ("simran_hi_news_breaking", "f"),
    ("simran_hi_recovery", "f"),
    ("simran_hi_sales", "f"),
    ("simran_hi_social_energetic", "f"),
    ("simran_hi_social_excited", "f"),
    ("soham_mr_narration", "m"),
    ("sophia_en_conversational", "f"),
    ("suchitra_hi_ecomm", "f"),
    ("suchitra_kn_narration", "f"),
    ("suhani_hi_social", "f"),
    ("suman_hi_companion", "f"),
    ("sumit_hi_conversational", "m"),
    ("sunny_en_social", "m"),
    ("sunny_enhi_customer", "m"),
    ("sunny_hi_ads", "m"),
    ("sunny_hi_reels", "m"),
    ("tanya_hi_narration", "f"),
    ("tarun_hi_conversational", "m"),
    ("tarun_hi_sales", "m"),
    ("tarun_te_narration", "m"),
    ("vandana_hi_ecomm", "f"),
    ("varun_en_ads", "m"),
    ("varun_en_suspense", "m"),
    ("vijay_ta_narration", "m"),
    ("vipul_hi_social", "m"),
    ("zarina_en_conversation", "f"),
)
# bulbul:v3 -> v4 (2026-10-13). v4 rejects v3 short names, so every stored v3
# speaker ("ritu", in agents and voice menus) is spoken by a v4 persona: the
# same name in a Hindi customer/conversation style where one exists. Checked
# by pitch against the v3 voice; aditya's v4 voice is ~45 Hz higher (likely a
# different speaker), priya/rohan exist only as "recovery" personas, pooja only
# with Gujarati/Telugu tags. Real calls: v4 first audio 170-189 ms vs v3
# 178-193 ms; Sarvam bills v4 about Rs 1.00 per 1K characters vs v3 Rs 3.00.
SARVAM_V3_TO_V4 = {
    "shubh": "shubh_hi_customer", "priya": "priya_hi_recovery", "aditya": "aditya_hi_conversational",
    "ritu": "ritu_hi_customer", "rohan": "rohan_en_recovery", "simran": "simran_hi_conversation",
    "kavya": "kavya_hi_conversational", "amit": "amit_hi_conversational", "pooja": "pooja_gu_customer",
    "ishita": "ishita_enhi_customer",
}
_SARVAM_V4_DEFAULT = {"male": "shubh_hi_customer", "female": "ritu_hi_customer"}


def sarvam_v4_speaker(value: str, gender: str | None = None) -> str:
    """bulbul:v4-flash persona id for any Sarvam voice value: a "sarvam4:" id
    as-is, a v3 short name through SARVAM_V3_TO_V4, anything else the
    gender-matched default (a retired v2 name would otherwise kill the call)."""
    if value.startswith(SARVAM_V4_PREFIX):
        return value[len(SARVAM_V4_PREFIX):]
    if value in SARVAM_V3_TO_V4:
        return SARVAM_V3_TO_V4[value]
    return _SARVAM_V4_DEFAULT["male" if gender == "male" else "female"]


_SARVAM_V4_LANG = {"hi": "Hindi", "en": "English", "enhi": "Hinglish", "mr": "Marathi", "kn": "Kannada",
                   "pa": "Punjabi", "ta": "Tamil", "te": "Telugu", "gu": "Gujarati", "bn": "Bengali"}


def _sarvam_v4_entry(vid: str, g: str) -> dict:
    name, lang, *style = vid.split("_")
    style_words = " ".join(style).title()
    expressive = "expressive" in style
    native = _SARVAM_V4_LANG.get(lang, lang)
    return {
        "value": f"{SARVAM_V4_PREFIX}{vid}",
        # The language Sarvam tuned this voice for is data (native_lang), not
        # part of the name: the voice speaks all 11 languages, best in this one.
        "name": f"{name.title()} {style_words}",
        "gender": "male" if g == "m" else "female",
        "tier": "standard",
        "multilingual": True,
        "native_lang": "hi" if lang == "enhi" else lang,
        "native_language": native,
        "note": f"Native {native}{' · expressive' if expressive else ''}",
    }


CATALOG += [_sarvam_v4_entry(vid, g) for vid, g in SARVAM_V4_VOICES]


# --- Gemini 3.8 Flash-Lite library voices (owner-only until quota) -------
# Google's /v1beta/voices library (2,089 voices, 290 Indian, checked
# 2026-10-13). These are ids, not personas: "en-in-csagent-3" must reach the
# API exactly as written, so every caller resolves names through
# gemini_voice_name() below instead of .capitalize(). Preview (owner-only)
# because Tier 1 allows 10 RPM / 100 RPD per Gemini TTS model — a few calls a
# day. Lift preview only after the project's limit is raised.
# (library id, display name, gender, role, accent)
GEMINI_LIBRARY_VOICES = (
    ("en-in-csagent-3", "Anjali", "female", "Customer support", "Hinglish"),
    ("en-in-csagent-1", "Rohit", "male", "Customer support", "Hinglish"),
    ("en-in-csagent-5", "Sneha", "female", "Sales", "Hinglish"),
    ("en-in-csagent-4", "Varun", "male", "Sales", "Hinglish"),
    ("en-in-advisor-6", "Nisha", "female", "Advisor", "Hinglish"),
    ("en-in-advisor-3", "Karan", "male", "Advisor", "Hinglish"),
    ("en-in-commercial-2", "Tanya", "female", "Promotions", "Hinglish"),
    ("en-in-commercial-7", "Dev", "male", "Promotions", "Hinglish"),
    ("hi-in-csagent-6", "Sunita", "female", "Customer support", "Haryanvi Hindi"),
    ("hi-in-csagent-7", "Ramesh", "male", "Sales", "Awadhi Hindi"),
    ("hi-in-csagent-4", "Ayesha", "female", "Customer support", "Urdu"),
    ("hi-in-csagent-11", "Imran", "male", "Customer support", "Urdu"),
)
_GEMINI_LIBRARY_IDS = {vid for vid, *_ in GEMINI_LIBRARY_VOICES}
CATALOG += [
    {
        "value": f"{GEMINI_38_PREFIX}{vid}",
        "name": f"{name} Studio Lite",
        "gender": gender,
        "tier": "premium",
        "multilingual": True,
        "preview": True,
        "note": f"{role} · {accent} · Studio Lite · test before live calls",
    }
    for vid, name, gender, role, accent in GEMINI_LIBRARY_VOICES
]


# Gemini-TTS model behind each Gemini persona prefix. Longest-first is not
# needed ("google:" does not prefix "google31:"), but keep specific first.
GEMINI_TTS_MODELS = (
    (GEMINI_38_FLASH_PREFIX, "gemini-3.8-flash-tts"),
    (GEMINI_38_PREFIX, "gemini-3.8-flash-lite-tts"),
    ("google31:", "gemini-3.1-flash-tts-preview"),
    ("google:", "gemini-2.5-flash-tts"),
)


def gemini_prefix_and_model(value: str) -> tuple[str, str] | None:
    """(prefix, Gemini-TTS model) for a Gemini voice value, else None."""
    for prefix, model in GEMINI_TTS_MODELS:
        if value.startswith(prefix):
            return prefix, model
    return None


def gemini_voice_name(value: str) -> str:
    """The voice name the Gemini/Cloud TTS API expects for a Gemini voice
    value: "Kore" for the persona "google38:kore", the id unchanged for a
    library voice ("google38:en-in-csagent-3")."""
    found = gemini_prefix_and_model(value)
    tail = value[len(found[0]):] if found else value
    return tail if tail in _GEMINI_LIBRARY_IDS else tail.capitalize()


def gemini_backup_persona(value: str) -> str:
    """Persona for the Cloud TTS backup voice. Library voices do not exist on
    Cloud TTS, so they fall back to a stock persona of the same gender."""
    found = gemini_prefix_and_model(value)
    tail = value[len(found[0]):] if found else value
    if tail in _GEMINI_LIBRARY_IDS:
        gender = next(g for vid, _n, g, *_ in GEMINI_LIBRARY_VOICES if vid == tail)
        return "Charon" if gender == "male" else "Kore"
    return tail.capitalize()


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
# Kiara HD (Chirp 3) leads because it is the fastest voice measured on
# real calls - 141ms TTS TTFB against 160-176ms for ElevenLabs, 288ms for
# Sarvam bulbul:v3 and 880-905ms for the Gemini TTS models. Same
# "standard" credit tier as the Sarvam voices below, so leading with it
# costs a tenant nothing. Chirp 3 is also the only Google family Google's
# streaming endpoint accepts, so it streams natively instead of going
# through the StreamAdapter workaround the other Google voices need.
#
# The Sarvam voices stay in the menu: an account that has been using one
# must not find it missing, and they are the fallback whenever
# GOOGLE_APPLICATION_CREDENTIALS_JSON is absent.
#
# 2026-09-14: pooja leads instead of Chirp 3. Google Cloud's billing account
# for the project backing Chirp3/Gemini TTS went past-due on 09-11 and every
# call requiring it now fails with PermissionDenied, regardless of the
# ~Rs27k free credit still sitting unused behind that gate - the credit does
# not waive the payment-method requirement. Sarvam has no dependency on that
# account. Move Chirp 3 back to the front once a payment method is added
# (console.cloud.google.com/billing) and it is confirmed reachable again -
# see test_tenant_defaults.py, which pins this and the other three places
# that must agree with it.
DEFAULT_ACCOUNT_VOICES = ["google:chirp3:Achernar", "google:chirp3:Aoede", "pooja", "shubh", "priya"]

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
SAMPLE_TEXT_VERSION = 4
# Every language says the same thing as the English line, so a customer
# switching the preview language hears the same sentence in that language.
# Translations written 2026-10-15; native-speaker review still pending.
SAMPLE_TEXTS: dict[str, str | dict[str, str]] = {
    "mr": {
        "male": (
            "नमस्कार! मी Vistrow Voice चा एआय एजंट आहे. मी तुमच्या कॉल्सना उत्तर देतो, "
            "लीड्स क्वालिफाय करतो आणि अपॉइंटमेंट बुक करतो — तेही तुमच्या ग्राहकाच्या स्वतःच्या भाषेत."
        ),
        "female": (
            "नमस्कार! मी Vistrow Voice ची एआय एजंट आहे. मी तुमच्या कॉल्सना उत्तर देते, "
            "लीड्स क्वालिफाय करते आणि अपॉइंटमेंट बुक करते — तेही तुमच्या ग्राहकाच्या स्वतःच्या भाषेत."
        ),
    },
    "ta": (
        "வணக்கம்! நான் Vistrow Voice-இன் ஏஐ ஏஜென்ட். உங்கள் அழைப்புகளுக்கு பதிலளிப்பேன், "
        "லீட்களை தகுதிப்படுத்துவேன், அப்பாயின்ட்மென்ட்களையும் புக் செய்வேன் — அதுவும் உங்கள் வாடிக்கையாளரின் சொந்த மொழியிலேயே."
    ),
    "te": (
        "నమస్కారం! నేను Vistrow Voice ఏఐ ఏజెంట్‌ని. మీ కాల్స్‌కు సమాధానం ఇస్తాను, "
        "లీడ్స్‌ను క్వాలిఫై చేస్తాను, అపాయింట్‌మెంట్లు బుక్ చేస్తాను — అదీ మీ కస్టమర్ సొంత భాషలోనే."
    ),
    "kn": (
        "ನಮಸ್ಕಾರ! ನಾನು Vistrow Voice ನ ಎಐ ಏಜೆಂಟ್. ನಿಮ್ಮ ಕರೆಗಳಿಗೆ ಉತ್ತರಿಸುತ್ತೇನೆ, "
        "ಲೀಡ್‌ಗಳನ್ನು ಕ್ವಾಲಿಫೈ ಮಾಡುತ್ತೇನೆ ಮತ್ತು ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್‌ಗಳನ್ನು ಬುಕ್ ಮಾಡುತ್ತೇನೆ — ಅದೂ ನಿಮ್ಮ ಗ್ರಾಹಕರ ಸ್ವಂತ ಭಾಷೆಯಲ್ಲೇ."
    ),
    "ml": (
        "നമസ്കാരം! ഞാൻ Vistrow Voice-ന്റെ എഐ ഏജന്റാണ്. നിങ്ങളുടെ കോളുകൾക്ക് മറുപടി നൽകുകയും "
        "ലീഡുകൾ ക്വാളിഫൈ ചെയ്യുകയും അപ്പോയിന്റ്മെന്റുകൾ ബുക്ക് ചെയ്യുകയും ചെയ്യും — അതും നിങ്ങളുടെ ഉപഭോക്താവിന്റെ സ്വന്തം ഭാഷയിൽ."
    ),
    "gu": (
        "નમસ્તે! હું Vistrow Voice નો એઆઈ એજન્ટ છું. હું તમારા કૉલ્સનો જવાબ આપું છું, "
        "લીડ્સ ક્વોલિફાય કરું છું અને એપોઇન્ટમેન્ટ બુક કરું છું — એ પણ તમારા ગ્રાહકની પોતાની ભાષામાં."
    ),
    "bn": (
        "নমস্কার! আমি Vistrow Voice-এর এআই এজেন্ট। আমি আপনার কলের উত্তর দিই, "
        "লিড কোয়ালিফাই করি আর অ্যাপয়েন্টমেন্ট বুক করি — তাও আপনার গ্রাহকের নিজের ভাষায়।"
    ),
    "pa": {
        "male": (
            "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ Vistrow Voice ਦਾ ਏਆਈ ਏਜੰਟ ਹਾਂ। ਮੈਂ ਤੁਹਾਡੀਆਂ ਕਾਲਾਂ ਦਾ ਜਵਾਬ ਦਿੰਦਾ ਹਾਂ, "
            "ਲੀਡਾਂ ਕੁਆਲੀਫਾਈ ਕਰਦਾ ਹਾਂ ਅਤੇ ਅਪਾਇੰਟਮੈਂਟ ਬੁੱਕ ਕਰਦਾ ਹਾਂ — ਉਹ ਵੀ ਤੁਹਾਡੇ ਗਾਹਕ ਦੀ ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ।"
        ),
        "female": (
            "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ Vistrow Voice ਦੀ ਏਆਈ ਏਜੰਟ ਹਾਂ। ਮੈਂ ਤੁਹਾਡੀਆਂ ਕਾਲਾਂ ਦਾ ਜਵਾਬ ਦਿੰਦੀ ਹਾਂ, "
            "ਲੀਡਾਂ ਕੁਆਲੀਫਾਈ ਕਰਦੀ ਹਾਂ ਅਤੇ ਅਪਾਇੰਟਮੈਂਟ ਬੁੱਕ ਕਰਦੀ ਹਾਂ — ਉਹ ਵੀ ਤੁਹਾਡੇ ਗਾਹਕ ਦੀ ਆਪਣੀ ਭਾਸ਼ਾ ਵਿੱਚ।"
        ),
    },
    "od": (
        "ନମସ୍କାର! ମୁଁ Vistrow Voice ର ଏଆଇ ଏଜେଣ୍ଟ। ମୁଁ ଆପଣଙ୍କ କଲ୍‌ର ଉତ୍ତର ଦିଏ, "
        "ଲିଡ୍ କ୍ୱାଲିଫାଏ କରେ ଏବଂ ଆପଏଣ୍ଟମେଣ୍ଟ ବୁକ୍ କରେ — ତାହା ବି ଆପଣଙ୍କ ଗ୍ରାହକଙ୍କ ନିଜ ଭାଷାରେ।"
    ),
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
# 2026-10-06: ElevenLabs is hidden entirely (menu, catalogue and agent picker).
# The Voices page was 13,000 px tall and no live agent uses one; agents that
# already point at an "elevenlabs:" voice still resolve it for calls and billing.
_HIDDEN_VOICE_PREFIXES = ("elevenlabs-v3:", "elevenlabs:", "google31:")

# 2026-10-08: voices that failed the speed or quality bar on real calls are not
# offered either (docs/INTERNATIONAL-EXPANSION-PLAN-2026-10-07.md section 8.1):
#   - the two multilingual "google:kore" / "google:charon" voices: about 0.93 s to
#     the first sound, five times Chirp 3 HD;
#   - the locale "Standard" family (e.g. google:hi-IN-Standard-A): audible distortion
#     and no transcription on call 885 (see web-demo agentOptions).
# Agents already using one keep working: get_voice() and billing still resolve them.
# 2026-10-14 (owner): the locale "Standard" (Native) voices are offered again.
# Their "distortion" was a decoding bug (PCM request answered with MP3), fixed
# in agent/main.py by requesting LINEAR16; verified clean on test call 1278.
# en-IN-Standard-D is female per Google's voice list, so it is "Anika", not "Aarav".
# Mira/Arin were hidden on 2026-10-08 for speed (about 0.93 s); they return on
# 2026-10-13 as part of the opt-in Expressive tier, labelled as slower.
_HIDDEN_VOICES_EXACT: frozenset = frozenset()

# 2026-10-14 (owner): only the Sarvam v4 personas made for business calls are
# offered. The other ~104 (narration, stories, audiobook, documentary, ads,
# reels, news, sports, market, social, companion, devotional, kids, late-night,
# romantic, therapist, suspense) are content voices. Matched on the first
# use-case word of the id (name_lang_use[_variant]); hidden, not deleted.
_SARVAM_V4_CALL_USES = frozenset({
    "customer", "conversational", "conversation", "sales", "banking", "recovery",
    "insurance", "ecomm", "medical", "edtech", "assistant", "kyc", "feedback",
    "interview", "numbers", "automobile",
})


def _is_sarvam_v4_content_voice(value: str) -> bool:
    if not value.startswith(SARVAM_V4_PREFIX):
        return False
    parts = value[len(SARVAM_V4_PREFIX):].split("_")
    return len(parts) < 3 or parts[2] not in _SARVAM_V4_CALL_USES


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

# Gemini 3.8 TTS documents its own, larger table at
# ai.google.dev/gemini-api/docs/speech-generation (checked 2026-10-15): 132 rows,
# all ticked for Flash TTS ("over 130") but only 103 for Flash-Lite TTS ("over
# 100"), which google38: voices use. The Live API (realtime) lists 99. Recheck
# all three when Google updates.
GEMINI_38_FLASH_TTS_TOTAL_LANGUAGES = 132
GEMINI_38_FLASH_LITE_TTS_TOTAL_LANGUAGES = 103
GEMINI_LIVE_TOTAL_LANGUAGES = 99

_GOOGLE_PREFIXES = ("google:", "google31:", GEMINI_38_FLASH_PREFIX, GEMINI_38_PREFIX)


# Chirp 3 HD personas exist in exactly these locales (verified against
# Google's list_voices on 2026-10-12: all 30 personas are present in all 52;
# ru-RU exists for only 8 of them, so it is left out). Indian locales first.
# A persona follows the caller by swapping the locale prefix, so this is both
# what the Voices tab names and the real switchable range.
CHIRP3_PERSONA_PREFIX = "google:chirp3:"
CHIRP3_INDIAN_LANGUAGES = ["hi-IN", "en-IN", "mr-IN", "ta-IN", "te-IN", "kn-IN", "ml-IN", "gu-IN", "bn-IN", "pa-IN", "ur-IN"]
CHIRP3_LANGUAGES = CHIRP3_INDIAN_LANGUAGES + [
    "en-US", "en-GB", "en-AU", "ar-XA", "bg-BG", "cmn-CN", "cs-CZ", "da-DK",
    "de-DE", "el-GR", "es-ES", "es-US", "et-EE", "fi-FI", "fr-CA", "fr-FR",
    "he-IL", "hr-HR", "hu-HU", "id-ID", "it-IT", "ja-JP", "ko-KR", "lt-LT",
    "lv-LV", "nb-NO", "nl-BE", "nl-NL", "pl-PL", "pt-BR", "ro-RO", "sk-SK",
    "sl-SI", "sr-RS", "sv-SE", "sw-KE", "th-TH", "tr-TR", "uk-UA", "vi-VN",
    "yue-HK",
]
# Names for the Chirp locales no other engine table labels.
CHIRP3_LANGUAGE_LABELS = {
    "ur-IN": "Urdu", "en-US": "English (US)", "en-GB": "English (UK)",
    "en-AU": "English (Australia)", "ar-XA": "Arabic", "bg-BG": "Bulgarian",
    "cmn-CN": "Chinese (Mandarin)", "cs-CZ": "Czech", "da-DK": "Danish",
    "de-DE": "German", "el-GR": "Greek", "es-ES": "Spanish",
    "es-US": "Spanish (US)", "et-EE": "Estonian", "fi-FI": "Finnish",
    "fr-CA": "French (Canada)", "fr-FR": "French", "he-IL": "Hebrew",
    "hr-HR": "Croatian", "hu-HU": "Hungarian", "id-ID": "Indonesian",
    "it-IT": "Italian", "ja-JP": "Japanese", "ko-KR": "Korean",
    "lt-LT": "Lithuanian", "lv-LV": "Latvian", "nb-NO": "Norwegian",
    "nl-BE": "Dutch (Belgium)", "nl-NL": "Dutch", "pl-PL": "Polish",
    "pt-BR": "Portuguese (Brazil)", "ro-RO": "Romanian", "sk-SK": "Slovak",
    "sl-SI": "Slovenian", "sr-RS": "Serbian", "sv-SE": "Swedish",
    "sw-KE": "Swahili", "th-TH": "Thai", "tr-TR": "Turkish",
    "uk-UA": "Ukrainian", "vi-VN": "Vietnamese", "yue-HK": "Cantonese",
}


# Labels for anything either engine can speak, so public_entry can name a
# locale regardless of which engine produced it.
_ALL_LANGUAGE_LABELS = {**CHIRP3_LANGUAGE_LABELS, **GOOGLE_TTS_LANGUAGES, **LANGUAGE_LABELS}


def chirp3_persona(value: str) -> str | None:
    """Persona name for a "google:chirp3:<Persona>" value, else None."""
    if not value.startswith(CHIRP3_PERSONA_PREFIX):
        return None
    return value[len(CHIRP3_PERSONA_PREFIX):] or None


def chirp3_voice_name(persona: str, language: str) -> str:
    """Google voice id for this persona in this language, falling back to
    Hindi for a language Chirp 3 does not cover."""
    lang = language if language in CHIRP3_LANGUAGES else "hi-IN"
    return f"{lang}-Chirp3-HD-{persona}"


def languages_for(entry: dict) -> tuple[list[str], bool]:
    """(language codes this voice speaks, can_switch_mid_call).

    A Google locale voice encodes its one language in the value itself
    ("google:hi-IN-Standard-A"); everything multilingual is a single voice
    that carries across all of them. Which set "all of them" means depends on
    the engine - Gemini and Sarvam do not overlap cleanly.
    """
    value = entry.get("value", "")
    if value.startswith(CHIRP3_PERSONA_PREFIX):
        # One persona across Chirp 3's own 52 locales — not Gemini's list.
        # Falling through to the branch below would claim the Gemini range
        # for a voice that does not have it.
        return list(CHIRP3_LANGUAGES), True
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
    if not value:
        return False
    return (
        value.startswith(_HIDDEN_VOICE_PREFIXES)
        or value in _HIDDEN_VOICES_EXACT
        or _is_sarvam_v4_content_voice(value)
    )


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
            len(_langs)
            if entry.get("value", "").startswith(CHIRP3_PERSONA_PREFIX)
            else GEMINI_38_FLASH_TTS_TOTAL_LANGUAGES
            if entry.get("value", "").startswith(GEMINI_38_FLASH_PREFIX)
            else GEMINI_38_FLASH_LITE_TTS_TOTAL_LANGUAGES
            if entry.get("value", "").startswith(GEMINI_38_PREFIX)
            else GOOGLE_TTS_TOTAL_LOCALES
            if _can_switch and entry.get("value", "").startswith(_GOOGLE_PREFIXES)
            else len(_langs)
        ),
        "languageLabels": [_ALL_LANGUAGE_LABELS[c] for c in _langs if c in _ALL_LANGUAGE_LABELS],
        "canSwitchLanguage": _can_switch,
        # Sarvam v4: the language the voice was tuned to sound native in
        # (preview default; the voice still speaks the other languages).
        "nativeLang": entry.get("native_lang", ""),
        "nativeLanguage": entry.get("native_language", ""),
    }
