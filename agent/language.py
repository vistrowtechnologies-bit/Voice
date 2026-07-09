import re

# Display name for each language code the dashboard's agent editor offers —
# used to tell the LLM which language to open a call in (see main.py); the
# reply-language codes above are TTS pronunciation hints only and never
# reach the LLM on their own.
LANGUAGE_NAMES: dict[str, str] = {
    "hi-IN": "Hindi",
    "en-IN": "English",
    "mr-IN": "Marathi",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "gu-IN": "Gujarati",
    "bn-IN": "Bengali",
    "pa-IN": "Punjabi",
}

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
# Whitespace/punctuation don't count as "script content" for the ratio check
# below — only letters do.
_NON_LETTER_PATTERN = re.compile(r"[\s\W_]")

# A script needs both a minimum share of the utterance's letters AND a
# minimum raw count to win. Sarvam's saaras:v3 "unknown" auto-language-ID is
# unreliable on short/noisy turns (reading digits back, background noise) and
# occasionally hallucinates one or two stray characters from an unrelated
# script. A single matching character used to be enough to flag a whole turn
# as that language (any(pattern.search(text))); requiring a real majority
# share, not just a presence check, stops one hallucinated glyph from
# starting a 3-turn switch countdown to the wrong language.
_MIN_SCRIPT_RATIO = 0.4
_MIN_SCRIPT_CHARS = 3


def detect_reply_language(text: str | None) -> str | None:
    """Guess which Sarvam TTS language code the reply should use, based on
    the dominant script of the caller's last transcribed utterance.

    Returns None when there isn't a confident signal (e.g. a short "okay",
    an utterance that's only digits once numerals are stripped, or one where
    no single script clearly dominates), so the caller can leave the current
    language unchanged rather than flip-flopping on ambiguous or noisy turns.
    """
    if not text or len(text.split()) < 2:
        return None

    stripped = _DIGIT_PATTERN.sub("", text)
    letters = _NON_LETTER_PATTERN.sub("", stripped)
    if not letters:
        return None

    best_code, best_count = None, 0
    for code, pattern in _SCRIPT_PATTERNS:
        count = len(pattern.findall(stripped))
        if count > best_count:
            best_code, best_count = code, count

    if best_code and best_count >= _MIN_SCRIPT_CHARS and best_count / len(letters) >= _MIN_SCRIPT_RATIO:
        return best_code

    if _LATIN_PATTERN.search(stripped):
        return "en-IN"

    return None
