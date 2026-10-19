"""Turn a caller's spoken or typed budget into rupees, for the dashboard's
pipeline value. Budgets arrive as free text in English, Hindi and Hinglish:
"eighty four lakh to one crore", "एक करोड़", "₹१०,००० से ₹२०,०००",
"INR 80,00,000 - 1,00,00,000", "2.4-2.8 करोड़", "around 60 lakhs".

parse_budget_inr returns (low, high) in rupees, or None when nothing
believable is there ("basic", "not mentioned"). A single amount is
(x, x). Values outside 1,000 to 1,000 crore are treated as misreads.
"""
from __future__ import annotations

import re
import unicodedata

_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")

_UNITS = {
    "crore": 10**7, "crores": 10**7, "cr": 10**7, "करोड़": 10**7, "करोड": 10**7, "करोड़": 10**7,
    "lakh": 10**5, "lakhs": 10**5, "lac": 10**5, "lacs": 10**5, "l": 10**5, "लाख": 10**5,
    "thousand": 10**3, "k": 10**3, "हजार": 10**3, "हज़ार": 10**3, "हज़ार": 10**3,
}

_ONES = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
}
_TENS = {"twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90}
# Hindi number words a caller is likely to say for a budget. Every number
# 1-99 has its own word in Hindi; these are the ones that appear in budgets.
_HINDI = {
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8,
    "नौ": 9, "दस": 10, "पंद्रह": 15, "बीस": 20, "पच्चीस": 25, "तीस": 30, "पैंतीस": 35, "चालीस": 40,
    "पैंतालीस": 45, "पचास": 50, "पचपन": 55, "साठ": 60, "पैंसठ": 65, "सत्तर": 70, "पचहत्तर": 75,
    "अस्सी": 80, "पचासी": 85, "नब्बे": 90, "पंचानवे": 95, "डेढ़": 1.5, "डेढ": 1.5, "ढाई": 2.5,
}
_HALF = ("and a half", "and half", "साढ़े", "साढे")


def _nfc(word: str) -> str:
    return unicodedata.normalize("NFC", word)


# Hindi has two encodings of ड़ (one code point, or ड + nukta); compare in one form.
_UNITS = {_nfc(k): v for k, v in _UNITS.items()}
_HINDI = {_nfc(k): v for k, v in _HINDI.items()}
_HALF = tuple(_nfc(h) for h in _HALF)
_RANGE_SPLIT = re.compile(r"\s+(?:to|se|से|till|upto|up to)\s+|\s*[-–—]\s*|\s*~\s*", re.IGNORECASE)
_MIN_INR, _MAX_INR = 1_000, 1_000 * 10**7
_FOREIGN = re.compile(r"[$€£¥]|\b(?:usd|eur|gbp|aed|dollars?|euros?|pounds?|dirhams?)\b", re.IGNORECASE)


def _words_to_number(words: list[str]) -> float | None:
    total, seen = 0.0, False
    for word in words:
        if word in _ONES:
            total += _ONES[word]
        elif word in _TENS:
            total += _TENS[word]
        elif word in _HINDI:
            total += _HINDI[word]
        elif word in ("hundred", "सौ"):
            total = (total or 1) * 100
        else:
            continue
        seen = True
    return total if seen else None


def _amount(part: str, fallback_unit: int | None) -> tuple[float | None, int | None]:
    """One side of a range: (rupees, the unit it used)."""
    text = part.strip().lower()
    half = any(h in text for h in _HALF)
    for h in _HALF:
        text = text.replace(h, " ")
    unit = None
    for token in re.findall(r"[a-z]+|[ऀ-ॿ]+", text):
        if token in _UNITS:
            unit = _UNITS[token]
    number = None
    digits = re.search(r"\d[\d,]*(?:\.\d+)?", text)
    if digits:
        number = float(digits.group().replace(",", ""))
    else:
        number = _words_to_number(re.findall(r"[a-z]+|[ऀ-ॿ]+", text))
    if number is None:
        return None, unit
    if half:
        number += 0.5
    scale = unit or fallback_unit
    return (number * scale if scale else number), unit


def parse_budget_inr(text: str | None) -> tuple[int, int] | None:
    if not text:
        return None
    clean = _nfc(str(text)).translate(_DEVANAGARI_DIGITS)
    # Another currency would be added to rupees as if it were rupees: skip it.
    if _FOREIGN.search(clean):
        return None
    clean = re.sub(r"(?i)\b(?:inr|rs\.?|rupees?|रुपए|रुपये|रुपया)\b|₹", " ", clean)
    clean = re.sub(r"(?i)\b(?:around|about|approx(?:imately)?|roughly|nearly|almost|करीब|लगभग|तक|ke|ka|the|budget)\b", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    if not clean:
        return None
    parts = [p for p in _RANGE_SPLIT.split(clean) if p.strip()][:2]
    # "2.4-2.8 करोड़": the unit is only on the right side; read that first.
    right, right_unit = _amount(parts[-1], None)
    left, _ = _amount(parts[0], right_unit) if len(parts) == 2 else (right, right_unit)
    values = [v for v in (left, right) if v is not None]
    if not values:
        return None
    low, high = min(values), max(values)
    if low < _MIN_INR or high > _MAX_INR:
        return None
    return round(low), round(high)


def budget_midpoint_inr(text: str | None) -> int | None:
    parsed = parse_budget_inr(text)
    return None if parsed is None else round((parsed[0] + parsed[1]) / 2)
