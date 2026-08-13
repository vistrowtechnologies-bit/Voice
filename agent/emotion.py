import re

# Lightweight, zero-latency keyword/punctuation heuristic — no extra LLM or
# network round trip per turn, since the TTS pace update has to land before
# the reply starts speaking.
#
# English + Hindi/Hinglish were the original coverage (modeled on real Agni
# recording transcripts). The other 9 languages this product actually
# supports (see language.py's LANGUAGE_NAMES) had ZERO emotion detection
# until this pass — a caller speaking pure Marathi or Tamil got no reaction
# at all, regardless of how frustrated or excited they sounded. These
# translations haven't been validated against real native-speaker call
# transcripts the way the original Hindi set was — worth a native-speaker
# spot-check before fully trusting the non-Hindi coverage.
#
# IMPORTANT: `\b` is unreliable across every Indic script here — confirmed
# empirically, not just Hindi. Python's `\w` (what `\b` boundaries are
# defined against) excludes combining vowel signs/virama (Unicode category
# Mn/Mc), which are a normal part of how these scripts spell words, so a
# `\b`-wrapped word like "समस्या" silently fails to match its own text half
# the time depending on which character happens to sit at the boundary —
# this means most non-English matching in this module was quietly broken,
# not just the newly-added languages. English/Latin-script keywords keep
# `\b` (it works correctly there); every Indic-script keyword matches as a
# plain substring instead — these are distinctive enough multi-character
# words that the false-positive risk from dropping the boundary is low,
# and a silent false negative (never firing at all) is a worse failure mode
# than an occasional over-eager match.


def _emotion_pattern(english: str, indic: str) -> re.Pattern[str]:
    return re.compile(rf"\b(?:{english})\b|(?:{indic})", re.IGNORECASE)


