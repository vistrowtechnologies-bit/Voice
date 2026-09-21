"""Did the caller just ask to be put through to a person?

The transfer tool is registered, the number is set, and the prompt tells the
agent to use it and never offer a callback instead — and the model still does
what it likes. Across three live calls with identical setup (2026-09-21):

  call 1035  refused outright: "transfer karna sambhav nahi hai"
  call 1037  called the tool correctly
  call 1049  promised a callback and hung up

A handoff is not a matter of taste. This decides it the way ringback and
carrier announcements are already decided — by looking at what was actually
said, not by asking the model to be consistent.

Deliberately narrow: a request has to name BOTH an action (connect, transfer,
put me through, talk to) AND a person (human, agent, someone, insaan, aadmi,
team member). "Connect my website to the domain" names an action and no
person, so it is not a handoff. A false positive hands a caller to a colleague
who was not expecting them; a false negative just leaves today's behaviour.
"""

import re

# Hindi is written three ways by the same speaker on the same call —
# Devanagari, romanised, and English — so all three appear here.
_ACTION = r"""(?:
      connect|transfer|patch|forward|redirect
    | put\s+me\s+(?:through|on)
    | (?:speak|talk|baat)\s*(?:to|with|kar|karni|karna|karaao|karao|kara)?
    | जोड़|कनेक्ट|ट्रांसफर|बात\s*कर|बात\s*करा|मिला
)"""

_PERSON = r"""(?:
      human|person|people|someone|somebody|anyone
    | agent|executive|representative|rep\b|manager|supervisor|operator
    | team\s*member|team\s*lead|staff|colleague|senior
    | real\s+(?:person|human|guy)|actual\s+person
    | insaan|insan|aadmi|admi|banda|vyakti|koi\s+(?:aur|insaan|banda)
    | इंसान|आदमी|व्यक्ति|एजेंट|मैनेजर|टीम|बंदा|किसी\s+से|कोई\s+इंसान
    # Callers switch script mid-sentence: "रियल पर्सन", "ह्यूमन", "एजेंट".
    | पर्सन|ह्यूमन|पर्सनल\s*एजेंट|स्टाफ
    | सुमन|शुभमन   # names an operator may ask for by mistranscription
)"""

_ACTION_RE = re.compile(_ACTION, re.IGNORECASE | re.VERBOSE)
_PERSON_RE = re.compile(_PERSON, re.IGNORECASE | re.VERBOSE)

# Said ABOUT a transfer rather than asking for one — the agent's own words
# echoed back, or a caller declining.
_NOT_A_REQUEST = re.compile(
    r"(?:don'?t|do\s+not|no\s+need|mat\s+karo|nahi\s+chahiye|नहीं\s+चाहिए|मत\s+कर)"
    r".{0,24}(?:connect|transfer|कनेक्ट|ट्रांसफर)"
    r"|(?:connect|transfer|कनेक्ट|ट्रांसफर).{0,24}(?:nahi|not|mat|नहीं|मत)",
    re.IGNORECASE,
)


def wants_human(text: str) -> bool:
    """True when this utterance is asking to be handed to a person."""
    if not text:
        return False
    cleaned = " ".join(str(text).split())
    if len(cleaned) > 300:
        # A long monologue that happens to contain both words is not a
        # request; a real one is short and direct.
        return False
    if _NOT_A_REQUEST.search(cleaned):
        return False
    return bool(_ACTION_RE.search(cleaned) and _PERSON_RE.search(cleaned))
