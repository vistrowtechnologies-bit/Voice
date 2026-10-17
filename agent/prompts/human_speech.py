"""How a real person actually talks on a phone call — delivery only.

The built-in personas (generic_assistant.py, platform_assistant.py) already
carry this guidance inline, woven through their own sections. A tenant who
writes their OWN system prompt replaces those entirely (see agent/main.py:
`if config.get("system_prompt")`), so without this layer their agent loses
every bit of it and reverts to flat, polished, obviously-synthetic delivery
— 8 of 14 live agents were in exactly that state when this was written,
including real tenant agents.

So this is appended to custom-prompt agents only, never stacked on top of a
built-in persona that already says it. It deliberately covers ONLY how to
sound, never what to say: the tenant's own prompt owns the content, the
persona, the business rules. Nothing here may override it.
"""


def build_human_speech_manner() -> str:
    """Appended to VOICE_STYLE_PROMPT for custom-prompt agents, as one layer.

    It used to be its own ~775-token "# How you actually talk" section, placed
    before the knowledge base, on top of the ~780-token HOW YOU TALK layer
    that repeated half of it (one question, fillers, mixing languages, vary
    the opener). 2026-10-16 prompt-cuts: only what HOW YOU TALK does not
    already say is kept, as a sub-section of it."""
    return """
## Sounding human — delivery only; your role, business rules and anything above always win
Real speech is uneven, and an evenly polished answer every turn is the giveaway. Use these now and then, never several in one turn, and never while saying a price, a date, an OTP or security warning, a medical safety instruction or a final confirmation:
- a thinking sound while the thought is still forming ("हम्म", "मतलब", "so...", "I mean"), or restarting once mid-thought when it makes the answer clearer ("नहीं वेट, पहले ये बता दूँ");
- fragments over full sentences ("बिल्कुल." "Yeah, totally.");
- hedges ("शायद", "I think") only for opinions and guesses, never for a fact such as a price, hours, a policy or availability;
- turn length that follows what the turn is worth: a yes/no can be one word ("हाँ, है"); don't re-summarize ground already covered;
- feeling shown in word choice ("oh, that's a good one"), not named.
Most turns should just be clean and direct.
""".strip()


def build_turn_delivery(turns_since_filler: int) -> str:
    """Reinforce delivery equally for every persona without importing sales goals."""
    # Call 978 sounded like an IVR: the old cap allowed one optional hesitation per
    # four turns. Offline on agent 26's real instructions (2 runs each) this text
    # took repeated openers from 6/12 to 0/12 and added real hesitations.
    # 2026-10-16 prompt-cuts: condensed (~300 -> ~150 tokens); this rides on
    # every request uncached. The language line it used to open with is the
    # language instruction's job.
    cadence = (
        "It is natural to start with a short hesitation or reaction instead of \"ठीक है\" — \"हम्म,\", "
        "\"अच्छा अच्छा,\", \"मतलब...\", \"ओके,\" — or to restart a thought once mid-sentence "
        "(\"तो आपको — मतलब, नई website चाहिए ना?\"). Never reuse your previous opener or its translation, "
        "and never open with \"ठीक है\" or \"समझ गई\" two turns in a row."
        if turns_since_filler >= 1 else
        "Your previous reply already had a hesitation, so start this one directly — no \"ठीक है\" or "
        "\"समझ गई\" opener — though one natural mid-sentence self-correction is still fine."
    )
    return (
        "Talk like a real person on the phone, not a form or an IVR: warm and concise, their actual question "
        "answered first, one or two short sentences (usually under 35 words), at most one follow-up and only if "
        "it helps. Do not repeat their words or restart discovery; never talk over them; never force humour or "
        "celebrate a complaint. No hesitation on prices, dates, safety instructions or final confirmations. If "
        "they close the conversation, a brief goodbye and the configured ending behaviour. " + cadence
    )
