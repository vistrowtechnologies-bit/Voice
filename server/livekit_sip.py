"""LiveKit SIP wiring for EnableX inbound calls.

Keeps one shared SIP inbound trunk (its numbers list mirrors every number in
phone_numbers) and one SIP dispatch rule per number, so an inbound call to a
given EnableX virtual number lands in its own LiveKit room.

Each dispatch rule stamps the created room's metadata with
{"agent_id", "phone_number"}. The same auto-dispatched agent that serves
browser calls (agent/main.py) reads that metadata off the job and passes the
agent_id to agent/db.get_agent_config(agent_id=...), so a phone call is
handled by whichever dashboard agent the dialed number is assigned to —
without a second worker process or explicit named dispatch.
"""

import json
import os

from livekit import api
from livekit.protocol.room import RoomConfiguration
from livekit.protocol.sip import (
    CreateSIPDispatchRuleRequest,
    CreateSIPInboundTrunkRequest,
    DeleteSIPDispatchRuleRequest,
    SIPDispatchRule,
    SIPDispatchRuleIndividual,
    SIPInboundTrunkInfo,
)

import calls_db

TRUNK_ID_SETTING = "lk_inbound_trunk_id"


def sip_host() -> str:
    """SIP endpoint to hand EnableX for bridging inbound calls.

    LiveKit Cloud's SIP domain is a fixed per-project subdomain that mirrors
    the project's regular <subdomain>.livekit.cloud host — see
    https://docs.livekit.io/telephony/start/sip-trunk-setup/. Override with
    LIVEKIT_SIP_HOST if that project's SIP subdomain ever differs.
    """
    override = os.environ.get("LIVEKIT_SIP_HOST")
    if override:
        return override
    livekit_url = os.environ.get("LIVEKIT_URL", "")
    host = livekit_url.split("://", 1)[-1].rstrip("/")
    return host.replace(".livekit.cloud", ".sip.livekit.cloud")


async def ensure_inbound_trunk() -> str:
    """Create the shared inbound trunk once, or resync its numbers list to
    match every number currently in phone_numbers. Returns the trunk id."""
    numbers = [n["number"] for n in calls_db.list_phone_numbers()]
    trunk_id = calls_db.get_setting(TRUNK_ID_SETTING)

    async with api.LiveKitAPI() as lkapi:
        if trunk_id:
            await lkapi.sip.update_inbound_trunk_fields(trunk_id, numbers=numbers)
            return trunk_id

        trunk = await lkapi.sip.create_inbound_trunk(
            CreateSIPInboundTrunkRequest(
                trunk=SIPInboundTrunkInfo(name="EnableX inbound", numbers=numbers)
            )
        )
        calls_db.set_setting(TRUNK_ID_SETTING, trunk.sip_trunk_id)
        return trunk.sip_trunk_id


async def upsert_dispatch_rule(number_row: dict) -> None:
    """(Re)create the SIP dispatch rule for one phone number so it routes to
    its currently-assigned agent. Safe to call whenever a number is added or
    its agent assignment changes."""
    trunk_id = await ensure_inbound_trunk()
    number = number_row["number"]
    agent_id = number_row.get("agentId")

    async with api.LiveKitAPI() as lkapi:
        old_rule_id = number_row.get("lkDispatchRuleId")
        if old_rule_id:
            try:
                await lkapi.sip.delete_dispatch_rule(DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=old_rule_id))
            except Exception:
                pass  # already gone — fine, we're about to replace it anyway

        safe_prefix = "".join(c for c in number if c.isalnum()) or "call"
        rule = await lkapi.sip.create_dispatch_rule(
            CreateSIPDispatchRuleRequest(
                rule=SIPDispatchRule(
                    dispatch_rule_individual=SIPDispatchRuleIndividual(room_prefix=f"phone-{safe_prefix}")
                ),
                trunk_ids=[trunk_id],
                inbound_numbers=[number],
                name=f"riya-inbound-{number}",
                # Stamped onto each created room so the auto-dispatched agent
                # knows which dashboard agent config to load for this number.
                room_config=RoomConfiguration(
                    metadata=json.dumps({"agent_id": agent_id, "phone_number": number})
                ),
            )
        )
        calls_db.set_phone_number_lk_ids(number_row["id"], trunk_id, rule.sip_dispatch_rule_id)


async def delete_dispatch_rule(number_row: dict) -> None:
    """Remove the LiveKit dispatch rule for a number. Call this before
    removing the row from phone_numbers, then call ensure_inbound_trunk()
    afterwards so the shared trunk's numbers list drops it too."""
    rule_id = number_row.get("lkDispatchRuleId")
    if not rule_id:
        return
    async with api.LiveKitAPI() as lkapi:
        try:
            await lkapi.sip.delete_dispatch_rule(DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=rule_id))
        except Exception:
            pass
