import difflib
import re
import unicodedata

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
    "od-IN": "Odia",
}

# Everything a Gemini-TTS voice can speak, which is a strict superset of the
# native list above (all 11, once od-IN/bn-IN are respelled the way Google
# spells them - see voice_catalog.to_google_code). Kept out of LANGUAGE_NAMES
# because a Sarvam voice handed "de-DE" would fail: the wider set only applies
# when the agent is actually running a Google multilingual voice.
from voice_catalog import (  # noqa: E402
    GOOGLE_TTS_LANGUAGES,
    to_google_code,
)

GOOGLE_LANGUAGE_NAMES: dict[str, str] = dict(GOOGLE_TTS_LANGUAGES)
# The native-11 names win where both tables describe the same language, so a
# switch to "English" or "Bengali" keeps resolving to the code the rest of the
# pipeline already uses; to_google_code() respells it at the TTS boundary.
for _code, _name in LANGUAGE_NAMES.items():
    GOOGLE_LANGUAGE_NAMES.setdefault(_code, _name)
    GOOGLE_LANGUAGE_NAMES[_code] = _name

# Names beyond the native 11 - what a Google voice unlocks over a Sarvam one.
# Google's own spelling of a native language (or-IN for od-IN, bn-BD for
# bn-IN) is excluded so the prompt does not list Odia and Bengali twice.
_NATIVE_IN_GOOGLE_SPELLING = {to_google_code(c) for c in LANGUAGE_NAMES}
GOOGLE_ONLY_LANGUAGE_NAMES: dict[str, str] = {
    c: n
    for c, n in GOOGLE_LANGUAGE_NAMES.items()
    if c not in LANGUAGE_NAMES and c not in _NATIVE_IN_GOOGLE_SPELLING
}


def is_google_multilingual(provider: str | None) -> bool:
    """Whether this TTS provider is a Gemini persona voice, and therefore
    gets the full global language range rather than the native 11."""
    return provider in ("google-multilingual", "google-multilingual-31")


# Which of the languages above ElevenLabs' eleven_flash_v2_5 model actually
# accepts as a `language` enforcement code. Confirmed against ElevenLabs'
# own published 32-language list (elevenlabs.io/docs/overview/models,
# 2026-07-15) — only Hindi, English, and Tamil overlap with our 11 offered
# languages. This is NOT a quality/accent list (see the Marathi pronunciation
# work elsewhere) — it's which codes the API will accept at all before
# REJECTING the request outright. Passing an unlisted code (confirmed live in
# production for "mr") gets an immediate hard error from ElevenLabs
# ("Model 'eleven_flash_v2_5' does not support language_code 'mr'"), which
# kills the whole TTS WebSocket connection (code 1008) and — because
# livekit-agents doesn't recover a dead TTS pipeline mid-session — leaves the
# agent permanently silent for the rest of the call while the room stays
# connected: the caller sees an active call that never speaks again. Every
# call site that sets `language=` on an ElevenLabs TTS instance (main.py's
# _build_tts and its mid-call update_options paths, tools.py's
# switch_reply_language) must check membership here first and omit the
# `language` kwarg entirely for anything not in this set — ElevenLabs then
# auto-detects from the text instead of enforcing (and rejecting) a code.
ELEVENLABS_SUPPORTED_LANGUAGES = {"hi-IN", "en-IN", "ta-IN"}

