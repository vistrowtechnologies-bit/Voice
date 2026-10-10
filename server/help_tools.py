"""Read-only, account-scoped data functions the help chatbot's LLM can call
(see help_chat.py). Each one is a thin wrapper around an existing calls_db.py
query — no new SQL — that reduces the result to a small curated dict rather
than raw rows, so the model can never surface a field beyond what these
functions choose to return.

account_id always comes from the authenticated session (token_api.py's
current_user dependency), never from the model or the client — same
tenant-isolation rule every other query in calls_db.py already follows.
"""

import datetime
from zoneinfo import ZoneInfo

import calls_db
import help_articles

# OpenAI tool schemas — passed verbatim in the chat completion's `tools`
# array. Keep descriptions short but specific: the model picks a function
# based on these strings, and a vague description picks the wrong tool.
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_help_articles",
            "description": "Search the help centre's articles for how to use a page or feature. Use this for any how-to question before answering, and name the article in your reply.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "The user's question in a few keywords."}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "dashboard_stats",
            "description": "Overall account totals: total calls, qualified calls, site visits booked, total minutes, and how many agents are live right now.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calls_on_date",
            "description": "How many calls (and which callers) happened on one specific calendar date.",
            "parameters": {
                "type": "object",
                "properties": {
                    "date": {
                        "type": "string",
                        "description": "The calendar date to check, as YYYY-MM-DD.",
                    }
                },
                "required": ["date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "hottest_leads",
            "description": "The most recent qualified leads or booked site visits — the callers most worth following up with right now.",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {
                        "type": "integer",
                        "description": "How many leads to return, default 5.",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "billing_snapshot",
            "description": "Current credit balance: credits remaining, credits used, and total credits for this billing cycle.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "contacts_stats",
            "description": "How many contacts are in the workspace, broken down by status (new, qualified, site visit booked, customer).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_recent_calls",
            "description": "Find recent calls by caller name or phone number and return their channel, website landing page, lead status, agent, and ArthaLeads delivery status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Caller name or phone number to search for.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum matching calls to return, default 5.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "integration_status",
            "description": "List this workspace's integrations and whether each is connected, including last sync or last error. Never returns tokens or configuration secrets.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_my_agents",
            "description": "List this workspace's voice agents: id, name, whether it is live or paused, model, voice, language, and the phone numbers assigned to it.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "agent_detail",
            "description": "One agent's configuration: status, model, voice, language, welcome message, who speaks first, whether a knowledge base is attached, and which CRM integrations it sends leads to. Use list_my_agents first to get the id.",
            "parameters": {
                "type": "object",
                "properties": {"agent_id": {"type": "integer", "description": "The agent's numeric id."}},
                "required": ["agent_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "contact_requirements",
            "description": "What a specific caller or contact asked for: their most recent calls with the AI summary, key points, action items, captured lead details, and the end of the transcript, plus any saved contact notes. Use for questions like 'what does Abhishek want' or 'what did +91... ask about'.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Caller or contact name, or phone number."}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "failing_integrations",
            "description": "Which connected integrations are currently reporting an error, with the last error text and last successful sync. Never returns tokens or configuration secrets.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "upcoming_appointments",
            "description": "Appointments booked from today onwards: date, time, contact, purpose and status.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "How many days ahead to include, default 7."}
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "phone_numbers",
            "description": "This workspace's phone numbers with their label, status, and which agent answers each one.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

# Tenant-facing model names, mirroring MODEL_OPTIONS/RETIRED_MODELS in
# web-demo/src/lib/agentOptions.ts — the dashboard never shows the vendor
# model string, so the bot must not either. Unknown values fall back to the
# raw string, same as the agent editor does.
_MODEL_LABELS = {
    "sarvam/sarvam-105b-conversations": "Vistrow Bharat",
    "gpt-4.1-mini": "Vistrow Swift",
    "gpt-4.1": "Vistrow Prime",
    "gpt-4o": "Vistrow Pro",
    "gemini-3.6-flash": "Vistrow Flash",
    "gpt-4o-mini": "Vistrow Standard",
    "gemini-3.5-flash-lite": "Vistrow Lite",
}

# Caps keeping every tool result small enough to feed back to the model.
MAX_LIST_ITEMS = 20
TRANSCRIPT_LAST_TURNS = 20
TRANSCRIPT_MAX_CHARS = 2_500
MAX_TEXT_CHARS = 300


def dashboard_stats(account_id: int, **_ignored) -> dict:
    s = calls_db.summary(account_id)
    return {
        "totalCalls": s["totalCalls"],
        "qualifiedCalls": s["qualifiedCalls"],
        "siteVisitsBooked": s["siteVisits"],
        "totalMinutes": s["totalMinutes"],
        "activeAgents": s["activeAgents"],
    }


def calls_on_date(account_id: int, date: str = "", timezone_name: str = "Asia/Kolkata", **_ignored) -> dict:
    if not date:
        return {"error": "no date given"}
    try:
        return calls_db.calls_for_local_date(account_id, date, timezone_name)
    except ValueError as exc:
        return {"error": str(exc)}


def hottest_leads(account_id: int, limit: int = 5, **_ignored) -> dict:
    limit = max(1, min(int(limit or 5), 20))
    calls = calls_db.list_calls(account_id, limit=100)
    hot = [c for c in calls if c["status"] in ("Qualified", "Appointment Booked")][:limit]
    return {
        "leads": [
            {"name": c["name"], "phone": c["phone"], "status": c["status"], "callDate": c["callDate"]}
            for c in hot
        ]
    }


def billing_snapshot(account_id: int, **_ignored) -> dict:
    b = calls_db.billing_summary(account_id)
    return {
        "creditsTotal": b["creditsTotal"],
        "creditsUsed": b["creditsUsed"],
        "creditsRemaining": b["creditsRemaining"],
    }


def contacts_stats(account_id: int, **_ignored) -> dict:
    contacts = calls_db.list_contacts(account_id)
    by_status: dict[str, int] = {}
    for c in contacts:
        by_status[c["status"]] = by_status.get(c["status"], 0) + 1
    return {"totalContacts": len(contacts), "byStatus": by_status}


def find_recent_calls(account_id: int, query: str = "", limit: int = 5, **_ignored) -> dict:
    query = str(query or "").strip()
    if not query:
        return {"error": "no caller name or phone number given"}
    limit = max(1, min(int(limit or 5), 10))
    calls = calls_db.list_calls(account_id, limit=limit, search=query)
    return {
        "query": query,
        "matches": [
            {
                "callId": call["id"],
                "name": call["name"],
                "phone": call["phone"],
                "callDate": call["callDate"],
                "callStatus": call["callStatus"],
                "leadStatus": call["status"],
                "channel": call["channel"],
                "direction": call["direction"],
                "agent": call["agent"],
                "website": call["website"],
                "pagePath": call["pagePath"],
                "arthaleadsStatus": call["arthaleadsStatus"],
                "arthaleadsSyncedAt": call["arthaleadsSyncedAt"],
            }
            for call in calls[:limit]
        ],
    }


def integration_status(account_id: int, **_ignored) -> dict:
    integrations = calls_db.list_integrations(account_id)
    return {
        "integrations": [
            {
                "key": integration["key"],
                "name": integration["name"],
                "category": integration["category"],
                "status": integration["status"],
                "lastSync": integration["lastSync"],
                "lastError": integration["lastError"],
            }
            for integration in integrations
        ]
    }


def search_help_articles(account_id: int, query: str = "", **_ignored) -> dict:
    """Same ranking the help centre's search box uses, so the bot and the
    page point at the same article."""
    return {
        "articles": [
            {"slug": a["slug"], "title": a["title"], "topic": a["topicTitle"], "body": a["body"]}
            for a in help_articles.search(query, limit=3)
        ]
    }


def _text(value, limit: int = MAX_TEXT_CHARS) -> str:
    text = str(value or "")
    return text if len(text) <= limit else text[:limit] + "…"


def _numbers_by_agent(account_id: int) -> dict[int, list[str]]:
    numbers: dict[int, list[str]] = {}
    for n in calls_db.list_phone_numbers(account_id):
        if n["agentId"] is not None:
            numbers.setdefault(n["agentId"], []).append(n["number"])
    return numbers


def _agent_summary(agent: dict, numbers_by_agent: dict[int, list[str]]) -> dict:
    return {
        "agentId": agent["id"],
        "name": agent["name"],
        "status": agent["status"],
        "model": _MODEL_LABELS.get(agent["model"], agent["model"]),
        "voice": agent["voiceName"],
        "language": agent["language"],
        "phoneNumbers": numbers_by_agent.get(agent["id"], []),
    }


def list_my_agents(account_id: int, **_ignored) -> dict:
    agents = calls_db.list_agents(account_id)
    numbers_by_agent = _numbers_by_agent(account_id)
    return {
        "found": bool(agents),
        "agents": [_agent_summary(a, numbers_by_agent) for a in agents[:MAX_LIST_ITEMS]],
    }


def agent_detail(account_id: int, agent_id=None, **_ignored) -> dict:
    try:
        agent_id = int(agent_id)
    except (TypeError, ValueError):
        return {"found": False, "error": "no agent_id given"}
    # list_agents is already account-scoped, so a foreign id simply isn't found.
    agent = next((a for a in calls_db.list_agents(account_id) if a["id"] == agent_id), None)
    if not agent:
        return {"found": False, "agentId": agent_id}
    return {
        "found": True,
        **_agent_summary(agent, _numbers_by_agent(account_id)),
        "welcomeMessage": _text(agent["welcomeMessage"]),
        "firstSpeaker": agent["firstSpeaker"],
        "hasKnowledgeBase": bool(agent["kbId"]),
        "crmIntegrationKeys": agent["crmIntegrationKeys"],
    }


def _last_transcript_turns(transcript: list[dict]) -> list[dict]:
    """The newest TRANSCRIPT_LAST_TURNS turns, then trimmed from the oldest
    end until the text fits TRANSCRIPT_MAX_CHARS (the end of a call is where
    the requirements and next steps are)."""
    turns: list[dict] = []
    used = 0
    for turn in reversed(transcript[-TRANSCRIPT_LAST_TURNS:]):
        room = TRANSCRIPT_MAX_CHARS - used
        if room <= 0:
            break
        text = str(turn.get("text") or "")
        if len(text) > room:
            text = "…" + text[-room:]
        turns.append({"speaker": turn.get("speaker"), "text": text})
        used += len(text)
    turns.reverse()
    return turns


def _call_requirements(call: dict) -> dict:
    intelligence = call.get("intelligence") or {}
    return {
        "callId": call["id"],
        "callDate": call["callDate"],
        "agent": call["agent"],
        "durationSeconds": call["durationSeconds"],
        "leadStatus": call["status"],
        "name": call["name"],
        "phone": call["phone"],
        "email": call["email"],
        "budget": call["budget"],
        "location": call["location"],
        "timeline": call["timeline"],
        "extractedData": {str(k): _text(v) for k, v in list((call.get("extractedData") or {}).items())[:MAX_LIST_ITEMS]},
        "summary": _text(intelligence.get("summary"), 1_000),
        "keyPoints": intelligence.get("key_points") or [],
        "actionItems": intelligence.get("action_items") or [],
        "transcriptTurnsTotal": len(call.get("transcript") or []),
        "transcript": _last_transcript_turns(call.get("transcript") or []),
    }


def _matching_contact(account_id: int, query: str) -> dict | None:
    """Newest contact whose name contains the query or whose phone shares its
    digits — same loose match list_calls applies to callers."""
    q = query.lower()
    digits = "".join(ch for ch in query if ch.isdigit())
    for contact in calls_db.list_contacts(account_id):
        phone_digits = "".join(ch for ch in contact["phone"] if ch.isdigit())
        if q in (contact["name"] or "").lower() or (
            digits and phone_digits and (digits in phone_digits or phone_digits in digits)
        ):
            return calls_db.contact_detail(contact["id"], account_id)
    return None


def contact_requirements(account_id: int, query: str = "", **_ignored) -> dict:
    query = str(query or "").strip()
    if not query:
        return {"found": False, "error": "no caller name or phone number given"}
    calls = []
    for call in calls_db.list_calls(account_id, limit=3, search=query):
        # list_calls omits transcripts; get_call (account-scoped) has them.
        full = calls_db.get_call(int(call["id"]), account_id)
        if full:
            calls.append(_call_requirements(full))
    contact = _matching_contact(account_id, query)
    if not calls and not contact:
        return {"found": False, "query": query}
    return {
        "found": True,
        "query": query,
        "calls": calls,
        "contact": {
            "contactId": contact["id"],
            "name": contact["name"],
            "phone": contact["phone"],
            "email": contact["email"],
            "company": contact["company"],
            "status": contact["status"],
            "tags": contact["tags"],
            "lastCalledAt": contact["lastCalledAt"],
            "notes": [
                {"createdAt": n["createdAt"], "body": _text(n["body"])} for n in contact["notes"][:5]
            ],
        }
        if contact
        else None,
    }


def failing_integrations(account_id: int, **_ignored) -> dict:
    # TODO: once calls_db.list_integration_deliveries(account_id, key, limit, status)
    # lands, attach each integration's last 5 failed deliveries here.
    integrations = calls_db.list_integrations(account_id)
    failing = [i for i in integrations if i["status"] == "connected" and i["lastError"]]
    return {
        "found": bool(failing),
        "connectedCount": sum(1 for i in integrations if i["status"] == "connected"),
        "failing": [
            {
                "key": i["key"],
                "name": i["name"],
                "lastSync": i["lastSync"],
                "lastError": _text(i["lastError"]),
            }
            for i in failing[:MAX_LIST_ITEMS]
        ],
    }


def upcoming_appointments(account_id: int, days: int = 7, timezone_name: str = "Asia/Kolkata", **_ignored) -> dict:
    days = max(1, min(int(days or 7), 60))
    try:
        today = datetime.datetime.now(ZoneInfo(timezone_name)).date()
    except Exception:
        today = datetime.datetime.now(ZoneInfo("Asia/Kolkata")).date()
    end = today + datetime.timedelta(days=days)
    appointments = calls_db.list_appointments(account_id, start=today.isoformat(), end=end.isoformat())
    return {
        "found": bool(appointments),
        "from": today.isoformat(),
        "to": end.isoformat(),
        "appointments": [
            {
                "date": a["date"],
                "time": a["time"],
                "durationMinutes": a["durationMinutes"],
                "name": a["name"],
                "phone": a["phone"],
                "purpose": _text(a["purpose"]),
                "status": a["status"],
            }
            for a in appointments[:MAX_LIST_ITEMS]
        ],
    }


def phone_numbers(account_id: int, **_ignored) -> dict:
    numbers = calls_db.list_phone_numbers(account_id)
    agent_names = {a["id"]: a["name"] for a in calls_db.list_agents(account_id)}
    return {
        "found": bool(numbers),
        "numbers": [
            {
                "number": n["number"],
                "label": n["label"],
                "status": n["status"],
                "agent": agent_names.get(n["agentId"]),
            }
            for n in numbers[:MAX_LIST_ITEMS]
        ],
    }


TOOL_FUNCTIONS = {
    "search_help_articles": search_help_articles,
    "dashboard_stats": dashboard_stats,
    "calls_on_date": calls_on_date,
    "hottest_leads": hottest_leads,
    "billing_snapshot": billing_snapshot,
    "contacts_stats": contacts_stats,
    "find_recent_calls": find_recent_calls,
    "integration_status": integration_status,
    "list_my_agents": list_my_agents,
    "agent_detail": agent_detail,
    "contact_requirements": contact_requirements,
    "failing_integrations": failing_integrations,
    "upcoming_appointments": upcoming_appointments,
    "phone_numbers": phone_numbers,
}
