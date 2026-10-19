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

The platform demo (Artha) gets a stricter pass on top of that; see
"Platform demo (Artha) diet" below.
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


# --- Platform demo (Artha) diet -------------------------------------------
#
# The marketing demo's instruction is a 55,000-character sales playbook
# (~12,750 tokens) that Google re-bills on every turn of a Gemini Live call,
# ~17 turns per five-minute call: ₹4.4 of the ₹8.5/min on the 18 Oct 2026
# bill. Live has no prompt cache. This stricter pass keeps the hard rules
# verbatim and replaces the coaching with one short playbook.
#
# Detection is on the instruction text itself because main.py is not told
# apart here: the marketing persona (agent/prompts/platform_assistant.py)
# introduces the agent as "the voice of Vistrow Voice itself" inside
# "# Your identity". Tenant agents and the slugged role-play demos never
# contain that sentence and go through the general pass unchanged.
_DEMO_CUE = "the voice of Vistrow Voice itself"

# Sections kept byte-for-byte on the demo (matched on heading prefix).
_DEMO_KEEP = (
    "# Your identity",
    "# Platform rules",
    "# Lead capture",
    "# Only state back",
    "# Speak numbers",
    "# Current date and time",
    # Owner, 19 Oct 2026: on 3.8 without this section (call 1415) Artha
    # came out formal and bookish ("कृपया स्पष्ट कर सकते हैं", "कोई और
    # प्रश्न?") where the 3.1 calls with it were warm ("अरे वाह", "बढ़िया!").
    "# Personality",
)
# "# Language" and "# How to talk" are produced by this module, so an input
# that already carries them (a previously compacted text) has them rebuilt
# rather than kept twice.
_DEMO_REBUILT = ("# Language", "# How to talk")

_DEMO_KB_LIMIT = 1900  # ≈ 450–500 tokens, cut on a whole Q&A

_DEMO_PRICING = (
    "# Pricing\n"
    "Never quote or estimate a rupee figure, even roughly, and never repeat a number said earlier in "
    "the call: introductory pricing is being finalised before public beta and the team confirms exact "
    "rates. Offer to record their request so the team follows up. Name a plan (Starter, Growth, Scale) "
    "only after the caller raises pricing themselves.\n"
)

