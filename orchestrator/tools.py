"""LLM function tools — ported from agent/tools.py's business logic, decoupled
from livekit-agents. Each tool is a plain async function `(session, **kwargs) ->
str`, registered in TOOL_FUNCTIONS/TOOL_SCHEMAS in the same
{"type": "function", "function": {...}} shape server/help_tools.py already
uses for OpenAI's Chat Completions `tools` param, so llm.py's calling
convention matches an existing, working pattern in this codebase.

`session` is an orchestrator.session.Session — see that module for the
fields every tool below reads/writes (account_id, agent_id, lead_data,
transfer_phone, ending_call, on_event, tts state).

Two things from the LiveKit version are intentionally NOT ported yet:
- transfer_call: LiveKit's SIP transfer API doesn't apply once EnableX is
  bridged via raw WebSocket audio (Phase 2) — needs EnableX's own call
  transfer/hangup REST endpoints instead. Stubbed to the same honest
  fallback message until that lands.
- The old `_publish_event`'s LiveKit room data-channel publish is now
  `session.emit_event(payload)` — a plain callback the Phase 3 browser/
  widget WebSocket adapter will wire to an actual client message.
"""

import logging

import aiohttp

import db
from language import ELEVENLABS_SUPPORTED_LANGUAGES, LANGUAGE_NAMES

logger = logging.getLogger("orchestrator-tools")

_NAME_TO_LANGUAGE_CODE = {name.lower(): code for code, name in LANGUAGE_NAMES.items()}

TOOL_SCHEMAS: list[dict] = []
TOOL_FUNCTIONS: dict[str, callable] = {}


def _register(schema: dict):
    def deco(fn):
        TOOL_FUNCTIONS[schema["function"]["name"]] = fn
        TOOL_SCHEMAS.append(schema)
        return fn

    return deco


# --------------------------------------------------------------- delivery

_NEGATIVE_WORDS = {
    "frustrated", "frustrating", "annoyed", "annoying", "angry", "furious",
    "ridiculous", "terrible", "horrible", "worst", "useless", "pathetic",
    "waste", "complaint", "complain", "scam", "cheated", "fraud", "bakwas",
    "bekaar", "faltu", "ghatiya", "dhokha", "problem", "problems", "issue",
    "issues", "delay", "delayed", "nonsense", "stupid", "stop calling",
}
_POSITIVE_WORDS = {
    "great", "perfect", "excellent", "wonderful", "amazing", "love", "happy",
    "thanks", "thank you", "helpful", "badhiya", "accha", "acha", "shukriya",
    "dhanyavad", "sahi", "wah", "interested", "excited",
}


def _sentiment(transcript: list[dict]) -> str:
    visitor_text = " ".join((t.get("text") or "").lower() for t in transcript if t.get("role") == "user")
    negative = sum(1 for w in _NEGATIVE_WORDS if w in visitor_text)
    positive = sum(1 for w in _POSITIVE_WORDS if w in visitor_text)
    if negative > positive:
        return "negative"
    if positive > negative:
        return "positive"
    return "neutral"


_CHANNEL_LABELS = {"phone": "Phone", "widget": "Website Widget", "browser": "Web"}


def _transcript_message(lead: dict) -> str:
    transcript = lead.get("transcript") or []
    lines = []
    for turn in transcript:
        role = turn.get("role")
        text = (turn.get("text") or "").strip()
        if not text or role not in ("user", "assistant"):
            continue
        speaker = "Caller" if role == "user" else "Agent"
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


_ARTHALEADS_URL = "https://api.arthaleads.com/webhook/lead"


