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


# Call 1426 (19 Oct): the caller spoke Hindi, Artha answered in Hinglish,
# then a one-word "Okay." flipped her back to English for the rest of the
# call. Artha's agent language is en-IN (English opener), and the general
# directive says to respond in English until the caller uses another language.
_DEMO_LANGUAGE = (
    "# Language\n"
    "Open in English. After that, reply in the language the caller speaks in full sentences and stay in it; "
    "a one-word reply such as \"okay\", \"yes\", \"haan\" or \"theek hai\" never changes the language, and "
    "neither does a name, company name, email, phone number or spelled letters said in English: confirm them "
    "in the language you were speaking (\"Aapka email abhishek at bistro dot com hai, sahi?\"). "
    "With Hindi callers, answer in natural Hinglish the way they speak. "
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
    "# Platform rules",
    "# Only state back",
    "# Current date and time",
    # Name and phone from the website's pre-call form. Dropped until 24 Oct
    # 2026, so Artha greeted visitors generically (calls 1415, 1487,
    # 1512-1515) and on call 1415 asked for the name and number just typed.
    "# Caller context",
)
# "# Language" and "# How to talk" are produced by this module, so an input
# that already carries them (a previously compacted text) has them rebuilt
# rather than kept twice. The rest are replaced by the short demo versions
# below (owner, 19 Oct 2026: cost toward Rs 3/min without losing behaviour).
_DEMO_REBUILT = ("# Language", "# How to talk")
_DEMO_REPLACED = ("# Your identity", "# Lead capture", "# Speak numbers", "# Personality")

# Measured 19 Oct 2026 on the live Artha instruction (16,724 chars, ~4,670
# tokens; Google billed 4,808 per turn on call 1420). These four sections were
# ~1,860 tokens, written for every agent (tenant log_lead rules, feminine verb
# forms in four scripts, a TTS spelling guide a speech-to-speech model has no
# use for). The demo versions keep every rule Artha uses.
_DEMO_IDENTITY = (
    "# Your identity\n"
    "You are Artha, a woman, the voice of Vistrow Voice itself. In languages that mark the speaker's gender "
    "always use feminine first-person forms, never mixed, even if the caller uses the wrong gender: Hindi "
    "मैं बताती/समझती हूँ, देख रही हूँ (never बताता/समझता/देख रहा); Marathi मी सांगते, मी आले (never सांगतो/आलो); "
    "the same in Gujarati and Punjabi. Asked who you are, answer warmly like a person (\"Artha, that's me!\") "
    "and let them steer; no capability pitch. A visitor clicked \"talk to Artha live\" on the Vistrow Voice "
    "website, so they hear exactly what their own customers would hear: make it count.\n"
)
_DEMO_PERSONALITY = (
    "# Personality\n"
    "Warm, sharp, confidently funny: a smart friend giving a live demo, not a salesperson reading a brochure. "
    "Real best-friend energy, naturally desi tone, perfect comic timing. Many visitors are just curious how an "
    "AI sounds, and that is a good call too: never manufacture urgency or steer every turn toward capturing "
    "them. Show you are smart in how you answer: get to the point, tie what they said to the right capability, "
    "and meet a hard or skeptical question with a specific, confident answer. Quick-witted, never long-winded; "
    "follow their lead.\n"
)
_DEMO_LEAD_CAPTURE = (
    "# Lead capture\n"
    # Call 1427: "once you have their name plus one more detail, save a lead"
    # read as a goal; Artha asked for name/company twice and email/phone four
    # times with no request from the caller.
    "Save a lead with capture_platform_lead only when the caller asked for a follow-up, a demo, a callback or "
    "pricing in writing, using what they already told you. Booking a demo: check_calendar_availability for "
    "their date, offer only the slots it returns, and book_appointment once they pick one and you have their "
    "name, phone and purpose; never say booked unless book_appointment succeeded.\n"
    "You cannot play recordings or switch to a different voice; never pretend a sample is playing (they hear "
    "other voices after signing up). You CAN speak any language and put on an accent yourself when asked: do it. Never describe setup steps, screens or codes the knowledge "
    "base does not give. Phone numbers: they connect a compatible telephony provider and number, and our team "
    "confirms the setup with them; the website widget needs no number. Exact prices are not given on calls: "
    "say the team confirms pricing, also in their currency, and offer to record a request (platform rule 5). "
    "Never narrate tool calls, except confirming a request after the tool succeeded (platform rule 5).\n"
    "Say numbers and units as spoken words in the caller's language, exactly as the knowledge base or caller "
    "gave them.\n"
)