_FRUSTRATED_PATTERNS = _emotion_pattern(
    r"problem|not working|doesn'?t work|angry|frustrat\w*|annoyed|worst|useless|"
    r"waste of time|so bad|terrible",
    r"उल्टा|गलत|परेशान|गुस्सा|समस्या|बकवास|खराब|"  # Hindi
    r"राग|वैतागल[ोे]|त्रास|वाईट|"  # Marathi
    r"સમસ્યા|ગુસ્સો|પરેશાન|ખરાબ|"  # Gujarati
    r"பிரச்சனை|கோபம்|எரிச்சல்|மோசம்|"  # Tamil
    r"సమస్య|కోపం|చిరాకు|చెడు|"  # Telugu
    r"ಸಮಸ್ಯೆ|ಕೋಪ|ರೇಜಿಗೆ|ಕೆಟ್ಟ|"  # Kannada
    r"പ്രശ്നം|ദേഷ്യം|ബുദ്ധിമുട്ട്|മോശം|"  # Malayalam
    r"সমস্যা|রাগ|বিরক্ত|খারাপ|"  # Bengali
    r"ਸਮੱਸਿਆ|ਗੁੱਸਾ|ਪਰੇਸ਼ਾਨ|ਖਰਾਬ|"  # Punjabi
    r"ସମସ୍ୟା|ରାଗ|ବିରକ୍ତ|ଖରାପ",  # Odia
)
_URGENT_PATTERNS = _emotion_pattern(
    r"urgent|asap|right now|immediately|hurry",
    r"जल्दी|अभी|फ़ौरन|जल्द से जल्द|"  # Hindi
    r"लवकर|आत्ता|त्वरित|"  # Marathi
    r"જલ્દી|હમણાં|તાત્કાલિક|"  # Gujarati
    r"சீக்கிரம்|இப்போதே|அவசரம்|"  # Tamil
    r"త్వరగా|ఇప్పుడే|అత్యవసరం|"  # Telugu
    r"ಬೇಗ|ಈಗಲೇ|ತುರ್ತು|"  # Kannada
    r"വേഗം|ഇപ്പോൾത്തന്നെ|അടിയന്തിരം|"  # Malayalam
    r"তাড়াতাড়ি|এখনই|জরুরি|"  # Bengali
    r"ਜਲਦੀ|ਹੁਣੇ|ਤੁਰੰਤ|"  # Punjabi
    r"ଶୀଘ୍ର|ଏବେ|ଜରୁରୀ",  # Odia
)
_EXCITED_PATTERNS = _emotion_pattern(
    r"great|awesome|perfect|love it|amazing|wonderful|excellent|thank you so much",
    r"बढ़िया|बहुत बढ़िया|शानदार|मज़ा आ गया|धन्यवाद|कमाल|"  # Hindi
    r"छान|बढिया|मस्त|"  # Marathi
    r"સરસ|મજા આવી|આભાર|"  # Gujarati
    r"நல்லது|அருமை|சூப்பர்|நன்றி|"  # Tamil
    r"బాగుంది|అద్భుతం|సూపర్|ధన్యవాదాలు|"  # Telugu
    r"ಚೆನ್ನಾಗಿದೆ|ಅದ್ಭುತ|ಧನ್ಯವಾದ|"  # Kannada
    r"നല്ലത്|അതിശയം|നന്ദി|"  # Malayalam
    r"ভালো|দারুণ|ধন্যবাদ|"  # Bengali
    r"ਵਧੀਆ|ਸ਼ਾਨਦਾਰ|ਧੰਨਵਾਦ|"  # Punjabi
    r"ଭଲ|ଅଦ୍ଭୁତ|ଧନ୍ୟବାଦ",  # Odia
)
_CONFUSED_PATTERNS = _emotion_pattern(
    r"what do you mean|i don'?t understand|confused|come again|huh\??",
    r"समझ नहीं आया|क्या मतलब|दोबारा बताओ|"  # Hindi
    r"समजल[ें] नाही|गोंधळ|"  # Marathi
    r"સમજાયું નહીં|મૂંઝવણ|"  # Gujarati
    r"புரியவில்லை|குழப்பம்|"  # Tamil
    r"అర్థం కాలేదు|గందరగోళం|"  # Telugu
    r"ಅರ್ಥವಾಗಲಿಲ್ಲ|ಗೊಂದಲ|"  # Kannada
    r"മനസ്സിലായില്ല|ആശയക്കുഴപ്പം|"  # Malayalam
    r"বুঝিনি|বিভ্রান্ত|"  # Bengali
    r"ਸਮਝ ਨਹੀਂ ਆਇਆ|ਉਲਝਣ|"  # Punjabi
    r"ବୁଝି ପାରିଲି ନାହିଁ|ଦ୍ୱନ୍ଦ୍ୱ",  # Odia
)


def detect_caller_emotion(text: str) -> str | None:
    """Classifies the caller's last turn into a coarse emotion bucket the
    agent should visibly react to, or None for plain neutral speech.
    Order matters: frustration/urgency signals win over excitement if a
    turn somehow matches both (rare, but "finally, great" type phrasing)."""
    if not text or not text.strip():
        return None
    if _FRUSTRATED_PATTERNS.search(text) or _URGENT_PATTERNS.search(text):
        return "frustrated"
    if _CONFUSED_PATTERNS.search(text):
        return "confused"
    if _EXCITED_PATTERNS.search(text):
        return "excited"
    # Heavy punctuation is its own signal even with no keyword match —
    # ALL-CAPS shouting or a stacked "???" reads as frustration/urgency.
    if re.search(r"[A-Z]{4,}", text) or "!!" in text or "???" in text:
        return "frustrated"
    return None


