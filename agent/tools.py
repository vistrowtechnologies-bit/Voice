import json
import logging

import aiohttp
from livekit.agents import RunContext
from livekit.agents.llm import function_tool

import db

logger = logging.getLogger("real-estate-tools")


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


async def _publish_event(context: RunContext, payload: dict) -> None:
    """Push a structured event to the browser client over the room data channel.

    The frontend's useDataChannel hook picks these up to render the live
    qualification summary without needing a database round-trip yet.
    """
    room = (context.userdata or {}).get("room")
    if room is None:
        return
    await room.local_participant.publish_data(json.dumps(payload), topic="lead-events")


@function_tool
async def check_availability(context: RunContext, property_id: str, preferred_date: str) -> str:
    """Check site-visit slot availability for a property on a given date.

    Args:
        property_id: The property/listing identifier the lead is interested in.
        preferred_date: The date the lead wants to visit, in YYYY-MM-DD format.
    """
    logger.info("checking availability for %s on %s", property_id, preferred_date)
    # TODO(phase 3): replace with a real inventory/CRM lookup.
    return f"Slots available on {preferred_date} at 11:00 AM and 4:00 PM for property {property_id}."


@function_tool
async def book_site_visit(
    context: RunContext,
    property_id: str,
    date: str,
    time: str,
    lead_name: str,
    lead_phone: str,
) -> str:
    """Book a confirmed site visit slot for a qualified lead.

    Args:
        property_id: The property/listing identifier.
        date: Visit date in YYYY-MM-DD format.
        time: Visit time, e.g. "11:00 AM".
        lead_name: The lead's name.
        lead_phone: The lead's phone number.
    """
    logger.info(
        "booking site visit: %s (%s) -> %s on %s %s",
        lead_name,
        lead_phone,
        property_id,
        date,
        time,
    )
    lead_data = (context.userdata or {}).get("lead_data")
    if lead_data is not None:
        lead_data.setdefault("name", lead_name)
        lead_data.setdefault("phone", lead_phone)
        lead_data["site_visit"] = {"property_id": property_id, "date": date, "time": time}
    event = {
        "type": "site_visit_booked",
        "property_id": property_id,
        "date": date,
        "time": time,
        "lead_name": lead_name,
        "lead_phone": lead_phone,
    }
    await _publish_event(context, event)
    await _post_webhook(event)
    return f"Site visit booked for {lead_name} on {date} at {time}."


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
    await _publish_event(context, event)
    await _post_webhook(event)
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
        "use_case": use_case,
        "team_size": team_size,
    }
    await _publish_event(context, event)
    await _post_webhook(event)
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
