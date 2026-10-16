"""Standard lead facts for every call: what the CALLER said about budget,
purpose, property and timing, in the shape ArthaLeads maps onto a lead
(backend/constants/leadOptions.js: PROPERTY_TYPE, BHK, PURPOSE).

Why this exists (call 1392, 16 Oct 2026): the caller gave a 1 crore budget,
self-use and a 2000 sq ft plot; only `configuration` reached the calls row and
ArthaLeads, because extracted_data carried just the three log_lead extras and
the agent had no post_call_fields. Budget stayed "Not captured".

The post-call LLM pass returns the caller's budget WORDS (budget_text); the
INR numbers come only from parse_inr_budget, so an amount the caller never
said cannot appear.
"""
from __future__ import annotations

import json
import logging
import os
import re
import unicodedata

logger = logging.getLogger(__name__)

PURPOSES = ("Buy", "Invest")
PROPERTY_TYPES = ("Apartment", "Villa", "Plot", "Commercial", "Office", "Penthouse", "Other")
BHKS = ("1BHK", "2BHK", "3BHK", "4BHK", "5BHK+", "Studio")

# ---------------------------------------------------------------------------
# Budget words -> INR integers (deterministic, no LLM)
# ---------------------------------------------------------------------------

_UNITS = {
    "crore": 10_000_000, "crores": 10_000_000, "cr": 10_000_000, "cror": 10_000_000,
    "karod": 10_000_000, "karor": 10_000_000, "करोड": 10_000_000,
    "lakh": 100_000, "lakhs": 100_000, "lac": 100_000, "lacs": 100_000, "lakh's": 100_000,
    "l": 100_000, "लाख": 100_000,
    "thousand": 1_000, "hazar": 1_000, "hazaar": 1_000, "हजार": 1_000, "k": 1_000,
}

