"""The instruction text for a speech-to-speech (Gemini Live) agent.

The normal pipeline and the realtime model were handed the SAME ~35,000-character
instruction. Most of it is written for a separate text-to-speech voice and costs
money on every turn (Google re-bills the whole instruction each turn):

  * "Default language" / "Global languages" tell the agent to call
    switch_reply_language "because your voice's pronunciation is driven by that
    tool". A speech-to-speech model has no separate voice to steer.
  * "How you actually talk" coaches human-sounding disfluency (hmm, false
    starts, "I mean"); the native-audio model already does that, and the extra
    coaching showed up as stray "um..." / "mhm..." lines.
  * Rule 3 says "if a message is garbled, say you did not catch it". On the
    greeting turn nobody has spoken yet, and both Gemini 2.5 phone calls opened
    with exactly that apology instead of the greeting.

Google's guidance for Live (ai.google.dev/gemini-api/docs/live-api/best-practices):
persona (with the output language) first, rules in the order they happen, short
prompts, one persona. This module reshapes the assembled text for that, by
section heading, and does nothing to a pipeline agent.
"""
import re

# Sections written for a separate TTS voice or that duplicate another section.
_DROP = (
    "# How you actually talk",
    "# HOW YOU TALK",
    "# Default language",
    "# Global languages",
    # Same rule as "Platform rules" 1 and "Truthfulness about actions".
    "# Never claim something you have not actually done",
    # Delivery coaching for a separate TTS voice (fillers, hesitations,
    # quips). Native audio already speaks this way, and the coaching was
    # behind stray "um..." lines. Billed every turn: the platform demo spent
    # ~12,900 characters per turn on these four alone (10 Oct 2026). The few
    # rules in "Voice conversation rules" that matter are in _TURN_STYLE.
    "# Voice conversation rules",
    "# Sounding like a person",
    "# Natural speech imperfections",
    "# A few jokes to have in your back pocket",
)

_TURN_STYLE = (
    "# How to talk\n"
    "You are in a live voice conversation, so listen more than you talk. One sentence per turn by default, "
    "two at most, under about 35 spoken words. Ask one question at a time, then stop and let them answer. "
    "React briefly to what they actually said, then answer directly. If they start speaking, stop at once. "
    "Never repeat their words back to them, and never end every answer with \"anything else?\".\n"
    "Background sounds, echo, silence, and <noise> are not caller requests. Wait quietly for clear speech; "
    "do not apologise, ask for a repeat, or invent an answer because of noise alone. "
    "Greet once when asked to open the conversation. Do not repeat the greeting later. "
    "If interrupted, answer the caller's new request rather than restarting the previous reply.\n"
    "A borrowed English word or number inside the caller's sentence is not a request to change language. "
    "Do not say \"one moment\" or \"let me check\" unless a tool is actually about to run. "
    "Unclear or garbled turns are never a reason to end the call; ask one short clarifying question. "
    "When the caller says goodbye or that they are done, give one short goodbye and end the call.\n"
)

_LANGUAGE_TOOL_LINE = (
    "If the caller asks for another language, simply start speaking it in its own script. "
    "Do not call any tool to change language."
)


def language_directive(language_name: str) -> str:
    """Google's own wording for native-audio models (output language is set in the text, not by code)."""
    return (
        "# Language\n"
        f"RESPOND IN {language_name.upper()}. YOU MUST RESPOND UNMISTAKABLY IN {language_name.upper()} "
        "until the caller clearly uses, or asks for, another language; then follow the caller. "
        + _LANGUAGE_TOOL_LINE
        + "\n"
    )


def _trim_kb(section: str, limit: int) -> str:
    """Cut a knowledge-base section at a whole Q&A boundary, never mid-answer."""
    if len(section) <= limit:
        return section
    cut = section.rfind("\n\nQ:", 0, limit)
    if cut <= 0:
        cut = section.rfind("\n\n", 0, limit)
    return section[: cut if cut > 0 else limit].rstrip() + "\n"


def compact(instructions: str, *, language_name: str, kb_limit: int = 6000) -> str:
    """Reshape an assembled instruction for a speech-to-speech model."""
    parts = [p for p in re.split(r"(?m)^(?=# )", instructions) if p.strip()]
    identity, rules, rest = None, None, []
    for p in parts:
        head = p.split("\n", 1)[0]
        if head.startswith("# Your identity"):
            identity = p
        elif head.startswith("# Platform rules"):
            rules = p
        elif head.startswith(_DROP):
            continue
        elif head.startswith("# Knowledge base"):
            rest.append(_trim_kb(p, kb_limit))
        else:
            rest.append(p)
    ordered = [x for x in (identity, language_directive(language_name), rules) if x] + rest + [_TURN_STYLE]
    out = "\n".join(p.rstrip("\n") + "\n" for p in ordered)
    # This rule exists in BOTH Platform rules and Only state back what they
    # actually said. Qualifying just the first copy leaves an unconditional
    # apology instruction in the model's system prompt on the opening turn.
    out = out.replace(
        "If a message is garbled",
        "Only after a genuine spoken caller request (never noise or silence), if a message is garbled",
    )
    return out.strip() + "\n"