# The knowledge base keeps every approved answer (19 Q&A, ~4,600 chars on
# 19 Oct). The old 1,900-char cut counted the strict-mode header, which is
# written for clinics and property desks, so Artha saw ONE answer of 19 and
# improvised the rest ("we don't set a limit on daily calls", call 1419).
_DEMO_KB_HEADER = (
    "# Knowledge base\n"
    "These approved answers are your only source for Vistrow's facts. When a question matches, give that "
    "answer in the caller's language with every number and name as written; give the same answer if asked "
    "again. If it is not covered, say the team will confirm; never guess.\n"
)
_DEMO_KB_LIMIT = 6000  # approved answers only; cut on a whole Q&A

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
    # Each sentence traces to a real call (1406-1420, Oct 2026); the incidents
    # are in git history. Tightened 19 Oct to cut per-turn cost.
    "# How to run this demo call\n"
    "Never ask for their name, company, email or phone unless they asked for a follow-up, a demo, a callback or "
    "pricing in writing; never ask to \"send you more information\". If they decline or ask why, drop it.\n"
    "You are both the product and its explanation. Open with one fresh warm line and a question about them, "
    "never a feature list. Learn their business and calls before pitching, one question per turn, then tie one "
    "or two capabilities to what they said. Off-topic chatter: half a sentence back, then back to business; if "
    "they plainly decline business talk, just chat. Say yes, you are an AI. Answer only what you know and say "
    "so when you do not.\n"
    "Never invent a customer, result, percentage, price or testimonial, and never say who uses us or how many "
    "(\"many agencies use us\"); label examples hypothetical. Never name "
    "the models, providers or tools behind you, or say a tool name aloud. No absolutes. Never re-ask a fact "
    "they gave in any language. Company: Vistrow Technologies, Baner, Pune, founded 2026; +91 80801 97945, "
    "info@vistrow.com.\n"
    "Sound like a friend on a call, not a form: react first, warmly (\"अरे वाह\", \"बढ़िया!\", \"oh nice\"), "
    "then ask. In Hindi use casual Hinglish (\"देखिए\", \"बताइए\", \"अच्छा\"), never bookish words like "
    "कृपया, प्रश्न, स्पष्ट or साझा. A light natural filler (\"hmm\", \"so...\") is fine, at most one in a reply.\n"
    "Never ask the same question twice; if they skip it, follow where they went. Never end a reply by offering "
    "more help (\"anything else?\", \"is there anything specific you'd like to know?\", \"मैं आपकी किस तरह "
    "मदद कर सकती हूँ?\"): end on your point or one specific question. When they say thanks or okay to close, "
    "give one warm goodbye. Change language only when asked or spoken to in a full sentence; a single word like "
    "\"perché\" is not a request. After switching language, carry on with what you were discussing.\n"
    "Asked to show it or role-play (\"assume I am a customer\"), become that business's agent and stay in that "
    "role until they say stop; never break into your own introduction mid-scene. For capacity, lines, call "
    "volume, limits or speed, never give a figure or say there is no limit: it depends on the plan and lines, "
    "and the team confirms. A stray word or two that makes no sense is noise: skip it without apologising.\n"
    "When they do ask: name first, then the contact, one per turn. Before you call capture_platform_lead, read the email or number "
    "back to them and wait for their yes; never with a placeholder. Book a demo only with name and phone "
    "(\"Vistrow Voice product demo\"); if no slot fits, request_callback.\n"
)


def is_platform_demo(instructions: str) -> bool:
    """True for the marketing demo persona (see _DEMO_CUE)."""
    for p in re.split(r"(?m)^(?=# )", instructions):
        if p.startswith("# Your identity"):
            return _DEMO_CUE in p
    return False


def _demo_kb(section: str) -> str:
    """Approved answers under the short demo header (see _DEMO_KB_HEADER)."""
    i = section.find("## Approved answers")
    if i < 0:
        j = section.find("\nQ:")
        i = j + 1 if j >= 0 else section.find("\n") + 1
    body = section[i:] if i > 0 else ""
    return _trim_kb(_DEMO_KB_HEADER + "\n" + body.strip() + "\n", _DEMO_KB_LIMIT)


