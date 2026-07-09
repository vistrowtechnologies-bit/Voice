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