# Whole numbers as words. Hindi/Hinglish budgets are almost always one of
# these (1-20 and the round fives); anything else is left unparsed rather
# than guessed.
_NUMBER_WORDS = {
    # Hindi (normalised: nukta removed, chandrabindu -> anusvara)
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "छह": 6, "छः": 6, "छे": 6,
    "सात": 7, "आठ": 8, "नौ": 9, "दस": 10, "ग्यारह": 11, "बारह": 12, "तेरह": 13,
    "चौदह": 14, "पंद्रह": 15, "पन्द्रह": 15, "सोलह": 16, "सत्रह": 17, "अठारह": 18,
    "उन्नीस": 19, "बीस": 20, "पच्चीस": 25, "तीस": 30, "पैंतीस": 35, "चालीस": 40,
    "पैंतालीस": 45, "पचास": 50, "पचपन": 55, "साठ": 60, "पैंसठ": 65, "सत्तर": 70,
    "पचहत्तर": 75, "अस्सी": 80, "पचासी": 85, "नब्बे": 90, "पचानवे": 95,
    # Hinglish
    "ek": 1, "do": 2, "teen": 3, "tin": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5,
    "chhe": 6, "che": 6, "saat": 7, "aath": 8, "nau": 9, "das": 10, "bees": 20, "bis": 20,
    "pachees": 25, "pachchis": 25, "tees": 30, "chalis": 40, "chaalis": 40,
    "pachas": 50, "pachaas": 50, "saath": 60, "sattar": 70, "assi": 80, "nabbe": 90,
    # English
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "fifteen": 15, "twenty": 20, "thirty": 30,
    "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
_FRACTION_WORDS = {
    "डेढ": 1.5, "ढाई": 2.5, "आधा": 0.5,
    "dedh": 1.5, "derh": 1.5, "dhai": 2.5, "dhaai": 2.5, "adhai": 2.5, "half": 0.5,
}
# "साढ़े तीन" = 3.5, "सवा दो" = 2.25, "पौने दो" = 1.75
_MODIFIERS = {
    "साढे": 0.5, "saade": 0.5, "sade": 0.5, "sadhe": 0.5,
    "सवा": 0.25, "sava": 0.25, "sawa": 0.25,
    "पौने": -0.25, "paune": -0.25,
}
_RANGE_SEPARATORS = {"to", "-", "–", "—", "~", "/", "se", "से", "and", "or", "और", "या", "between"}

_TOKEN_RE = re.compile(r"\d[\d,]*(?:\.\d+)?|[ऀ-ॿ]+|[a-z']+|[-–—~/]")
_DEVANAGARI_DIGITS = str.maketrans("०१२३४५६७८९", "0123456789")


def _normalise(text: str) -> str:
    # NFD splits precomposed nukta letters (ड़ -> ड + ़); then the nukta goes,
    # and chandrabindu becomes anusvara, so "करोड़"/"करोड़" and "पाँच"/"पांच" match.
    text = unicodedata.normalize("NFD", text or "").replace("़", "").replace("ँ", "ं")
    return unicodedata.normalize("NFC", text).translate(_DEVANAGARI_DIGITS).lower()


def parse_inr_budget(text: str) -> tuple[int | None, int | None]:
    """(budget_min, budget_max) in INR from a caller's budget words, or
    (None, None) when no amount can be read with certainty.

    "एक करोड़" -> (10000000, 10000000); "80 lakh to 1 crore" -> (8000000,
    10000000); "1-1.5 cr" -> (10000000, 15000000); "1 crore 20 lakh" ->
    (12000000, 12000000). A bare number counts only when it is already a
    rupee amount (>= 10,000); "80" with no unit is ambiguous and dropped.
    """
    tokens = _TOKEN_RE.findall(_normalise(text))
    # Each amount: [value, unit multiplier or None, separator-before?]
    amounts: list[list] = []
    separator_seen = False
    pending_modifier = 0.0
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        value = None
        if tok[0].isdigit():
            try:
                value = float(tok.replace(",", ""))
            except ValueError:
                value = None
        elif tok in _NUMBER_WORDS:
            value = float(_NUMBER_WORDS[tok])
        elif tok in _FRACTION_WORDS:
            value = _FRACTION_WORDS[tok]
        elif tok in _MODIFIERS:
            pending_modifier = _MODIFIERS[tok]
            i += 1
            continue
        if value is not None:
            value += pending_modifier
            pending_modifier = 0.0
            # "one and a half", "1 and half"
            if tokens[i + 1:i + 4] == ["and", "a", "half"]:
                value, i = value + 0.5, i + 3
            elif tokens[i + 1:i + 3] == ["and", "half"]:
                value, i = value + 0.5, i + 2
            amounts.append([value, None, separator_seen])
            separator_seen = False
        elif tok in _UNITS and amounts and amounts[-1][1] is None and not separator_seen:
            amounts[-1][1] = _UNITS[tok]
        elif tok in _RANGE_SEPARATORS:
            separator_seen = True
        i += 1

    # A unitless figure takes the unit of the next one across a range
    # separator: "50 se 60 lakh", "1-1.5 crore".
    for idx in range(len(amounts) - 2, -1, -1):
        if amounts[idx][1] is None and amounts[idx + 1][2] and amounts[idx + 1][1] is not None:
            amounts[idx][1] = amounts[idx + 1][1]

    rupees: list[float] = []
    prev_unit = None
    for value, unit, after_separator in amounts:
        if unit is None:
            if value < 10_000:
                prev_unit = None
                continue
            unit = 1
        amount = value * unit
        # "1 crore 20 lakh": a smaller unit straight after a bigger one, with
        # no "to"/"se" between them, is one amount, not a range.
        if rupees and not after_separator and prev_unit and unit < prev_unit:
            rupees[-1] += amount
        else:
            rupees.append(amount)
        prev_unit = unit
    if not rupees:
        return None, None
    return int(round(min(rupees))), int(round(max(rupees)))


# ---------------------------------------------------------------------------
# Mid-call (log_lead) values in the same shape
# ---------------------------------------------------------------------------

def normalise_purpose(text: str) -> str | None:
    t = _normalise(text)
    if not t:
        return None
    if any(w in t for w in ("invest", "निवेश", "इन्वेस्ट", "rental income", "return")):
        return "Invest"
    if any(w in t for w in (
        "buy", "self", "own use", "end use", "end-use", "khud", "rehne", "living", "to live",
        "second home", "family", "खुद", "रहने", "सेल्फ", "स्वयं",
    )):
        return "Buy"
    return None


_PROPERTY_ALIASES = {
    "apartment": "Apartment", "flat": "Apartment", "फ्लैट": "Apartment",
    "villa": "Villa", "bungalow": "Villa", "विला": "Villa",
    "plot": "Plot", "land": "Plot", "प्लॉट": "Plot", "प्लाट": "Plot",
    "commercial": "Commercial", "shop": "Commercial", "office": "Office",
    "penthouse": "Penthouse",
}


def normalise_property_type(text: str) -> str | None:
    t = _normalise(text)
    for alias, value in _PROPERTY_ALIASES.items():
        if alias in t:
            return value
    return None


def bhk_from_configuration(text: str) -> str | None:
    t = _normalise(text)
    if "studio" in t or re.search(r"\b1\s*rk\b", t):
        return "Studio"
    m = re.search(r"(?<![\d.])(\d)\s*-?\s*bhk", t)
    if not m:
        return None
    n = int(m.group(1))
    if n < 1:
        return None
    return "5BHK+" if n >= 5 else f"{n}BHK"


def mid_call_facts(lead_data: dict) -> dict:
    """What log_lead / send_brochure captured during the call, in the
    standard shape. Unrecognised purpose/property text is kept as said, so
    the Vistrow call page still shows it (ArthaLeads ignores values outside
    its vocabulary)."""
    out: dict = {}
    if (v := str(lead_data.get("property_type") or "").strip()):
        out["property_type"] = normalise_property_type(v) or v
    if (v := str(lead_data.get("configuration") or "").strip()):
        out["configuration"] = v
        if (bhk := bhk_from_configuration(v)):
            out["bhk"] = bhk
    if (v := str(lead_data.get("purpose") or "").strip()):
        out["purpose"] = normalise_purpose(v) or v
    if (v := str(lead_data.get("budget") or "").strip()):
        out["budget_text"] = v
        lo, hi = parse_inr_budget(v)
        if lo is not None:
            out["budget_min"], out["budget_max"] = lo, hi
    if (v := str(lead_data.get("location") or "").strip()):
        out["preferred_location"] = v
    if (v := str(lead_data.get("timeline") or "").strip()):
        out["timeline"] = v
    if lead_data.get("brochure_requested"):
        out["brochure_requested"] = True
        if (v := str(lead_data.get("brochure_project") or "").strip()):
            out["brochure_project"] = v
    return out


def _empty(value) -> bool:
    return value is None or value == "" or value == [] or value == {}


def merge_facts(mid_call: dict, post_call: dict) -> dict:
    """The call's extracted_data: the post-call read wins, and a mid-call
    value stands only where the post-call read returned nothing for that
    key. brochure_requested is kept only when True."""
    merged = dict(mid_call)
    for key, value in (post_call or {}).items():
        if _empty(value) and key in merged:
            continue
        merged[key] = value
    if merged.get("brochure_requested") is not True:
        merged.pop("brochure_requested", None)
        merged.pop("brochure_project", None)
    return merged


# ---------------------------------------------------------------------------
# Post-call LLM pass
# ---------------------------------------------------------------------------

# Plain strings with "" for "not stated", the same shape as the server's
# strict call_intelligence schema already running on gpt-5.4-mini (no
# nullable types, no null inside an enum).
def _text(enum: tuple | None = None) -> dict:
    spec: dict = {"type": "string"}
    if enum:
        spec["enum"] = [*enum, ""]
    return spec


RESPONSE_FORMAT = {"type": "json_schema", "json_schema": {"name": "lead_facts", "strict": True, "schema": {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "budget_text", "purpose", "property_type", "bhk", "configuration",
        "preferred_location", "timeline", "brochure_requested", "summary", "key_points",
    ],
    "properties": {
        "budget_text": _text(),
        "purpose": _text(PURPOSES),
        "property_type": _text(PROPERTY_TYPES),
        "bhk": _text(BHKS),
        "configuration": _text(),
        "preferred_location": _text(),
        "timeline": _text(),
        "brochure_requested": {"type": "boolean"},
        "summary": {"type": "string"},
        "key_points": {"type": "array", "items": {"type": "string"}},
    },
}}}

