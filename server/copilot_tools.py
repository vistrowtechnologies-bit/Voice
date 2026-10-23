"""Write actions the dashboard copilot may PROPOSE (see copilot.py). Nothing
here runs when the model asks for it: help_chat.py turns the model's call into
a signed confirmation card, and only POST /help/chat/confirm executes `fn`,
after re-checking role, plan and daily caps.

Each tool has:
  schema    OpenAI function schema shown to the model
  clean     (args) -> args: types and an explicit allowlist of keys; raises ActionError
  describe  (account_id, args) -> str: the confirmation line, ids resolved to names
  fn        (account_id, user, **args) -> str: does the write, returns a friendly sentence
  min_role  calls_db.ROLE_RANK name
  features  plan features required (always "copilot_actions", plus "crm" where the route needs it)

account_id always comes from the session, never from the model; every id the
model passes is looked up inside that account first, so another workspace's id
is simply "not found".
"""

import asyncio
import datetime
import logging
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import calls_db
import voice_catalog

logger = logging.getLogger("copilot-tools")

FEATURE = "copilot_actions"
# Agent delivery targets, same list as the Integrations and Agent pages
# (web-demo IntegrationDetail.tsx / AgentDetail.tsx DELIVERY_KEYS).
DELIVERY_KEYS = ("arthaleads", "webhook", "slack", "whatsapp", "sheets", "zoho_crm")
MAX_TEXT = 500

# token_api.py sets this to its _guard_agent_patch, the same checks the
# PATCH /agents/{id} route runs. Agent edits refuse to run without it rather
# than skip the route's guards.
AGENT_PATCH_GUARD = None


class ActionError(Exception):
    """A user-facing reason an action cannot be proposed or run."""


# ------------------------------------------------------------------ lookups

