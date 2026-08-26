import asyncio
import json
import logging
import os
import random
import re

import aiohttp
from livekit.agents import RunContext
from livekit.agents.llm import function_tool

import db
from language import ELEVENLABS_SUPPORTED_LANGUAGES, LANGUAGE_NAMES, detect_reply_language

logger = logging.getLogger("real-estate-tools")

# Spoken via RunContext.with_filler() while a tool's webhook/integration
# fan-out is in flight (log_lead, book_appointment, capture_platform_lead) -
# that sequence of awaited network calls was measured live at ~1.8s, long
# enough that the caller was sitting in dead air waiting for the actual
# reply. delay=0.6 at each call site means this only fires if the tool is
# genuinely still running past that point, not on a fast/cached response.
# One short, code-switch-friendly line rather than a per-language dict -
# "one second" is said in English mid-sentence across every Indian language
# this product speaks, so it doesn't need translating to sound natural.
_TOOL_FILLER_TEXT = "One second..."

# Availability checks need an immediate spoken bridge, even though the native
# calendar lookup itself is usually fast. Without one, the caller asks for a
# slot and hears a dead beat before the agent suddenly starts listing times.
# Keep this separate from _TOOL_FILLER_TEXT: that generic delayed filler is for
# genuinely slow integration fan-out, while this line is part of the natural
# front-desk interaction and must match the language currently being spoken.
_CALENDAR_CHECK_FILLERS = {
    "hi-IN": {
        "female": "एक मिनट, चेक करके बताती हूँ।",
        "male": "एक मिनट, चेक करके बताता हूँ।",
    },
    "en-IN": {"default": "One moment, let me check that for you."},
    "mr-IN": {
        "female": "एक मिनिट, तपासून सांगते.",
        "male": "एक मिनिट, तपासून सांगतो.",
    },
    "ta-IN": {"default": "ஒரு நிமிடம், பார்த்துச் சொல்கிறேன்."},
    "te-IN": {"default": "ఒక్క నిమిషం, చూసి చెబుతాను."},
    "kn-IN": {"default": "ಒಂದು ನಿಮಿಷ, ನೋಡಿ ಹೇಳುತ್ತೇನೆ."},
    "ml-IN": {"default": "ഒരു മിനിറ്റ്, നോക്കി പറയാം."},
    "gu-IN": {"default": "એક મિનિટ, તપાસીને કહું છું."},
    "bn-IN": {"default": "এক মিনিট, দেখে বলছি।"},
    "pa-IN": {
        "female": "ਇੱਕ ਮਿੰਟ, ਚੈੱਕ ਕਰਕੇ ਦੱਸਦੀ ਹਾਂ।",
        "male": "ਇੱਕ ਮਿੰਟ, ਚੈੱਕ ਕਰਕੇ ਦੱਸਦਾ ਹਾਂ।",
    },
    "od-IN": {"default": "ଗୋଟେ ମିନିଟ୍, ଦେଖିକି କହୁଛି।"},
}

# The public role-play demos should sound like an employee checking the thing
# the caller actually asked for, not a generic tool spinner. These are spoken
# only in Hindi/English; every other supported language keeps the translated
# generic line above rather than hearing an unexpected language switch.
_INDUSTRY_CALENDAR_CHECK_FILLERS = {
    "healthcare": {
        "hi-IN": {
            "female": (
                "जी, एक मिनट—डॉक्टर के स्लॉट्स चेक कर रही हूँ।",
                "हम्म, एक सेकंड... डॉक्टर की availability देखती हूँ।",
            ),
            "male": (
                "जी, एक मिनट—डॉक्टर के स्लॉट्स चेक कर रहा हूँ।",
                "हम्म, एक सेकंड... डॉक्टर की availability देखता हूँ।",
            ),
        },
        "en-IN": {"default": ("One moment — I'm checking the doctor's slots.", "Hmm, one second... let me check the calendar.")},
    },
    "real-estate": {
        "hi-IN": {
            "female": ("जी, एक मिनट—साइट विज़िट के स्लॉट्स देख रही हूँ।",),
            "male": ("जी, एक मिनट—साइट विज़िट के स्लॉट्स देख रहा हूँ।",),
        },
        "en-IN": {"default": ("One moment — I'm checking the site-visit slots.",)},
    },
    "finance": {
        "hi-IN": {
            "female": ("जी, एक मिनट—callback का समय चेक कर रही हूँ।",),
            "male": ("जी, एक मिनट—callback का समय चेक कर रहा हूँ।",),
        },
        "en-IN": {"default": ("One moment — I'm checking a callback time.",)},
    },
    "support": {
        "hi-IN": {
            "female": ("एक सेकंड, callback का स्लॉट देख रही हूँ।",),
            "male": ("एक सेकंड, callback का स्लॉट देख रहा हूँ।",),
        },
        "en-IN": {"default": ("One second — I'm checking a callback slot.",)},
    },
}

