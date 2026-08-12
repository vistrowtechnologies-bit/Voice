import re

# Lightweight, zero-latency keyword/punctuation heuristic — no extra LLM or
# network round trip per turn, since the TTS pace update has to land before
# the reply starts speaking. English + Hindi/Hinglish, matching what actual
# callers say (see the Agni recording transcripts this was modeled on).
_FRUSTRATED_PATTERNS = re.compile(
    r"\b(problem|not working|doesn'?t work|angry|frustrat\w*|annoyed|worst|useless|"
    r"waste of time|so bad|terrible|उल्टा|गलत|परेशान|गुस्सा|समस्या|बकवास|खराब)\b",
    re.IGNORECASE,
)
_URGENT_PATTERNS = re.compile(
    r"\b(urgent|asap|right now|immediately|hurry|जल्दी|अभी|फ़ौरन|जल्द से जल्द)\b",
    re.IGNORECASE,
)
_EXCITED_PATTERNS = re.compile(
    r"\b(great|awesome|perfect|love it|amazing|wonderful|excellent|thank you so much|"
    r"बढ़िया|बहुत बढ़िया|शानदार|मज़ा आ गया|धन्यवाद|कमाल)\b",
    re.IGNORECASE,
)
_CONFUSED_PATTERNS = re.compile(
    r"\b(what do you mean|i don'?t understand|confused|come again|huh\??|"
    r"समझ नहीं आया|क्या मतलब|दोबारा बताओ)\b",
    re.IGNORECASE,
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
EMOTION_TONE_DELTAS: dict[str, dict[str, float]] = {
    "frustrated": {"pace": -0.08, "pitch": -0.03},
    "confused": {"pace": -0.12, "pitch": 0.0},
    # Kept modest deliberately — this stacks additively on top of the
    # agent's base tone (TONE_PRESETS), and "casual" alone already runs at
    # pace 1.08. The original 0.06 pushed a casual agent to ~1.14, which
    # read as rushed/too-fast rather than "upbeat."
    "excited": {"pace": 0.03, "pitch": 0.02},
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
    "professional": "Speak in a calm, measured, professional tone.",
    "balanced": "Speak in a natural, warm, conversational tone.",
    "casual": "Speak in an upbeat, friendly, energetic tone.",
}
GEMINI_EMOTION_PROMPT_DELTAS: dict[str, str] = {
    "frustrated": "The caller sounds frustrated — speak calmly, patiently, and reassuringly to de-escalate.",
    "confused": "The caller sounds confused — speak slowly and clearly, articulating each word.",
    "excited": "The caller sounds excited and happy — match their energy with warmth and enthusiasm.",
}