# Unicode script ranges for the Indic languages Sarvam's bulbul:v3 TTS
# supports. Devanagari covers both Hindi and Marathi — script alone can't
# tell them apart, so it maps to hi-IN here; on_user_turn_completed special
# -cases the reverse (an mr-IN session seeing a Devanagari "hi-IN" candidate
# must NOT be treated as a real switch signal, or every Marathi call would
# get silently downgraded to Hindi after a few caller turns — this was a real
# bug, not hypothetical, caught 2026-07-15).
_SCRIPT_RANGES: list[tuple[str, str]] = [
    ("hi-IN", r"[ऀ-ॿ]"),  # Devanagari (Hindi/Marathi)
    ("bn-IN", r"[ঀ-৿]"),  # Bengali
    ("pa-IN", r"[਀-੿]"),  # Gurmukhi (Punjabi)
    ("gu-IN", r"[઀-૿]"),  # Gujarati
    ("ta-IN", r"[஀-௿]"),  # Tamil
    ("te-IN", r"[ఀ-౿]"),  # Telugu
    ("kn-IN", r"[ಀ-೿]"),  # Kannada
    ("ml-IN", r"[ഀ-ൿ]"),  # Malayalam
    ("od-IN", r"[଀-୿]"),  # Odia
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


# Romanization built from Unicode character names, which every Indic block
# follows ("DEVANAGARI LETTER KA", "MALAYALAM VOWEL SIGN AA"). No dependency,
# and it covers every script Sarvam can return rather than Devanagari alone —
# which matters, because the same word comes back in a different script on
# almost every noisy turn.
#
# Exists because entity names never arrive in Latin on a Hindi call. Call 842
# asked about "आर्या" and "महिंद्रा सीट आर्डल"; a Latin-token match against
# the catalog finds neither, so the agent answered from imagination and put
# Kalpataru Aria in Pune when it is in Karjat.
_ROMAN_CACHE: dict[str, str] = {}


def _roman_char(ch: str) -> str:
    if ch in _ROMAN_CACHE:
        return _ROMAN_CACHE[ch]
    try:
        name = unicodedata.name(ch)
    except ValueError:
        out = ch.lower() if ch.isalnum() else " "
    else:
        # "DEVANAGARI LETTER KA" -> KA ; "MALAYALAM VOWEL SIGN AA" -> AA
        if " LETTER " in name:
            out = name.rsplit(" LETTER ", 1)[1].lower()
        elif " VOWEL SIGN " in name:
            out = name.rsplit(" VOWEL SIGN ", 1)[1].lower()
        elif " SIGN VIRAMA" in name or name.endswith(" SIGN NUKTA"):
            out = ""  # virama kills the inherent vowel; nukta is a modifier
        elif " DIGIT " in name:
            out = ""
        else:
            out = " "
        # Names like "KSSA" / "VOCALIC R" carry extra words; keep letters only
        out = "".join(c for c in out if c.isalpha())
    _ROMAN_CACHE[ch] = out
    return out


def romanize(text: str | None) -> str:
    """Rough Latin rendering of Indic text — for MATCHING, not for display."""
    if not text:
        return ""
    return "".join(_roman_char(ch) for ch in text)


# Ordinary Hindi/Marathi conversation words that are long enough to survive
# the length guard below and close enough to a short project name to match it
# by sound. "बारे" ("about") scores 0.67 against "Aria" — the same ratio as
# "आर्या", the actual mention — so no threshold can separate them and they are
# excluded by identity instead.
_STOPWORD_SOURCES = [
    # Hindi / Marathi conversation filler, written in the script callers
    # actually use. Normalized through _match_form() below rather than guessed
    # in Latin: "मुझे" romanizes to "maujhae", not "mujhe", so a hand-written
    # Latin list silently failed to exclude it and it matched "Gahunje".
    "मुझे", "मेरा", "मेरी", "मेरे", "मला", "माझा", "माझी", "आपके", "आपका",
    "आपकी", "आप", "हमारे", "हमारा", "तुमच्या", "बारे", "में",
    "के", "का", "की", "को", "पर", "पास", "वाले", "लिए", "क्या", "कौन",
    "कहाँ", "कुठे", "नाम", "बताइए", "बताओ", "बताव", "सांगा", "चाहिए",
    "पाहिजे", "प्रोजेक्ट", "प्रॉपर्टी", "लोकेशन", "एरिया", "इलाके", "बजट",
    "अपार्टमेंट", "फ्लैट", "प्लॉट", "विला", "साइट", "विजिट", "अच्छा",
    "ठीक", "हाँ", "नहीं", "और", "भी", "तो", "था", "कुछ", "कोई", "सकते",
    "सकती", "करना", "करने", "पहले", "अभी", "यहाँ", "वहाँ", "देख", "रहा",
    "रहे", "रही", "करोड़", "लाख", "जल्दी", "थैंक",
    # and the English/Hinglish equivalents that reach us in Latin
    "project", "property", "location", "area", "budget", "apartment", "flat",
    "plot", "villa", "site", "visit", "name", "please", "thanks", "thank",
    "okay", "hello", "which", "where", "what", "about", "tell", "want",
    "need", "have", "here", "there", "crore", "lakh", "price", "detail",
    "details", "available", "possession",
]
_NAME_MATCH_STOPWORDS = set()


def _match_form(text: str | None) -> str:
    """Romanized, with runs of a repeated letter collapsed — the shape that
    survives both transliteration and mis-transcription."""
    roman = romanize(text).lower()
    roman = re.sub(r"([a-z])\1+", r"\1", roman)
    return re.sub(r"[^a-z]", "", roman)


_NAME_MATCH_STOPWORDS.update(f for f in (_match_form(w) for w in _STOPWORD_SOURCES) if f)

_MIN_NAME_MATCH_CHARS = 4
_NAME_MATCH_RATIO = 0.55


def _words(text: str | None) -> list[str]:
    return [w for w in re.split(r"[\s,.।?!\-]+", text or "") if w]


def match_score(a: str | None, b: str | None) -> float:
    """Best word-pair similarity between two names, 0.0 if nothing compares."""
    if not a or not b:
        return 0.0
    best = 0.0
    for wa in _words(a):
        fa = _match_form(wa)
        if len(fa) < _MIN_NAME_MATCH_CHARS or fa in _NAME_MATCH_STOPWORDS:
            continue
        for wb in _words(b):
            fb = _match_form(wb)
            if len(fb) < _MIN_NAME_MATCH_CHARS:
                continue
            best = max(best, 1.0 if fa == fb else difflib.SequenceMatcher(None, fa, fb).ratio())
    return best


def best_match(text: str | None, candidates: list[str]) -> str | None:
    """The candidate this text most plausibly names, or None.

    Scored rather than first-past-the-post: "Pimpri Chinchwad" clears the
    threshold against BOTH "Hinjewadi Rd" and "Pimpri", and taking whichever
    came first in the list canonicalized it to the wrong locality entirely.
    """
    scored = [(match_score(text, c), c) for c in candidates]
    scored = [(sc, c) for sc, c in scored if sc >= _NAME_MATCH_RATIO]
    return max(scored)[1] if scored else None


def sounds_like(a: str | None, b: str | None) -> bool:
    """Whether two names plausibly refer to the same thing across scripts.

    Compared word by word, because a caller says one word of a name inside a
    sentence ("आर्या के बारे में") and a locality can be two words
    ("पिंप्री चिंचवड़" against "Pimpri" and "Chinchwad") — whole-string
    comparison misses both.

    Tuned on the real mentions from calls 839 and 842: at 0.55 with a
    four-character floor it resolves आर्या->Aria, महिंद्रा->Mahindra,
    बानेर/బానేరు->Baner, पिंप्री->Pimpri, करजत->Karjat, and still refuses
    बांगर and ബാങ്ങി, which are too far gone to act on.
    """
    if not a or not b:
        return False
    for wa in _words(a):
        fa = _match_form(wa)
        if len(fa) < _MIN_NAME_MATCH_CHARS or fa in _NAME_MATCH_STOPWORDS:
            continue
        for wb in _words(b):
            fb = _match_form(wb)
            if len(fb) < _MIN_NAME_MATCH_CHARS:
                continue
            if fa == fb or difflib.SequenceMatcher(None, fa, fb).ratio() >= _NAME_MATCH_RATIO:
                return True
    return False


def fragment_languages(text: str | None, reply_language: str | None) -> set[str]:
    """Languages present in this turn ONLY as a stray minority-script fragment.

    Such a fragment is what a mis-transcription looks like, never a request.
    Call 839 turn 9 was "હા. अर्ली पजेशन में। ਸਹੀ ਹੈ।" — one Gujarati word and
    one Punjabi fragment inside a Hindi sentence — and the model called
    switch_reply_language("Gujarati") on it, taking the whole call into a
    language the caller then had to ask it to leave.

    Deliberately narrow, so genuine multilingual switching is untouched:

    - the turn must still be DOMINATED by the current language's own script,
      so a caller who really has switched (their whole turn in the new
      script) is not caught;
    - Latin is not a script here, so Hinglish never triggers it and a switch
      to English is never blocked;
    - digits are stripped first, for the same reason detect_reply_language
      strips them — native-script digits from a spoken price are not
      evidence of anything.

    Stateless on purpose. An earlier version of this computed the answer once
    per turn and stashed it for the tool to read, which is unsound: with
    preemptive generation the LLM can run — and call tools — before the
    per-turn hook has updated that state, so the tool could have been reading
    the PREVIOUS turn's flags.
    """
    if not text or not reply_language:
        return set()
    stripped = _DIGIT_PATTERN.sub("", text)
    counts = {code: len(pattern.findall(stripped)) for code, pattern in _SCRIPT_PATTERNS}
    present = {code: n for code, n in counts.items() if n}
    if not present:
        return set()
    dominant = max(present, key=present.get)
    # Devanagari is shared by Hindi and Marathi; compare on the script, not
    # the language, or a Marathi call would treat all its own text as foreign.
    def _script_of(code: str) -> str:
        return "hi-IN" if code in ("hi-IN", "mr-IN") else code

    if _script_of(reply_language) != dominant:
        return set()
    return {code for code in present if code != dominant}


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

# Catalog index lines look like:
#   "- Title [status] | by Developer | config | locality | from <price>"
# with the "by Developer" field present only when the title does not already
# carry the brand, and the price absent when the feed has none. So the
# locality is NOT at a fixed index — reading it positionally is how it broke
# the day the developer field was added: every row that gained one silently
# stopped matching its own locality, and "which projects in Baner" quietly
# lost 24K Altura and The Balmoral Hillside, both of which are in Baner.
_CATALOG_DEV_PREFIX = "by "


def catalog_fields(line: str) -> list[str]:
    """The line's fields after the title, with the optional developer removed."""
    parts = [p.strip() for p in (line or "").lstrip("- ").split("|")]
    return [p for p in parts[1:] if not p.lower().startswith(_CATALOG_DEV_PREFIX)]


def catalog_locality(line: str) -> str:
    """The locality field of a catalog index line, or ""."""
    fields = catalog_fields(line)
    return fields[1] if len(fields) >= 2 else ""


def catalog_rows_mentioned(text: str, catalog_index: str) -> list[str]:
    """Exact catalog lines for any item the caller just named.

    Matched phonetically across scripts, not on Latin tokens. Entity names
    never arrive in Latin on a Hindi call: call 842 asked about "आर्या" and
    "महिंद्रा सीट आर्डल", a Latin match found neither, and the agent invented
    an answer — placing Kalpataru Aria in Pune when it is in Karjat, and
    saying there was nothing in Karjat when Aria is exactly there.

    sounds_like() compares romanized word forms, which is what makes "आर्या"
    and "Aria" compare equal, and a name too mangled to resolve stays
    unmatched on purpose — the agent should ask rather than guess at it.

    Lives here rather than in main.py because tools.py needs it too, and a
    second copy of this parsing is exactly how the locality index drifted.
    """
    if not text or not catalog_index:
        return []
    lowered = text.lower()
    words = [w for w in re.split(r"[\s,.।?!]+", text) if w]
    rows = []
    for line in catalog_index.splitlines():
        title = line.lstrip("- ").split("|")[0].strip()
        if not title:
            continue
        # Latin still wins outright when the caller does say it in English.
        tokens = [t for t in re.findall(r"[A-Za-z]{4,}", title)]
        if tokens and any(t.lower() in lowered for t in tokens):
            rows.append(line.strip())
            continue
        # Otherwise compare the spoken words against the title's own words,
        # phonetically. Whole-title comparison drowns a one-word mention.
        title_words = [w for w in re.split(r"[\s\-]+", title) if len(w) > 3]
        if any(sounds_like(w, tw) for tw in title_words for w in words if len(w) > 2):
            rows.append(line.strip())
            continue
        # Also match on the row's LOCALITY. "Which projects do you have in
        # Karjat?" is the commonest question there is, and on call 842 the
        # agent answered "कर्जत में कोई लाइव प्रोजेक्ट उपलब्ध नहीं है" when
        # Kalpataru Aria is in Karjat — then described that same project as
        # being in Pune two turns later.
        loc_words = [
            w for w in re.split(r"[\s,\u2013\u2014-]+", catalog_locality(line))
            if len(w) > 3 and w.lower() not in ("pune", "maharashtra", "road")
        ]
        if any(sounds_like(w, lw) for lw in loc_words for w in words if len(w) > 2):
            rows.append(line.strip())
    return rows