def _int(value, what: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ActionError(f"No {what} was given.") from None


def _text(value, limit: int = MAX_TEXT) -> str:
    return str(value or "").strip()[:limit]


def _whole_text(value, limit: int, what: str) -> str:
    """Text the confirmation card shows in full: refused when too long rather
    than cut, so a greeting or note is never written half-finished."""
    text = str(value or "").strip()
    if len(text) > limit:
        raise ActionError(f"The {what} is too long ({len(text)} characters); keep it under {limit}.")
    return text


def _agent(account_id: int, agent_id: int) -> dict:
    # list_agents is account-scoped, so a foreign id is simply not found.
    agent = next((a for a in calls_db.list_agents(account_id) if a["id"] == agent_id), None)
    if not agent:
        raise ActionError(f"Agent {agent_id} was not found in this workspace.")
    return agent


def _number(account_id: int, number_id: int) -> dict:
    number = calls_db.get_phone_number(number_id, account_id)
    if not number:
        raise ActionError(f"Phone number {number_id} was not found in this workspace.")
    return number


def _integration_names(account_id: int) -> dict[str, str]:
    return {i["key"]: i["name"] for i in calls_db.list_integrations(account_id)}


def _patch_agent(account_id: int, agent_id: int, data: dict) -> dict:
    if AGENT_PATCH_GUARD is None:
        raise ActionError("Agent edits are not available right now.")
    try:
        data = AGENT_PATCH_GUARD(data, account_id, agent_id)
    except Exception as exc:  # the route's guards raise HTTPException(detail=...)
        detail = getattr(exc, "detail", None)
        if detail:
            raise ActionError(str(detail)) from exc
        raise
    agent = calls_db.update_agent(agent_id, data, account_id)
    if agent is None:
        raise ActionError(f"Agent {agent_id} was not found in this workspace.")
    return agent


# --------------------------------------------------------- set_agent_status

def _clean_status(args: dict) -> dict:
    status = _text(args.get("status")).lower()
    if status not in ("live", "paused"):
        raise ActionError("Status must be live or paused.")
    return {"agent_id": _int(args.get("agent_id"), "agent"), "status": status}


def _describe_status(account_id: int, args: dict) -> str:
    agent = _agent(account_id, args["agent_id"])
    verb = "Pause" if args["status"] == "paused" else "Put live"
    return f"{verb} agent '{agent['name']}'"


def set_agent_status(account_id: int, user: dict, agent_id: int, status: str) -> str:
    agent = _patch_agent(account_id, agent_id, {"status": status})
    return f"Agent '{agent['name']}' is now {'paused' if status == 'paused' else 'live'}."


# ------------------------------------------------------ update_agent_basics

def _language(value) -> str:
    text = _text(value, 40)
    if text in voice_catalog.LANGUAGE_LABELS:
        return text
    by_label = {label.lower(): code for code, label in voice_catalog.LANGUAGE_LABELS.items()}
    if text.lower() in by_label:
        return by_label[text.lower()]
    raise ActionError(f"'{text}' is not a supported agent language.")


def _clean_basics(args: dict) -> dict:
    cleaned = {"agent_id": _int(args.get("agent_id"), "agent")}
    if args.get("name") not in (None, ""):
        cleaned["name"] = _text(args["name"], 80)
    if args.get("language") not in (None, ""):
        cleaned["language"] = _language(args["language"])
    if args.get("welcome_message") not in (None, ""):
        # Short enough that the confirmation card can show all of it: the
        # caller hears exactly what the user approved, nothing hidden.
        cleaned["welcome_message"] = _whole_text(args["welcome_message"], 300, "welcome message")
    if len(cleaned) == 1:
        raise ActionError("Say what to change: the name, language or welcome message.")
    return cleaned


def _describe_basics(account_id: int, args: dict) -> str:
    agent = _agent(account_id, args["agent_id"])
    changes = []
    if "name" in args:
        changes.append(f"rename to '{args['name']}'")
    if "language" in args:
        changes.append(f"language {voice_catalog.LANGUAGE_LABELS.get(args['language'], args['language'])}")
    if "welcome_message" in args:
        changes.append(f"welcome message \"{args['welcome_message']}\"")
    return f"Update agent '{agent['name']}': " + ", ".join(changes)


def update_agent_basics(account_id: int, user: dict, agent_id: int, name: str | None = None,
                        language: str | None = None, welcome_message: str | None = None) -> str:
    data = {k: v for k, v in (("name", name), ("language", language), ("welcomeMessage", welcome_message)) if v}
    agent = _patch_agent(account_id, agent_id, data)
    return f"Agent '{agent['name']}' was updated."


# --------------------------------------------------- set_agent_integrations

def _clean_integrations(args: dict) -> dict:
    keys = args.get("integration_keys")
    if not isinstance(keys, list):
        raise ActionError("integration_keys must be a list.")
    keys = [_text(k, 40).lower() for k in keys]
    if "all" in keys:
        chosen: list[str] = []  # empty = every integration
    else:
        unknown = [k for k in keys if k not in DELIVERY_KEYS and k != "none"]
        if unknown:
            raise ActionError(f"Unknown integration: {', '.join(unknown)}.")
        chosen = [k for k in DELIVERY_KEYS if k in keys]
        # Same sentinel as the Integrations page: [] means "all", so "none" is ['none'].
        if not chosen:
            chosen = ["none"]
        elif len(chosen) == len(DELIVERY_KEYS):
            chosen = []
    return {"agent_id": _int(args.get("agent_id"), "agent"), "integration_keys": chosen}


def _describe_integrations(account_id: int, args: dict) -> str:
    agent = _agent(account_id, args["agent_id"])
    keys = args["integration_keys"]
    if not keys:
        return f"Send agent '{agent['name']}' leads to every integration"
    if keys == ["none"]:
        return f"Stop sending agent '{agent['name']}' leads to any integration"
    for k in keys:
        if not calls_db.integration_accepts_connect(account_id, k):
            raise ActionError(f"{k.title()} is not available yet, so it cannot be chosen.")
    names = _integration_names(account_id)
    return f"Send agent '{agent['name']}' leads only to: " + ", ".join(names.get(k, k) for k in keys)


def set_agent_integrations(account_id: int, user: dict, agent_id: int, integration_keys: list[str]) -> str:
    agent = _patch_agent(account_id, agent_id, {"crmIntegrationKeys": integration_keys})
    return f"Integration delivery for agent '{agent['name']}' was updated."


# ------------------------------------------------ book_callback / appointment

_TIME = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")


def _clean_booking(args: dict, callback: bool) -> dict:
    name = _text(args.get("name"), 120)
    phone = _text(args.get("phone"), 40)
    if not name or not phone:
        raise ActionError("A name and phone number are needed to book.")
    date = _text(args.get("date"), 10)
    try:
        datetime.date.fromisoformat(date)
    except ValueError:
        raise ActionError("The date must be YYYY-MM-DD.") from None
    match = _TIME.match(_text(args.get("time"), 5))
    if not match:
        raise ActionError("The time must be HH:MM (24-hour).")
    cleaned = {"name": name, "phone": phone, "date": date, "time": f"{int(match.group(1)):02d}:{match.group(2)}"}
    if args.get("agent_id") not in (None, ""):
        cleaned["agent_id"] = _int(args["agent_id"], "agent")
    if args.get("notes"):
        cleaned["notes"] = _whole_text(args["notes"], 300, "note")  # shown in full on the card
    if not callback:
        duration = args.get("duration_minutes") or 30
        duration = _int(duration, "duration")
        if not 5 <= duration <= 480:
            raise ActionError("The duration must be between 5 and 480 minutes.")
        cleaned["duration_minutes"] = duration
        if args.get("purpose"):
            cleaned["purpose"] = _text(args["purpose"], 200)
    return cleaned


def _describe_booking(account_id: int, args: dict, kind: str) -> str:
    line = f"Book {kind} with {args['name']} ({args['phone']}) on {args['date']} at {args['time']}"
    if args.get("duration_minutes") and args["duration_minutes"] != 30:
        line += f" for {args['duration_minutes']} minutes"
    if args.get("purpose"):
        line += f", purpose: {args['purpose']}"
    if "agent_id" in args:
        line += f", agent '{_agent(account_id, args['agent_id'])['name']}'"
    if args.get("notes"):
        line += f", notes: \"{args['notes']}\""
    return line


def _book(account_id: int, agent_id: int | None, name: str, phone: str, date: str, time: str,
          duration_minutes: int, purpose: str, notes: str) -> None:
    if agent_id is not None:
        _agent(account_id, agent_id)
    result = calls_db.book_appointment_native(
        account_id, agent_id, None, name, phone, date, time, duration_minutes, purpose,
        source="copilot", notes=notes,
    )
    if not result.get("ok"):
        raise ActionError(f"{date} at {time} is already booked. Pick another time.")


def book_callback(account_id: int, user: dict, name: str, phone: str, date: str, time: str,
                  agent_id: int | None = None, notes: str = "") -> str:
    _book(account_id, agent_id, name, phone, date, time, 30, "Callback", notes)
    return f"Callback with {name} booked for {date} at {time}."


def book_appointment(account_id: int, user: dict, name: str, phone: str, date: str, time: str,
                     duration_minutes: int = 30, purpose: str = "", agent_id: int | None = None,
                     notes: str = "") -> str:
    _book(account_id, agent_id, name, phone, date, time, duration_minutes, purpose, notes)
    return f"Appointment with {name} booked for {date} at {time}."


# --------------------------------------------------- assign_number_to_agent

def _clean_assign(args: dict) -> dict:
    return {"number_id": _int(args.get("number_id"), "phone number"), "agent_id": _int(args.get("agent_id"), "agent")}


def _describe_assign(account_id: int, args: dict) -> str:
    number = _number(account_id, args["number_id"])
    agent = _agent(account_id, args["agent_id"])
    return f"Route {number['number']} to agent '{agent['name']}'"


def assign_number_to_agent(account_id: int, user: dict, number_id: int, agent_id: int) -> str:
    number = _number(account_id, number_id)
    agent = _agent(account_id, agent_id)
    if not calls_db.assign_phone_number(number_id, agent_id, account_id):
        raise ActionError(f"Agent {agent_id} was not found in this workspace.")
    # Same follow-up as PATCH /telephony/numbers/{id}: without it inbound calls
    # keep ringing the previous agent.
    try:
        import livekit_sip

        row = calls_db.get_phone_number(number_id, account_id)
        if row:
            asyncio.run(livekit_sip.upsert_dispatch_rule(row))
    except Exception:
        logger.exception("copilot: LiveKit dispatch sync failed for number %s", number_id)
        return (f"{number['number']} is now assigned to '{agent['name']}', but call routing wasn't "
                "updated yet. Open Phone Numbers and save it again.")
    return f"{number['number']} now rings agent '{agent['name']}'."


# --------------------------------------------------- set_integration_events

def _clean_events(args: dict) -> dict:
    events = args.get("events")
    if not isinstance(events, list):
        raise ActionError("events must be a list.")
    events = [_text(e, 40) for e in events]
    unknown = [e for e in events if e not in calls_db.INTEGRATION_EVENTS]
    if unknown:
        raise ActionError(f"Unknown event: {', '.join(unknown)}.")
    if not events:
        raise ActionError("Pick at least one event to send.")
    return {"integration_key": _text(args.get("integration_key"), 40).lower(),
            "events": [e for e in calls_db.INTEGRATION_EVENTS if e in events]}


def _describe_events(account_id: int, args: dict) -> str:
    names = _integration_names(account_id)
    if args["integration_key"] not in names:
        raise ActionError(f"Integration '{args['integration_key']}' was not found in this workspace.")
    if args["integration_key"] not in calls_db.EVENT_CONFIGURABLE_KEYS:
        raise ActionError(f"{names[args['integration_key']]} always sends one record per caller at the end of the call; "
                          "its events can't be chosen.")
    readable = ", ".join(e.replace("_", " ") for e in args["events"])
    return f"Send {names[args['integration_key']]} these events: {readable}"


def set_integration_events(account_id: int, user: dict, integration_key: str, events: list[str]) -> str:
    try:
        calls_db.update_integration_settings(account_id, integration_key, events=events)
    except ValueError as exc:
        raise ActionError(str(exc)) from exc
    name = _integration_names(account_id).get(integration_key, integration_key)
    return f"{name} will now send: {', '.join(e.replace('_', ' ') for e in events)}."


# ------------------------------------------------------------- follow-ups
# The Follow-ups page's actions (owner, 22 Oct 2026). Each one runs the same
# calls_db function as its button, so Do-Not-Call, the 90-day window, the
# agent's phone number and "being called right now" are checked identically.
# Times are the workspace's calling time zone (Compliance), as the dialer uses.

_FOLLOW_UP_KINDS = {"callback": "Call them back", "nurture": "Check in on their interest"}


def _follow_up_tz(account_id: int) -> ZoneInfo:
    try:
        return ZoneInfo(calls_db.get_compliance(account_id).get("timezone") or "Asia/Kolkata")
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return ZoneInfo("Asia/Kolkata")


def _when(dt: datetime.datetime, tz: ZoneInfo) -> str:
    local = dt.astimezone(tz)
    return f"{local:%a} {local.day} {local:%b}, {local.hour % 12 or 12}:{local:%M} {'am' if local.hour < 12 else 'pm'}"


def _due(item: dict, tz: ZoneInfo) -> str:
    try:
        return _when(datetime.datetime.fromisoformat(item["dueAt"].replace("Z", "+00:00")), tz)
    except (AttributeError, ValueError):
        return "no time set"


def _clean_date_time(args: dict) -> tuple[str, str]:
    date = _text(args.get("date"), 10)
    try:
        datetime.date.fromisoformat(date)
    except ValueError:
        raise ActionError("The date must be YYYY-MM-DD.") from None
    match = _TIME.match(_text(args.get("time"), 5))
    if not match:
        raise ActionError("The time must be HH:MM (24-hour).")
    return date, f"{int(match.group(1)):02d}:{match.group(2)}"


def _at(account_id: int, date: str, time: str) -> datetime.datetime:
    """The local date and time as an aware moment, refused unless it is in
    the future and within 90 days (the page's own rule)."""
    local = datetime.datetime.fromisoformat(f"{date}T{time}").replace(tzinfo=_follow_up_tz(account_id))
    try:
        return calls_db._parse_follow_up_time(local.isoformat())
    except ValueError as exc:
        raise ActionError(f"{exc}.") from exc


def _follow_up(account_id: int, follow_up_id: int) -> dict:
    # list_follow_ups is account-scoped, so a foreign id is simply not found.
    item = next((i for i in calls_db.list_follow_ups(account_id, view="all", limit=1000)["items"]
                 if i["id"] == follow_up_id), None)
    if item is None:
        raise ActionError(f"Follow-up {follow_up_id} was not found in this workspace.")
    if item["status"] == "calling":
        raise ActionError(f"The AI is calling {item['name']} right now.")
    if item["state"] != "upcoming":
        raise ActionError(f"The follow-up call to {item['name']} has already finished.")
    return item


def _act(account_id: int, follow_up_id: int, action: str, at: str | None = None) -> dict:
    try:
        return calls_db.act_on_follow_up(account_id, follow_up_id, action, at)
    except (LookupError, ValueError) as exc:
        raise ActionError(f"{exc}.") from exc


def _clean_schedule(args: dict) -> dict:
    phone = _text(args.get("phone"), 40)
    if not phone:
        raise ActionError("A phone number is needed to schedule a follow-up.")
    kind = _text(args.get("kind") or "callback", 20).lower()
    if kind not in _FOLLOW_UP_KINDS:
        raise ActionError("The follow-up type must be callback or nurture.")
    date, time = _clean_date_time(args)
    cleaned = {"name": _text(args.get("name"), 120), "phone": phone, "agent_id": _int(args.get("agent_id"), "agent"),
               "kind": kind, "date": date, "time": time}
    if args.get("note"):
        cleaned["note"] = _whole_text(args["note"], 300, "note")  # shown in full on the card
    return cleaned


def _waiting_for(account_id: int, agent_id: int, phone: str) -> dict | None:
    """The follow-up create_follow_up would move instead of adding a second:
    a waiting one from the same agent to the same number."""
    e164 = calls_db.account_phone(account_id, phone)
    return next((i for i in calls_db.list_follow_ups(account_id, view="upcoming", limit=1000)["items"]
                 if i["agentId"] == agent_id and i["status"] == "pending" and i["phone"] == e164), None)


def _describe_schedule(account_id: int, args: dict) -> str:
    agent = _agent(account_id, args["agent_id"])
    tz = _follow_up_tz(account_id)
    when = _at(account_id, args["date"], args["time"])
    # The same refusals create_follow_up makes on Confirm, shown before the card
    # instead of after it.
    e164 = calls_db.account_phone(account_id, args["phone"])
    if not e164:
        raise ActionError("Enter a valid phone number.")
    if calls_db.get_compliance(account_id).get("honor_dnc", True) and calls_db.is_dnc(account_id, e164):
        raise ActionError("This number is on your Do-Not-Call list.")
    if not any(n["agentId"] == args["agent_id"] and n["status"] == "active"
               for n in calls_db.list_phone_numbers(account_id)):
        raise ActionError(f"Agent '{agent['name']}' has no phone number to call from. Assign one in Phone Numbers first.")
    who = f"{args['name']} ({args['phone']})" if args["name"] else args["phone"]
    line = (f"Schedule a follow-up call to {who} on {_when(when, tz)} ({tz.key}) by agent '{agent['name']}': "
            f"{_FOLLOW_UP_KINDS[args['kind']]}")
    if args.get("note"):
        line += f", note for the AI: \"{args['note']}\""
    waiting = _waiting_for(account_id, args["agent_id"], args["phone"])
    if waiting:
        line += f". This moves the follow-up already waiting for them ({_due(waiting, tz)})"
    return line


def schedule_follow_up(account_id: int, user: dict, phone: str, agent_id: int, kind: str, date: str, time: str,
                       name: str = "", note: str = "") -> str:
    _agent(account_id, agent_id)
    when = _at(account_id, date, time)
    try:
        out = calls_db.create_follow_up(
            account_id, {"agent_id": agent_id, "phone": phone, "name": name, "kind": kind,
                         "at": when.isoformat(), "note": note},
            user_id=user.get("user_id"),
        )
    except (LookupError, ValueError) as exc:
        raise ActionError(f"{exc}.") from exc
    item, tz = out["item"], _follow_up_tz(account_id)
    if out["replaced"]:
        return f"Moved the follow-up call to {item['name']} to {_due(item, tz)}."
    return f"Follow-up call to {item['name']} scheduled for {_due(item, tz)}."


def _clean_follow_up_id(args: dict) -> dict:
    return {"follow_up_id": _int(args.get("follow_up_id"), "follow-up")}


def _clean_reschedule(args: dict) -> dict:
    date, time = _clean_date_time(args)
    return {**_clean_follow_up_id(args), "date": date, "time": time}


def _describe_reschedule(account_id: int, args: dict) -> str:
    item, tz = _follow_up(account_id, args["follow_up_id"]), _follow_up_tz(account_id)
    when = _at(account_id, args["date"], args["time"])
    return f"Move the follow-up call to {item['name']} ({item['label']}) from {_due(item, tz)} to {_when(when, tz)} ({tz.key})"


def reschedule_follow_up(account_id: int, user: dict, follow_up_id: int, date: str, time: str) -> str:
    when = _at(account_id, date, time)
    item = _act(account_id, follow_up_id, "reschedule", when.isoformat())
    return f"The follow-up call to {item['name']} is now at {_due(item, _follow_up_tz(account_id))}."


def _describe_cancel(account_id: int, args: dict) -> str:
    item = _follow_up(account_id, args["follow_up_id"])
    return f"Cancel the follow-up call to {item['name']} ({item['label']}, due {_due(item, _follow_up_tz(account_id))})"


def cancel_follow_up(account_id: int, user: dict, follow_up_id: int) -> str:
    item = _act(account_id, follow_up_id, "cancel")
    return f"Cancelled the follow-up call to {item['name']}. It will not ring."


def _describe_call_now(account_id: int, args: dict) -> str:
    item = _follow_up(account_id, args["follow_up_id"])
    line = f"Call {item['name']} now ({item['label']}, was due {_due(item, _follow_up_tz(account_id))})"
    if item["campaignPaused"]:
        line += ". The follow-up campaign is paused, so this will not ring until it is resumed"
    return line


def call_follow_up_now(account_id: int, user: dict, follow_up_id: int) -> str:
    item = _act(account_id, follow_up_id, "call_now")
    if item["campaignPaused"]:
        return f"Queued {item['name']}, but the follow-up campaign is paused, so it will not ring until it is resumed."
    return f"Queued: the AI will call {item['name']} at the next chance inside your calling window."


# ----------------------------------------------------------------- registry

def _schema(name: str, description: str, properties: dict, required: list[str]) -> dict:
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": properties, "required": required},
    }}