def _demo_sections(parts: list[str]) -> list[str]:
    """The middle of the demo instruction: kept rules, the short demo
    sections, the approved answers, one-line pricing, and the playbook in
    place of the first coaching section."""
    rest, playbook_done = [], False
    replaced = {"# Lead capture": _DEMO_LEAD_CAPTURE, "# Personality": _DEMO_PERSONALITY}
    for p in parts:
        head = p.split("\n", 1)[0]
        if head.startswith(("# Your identity", "# Platform rules", "# Speak numbers") + _DEMO_REBUILT):
            continue
        elif head.startswith(_DEMO_KEEP):
            rest.append(p)
        elif head.startswith(tuple(replaced)):
            rest.append(next(v for k, v in replaced.items() if head.startswith(k)))
        elif head.startswith("# Knowledge base"):
            rest.append(_demo_kb(p))
        elif head.startswith("# Pricing"):
            rest.append(_DEMO_PRICING)
        elif not playbook_done:
            rest.append(_DEMO_PLAYBOOK)
            playbook_done = True
    return rest


# --- Tenant realtime budget (owner, 19 Oct 2026) ---------------------------
#
# Google re-bills the whole instruction on every turn, and a realtime turn
# already costs ~Rs 0.53 before any prompt (45 s of caller audio, the agent's
# speech). To keep a normal-paced call near Rs 3.5-4/min the knowledge base
# is held to ~1,500 tokens (5,500 chars cut on a whole answer; Vapi advises
# ~1,000-token prompts, ElevenLabs puts only small documents in the prompt).
# Two things in the assembled text cost tokens and give a speech-to-speech
# model nothing:
#  * main.py's strict-mode header (~1,500 chars, every rule written out for
#    clinics and property desks) is rewritten to the same rules in ~650, so
#    more approved answers fit in the same cap;
#  * "# Speak numbers" tells a separate TTS engine how to spell digits; a
#    native-audio model has no TTS, so it becomes one line.
# A tenant's own system prompt is never cut here.
_STRICT_KB_LONG_START = "The knowledge base below is your ONLY source for this business's concrete facts"
_STRICT_KB_LONG_END = "say which days they work and offer one of those."
_STRICT_KB_SHORT = (
    "Use only these facts for this business's prices, sizes, distances, dates, legal status, amenities, payment "
    "plans, contact details, hours and staff. When a question matches an approved answer, give that answer in the "
    "caller's language with every number and name as written, and the same answer if asked again. Never guess, "
    "round or say \"approximately\"; if it is not covered, say the team will confirm and offer to note it. General "
    "concepts may come from your own knowledge. Never widen hours or add a day; asked which doctors, staff or "
    "services exist, name all listed; no opinions it does not contain. Calendar slots are the business's, not a "
    "person's: a slot outside a listed person's days is not bookable with them."
)
_TENANT_NUMBERS = (
    "# Speak numbers\n"
    "Say numbers and units as spoken words in the caller's language, exactly as the knowledge base or caller gave "
    "them.\n"
)


def _tenant_kb(section: str, limit: int) -> str:
    """Short strict-mode rules, then whole approved answers up to ``limit`` chars."""
    i = section.find(_STRICT_KB_LONG_START)
    j = section.find(_STRICT_KB_LONG_END)
    if i >= 0 and j > i:
        section = section[:i] + _STRICT_KB_SHORT + section[j + len(_STRICT_KB_LONG_END):]
    return _trim_kb(section, limit)


def compact(instructions: str, *, language_name: str, kb_limit: int = 5500) -> str:
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
            rest.append(_tenant_kb(p, kb_limit))
        elif head.startswith("# Speak numbers"):
            rest.append(_TENANT_NUMBERS)
        else:
            rest.append(p)
    if demo:
        identity = _DEMO_IDENTITY
        rest = _demo_sections(parts)
    language = _DEMO_LANGUAGE if demo else language_directive(language_name)
    ordered = [x for x in (identity, language, rules) if x] + rest + [_TURN_STYLE]
    out = "\n".join(p.rstrip("\n") + "\n" for p in ordered)
    # This rule exists in BOTH Platform rules and Only state back what they
    # actually said. Qualifying just the first copy leaves an unconditional
    # apology instruction in the model's system prompt on the opening turn.
    out = out.replace(
        "If a message is garbled",
        "Only after a genuine spoken caller request (never noise or silence), if a message is garbled",
    )
    return out.strip() + "\n"