_NAME_TO_LANGUAGE_CODE = {name.lower(): code for code, name in LANGUAGE_NAMES.items()}

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "").strip()
_TAVILY_SEARCH_URL = "https://api.tavily.com/search"


def _calendar_check_filler(context: RunContext) -> str:
    """Natural, language-matched bridge spoken before a calendar lookup."""
    agent = context.session.current_agent
    language = getattr(agent, "_reply_language", "en-IN")
    gender = getattr(agent, "_voice_gender", "female")
    demo_slug = getattr(agent, "_public_demo_slug", "")
    industry_options = (_INDUSTRY_CALENDAR_CHECK_FILLERS.get(demo_slug) or {}).get(language)
    if industry_options:
        variants = industry_options.get(gender) or industry_options.get("default")
        if variants:
            return random.choice(variants)
    options = _CALENDAR_CHECK_FILLERS.get(language) or _CALENDAR_CHECK_FILLERS["en-IN"]
    return options.get(gender) or options.get("default") or _TOOL_FILLER_TEXT


async def _post_webhook(payload: dict) -> None:
    """Push the event to the CRM webhook configured on the Integrations page.

    Best-effort with a short timeout — a slow or dead endpoint must never
    stall the live call.
    """
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


# Same Hinglish-aware word lists the dashboard's own sentiment badge uses
# (server/calls_db.py's _sentiment) — duplicated here since agent/ and
# server/ are separate deployables that don't share code.
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
    visitor_text = " ".join(
        (t.get("text") or "").lower() for t in transcript if t.get("role") == "user"
    )
    negative = sum(1 for w in _NEGATIVE_WORDS if w in visitor_text)
    positive = sum(1 for w in _POSITIVE_WORDS if w in visitor_text)
    if negative > positive:
        return "negative"
    if positive > negative:
        return "positive"
    return "neutral"


_CHANNEL_LABELS = {"phone": "Phone", "widget": "Website Widget", "browser": "Web"}


def _transcript_message(lead: dict) -> str:
    """Render lead['transcript'] (list of {role, text}) as readable
    "Caller: ..." / "Agent: ..." lines for CRMs that want one freeform text
    field (e.g. a "message" or "requirements" field) rather than a
    structured transcript array. Empty string if there's no transcript on
    this event (mid-call events like capture_lead/book_appointment don't
    carry one — only the call-end event in agent/main.py's log_call does)."""
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
    """(url, json_body) for one delivery integration, or None to skip. Mirrors
    the backend integrations_dispatch shapes so a Slack test-send and a live
    call produce the same message."""
    name = lead.get("name") or "Unknown caller"
    if key == "arthaleads":
        # Dedicated, first-class integration: the endpoint is fixed (not a
        # user-pasted URL) and the only thing the operator configures is
        # their ArthaLeads API token. Fires exactly once per call — at
        # call-end, with the full transcript — unlike the other
        # integrations, which also get a small mid-call event per tool
        # call. Mid-call events here are skipped by design.
        #
        # Deliberately NOT gated on whether the LLM happened to call
        # log_lead/book_appointment during the conversation — every widget
        # visitor already went through a required name/phone/email form
        # before the call even started, so every completed widget call is a
        # real lead worth having in the CRM, regardless of what tools the
        # model chose to invoke.
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
            # Freeform summary for CRMs that only have one text field...
            "message": _transcript_message(lead),
            # ...and the structured version for a dedicated Transcript view.
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
    # webhook + sheets: full lead JSON, plus a readable "message" field (the
    # transcript, when there is one) and an optional auth token embedded in
    # the body — some receivers (e.g. a CRM's inbound-lead endpoint) expect
    # a body-level token rather than an Authorization header.
    body = {**lead, "message": _transcript_message(lead)}
    token = (config.get("token") or "").strip()
    if token:
        body["token"] = token
    return url, body