def _integration_body(key: str, config: dict, lead: dict) -> tuple[str, dict] | None:
    name = lead.get("name") or "Unknown caller"
    if key == "arthaleads":
        token = (config.get("token") or "").strip()
        if not token or lead.get("type") != "call_completed":
            return None
        if not (lead.get("name") and lead.get("phone")):
            return None
        transcript = lead.get("transcript") or []
        return _ARTHALEADS_URL, {
            "token": token,
            "name": name,
            "phone": lead.get("phone", ""),
            "email": lead.get("email", ""),
            "message": _transcript_message(lead),
            "transcript": [
                {"speaker": "Caller" if t.get("role") == "user" else "Agent", "text": (t.get("text") or "").strip()}
                for t in transcript
                if (t.get("text") or "").strip() and t.get("role") in ("user", "assistant")
            ],
            "sentiment": _sentiment(transcript),
            "duration_seconds": lead.get("duration_seconds"),
            "channel": _CHANNEL_LABELS.get(lead.get("channel"), lead.get("channel") or ""),
            "language": lead.get("language") or "",
            "agent_name": lead.get("agent_name") or "",
            "extracted_data": lead.get("extracted_data") or {},
        }
    url = (config.get("url") or "").strip()
    if not url:
        return None
    if key == "slack":
        line = " · ".join(str(x) for x in [name, lead.get("phone"), lead.get("company"), lead.get("use_case")] if x)
        return url, {"text": f":telephone_receiver: *New qualified lead* — {line}"}
    if key == "whatsapp":
        return url, {
            "to": lead.get("phone", ""),
            "message": config.get("template") or f"Hi {name}, thanks for your call. We'll follow up shortly.",
        }
    body = {**lead, "message": _transcript_message(lead)}
    token = (config.get("token") or "").strip()
    if token:
        body["token"] = token
    return url, body


async def _post_webhook(payload: dict) -> None:
    """Push the event to the per-agent CRM webhook configured on the
    Integrations page. Best-effort — must never stall the live call."""
    url = db.get_webhook_url()
    if not url:
        return
    try:
        timeout = aiohttp.ClientTimeout(total=5)
        async with aiohttp.ClientSession(timeout=timeout) as http:
            await http.post(url, json=payload)
        logger.info("posted %s event to CRM webhook", payload.get("type"))
    except Exception:
        logger.warning("CRM webhook post failed", exc_info=True)


async def _deliver_to_integrations(account_id: int | None, lead: dict, call_id: int | None = None) -> None:
    """Deliver an event to every connected integration for this tenant.
    Same shape as agent/tools.py's version — callable both mid-call (via
    _fan_out_integrations) and at call-end from session.py's log_call
    equivalent."""
    try:
        integrations = db.get_delivery_integrations(account_id)
    except Exception:
        return
    if not integrations:
        return
    try:
        timeout = aiohttp.ClientTimeout(total=5)
        async with aiohttp.ClientSession(timeout=timeout) as http:
            for integ in integrations:
                shaped = _integration_body(integ["key"], integ.get("config") or {}, lead)
                if shaped is None:
                    continue
                url, body = shaped
                try:
                    async with http.post(url, json=body) as resp:
                        if 200 <= resp.status < 300:
                            logger.info("delivered lead to %s integration", integ["key"])
                            db.touch_integration_sync(account_id, integ["key"])
                            if integ["key"] == "arthaleads":
                                db.set_call_arthaleads_status(call_id, "sent")
                        elif resp.status == 401:
                            db.mark_integration_error(account_id, integ["key"], "Invalid token — reconnect")
                            if integ["key"] == "arthaleads":
                                db.set_call_arthaleads_status(call_id, "failed", "Invalid token — reconnect")
                        else:
                            text = (await resp.text())[:200]
                            db.mark_integration_error(account_id, integ["key"], f"HTTP {resp.status}: {text}")
                            if integ["key"] == "arthaleads":
                                db.set_call_arthaleads_status(call_id, "failed", f"HTTP {resp.status}: {text}")
                except Exception:
                    logger.warning("integration %s delivery failed", integ["key"], exc_info=True)
                    db.mark_integration_error(account_id, integ["key"], "Network error — delivery failed")
                    if integ["key"] == "arthaleads":
                        db.set_call_arthaleads_status(call_id, "failed", "Network error — delivery failed")
    except Exception:
        logger.warning("integration fan-out failed", exc_info=True)


async def _fan_out_integrations(session, event: dict) -> None:
    await _deliver_to_integrations(session.account_id, event)


# --------------------------------------------------------------- appointments