SYSTEM_PROMPT = (
    "You read a phone/web call transcript between our AGENT (sales assistant for the business) "
    "and a CALLER (a prospective customer), and record what the CALLER said. The transcript may "
    "be Hindi, English, Hinglish or another Indian language and comes from speech recognition, "
    "so it can contain mistakes.\n"
    "Rules:\n"
    "- Only facts the CALLER stated or clearly confirmed. Never take a fact from the agent's "
    "pitch or questions alone. If the caller only said yes to the agent's question, the fact "
    "counts only when the question itself stated it. Use \"\" (empty) when not stated.\n"
    "- budget_text: the caller's budget exactly as they said it, in their own words and script, "
    "including range words (e.g. \"एक करोड़\", \"80 lakh to 1 crore\", \"डेढ़ करोड़ तक\"). Do NOT "
    "convert it to a number.\n"
    "- purpose: \"Buy\" for own use / self use / to live in / future own use / second home; "
    "\"Invest\" for investment / rental returns. \"\" if not said.\n"
    "- property_type: Apartment (flat), Villa, Plot, Commercial, Office, Penthouse or Other. "
    "If the caller is enquiring about the property the call is about and its type is clear from "
    "the conversation (e.g. the project being discussed is plots and the caller is interested), "
    "use that type.\n"
    "- bhk: only for flats/villas, when a BHK is said.\n"
    "- configuration: size/layout in short English, e.g. \"2000 sq ft and above\", \"3 BHK\".\n"
    "- preferred_location: an area or city the CALLER named as where they want to buy (e.g. "
    "\"Hinjewadi\", \"near Khopoli station\"). Never the name of the project or developer the call "
    "is about, never the town or area inside that project's name (a \"Khopoli\" project does "
    "not make Khopoli the caller's preference), and never a place only the agent said. Only a "
    "place in the CALLER's own lines counts. Write it in English letters "
    "(\"Panvel or Karjat\", not Devanagari). \"\" if the caller named no place.\n"
    "- timeline: short English, as the caller said it.\n"
    "- brochure_requested: true if the caller asked for a brochure, details, photos or a price "
    "list to be sent (e.g. on WhatsApp), OR the agent offered or promised to send one and the "
    "caller agreed (yes / ha / जी / ok) and did not refuse. false if the caller declined or it "
    "never came up. One unclear or garbled line alone is not a request.\n"
    "- summary: 1-3 sentences in English about the caller and what they want.\n"
    "- key_points: up to 5 short English points a salesperson should know."
)


