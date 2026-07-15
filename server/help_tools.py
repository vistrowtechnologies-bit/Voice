"""Read-only, account-scoped data functions the help chatbot's LLM can call
(see help_chat.py). Each one is a thin wrapper around an existing calls_db.py
query — no new SQL — that reduces the result to a small curated dict rather
than raw rows, so the model can never surface a field beyond what these
functions choose to return.

account_id always comes from the authenticated session (token_api.py's
current_user dependency), never from the model or the client — same
tenant-isolation rule every other query in calls_db.py already follows.
"""

import calls_db

# OpenAI tool schemas — passed verbatim in the chat completion's `tools`
# array. Keep descriptions short but specific: the model picks a function
# based on these strings, and a vague description picks the wrong tool.
TOOL_SCHEMAS = [
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
]


def dashboard_stats(account_id: int, **_ignored) -> dict:
    s = calls_db.summary(account_id)
    return {
        "totalCalls": s["totalCalls"],
        "qualifiedCalls": s["qualifiedCalls"],
        "siteVisitsBooked": s["siteVisits"],
        "totalMinutes": s["totalMinutes"],
        "activeAgents": s["activeAgents"],
    }


def calls_on_date(account_id: int, date: str = "", **_ignored) -> dict:
    if not date:
        return {"error": "no date given"}
    # started_at is stored with a time component — compare only the date
    # portion. days=0 pulls no window filter at the SQL level, so cap the
    # scan at a generous recent-call limit and filter exactly in Python.
    calls = calls_db.list_calls(account_id, limit=500)
    matches = [c for c in calls if str(c["callDate"])[:10] == date]
    return {
        "date": date,
        "count": len(matches),
        "callers": [{"name": c["name"], "status": c["status"]} for c in matches[:10]],
    }


def hottest_leads(account_id: int, limit: int = 5, **_ignored) -> dict:
    limit = max(1, min(int(limit or 5), 20))
    calls = calls_db.list_calls(account_id, limit=100)
    hot = [c for c in calls if c["status"] in ("Qualified", "Site Visit Booked")][:limit]
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


TOOL_FUNCTIONS = {
    "dashboard_stats": dashboard_stats,
    "calls_on_date": calls_on_date,
    "hottest_leads": hottest_leads,
    "billing_snapshot": billing_snapshot,
    "contacts_stats": contacts_stats,
}