@_register({
    "type": "function",
    "function": {
        "name": "check_calendar_availability",
        "description": (
            "Check real open appointment slots on the business's calendar for a date. "
            "Call this before offering times so you only offer slots that are actually free. "
            "Works for any business (clinic, salon, property visit, consultation)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "The date to check, in YYYY-MM-DD format."},
                "duration_minutes": {"type": "integer", "description": "How long the appointment needs to be. Default 30."},
            },
            "required": ["date"],
        },
    },
})
async def check_calendar_availability(session, date: str, duration_minutes: int = 30) -> str:
    logger.info("checking calendar availability for %s (%smin)", date, duration_minutes)
    slots = db.check_appointment_availability(session.account_id, date, duration_minutes)
    if slots is None:
        return (
            "No live calendar is connected, so I can't confirm exact open times. "
            "Note the caller's preferred date and time and tell them the team will confirm."
        )
    if not slots:
        return f"No open slots on {date}. Offer the caller a different day."
    return f"Open slots on {date}: {', '.join(slots)}. Offer these to the caller."


@_register({
    "type": "function",
    "function": {
        "name": "book_appointment",
        "description": (
            "Book a confirmed appointment on the business's calendar for any business (clinic visit, "
            "consultation, property visit, service booking). Only call this after confirming the slot "
            "is free with check_calendar_availability and the caller has agreed to a specific time."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date": {"type": "string", "description": "Appointment date in YYYY-MM-DD format."},
                "time": {"type": "string", "description": 'Appointment time, 24-hour "HH:MM", e.g. "14:30".'},
                "name": {"type": "string", "description": "The customer's name."},
                "phone": {"type": "string", "description": "The customer's phone number."},
                "purpose": {"type": "string", "description": 'What the appointment is for, e.g. "dental cleaning".'},
                "duration_minutes": {"type": "integer", "description": "Appointment length in minutes. Default 30."},
            },
            "required": ["date", "time", "name", "phone"],
        },
    },
})
async def book_appointment(
    session, date: str, time: str, name: str, phone: str, purpose: str = "", duration_minutes: int = 30
) -> str:
    logger.info("booking appointment: %s (%s) %s %s for %s", name, phone, date, time, purpose)
    session.lead_data.setdefault("name", name)
    session.lead_data.setdefault("phone", phone)
    # "site_visit" (not "appointment") is the key db.save_call and the
    # dashboard's "Site Visit Booked" status/analytics actually read.
    session.lead_data["site_visit"] = {"date": date, "time": time, "purpose": purpose}
    result = db.book_native_appointment(session.account_id, session.agent_id, date, time, duration_minutes, name, phone, purpose)
    event = {"type": "appointment_booked", "date": date, "time": time, "purpose": purpose, "name": name, "phone": phone}
    session.emit_event(event)
    await _post_webhook(event)
    await _fan_out_integrations(session, event)
    if result is None:
        return f"Noted the appointment request for {name} on {date} at {time}. Tell the caller the team will confirm it shortly."
    if not result.get("ok", True):
        return f"That slot couldn't be booked ({result.get('error', 'unavailable')}). Offer the caller another time."
    return f"Appointment confirmed for {name} on {date} at {time}. Confirm it warmly to the caller."


# --------------------------------------------------------------- lead capture

@_register({
    "type": "function",
    "function": {
        "name": "log_lead",
        "description": "Log a qualified lead's details captured during the call.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Lead's name."},
                "phone": {"type": "string", "description": "Lead's phone number."},
                "budget": {"type": "string", "description": "Budget range the lead mentioned."},
                "location": {"type": "string", "description": "Preferred location/area."},
                "timeline": {"type": "string", "description": 'Purchase timeline, e.g. "within 3 months".'},
            },
            "required": ["name", "phone"],
        },
    },
})
async def log_lead(session, name: str, phone: str, budget: str = "", location: str = "", timeline: str = "") -> str:
    logger.info("lead captured: name=%s phone=%s budget=%s location=%s timeline=%s", name, phone, budget, location, timeline)
    session.lead_data.update(name=name, phone=phone, budget=budget, location=location, timeline=timeline)
    event = {"type": "lead_update", "name": name, "phone": phone, "budget": budget, "location": location, "timeline": timeline}
    session.emit_event(event)
    await _post_webhook(event)
    await _fan_out_integrations(session, event)
    return "Lead details recorded."


