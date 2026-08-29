"""Replay the real failing turns from calls 720/721 against the real prompt
and the real model, so a fix is verified here rather than on a live call.

Mirrors main.py's delivery exactly: agent.instructions as the system message,
then a per-turn system message carrying the same nudges on_user_turn_completed
builds, then the tools bound to the session.
"""
import json
import os
import sys

sys.path.insert(0, "/Users/mac15/BRANDS/VISTROW VOICE/agent")

import db  # noqa: E402
import main  # noqa: E402
from openai import OpenAI  # noqa: E402

AGENT_ID = 18
cfg = db.get_agent_config(AGENT_ID)
agent = main.RealEstateAgent(cfg, None, None)
SYSTEM = agent.instructions
MODEL = cfg.get("model") or "gpt-4.1"

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "switch_reply_language",
            "description": (main.__dict__ and ""),
            "parameters": {
                "type": "object",
                "properties": {"language": {"type": "string"}},
                "required": ["language"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_calendar_availability",
            "description": "Check real open appointment slots for a date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "duration_minutes": {"type": "integer"},
                    "requested_time": {"type": "string"},
                },
                "required": ["date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": "Book the appointment once name, phone and time are known.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {"type": "string"},
                    "time": {"type": "string"},
                    "name": {"type": "string"},
                    "phone": {"type": "string"},
                    "purpose": {"type": "string"},
                },
                "required": ["date", "time", "name"],
            },
        },
    },
]
import tools as agent_tools  # noqa: E402

TOOLS[0]["function"]["description"] = (agent_tools.switch_reply_language.__doc__ or "")[:1000]


def per_turn_system(text: str) -> str:
    """The same nudges main.py appends for this turn."""
    parts = []
    if main._LANGUAGE_REQUEST_PATTERN.search(text):
        parts.append(
            "The caller's last message asks you to speak a different language. Call "
            "switch_reply_language with that language's plain English name BEFORE your next "
            "reply, then answer in it. You speak every language listed in your prompt — do NOT "
            "say you can only speak Hindi, do not claim a limited set, and do not offer to "
            "continue in the current language instead. If you genuinely cannot, the tool tells "
            "you so; you do not decide that yourself."
        )
    return "\n\n".join(parts)


def run(name: str, history, user_text: str, tool_results=None):
    msgs = [{"role": "system", "content": SYSTEM}]
    msgs += history
    msgs.append({"role": "user", "content": user_text})
    nudge = per_turn_system(user_text)
    if nudge:
        msgs.append({"role": "system", "content": nudge})
    if tool_results:
        msgs += tool_results
    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    r = client.chat.completions.create(
        model=MODEL, messages=msgs, tools=TOOLS, temperature=0.7, max_tokens=200
    )
    m = r.choices[0].message
    calls = [(c.function.name, c.function.arguments) for c in (m.tool_calls or [])]
    print(f"\n=== {name} ===")
    print(f"  nudge fired: {bool(nudge)}")
    print(f"  tool calls : {calls if calls else 'NONE'}")
    print(f"  said       : {(m.content or '').strip()[:260]}")
    return m, calls