async def _deliver_to_integrations(account_id: int | None, lead: dict, call_id: int | None = None) -> None:
    """Deliver an event to every connected integration for this tenant.
    Best-effort and heavily guarded — never lets a bad integration disturb the
    live call. The per-agent CRM webhook (_post_webhook) still fires separately.

    Takes account_id directly rather than a RunContext so it can be called
    from both mid-call function tools (via _fan_out_integrations below) and
    agent/main.py's call-end log_call(), which has no RunContext at all.

    call_id (only ever set from log_call, never mid-call) additionally
    records THIS call's own ArthaLeads outcome on its calls row — separate
    from the integration-level last_sync/last_error, which only reflect the
    most recent attempt across every call and can't answer "did THIS lead
    make it to the CRM?" from the call's own detail page.
    """
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
                            logger.warning("integration %s delivery failed: invalid token", integ["key"])
                            db.mark_integration_error(account_id, integ["key"], "Invalid token — reconnect")
                            if integ["key"] == "arthaleads":
                                db.set_call_arthaleads_status(call_id, "failed", "Invalid token — reconnect")
                        else:
                            text = (await resp.text())[:200]
                            logger.warning("integration %s delivery failed: HTTP %s", integ["key"], resp.status)
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


async def _fan_out_integrations(context: RunContext, lead: dict) -> None:
    """Mid-call convenience wrapper — pulls account_id from the function
    tool's RunContext.userdata. See _deliver_to_integrations for the actual
    delivery logic."""
    await _deliver_to_integrations((context.userdata or {}).get("account_id"), lead)


async def _publish_event(context: RunContext, payload: dict) -> None:
    """Push a structured event to the browser client over the room data channel.

    The frontend's useDataChannel hook picks these up to render the live
    qualification summary without needing a database round-trip yet.
    """
    room = (context.userdata or {}).get("room")
    if room is None:
        return
    await room.local_participant.publish_data(json.dumps(payload), topic="lead-events")


async def _calendar_check(context: RunContext, date: str, duration_minutes: int) -> list[str] | None:
    """Real open HH:MM slots for `date` from the native appointments system
    (server/calls_db.py's counterpart is the source of truth for the
    dashboard; this queries the same `appointments` table directly). None
    only on a genuine DB error — a native calendar always exists, so unlike
    the old Google-Calendar-backed version this no longer means "not
    connected"."""
    account_id = (context.userdata or {}).get("account_id")
    return db.check_appointment_availability(account_id, date, duration_minutes)


async def _calendar_book(
    context: RunContext, date: str, time: str, duration_minutes: int, name: str, phone: str, purpose: str
) -> dict | None:
    """{"ok": bool, "error"?: str}, or None only on a genuine DB error."""
    account_id = (context.userdata or {}).get("account_id")
    agent_id = (context.userdata or {}).get("agent_id")
    return db.book_native_appointment(account_id, agent_id, date, time, duration_minutes, name, phone, purpose)