@_register({
    "type": "function",
    "function": {
        "name": "capture_platform_lead",
        "description": (
            "Log a business lead captured while explaining Vistrow Voice itself "
            "(the platform-assistant persona, not a per-tenant sales call)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Lead's name."},
                "company": {"type": "string", "description": "The lead's company/business name."},
                "contact": {"type": "string", "description": "Phone number or email the lead gave to be reached at."},
                "use_case": {"type": "string", "description": 'What they want to use Vistrow Voice for.'},
                "team_size": {"type": "string", "description": 'Rough team/company size, e.g. "11-50".'},
            },
            "required": ["name", "contact"],
        },
    },
})
async def capture_platform_lead(session, name: str, contact: str, company: str = "", use_case: str = "", team_size: str = "") -> str:
    logger.info("platform lead captured: name=%s company=%s contact=%s use_case=%s team_size=%s", name, company, contact, use_case, team_size)
    session.lead_data.update(name=name, phone=contact, company=company, use_case=use_case, team_size=team_size)
    event = {
        "type": "platform_lead_update", "name": name, "company": company,
        "contact": contact, "phone": contact, "use_case": use_case, "team_size": team_size,
    }
    session.emit_event(event)
    await _post_webhook(event)
    await _fan_out_integrations(session, event)
    return "Lead details recorded."


# --------------------------------------------------------------- call control

@_register({
    "type": "function",
    "function": {
        "name": "end_call",
        "description": (
            "Call this once the caller has clearly indicated the conversation is over — they thank you "
            "with nothing further to ask, say goodbye, or otherwise signal they're done. Do NOT call this "
            "for a mere pause, a one-word 'okay', or mid-conversation small talk."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
})
async def end_call(session) -> str:
    session.ending_call = True
    return (
        "The caller is done. Give one short, warm goodbye line right now (thank them, wish them well) "
        "and then stop — do not ask any further questions or add anything after the goodbye."
    )


@_register({
    "type": "function",
    "function": {
        "name": "switch_reply_language",
        "description": (
            "Call this the INSTANT the caller asks you to switch what language you speak in — in any "
            "phrasing, in any language. This is the only reliable way to change your spoken language mid-call."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "language": {
                    "type": "string",
                    "description": (
                        "The language's plain English name — one of Hindi, English, Marathi, Tamil, "
                        "Telugu, Kannada, Malayalam, Gujarati, Bengali, Punjabi."
                    ),
                },
            },
            "required": ["language"],
        },
    },
})
async def switch_reply_language(session, language: str) -> str:
    code = _NAME_TO_LANGUAGE_CODE.get(language.strip().lower())
    if code is None:
        return f"'{language}' isn't a language this line supports switching to — stay in the current language and don't mention this limitation to the caller."
    if session.reply_language == code:
        return f"Already replying in {language} — just continue."
    session.reply_language = code
    voice_unsupported = session.tts_provider == "elevenlabs" and code not in ELEVENLABS_SUPPORTED_LANGUAGES
    logger.info("switch_reply_language -> %s (%s)%s", language, code, " [voice unsupported]" if voice_unsupported else "")
    if voice_unsupported:
        return (
            f"Reply language switched to {language} for your WORDS — write your next reply in {language}. "
            f"But this voice can't enforce {language} pronunciation specifically, so it may sound accented "
            "rather than fully native. Don't apologize for this or mention it unprompted."
        )
    return f"Reply language switched to {language}. Continue the conversation in {language} from your very next line."


@_register({
    "type": "function",
    "function": {
        "name": "transfer_call",
        "description": (
            "Transfer the caller to a human team member. Call this ONLY when the caller explicitly asks "
            "to speak to a human/agent/manager, or their request genuinely can't be handled by you."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
})
async def transfer_call(session) -> str:
    dest = (getattr(session, "transfer_phone", "") or "").strip()
    if not dest:
        return (
            "Transfer isn't set up for this line. Apologize briefly, offer to take a message or have "
            "the team call them back, and continue helping as best you can."
        )
    if session.call_type != "phone":
        # Matches agent/tools.py's exact wording for the same case — a web
        # call has nothing to bridge a phone transfer to.
        return (
            "This is a web call, which can't be transferred to a phone. Offer to have the team call "
            "them back at a number they give you, and capture it."
        )
    # A destination IS configured and this IS a phone call — but unlike
    # agent/tools.py's LiveKit path (which calls transfer_sip_participant),
    # EnableX's call-control API for an in-progress transfer hasn't been
    # confirmed/implemented here yet. Degrade honestly rather than silently
    # doing nothing while claiming success — same fallback wording
    # agent/tools.py uses when its own SIP transfer attempt fails.
    logger.warning("transfer_call requested but EnableX transfer isn't implemented yet (dest=%s)", dest)
    return (
        "The transfer couldn't go through right now. Apologize briefly, offer to take their number for "
        "a callback, and carry on helping them yourself."
    )


# --------------------------------------------------------------- web search

TAVILY_API_KEY = __import__("os").environ.get("TAVILY_API_KEY", "").strip()
_TAVILY_SEARCH_URL = "https://api.tavily.com/search"


@_register({
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the live web for current or factual information you don't already know — news, "
            "prices, 'what is/who is' facts, anything time-sensitive. Don't call this for questions the "
            "knowledge base or your instructions already answer."
        ),
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "A short, specific search query."}},
            "required": ["query"],
        },
    },
})
async def web_search(session, query: str) -> str:
    if not TAVILY_API_KEY:
        return "Web search isn't set up right now — answer from what you already know, don't mention this."
    try:
        timeout = aiohttp.ClientTimeout(total=8)
        async with aiohttp.ClientSession(timeout=timeout) as http:
            resp = await http.post(
                _TAVILY_SEARCH_URL,
                json={"api_key": TAVILY_API_KEY, "query": query, "search_depth": "basic", "include_answer": True, "max_results": 3},
            )
            data = await resp.json()
        answer = (data.get("answer") or "").strip()
        if answer:
            return answer[:800]
        results = data.get("results") or []
        if not results:
            return "No web results found for that — say so plainly and offer to help another way."
        snippets = "; ".join(f"{r.get('title', '')}: {r.get('content', '')[:150]}" for r in results[:3])
        return snippets[:800]
    except Exception:
        logger.warning("web_search failed for %r", query, exc_info=True)
        return "Web search failed right now — answer from what you already know, don't mention the error."