_AGENT_ID = {"type": "integer", "description": "agentId from list_my_agents."}
_FOLLOW_UP_ID = {"type": "integer", "description": "followUpId from upcoming_follow_ups."}
_BOOKING = {
    "name": {"type": "string", "description": "Contact's name."},
    "phone": {"type": "string", "description": "Contact's phone number."},
    "date": {"type": "string", "description": "YYYY-MM-DD."},
    "time": {"type": "string", "description": "HH:MM, 24-hour, workspace local time."},
    "agent_id": {"type": "integer", "description": "Optional agentId the booking belongs to."},
    "notes": {"type": "string"},
}

TOOLS: dict[str, dict] = {
    "set_agent_status": {
        "schema": _schema("set_agent_status", "Propose pausing an agent or putting it live. The user must confirm.",
                          {"agent_id": _AGENT_ID, "status": {"type": "string", "enum": ["live", "paused"]}},
                          ["agent_id", "status"]),
        "clean": _clean_status, "describe": _describe_status, "fn": set_agent_status,
        "min_role": "member", "features": (FEATURE,),
    },
    "update_agent_basics": {
        "schema": _schema("update_agent_basics", "Propose changing an agent's name, language (e.g. hi-IN) or welcome message. The user must confirm.",
                          {"agent_id": _AGENT_ID, "name": {"type": "string"}, "language": {"type": "string"},
                           "welcome_message": {"type": "string"}},
                          ["agent_id"]),
        "clean": _clean_basics, "describe": _describe_basics, "fn": update_agent_basics,
        "min_role": "member", "features": (FEATURE,),
    },
    "set_agent_integrations": {
        "schema": _schema("set_agent_integrations", "Propose which integrations an agent sends leads to. Keys: "
                          + ", ".join(DELIVERY_KEYS) + '; ["all"] for every integration, [] for none. The user must confirm.',
                          {"agent_id": _AGENT_ID, "integration_keys": {"type": "array", "items": {"type": "string"}}},
                          ["agent_id", "integration_keys"]),
        "clean": _clean_integrations, "describe": _describe_integrations, "fn": set_agent_integrations,
        "min_role": "member", "features": (FEATURE, "crm"),
    },
    "book_callback": {
        "schema": _schema("book_callback", "Propose booking a callback (an appointment with purpose Callback). The user must confirm.",
                          _BOOKING, ["name", "phone", "date", "time"]),
        "clean": lambda args: _clean_booking(args, callback=True),
        "describe": lambda account_id, args: _describe_booking(account_id, args, "a callback"),
        "fn": book_callback, "min_role": "member", "features": (FEATURE,),
    },
    "book_appointment": {
        "schema": _schema("book_appointment", "Propose booking an appointment. The user must confirm.",
                          {**_BOOKING, "duration_minutes": {"type": "integer"}, "purpose": {"type": "string"}},
                          ["name", "phone", "date", "time"]),
        "clean": lambda args: _clean_booking(args, callback=False),
        "describe": lambda account_id, args: _describe_booking(account_id, args, "an appointment"),
        "fn": book_appointment, "min_role": "member", "features": (FEATURE,),
    },
    "assign_number_to_agent": {
        "schema": _schema("assign_number_to_agent", "Propose routing a phone number to an agent. The user must confirm.",
                          {"number_id": {"type": "integer", "description": "numberId from phone_numbers."}, "agent_id": _AGENT_ID},
                          ["number_id", "agent_id"]),
        "clean": _clean_assign, "describe": _describe_assign, "fn": assign_number_to_agent,
        "min_role": "admin", "features": (FEATURE,),
    },
    "set_integration_events": {
        "schema": _schema("set_integration_events", "Propose which events an integration (webhook, slack, whatsapp, sheets) sends: "
                          + ", ".join(calls_db.INTEGRATION_EVENTS) + ". The user must confirm.",
                          {"integration_key": {"type": "string"},
                           "events": {"type": "array", "items": {"type": "string", "enum": list(calls_db.INTEGRATION_EVENTS)}}},
                          ["integration_key", "events"]),
        "clean": _clean_events, "describe": _describe_events, "fn": set_integration_events,
        "min_role": "admin", "features": (FEATURE, "crm"),
    },
    "schedule_follow_up": {
        "schema": _schema("schedule_follow_up", "Propose scheduling a follow-up call the AI agent will make to someone. "
                          "kind: callback = call them back as agreed; nurture = check in on their interest. date and "
                          "time are in the workspace calling time zone (upcoming_follow_ups reports it). If that person "
                          "already has one waiting from this agent, it is moved instead. The user must confirm.",
                          {"name": {"type": "string", "description": "Their name."},
                           "phone": {"type": "string", "description": "Their phone number."},
                           "agent_id": {**_AGENT_ID, "description": "agentId from list_my_agents: the agent who calls."},
                           "kind": {"type": "string", "enum": list(_FOLLOW_UP_KINDS)},
                           "date": {"type": "string", "description": "YYYY-MM-DD."},
                           "time": {"type": "string", "description": "HH:MM, 24-hour."},
                           "note": {"type": "string", "description": "Optional note for the AI on what to ask, up to 300 characters."}},
                          ["phone", "agent_id", "kind", "date", "time"]),
        "clean": _clean_schedule, "describe": _describe_schedule, "fn": schedule_follow_up,
        "min_role": "member", "features": (FEATURE, "campaigns"),
    },
    "reschedule_follow_up": {
        "schema": _schema("reschedule_follow_up", "Propose moving a waiting follow-up call to a new date and time "
                          "(workspace calling time zone). The user must confirm.",
                          {"follow_up_id": _FOLLOW_UP_ID, "date": {"type": "string", "description": "YYYY-MM-DD."},
                           "time": {"type": "string", "description": "HH:MM, 24-hour."}},
                          ["follow_up_id", "date", "time"]),
        "clean": _clean_reschedule, "describe": _describe_reschedule, "fn": reschedule_follow_up,
        "min_role": "member", "features": (FEATURE,),
    },
    "cancel_follow_up": {
        "schema": _schema("cancel_follow_up", "Propose cancelling a waiting follow-up call so it does not ring. The user must confirm.",
                          {"follow_up_id": _FOLLOW_UP_ID}, ["follow_up_id"]),
        "clean": _clean_follow_up_id, "describe": _describe_cancel, "fn": cancel_follow_up,
        "min_role": "member", "features": (FEATURE,),
    },
    "call_follow_up_now": {
        "schema": _schema("call_follow_up_now", "Propose placing a waiting follow-up call now instead of at its time. The user must confirm.",
                          {"follow_up_id": _FOLLOW_UP_ID}, ["follow_up_id"]),
        "clean": _clean_follow_up_id, "describe": _describe_call_now, "fn": call_follow_up_now,
        "min_role": "member", "features": (FEATURE,),
    },
}


def role_allows(role: str | None, tool: str) -> bool:
    return calls_db.ROLE_RANK.get(role or "", -1) >= calls_db.ROLE_RANK[TOOLS[tool]["min_role"]]


def plan_allows(features: dict, tool: str) -> bool:
    return all(features.get(f, False) for f in TOOLS[tool]["features"])
