import re

# Lightweight, latency-free heuristic — no extra LLM round-trip. Good enough
# to catch clearly frustrated/angry phrasing; not a full sentiment model.
_FRUSTRATION_WORDS = [
    # English
    "angry",
    "frustrated",
    "frustrating",
    "annoyed",
    "annoying",
    "ridiculous",
    "useless",
    "terrible",
    "horrible",
    "worst",
    "hate",
    "sick of",
    "fed up",
    "waste of time",
    "unacceptable",
    "stupid",
    "pathetic",
    "scam",
    "cheat",
    "fraud",
    "shut up",
    "forget it",
    "nonsense",
    "rubbish",
    # Hinglish / Hindi (transliterated)
    "bakwas",
    "faltu",
    "bekar",
    "pareshan",
    "gussa",
    "ghatiya",
    "bewakoof",
    "time waste",
]

_WORD_PATTERNS = [re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE) for word in _FRUSTRATION_WORDS]


def is_frustrated(text: str | None) -> bool:
    """Heuristic frustration/anger detector for the caller's last utterance.

    Checks for known frustration/anger phrasing, shouting (ALL CAPS), or
    repeated punctuation (multiple `!`/`?`) as a fast, latency-free signal
    for whether the agent should shift into a calmer, slower delivery.
    """
    if not text:
        return False

    if any(pattern.search(text) for pattern in _WORD_PATTERNS):
        return True

    letters = [c for c in text if c.isalpha()]
    if len(letters) >= 6 and sum(1 for c in letters if c.isupper()) / len(letters) > 0.7:
        return True

    if text.count("!") >= 2 or text.count("?") >= 2:
        return True

    return False
