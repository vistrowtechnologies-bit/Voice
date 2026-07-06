import re

# Unicode script ranges for the Indic languages Sarvam's bulbul:v3 TTS
# supports. Devanagari covers both Hindi and Marathi — script alone can't
# tell them apart, so it defaults to Hindi for that range.
_SCRIPT_RANGES: list[tuple[str, str]] = [
    ("hi-IN", r"[ऀ-ॿ]"),  # Devanagari (Hindi/Marathi)
    ("bn-IN", r"[ঀ-৿]"),  # Bengali
    ("pa-IN", r"[਀-੿]"),  # Gurmukhi (Punjabi)
    ("gu-IN", r"[઀-૿]"),  # Gujarati
    ("od-IN", r"[଀-୿]"),  # Odia
    ("ta-IN", r"[஀-௿]"),  # Tamil
    ("te-IN", r"[ఀ-౿]"),  # Telugu
    ("kn-IN", r"[ಀ-೿]"),  # Kannada
    ("ml-IN", r"[ഀ-ൿ]"),  # Malayalam
]
_SCRIPT_PATTERNS = [(code, re.compile(pattern)) for code, pattern in _SCRIPT_RANGES]
_LATIN_PATTERN = re.compile(r"[A-Za-z]")


def detect_reply_language(text: str | None) -> str | None:
    """Guess which Sarvam TTS language code the reply should use, based on
    the script of the caller's last transcribed utterance.

    Returns None when there isn't a confident signal (e.g. a short "okay"),
    so the caller can leave the current language unchanged rather than
    flip-flopping on ambiguous one-word turns.
    """
    if not text or len(text.split()) < 2:
        return None

    for code, pattern in _SCRIPT_PATTERNS:
        if pattern.search(text):
            return code

    if _LATIN_PATTERN.search(text):
        return "en-IN"

    return None