def _convo(transcript: list[dict]) -> str:
    lines = []
    for turn in transcript or []:
        text = (turn.get("text") or "").strip()
        if not text or turn.get("role") not in ("user", "assistant"):
            continue
        lines.append(f"{'CALLER' if turn.get('role') == 'user' else 'AGENT'}: {text}")
    return "\n".join(lines)[:8000]


def facts_from_response(data: dict) -> tuple[dict, dict]:
    """(facts, notes) from the model's JSON, re-validated here so a value
    outside the vocabulary never leaves this module."""
    facts: dict = {}
    if not isinstance(data, dict):
        return facts, {}
    budget_text = str(data.get("budget_text") or "").strip()
    if budget_text:
        facts["budget_text"] = budget_text
        lo, hi = parse_inr_budget(budget_text)
        if lo is not None:
            facts["budget_min"], facts["budget_max"] = lo, hi
    for key, allowed in (("purpose", PURPOSES), ("property_type", PROPERTY_TYPES), ("bhk", BHKS)):
        if data.get(key) in allowed:
            facts[key] = data[key]
    for key in ("configuration", "preferred_location", "timeline"):
        if (v := str(data.get(key) or "").strip()):
            facts[key] = v
    if isinstance(data.get("brochure_requested"), bool):
        facts["brochure_requested"] = data["brochure_requested"]
    notes: dict = {}
    if (summary := str(data.get("summary") or "").strip()):
        notes["summary"] = summary
    points = [str(p).strip() for p in (data.get("key_points") or []) if str(p).strip()]
    if points:
        notes["key_points"] = points[:5]
    return facts, notes


async def extract_lead_facts(transcript: list[dict]) -> tuple[dict, dict]:
    """One post-call pass: (facts, {"summary", "key_points"}). Best-effort:
    ({}, {}) on any failure, and nothing is called when the caller never
    spoke. Same model and settings as main._post_call_analysis."""
    if not any(t.get("role") == "user" and (t.get("text") or "").strip() for t in transcript or []):
        return {}, {}
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {}, {}
    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        resp = await client.chat.completions.create(
            model="gpt-5.4-mini",
            reasoning_effort="none",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": _convo(transcript)},
            ],
            response_format=RESPONSE_FORMAT,
            temperature=0,
        )
        return facts_from_response(json.loads(resp.choices[0].message.content or "{}"))
    except Exception:
        logger.warning("lead facts extraction failed", exc_info=True)
        return {}, {}