@function_tool
async def check_calendar_availability(
    context: RunContext, date: str, duration_minutes: int = 30, requested_time: str = ""
) -> str:
    """Check real open appointment slots on the business's calendar for a date.
    Call this before offering times so you only offer slots that are actually
    free. Works for any business (clinic, salon, property visit, consultation).

    Args:
        date: The date to check, in YYYY-MM-DD format.
        duration_minutes: How long the appointment needs to be. Default 30.
        requested_time: If the caller already named a specific time (24-hour
            "HH:MM", e.g. "13:00"), pass it here so the tool tells you
            directly whether THAT exact time is free — don't try to
            eyeball-match it against the slot list yourself.
    """
    logger.info(
        "checking calendar availability for %s (%smin, requested=%s)", date, duration_minutes, requested_time or "-"
    )
    # This is intentionally immediate rather than delay=0.6 like the generic
    # integration filler below. The caller has just asked us to look at the
    # calendar, so a short "एक मिनट, चेक करके बताती हूँ" is a meaningful
    # front-desk acknowledgement, not narration of invisible processing.
    # Start the real DB lookup underneath the spoken bridge — the agent is
    # genuinely checking while it says "एक मिनट, चेक कर रही हूँ", rather
    # than narrating first and only then beginning the work. The line is very
    # short and deliberately non-interruptible so it cannot disappear from
    # playout when the caller makes a small acknowledgement such as "हाँ".
    slots_task = asyncio.create_task(_calendar_check(context, date, duration_minutes))
    try:
        filler = context.session.say(_calendar_check_filler(context), allow_interruptions=False)
        await filler.wait_for_playout()
        slots = await slots_task
    except BaseException:
        if not slots_task.done():
            slots_task.cancel()
        try:
            await slots_task
        except BaseException:
            pass
        raise
    if slots is None:
        # A native calendar always exists now — None here means the DB call
        # itself failed. Don't invent slots; hand off honestly.
        return (
            "No live calendar is connected, so I can't confirm exact open times. "
            "Note the caller's preferred date and time and tell them the team will confirm."
        )
    if not slots:
        return f"No open slots on {date}. Offer the caller a different day."
    # Confirmed real failure: a caller who hadn't named a time got all
    # sixteen open slots for the day read out in one breath ("10, 10:30,
    # 11, 11:30, 12, 12:30..."), which is the exact IVR-menu monologue this
    # product exists to avoid, and produced nothing but the caller saying
    # "ok, ok, ok, ok, ok" until it stopped. Offer at most 2-3 - e.g. a
    # morning, afternoon, and evening option - and offer more only if the
    # caller asks. This applies whether or not requested_time is set.
    if requested_time:
        # Deterministic exact-match check instead of leaving the model to
        # scan a long comma list itself — a 2026-08-03 real call had the
        # model claim a genuinely-open time ("13:00", present in the slot
        # list) was unavailable. Stating the verdict directly removes that
        # failure mode for the one case that matters most: the exact time
        # the caller just asked for.
        if requested_time in slots:
            return (
                f"YES — {requested_time} on {date} IS available. Offer it back to the caller and book it if they "
                f"confirm; do not claim it's unavailable."
            )
        alternatives = slots[:3]
        return (
            f"NO — {requested_time} on {date} is NOT available (already booked or outside business hours). "
            f"Do not offer {requested_time}. Offer only these alternatives: {', '.join(alternatives)}."
        )
    # Never expose the entire day to the model: in a real failed call it
    # ignored the prose instruction and read sixteen slots aloud, then even
    # hallucinated every :30 value as :32. Three representative choices are
    # enough for a natural phone turn; a caller can name another time and the
    # next tool call verifies that exact requested_time.
    if len(slots) <= 3:
        choices = slots
    else:
        choices = [slots[0], slots[len(slots) // 2], slots[-1]]
    return (
        f"Offer ONLY these open choices on {date}: {', '.join(choices)}. "
        "Do not mention any other time or read a full-day list. If none suits, ask whether the caller "
        "prefers morning, afternoon, or evening, then check their exact requested time."
    )


@function_tool
async def book_appointment(
    context: RunContext,
    date: str,
    time: str,
    name: str,
    phone: str,
    purpose: str = "",
    duration_minutes: int = 30,
) -> str:
    """Book a confirmed appointment on the business's calendar for any business
    (clinic visit, consultation, property visit, service booking). Only call
    this after confirming the slot is free with check_calendar_availability and
    the caller has agreed to a specific time.

    Args:
        date: Appointment date in YYYY-MM-DD format.
        time: Appointment time, 24-hour "HH:MM", e.g. "14:30".
        name: The customer's name.
        phone: The customer's phone number.
        purpose: What the appointment is for, e.g. "dental cleaning", "site visit".
        duration_minutes: Appointment length in minutes. Default 30.
    """
    clean_name = (name or "").strip()
    clean_phone = (phone or "").strip()
    clean_purpose = (purpose or "").strip()
    phone_digits = re.sub(r"\D", "", clean_phone)
    placeholder_names = {"caller", "customer", "patient", "unknown", "not provided", "na", "n/a", "name"}
    if len(clean_name) < 2 or clean_name.lower() in placeholder_names:
        return (
            "BOOKING REJECTED — the caller's real name is missing. Ask for their name and do not say "
            "the appointment is booked or confirmed."
        )
    if len(phone_digits) < 8:
        return (
            "BOOKING REJECTED — a real callback phone number is missing or invalid. Ask for it and do "
            "not say the appointment is booked or confirmed."
        )
    if len(clean_purpose) < 3 or clean_purpose.lower() in {"unknown", "not provided", "na", "n/a"}:
        return (
            "BOOKING REJECTED — the reason/purpose is missing. Ask what the visit is for and do not say "
            "the appointment is booked or confirmed."
        )
    name, phone, purpose = clean_name, clean_phone, clean_purpose
    logger.info("booking appointment: %s (%s) %s %s for %s", name, phone, date, time, purpose)
    lead_data = (context.userdata or {}).get("lead_data")
    if lead_data is not None:
        lead_data.setdefault("name", name)
        lead_data.setdefault("phone", phone)
        # "site_visit" (not "appointment") is the key agent/db.py's save_call
        # and the dashboard's "Site Visit Booked" status/analytics actually
        # read — an "appointment" key here would silently vanish, saved
        # nowhere and shown nowhere.
        lead_data["site_visit"] = {"date": date, "time": time, "purpose": purpose}
    async with context.with_filler(_TOOL_FILLER_TEXT, delay=0.6):
        result = await _calendar_book(context, date, time, duration_minutes, name, phone, purpose)
        event = {
            "type": "appointment_booked",
            "date": date,
            "time": time,
            "purpose": purpose,
            "name": name,
            "phone": phone,
        }
        await _publish_event(context, event)
        await _post_webhook(event)
        await _fan_out_integrations(context, event)
    if result is None:
        # Recorded on the lead + pushed to integrations, but the native
        # calendar DB call failed — be honest rather than claim a slot exists.
        return (
            f"Noted the appointment request for {name} on {date} at {time}. "
            "Tell the caller the team will confirm it shortly."
        )
    if not result.get("ok", True):
        return (
            f"That slot couldn't be booked ({result.get('error', 'unavailable')}). "
            "Offer the caller another time."
        )
    context.session.current_agent._booking_confirmed_this_turn = True
    return f"Appointment confirmed for {name} on {date} at {time}. Confirm it warmly to the caller."


@function_tool
async def log_lead(
    context: RunContext,
    name: str,
    phone: str,
    budget: str,
    location: str,
    timeline: str,
) -> str:
    """Log a qualified lead's details captured during the call.

    Args:
        name: Lead's name.
        phone: Lead's phone number.
        budget: Budget range the lead mentioned.
        location: Preferred location/area.
        timeline: Purchase timeline, e.g. "within 3 months".
    """
    logger.info(
        "lead captured: name=%s phone=%s budget=%s location=%s timeline=%s",
        name,
        phone,
        budget,
        location,
        timeline,
    )
    lead_data = (context.userdata or {}).get("lead_data")
    if lead_data is not None:
        lead_data.update(name=name, phone=phone, budget=budget, location=location, timeline=timeline)
    event = {
        "type": "lead_update",
        "name": name,
        "phone": phone,
        "budget": budget,
        "location": location,
        "timeline": timeline,
    }
    async with context.with_filler(_TOOL_FILLER_TEXT, delay=0.6):
        await _publish_event(context, event)
        await _post_webhook(event)
        await _fan_out_integrations(context, event)
    return "Lead details recorded."


@function_tool
async def capture_platform_lead(
    context: RunContext,
    name: str,
    company: str,
    contact: str,
    use_case: str,
    team_size: str,
) -> str:
    """Log a business lead captured while explaining Vistrow Voice itself
    (the platform-assistant persona, not a per-tenant sales call).

    Args:
        name: Lead's name.
        company: The lead's company/business name.
        contact: Phone number or email the lead gave to be reached at.
        use_case: What they want to use Vistrow Voice for, e.g. "inbound lead
            qualification for a real-estate brokerage".
        team_size: Rough team/company size the lead mentioned, e.g. "11-50".
    """
    logger.info(
        "platform lead captured: name=%s company=%s contact=%s use_case=%s team_size=%s",
        name, company, contact, use_case, team_size,
    )
    lead_data = (context.userdata or {}).get("lead_data")
    if lead_data is not None:
        lead_data.update(name=name, phone=contact, company=company, use_case=use_case, team_size=team_size)
    event = {
        "type": "platform_lead_update",
        "name": name,
        "company": company,
        "contact": contact,
        "phone": contact,
        "use_case": use_case,
        "team_size": team_size,
    }
    async with context.with_filler(_TOOL_FILLER_TEXT, delay=0.6):
        await _publish_event(context, event)
        await _post_webhook(event)
        await _fan_out_integrations(context, event)
    return "Lead details recorded."


@function_tool
async def end_call(context: RunContext) -> str:
    """Call this once the caller has clearly indicated the conversation is
    over — they thank you with nothing further to ask, say goodbye, or
    otherwise signal they're done. Do NOT call this for a mere pause, a
    one-word "okay", or mid-conversation small talk — only on a clear
    end-of-call signal. main.py watches for the agent's speech to finish
    after this tool returns, then actually ends the call for both sides.
    """
    if context.userdata is not None:
        context.userdata["ending_call"] = True
    return (
        "The caller is done. Give one short, warm goodbye line right now (thank them, wish them well) "
        "and then stop — do not ask any further questions or add anything after the goodbye."
    )


def _last_user_utterance(context: RunContext) -> str | None:
    """Most recent thing the caller actually said, as committed transcript
    text — used by switch_reply_language to sanity-check a switch against
    the same script-confidence bar detect_reply_language() already applies
    to the automatic per-turn reply_language tracking in main.py. Without
    this, the tool path had NO such check: the LLM is told to switch when
    "the caller's own words are themselves in a different language", but it
    is reading raw STT output, including a single mis-transcribed word, with
    no way to tell that apart from a real switch."""
    try:
        items = context.session.history.items
    except Exception:
        return None
    for item in reversed(items):
        if getattr(item, "role", None) == "user" and getattr(item, "text_content", None):
            return item.text_content
    return None


@function_tool
async def switch_reply_language(context: RunContext, language: str) -> str:
    """Call this the INSTANT the caller asks you to switch what language you
    speak in — in any phrasing, in any language ("let's speak in Marathi",
    "मराठीत बोलूया", "can you do Tamil instead", "angrezi mein baat karo").

    This is the only reliable way to change your spoken language mid-call.
    The system cannot reliably auto-detect a switch from the caller's words
    alone — Hindi and Marathi in particular are written in the exact same
    script, so nothing downstream can tell them apart without you flagging
    it explicitly. If you don't call this, your VOICE keeps its old
    language's pronunciation even after you start writing replies in the new
    language, which sounds foreign/accented to the caller — so always call
    this before your first reply in the new language, not after.

    Args:
        language: The language's plain English name — one of Hindi, English,
            Marathi, Tamil, Telugu, Kannada, Malayalam, Gujarati, Bengali,
            Punjabi.
    """
    code = _NAME_TO_LANGUAGE_CODE.get(language.strip().lower())
    if code is None:
        return (
            f"'{language}' isn't a language this line supports switching to — stay in "
            "the current language and don't mention this limitation to the caller."
        )
    agent = context.session.current_agent
    if getattr(agent, "_reply_language", None) == code:
        return f"Already replying in {language} — just continue."

    # Confirmed live in production (2026-08-22): a caller saying a Hindi
    # place name ("बानेर") got mis-transcribed by STT as ~4 characters of
    # Bengali script. The LLM, following its own instruction to switch when
    # "the caller's own words are themselves in a different language", called
    # this tool with "Bengali" and it was honored outright — the agent then
    # replied to a Hindi-speaking caller entirely in Bengali for the rest of
    # the call. detect_reply_language() already declines exactly this input
    # (too short/low-confidence a script majority) for the automatic
    # per-turn path; this tool had no equivalent check at all. A confident
    # detection of ANY language (not just a match on the requested one) is
    # accepted as real evidence a switch or request genuinely happened —
    # explicit requests are typically phrased in the CALLER'S CURRENT
    # language ("please speak in English"), so requiring the detected script
    # to equal the target would wrongly block those.
    #
    # Trade-off, accepted deliberately: a bare one-word request (just
    # "Hindi") is below detect_reply_language's own two-word minimum and
    # will be declined too. That degrades to the agent asking the caller to
    # repeat themselves — safe, if mildly annoying — versus the alternative
    # of derailing the whole call into the wrong language on STT noise.
    if detect_reply_language(_last_user_utterance(context)) is None:
        return (
            f"Not switching to {language} — the caller's last message is too short or unclear "
            "to confirm this is a real language switch or request (it may be a mis-transcribed "
            "word). Stay in the current language, and if you're not sure what they want, ask "
            "them to repeat or clarify which language they'd like."
        )
    voice_unsupported = False
    if hasattr(agent, "_reply_language"):
        agent._reply_language = code
        agent._pending_language = None
        agent._pending_language_streak = 0
        try:
            provider = getattr(agent, "_tts_provider", None)
            if provider == "elevenlabs":
                # eleven_flash_v2_5 hard-rejects a `language` code outside its
                # own 32-language list — confirmed live in production: it
                # kills the TTS WebSocket entirely and the agent goes
                # silently dead for the rest of the call. Only enforce a
                # language it actually accepts (see language.py); otherwise
                # the LLM's text still switches (that's provider-independent)
                # but the voice keeps auto-detecting rather than crashing.
                if code in ELEVENLABS_SUPPORTED_LANGUAGES:
                    agent.tts.update_options(language=code.split("-")[0])
                else:
                    voice_unsupported = True
            elif provider in ("google-multilingual", "google-multilingual-31"):
                raw_voice = getattr(agent, "_voice", "")
                is_google_31 = raw_voice.startswith("google31:")
                voice_name = raw_voice.removeprefix("google31:" if is_google_31 else "google:")
                agent.tts.update_options(
                    language=code,
                    voice_name=voice_name.capitalize(),
                    model_name="gemini-3.1-flash-tts-preview" if is_google_31 else "gemini-2.5-flash-tts",
                )
            elif provider == "google-native":
                voice_unsupported = True
            elif provider not in (None, "elevenlabs-v3"):
                agent.tts.update_options(target_language_code=code)
            # elevenlabs-v3 (StreamAdapter) has no update_options — same
            # known limitation as the automatic switch path in main.py.
        except Exception:
            logger.warning("switch_reply_language: update_options failed", exc_info=True)
    logger.info("switch_reply_language -> %s (%s)%s", language, code, " [voice unsupported]" if voice_unsupported else "")
    if voice_unsupported:
        return (
            f"Reply language switched to {language} for your WORDS — write your next reply in "
            f"{language}. But this voice can't enforce {language} pronunciation specifically, so it "
            "may sound accented rather than fully native. Don't apologize for this or mention it "
            "unprompted; only acknowledge it briefly if the caller comments on the accent."
        )
    return f"Reply language switched to {language}. Continue the conversation in {language} from your very next line."


@function_tool
async def web_search(context: RunContext, query: str) -> str:
    """Search the live web for current or factual information you don't
    already know — news, prices, "what is/who is" facts, anything
    time-sensitive. Don't call this for questions the knowledge base or your
    instructions already answer.

    Args:
        query: A short, specific search query capturing what to look up.
    """
    if not TAVILY_API_KEY:
        return "Web search isn't set up right now — answer from what you already know, don't mention this."
    try:
        timeout = aiohttp.ClientTimeout(total=8)
        async with aiohttp.ClientSession(timeout=timeout) as http:
            resp = await http.post(
                _TAVILY_SEARCH_URL,
                json={
                    "api_key": TAVILY_API_KEY,
                    "query": query,
                    "search_depth": "basic",
                    "include_answer": True,
                    "max_results": 3,
                },
            )
            data = await resp.json()
        logger.info("web_search %r -> %s", query, resp.status)
        answer = (data.get("answer") or "").strip()
        if answer:
            return answer[:800]
        results = data.get("results") or []
        if not results:
            return "No web results found for that — say so plainly and offer to help another way."
        # No summarized answer from Tavily this time — hand back short
        # title/snippet pairs so the model can compose its own summary.
        snippets = "; ".join(f"{r.get('title', '')}: {r.get('content', '')[:150]}" for r in results[:3])
        return snippets[:800]
    except Exception:
        logger.warning("web_search failed for %r", query, exc_info=True)
        return "Web search failed right now — answer from what you already know, don't mention the error."


def _find_sip_participant(room) -> str | None:
    """Identity of the phone caller in the room, or None on a web call.

    A phone caller joins via LiveKit SIP — kind == PARTICIPANT_KIND_SIP, and
    by our dispatch convention their identity is prefixed "sip_". A browser
    visitor has neither, so transfer is a no-op for web calls."""
    if room is None:
        return None
    for participant in room.remote_participants.values():
        kind = str(getattr(participant, "kind", "")).upper()
        identity = participant.identity or ""
        if "SIP" in kind or identity.startswith("sip_"):
            return identity
    return None


@function_tool
async def transfer_call(context: RunContext) -> str:
    """Transfer the caller to a human team member. Call this ONLY when the
    caller explicitly asks to speak to a human/agent/manager, or when their
    request genuinely can't be handled by you and a handoff is the right next
    step. Do not offer or perform a transfer unprompted for routine questions.
    """
    userdata = context.userdata or {}
    dest = (userdata.get("transfer_phone") or "").strip()
    room = userdata.get("room")
    if not dest:
        return (
            "Transfer isn't set up for this line. Apologize briefly, offer to take a message or have "
            "the team call them back, and continue helping as best you can."
        )
    sip_identity = _find_sip_participant(room)
    if sip_identity is None:
        return (
            "This is a web call, which can't be transferred to a phone. Offer to have the team call "
            "them back at a number they give you, and capture it."
        )
    transfer_to = dest if dest.startswith(("tel:", "sip:")) else f"tel:{dest}"
    try:
        from livekit import api

        lkapi = api.LiveKitAPI()
        try:
            await lkapi.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    participant_identity=sip_identity,
                    room_name=room.name,
                    transfer_to=transfer_to,
                    play_dialtone=True,
                )
            )
        finally:
            await lkapi.aclose()
        logger.info("transferred caller %s to %s", sip_identity, transfer_to)
        return (
            "Tell the caller you're connecting them to a team member now, one short line, then stop — "
            "the transfer is already happening."
        )
    except Exception:
        logger.warning("SIP transfer failed", exc_info=True)
        return (
            "The transfer couldn't go through. Apologize briefly, offer to take their number for a "
            "callback, and carry on helping them yourself."
        )