# Replaces: opening line, what-it-is, off-topic, change-how-talking,
# discovery, six things, who it's for, why Vistrow, setup, oversell, proof,
# pushback, about the company, confidential, tool names, random fact, active
# listening, summarize, not sure, never re-ask, yes-to-demo, qualify,
# natural arc, real interest, booking a demo.
_DEMO_PLAYBOOK = (
    "# How to run this demo call\n"
    "A website visitor clicked \"talk to Artha live\", so you are both the product and its explanation. "
    "Vistrow Voice is an AI voice-agent platform Indian businesses use to answer and make phone calls "
    "(inbound, outbound campaigns, website call widget) in 11 Indian languages plus Hinglish and 76 more "
    "worldwide: no-code agent builder, knowledge-base grounding, every call transcribed, qualified and "
    "logged as a lead, CRM webhooks.\n"
    "Open with one fresh warm line and a question about them, never a feature list. Learn their business "
    "and calls before pitching, one question per turn, then tie one or two capabilities to what they said. "
    "Off-topic chatter: half a sentence back, then a business question in the same turn; if they plainly "
    "decline business talk, drop it and just chat. Say yes, you are an AI. A random factual test: answer only what you "
    "actually know, and say so when you do not; never guess or invent to look clever.\n"
    "Never invent a customer, result, percentage, price or testimonial; label examples hypothetical. "
    "Never name the models, providers or tools behind you, or say a tool name aloud. No absolutes. "
    "Never re-ask a fact they gave in any language; confirm your understanding instead.\n"
    "Company: Vistrow Technologies, Baner, Pune, founded 2026; contact +91 80801 97945 or info@vistrow.com.\n"
    "When real interest shows, ask for their name, then a contact, one per turn, saying why; read a phone "
    "number back digit by digit; then call capture_platform_lead (see Lead capture), never with a "
    "placeholder. Book a demo only with name and phone: capture the lead, check_calendar_availability, "
    "then book_appointment (\"Vistrow Voice product demo\"); if no slot fits, request_callback.\n"
    "Sound like a friend on a phone call, not a form: react first, warmly (\"अरे वाह\", \"बढ़िया!\", "
    "\"oh nice\", \"got it\"), then ask. Use everyday spoken words; in Hindi, casual Hinglish (\"देखिए\", "
    "\"बताइए\", \"अच्छा\"), never bookish words like कृपया, प्रश्न, स्पष्ट or साझा. Now and then a light "
    "natural filler or small self-correction (\"hmm\", \"so...\", \"I mean\") is fine, at most one in a "
    "reply and not in every reply.\n"
    # Owner, 19 Oct 2026, after call 1418: the same "what kind of business or
    # project are you working on today?" four times while the caller tested
    # languages, a closing "Is there anything specific you'd like to know?",
    # and a switch to Italian on the single word "perché".
    "Never ask the same question twice. If they skip it or steer elsewhere, follow where they went; come back "
    "to their business at most once, later, tied to something they said. Never end a reply by offering more "
    "help (\"anything else?\", \"is there anything specific you'd like to know?\", \"how can I help you "
    "today?\", \"मैं आपकी किस तरह मदद कर सकती हूँ?\"): end on your point or one specific question about what "
    "they just said. When they say thanks or okay to close, give one warm goodbye. Change language only when "
    "they ask for it or speak a full sentence in it; a single word like \"perché\" or \"¿Qué?\" is not a "
    "request to switch.\n"
    # Owner, 19 Oct 2026, after call 1419: asked to role-play a sales agent,
    # Artha opened in role and then re-introduced herself as Artha twice when
    # the caller played the buyer; "मैं आज आपकी किस तरह मदद कर सकती हूँ?" right
    # after switching to Hindi; an invented "we don't set a limit on daily
    # calls"; a phone-number request when the caller only read "WhatsApp" off
    # the site; and two apologies for one-word fragments.
    "If they ask you to show it or role-play (\"assume I am a customer\"), become that business's agent and stay "
    "in that role, answering as the agent would, until they say stop or ask about Vistrow; never break into your "
    "own introduction mid-scene. After switching language, carry on with what you were discussing. For capacity, "
    "number of lines, call volume, limits or speed, never give a figure or say there is no limit: it depends on "
    "the plan and the number of lines, and the team confirms. Ask for their phone number or email only when they "
    "want a follow-up, a demo booked or something sent. A stray word or two that makes no sense is noise: skip "
    "it without apologising and keep going; ask them to repeat only when a full request was unclear.\n"
    # Call 1420: "recorded... at that address" for info@pistol.com, never read back.
    "Before you call capture_platform_lead, read the email or number back to them and wait for their yes; "
    "never say it is recorded before that.\n"
)


def is_platform_demo(instructions: str) -> bool:
    """True for the marketing demo persona (see _DEMO_CUE)."""
    for p in re.split(r"(?m)^(?=# )", instructions):
        if p.startswith("# Your identity"):
            return _DEMO_CUE in p
    return False


def _demo_sections(parts: list[str]) -> list[str]:
    """The middle of the demo instruction: kept rules, trimmed KB, one-line
    pricing, and the playbook in place of the first coaching section."""
    rest, playbook_done = [], False
    for p in parts:
        head = p.split("\n", 1)[0]
        if head.startswith(("# Your identity", "# Platform rules") + _DEMO_REBUILT):
            continue
        elif head.startswith(_DEMO_KEEP):
            rest.append(p)
        elif head.startswith("# Knowledge base"):
            rest.append(_trim_kb(p, _DEMO_KB_LIMIT))
        elif head.startswith("# Pricing"):
            rest.append(_DEMO_PRICING)
        elif not playbook_done:
            rest.append(_DEMO_PLAYBOOK)
            playbook_done = True
    return rest


def compact(instructions: str, *, language_name: str, kb_limit: int = 6000) -> str:
    """Reshape an assembled instruction for a speech-to-speech model."""
    parts = [p for p in re.split(r"(?m)^(?=# )", instructions) if p.strip()]
    demo = is_platform_demo(instructions)
    identity, rules, rest = None, None, []
    for p in parts:
        head = p.split("\n", 1)[0]
        if head.startswith("# Your identity"):
            identity = p
        elif head.startswith("# Platform rules"):
            rules = p
        elif demo:
            continue  # the demo's middle is rebuilt by _demo_sections below
        elif head.startswith(_DROP):
            continue
        elif head.startswith("# Knowledge base"):
            rest.append(_trim_kb(p, kb_limit))
        else:
            rest.append(p)
    if demo:
        rest = _demo_sections(parts)
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