# --------------------------------------------------------------- custom functions

_CUSTOM_PARAM_TYPES = {"string": "string", "number": "number", "boolean": "boolean"}


def build_custom_function_tools(custom_functions: list[dict]) -> tuple[list[dict], dict[str, callable]]:
    """Turn an agent's operator-defined custom_functions JSON into
    (schemas, handlers) — same per-agent-config shape as
    agent/tools.py's build_custom_function_tools, returned as a pair so
    session.py can merge them into the global TOOL_SCHEMAS/TOOL_FUNCTIONS
    for the duration of one call without leaking between agents."""
    schemas: list[dict] = []
    handlers: dict[str, callable] = {}
    for spec in custom_functions or []:
        name = (spec.get("name") or "").strip()
        url = (spec.get("url") or "").strip()
        if not name or not url:
            continue
        params = spec.get("parameters") or []
        properties: dict[str, dict] = {}
        required: list[str] = []
        for param in params:
            pname = (param.get("name") or "").strip()
            if not pname:
                continue
            ptype = _CUSTOM_PARAM_TYPES.get((param.get("type") or "string").lower(), "string")
            properties[pname] = {"type": ptype, "description": param.get("description") or ""}
            if param.get("required"):
                required.append(pname)
        method = (spec.get("method") or "POST").upper()
        headers = spec.get("headers") if isinstance(spec.get("headers"), dict) else {}
        schemas.append({
            "type": "function",
            "function": {
                "name": name,
                "description": spec.get("description") or f"Call the {name} function.",
                "parameters": {"type": "object", "properties": properties, "required": required},
            },
        })

        def _make(url=url, method=method, headers=headers, fname=name):
            async def _call(session, **raw_arguments) -> str:
                try:
                    timeout = aiohttp.ClientTimeout(total=10)
                    async with aiohttp.ClientSession(timeout=timeout) as http:
                        if method == "GET":
                            resp = await http.get(url, params=raw_arguments, headers=headers)
                        else:
                            resp = await http.request(method, url, json=raw_arguments, headers=headers)
                        text = await resp.text()
                    return text[:2000] if text else f"{fname} completed (status {resp.status})."
                except Exception:
                    logger.warning("custom function %s failed", fname, exc_info=True)
                    return f"The {fname} action could not be completed right now."

            return _call

        handlers[name] = _make()
    return schemas, handlers