# JSON-schema type strings an operator can pick for a custom-function param,
# mapped to their JSON Schema equivalent (which is what the LLM API expects).
_CUSTOM_PARAM_TYPES = {"string": "string", "number": "number", "boolean": "boolean"}


def build_custom_function_tools(custom_functions: list[dict]) -> list:
    """Turn an agent's operator-defined custom_functions JSON into live LLM
    tools. Each definition looks like:

        {"name", "description", "url", "method", "headers": {...},
         "parameters": [{"name", "type", "description", "required"}]}

    When the LLM calls one, we POST/GET its `url` with the collected arguments
    and hand the response text back to the model. Malformed entries are
    skipped rather than crashing agent startup.
    """
    tools = []
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
        raw_schema = {
            "name": name,
            "description": spec.get("description") or f"Call the {name} function.",
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        }

        def _make(url=url, method=method, headers=headers, fname=name):
            async def _call(raw_arguments: dict) -> str:
                try:
                    timeout = aiohttp.ClientTimeout(total=10)
                    async with aiohttp.ClientSession(timeout=timeout) as http:
                        if method == "GET":
                            resp = await http.get(url, params=raw_arguments, headers=headers)
                        else:
                            resp = await http.request(method, url, json=raw_arguments, headers=headers)
                        text = await resp.text()
                    logger.info("custom function %s -> %s", fname, resp.status)
                    # Cap what we feed back to the LLM so a huge response can't
                    # blow up the context window.
                    return text[:2000] if text else f"{fname} completed (status {resp.status})."
                except Exception:
                    logger.warning("custom function %s failed", fname, exc_info=True)
                    return f"The {fname} action could not be completed right now."

            return _call

        tools.append(function_tool(_make(), raw_schema=raw_schema))
    return tools
