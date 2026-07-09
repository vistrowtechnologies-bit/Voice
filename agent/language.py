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
# Every script range above also contains that script's own digit glyphs
# (e.g. Malayalam ൦-൯ sits inside ഀ-ൿ) — \d matches any Unicode decimal
# digit, not just ASCII, so this strips all of them before the script match.
# Without it, a caller reading out a phone number or price gets transcribed
# with native-script digits and the agent wrongly "detects" that script as
# the reply language and switches TTS to it mid-call.
_DIGIT_PATTERN = re.compile(r"\d")


def detect_reply_language(text: str | None) -> str | None:
    """Guess which Sarvam TTS language code the reply should use, based on
    the script of the caller's last transcribed utterance.

    Returns None when there isn't a confident signal (e.g. a short "okay",
    or an utterance that's only digits once punctuation/numerals are
    stripped), so the caller can leave the current language unchanged rather
    than flip-flopping on ambiguous turns.
    """
    if not text or len(text.split()) < 2:
        return None

    stripped = _DIGIT_PATTERN.sub("", text)
    if not stripped.strip():
        return None

    for code, pattern in _SCRIPT_PATTERNS:
        if pattern.search(stripped):
            return code

    if _LATIN_PATTERN.search(stripped):
        return "en-IN"

    return None