# Deltas applied on top of the agent's configured base tone (TONE_PRESETS in
# main.py) — additive, not absolute, so a "casual" agent stays livelier than
# a "professional" one even while both react to the same caller emotion.
# pace is the reliable lever (works on every Sarvam voice, v2 and v3); pitch
# only takes effect for v2 speakers, so its delta is small and secondary.
# loudness is a genuinely separate dimension from both — added because pace/
# pitch alone read as too subtle to notice as real "modulation" rather than
# just faster/slower talking.
EMOTION_TONE_DELTAS: dict[str, dict[str, float]] = {
    # Quieter/calmer, not just slower — reads as de-escalating rather than
    # sluggish.
    "frustrated": {"pace": -0.08, "pitch": -0.03, "loudness": -0.05},
    "confused": {"pace": -0.12, "pitch": 0.0, "loudness": 0.0},
    # Kept modest deliberately — this stacks additively on top of the
    # agent's base tone (TONE_PRESETS), and "casual" alone already runs at
    # pace 1.08. The original 0.06 pushed a casual agent to ~1.14, which
    # read as rushed/too-fast rather than "upbeat." loudness carries more of
    # the "more energy" signal here instead of pushing pace further.
    "excited": {"pace": 0.03, "pitch": 0.02, "loudness": 0.1},
}

# ElevenLabs equivalent of EMOTION_TONE_DELTAS above — same caller-emotion
# buckets, expressed as VoiceSettings deltas since ElevenLabs has no
# pace/pitch knobs. `speed` is direct playback rate (same intent as
# Sarvam's pace); `style` is ElevenLabs' "exaggeration" dial — turned down
# for a calmer/more careful delivery, up for a more animated one. Applied
# via tts.update_options(voice_settings=...) on eleven_flash_v2_5, which
# supports live mid-call updates without the streaming/latency problems of
# eleven_v3's bracket-tag emotion system (v3 isn't viable for real-time
# calls — see agent/main.py's _build_tts docstring).
ELEVENLABS_EMOTION_DELTAS: dict[str, dict[str, float]] = {
    "frustrated": {"speed": -0.05, "style": -0.1},
    "confused": {"speed": -0.08, "style": -0.1},
    # Same reasoning as EMOTION_TONE_DELTAS above — halved from the
    # original 0.05/0.15, which stacked on "casual" tone's own speed 1.05
    # base and read as rushed.
    "excited": {"speed": 0.025, "style": 0.08},
}

# Gemini-TTS (google:kore/charon) has no pace/pitch knobs like Sarvam or a
# VoiceSettings struct like ElevenLabs — instead its `prompt` field is a
# natural-language STYLE instruction the model actually performs (Google's
# own docs: "Say this in a spooky whisper", etc.), applied fresh to each
# reply's first chunk. That's a genuinely different (and more expressive)
# mechanism than the numeric deltas above, so it isn't derived from
# EMOTION_TONE_DELTAS — it's composed as base-tone sentence + emotion
# sentence, both plain English, and sent verbatim as the prompt.
GEMINI_TONE_PROMPTS: dict[str, str] = {
    "professional": (
        "Speak like a calm, sharp Indian business consultant in a real one-to-one phone call. "
        "Be measured and concise, with subtle clause-level pace changes and brief natural pauses. "
        "Never sound like an announcer, advertisement, IVR, or overly cheerful assistant."
    ),
    "balanced": (
        "Speak like a warm, perceptive Indian business consultant in a real one-to-one phone call. "
        "Keep the delivery relaxed and responsive, with subtle clause-level pace changes and brief "
        "natural pauses after acknowledgements. Use Indian-English or Hinglish rhythm only when the "
        "text naturally contains it. Never sound like an announcer, advertisement, IVR, or overly "
        "cheerful assistant; do not exaggerate fillers or emotion."
    ),
    "casual": (
        "Speak like a friendly, quick-witted Indian consultant in a relaxed one-to-one phone call. "
        "Sound engaged rather than performative, vary pace subtly, and leave brief natural pauses. "
        "Never sound like an announcer, advertisement, IVR, or hyperactive assistant; do not "
        "exaggerate fillers, jokes, or emotion."
    ),
}
GEMINI_EMOTION_PROMPT_DELTAS: dict[str, str] = {
    "frustrated": "The caller sounds frustrated — speak calmly, patiently, and reassuringly to de-escalate.",
    "confused": "The caller sounds confused — speak slowly and clearly, articulating each word.",
    "excited": "The caller sounds excited and happy — match their energy with warmth and enthusiasm.",
}
