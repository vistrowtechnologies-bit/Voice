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
import logging
import os
import secrets

from livekit import api
from livekit.api.twirp_client import TwirpError
from livekit.protocol.room import (
    CreateRoomRequest,
    DeleteRoomRequest,
    ListRoomsRequest,
    RoomConfiguration,
    UpdateRoomMetadataRequest,
)
from livekit.protocol.sip import (
    CreateSIPDispatchRuleRequest,
    CreateSIPInboundTrunkRequest,
    CreateSIPOutboundTrunkRequest,
    CreateSIPParticipantRequest,
    DeleteSIPDispatchRuleRequest,
    DeleteSIPTrunkRequest,
    ListSIPDispatchRuleRequest,
    ListSIPInboundTrunkRequest,
    ListSIPOutboundTrunkRequest,
    SIPDispatchRule,
    SIPDispatchRuleIndividual,
    SIPInboundTrunkInfo,
    SIPOutboundTrunkInfo,
)

import calls_db

logger = logging.getLogger(__name__)

OUTBOUND_TRUNK_ID_SETTING = "lk_outbound_trunk_id"
OUTBOUND_TRUNK_ADDRESS_SETTING = "lk_outbound_trunk_address"
OUTBOUND_TRUNK_CALLER_ID_SETTING = "lk_outbound_trunk_caller_id"
OUTBOUND_TRUNK_NAME = "EnableX outbound"


def outbound_trunk_status() -> dict:
    """What's currently configured, for the admin settings page — so setting
    up the trunk once EnableX gives us their SBC address doesn't require
    editing code, just filling in a form."""
    return {
        "configured": bool(calls_db.get_setting(OUTBOUND_TRUNK_ID_SETTING, calls_db.PLATFORM_ACCOUNT_ID)),
        "trunkId": calls_db.get_setting(OUTBOUND_TRUNK_ID_SETTING, calls_db.PLATFORM_ACCOUNT_ID),
        "address": calls_db.get_setting(OUTBOUND_TRUNK_ADDRESS_SETTING, calls_db.PLATFORM_ACCOUNT_ID),
        "callerId": calls_db.get_setting(OUTBOUND_TRUNK_CALLER_ID_SETTING, calls_db.PLATFORM_ACCOUNT_ID),
    }


async def ensure_outbound_trunk(address: str, caller_id: str) -> str:
    """Create/resync the shared outbound trunk LiveKit sends EnableX-bound
    INVITEs through. address is the bare host/IP EnableX gave us for their
    SBC (e.g. "35.234.209.8") — LiveKit sends the INVITE's Request-URI
    straight to this address, no DNS/SRV involved. caller_id is the E.164
    number stamped as the From header on every outbound call.

    No auth_username/auth_password: EnableX confirmed (2026-08-24, WhatsApp)
    they don't support username/password on outbound — they authorize by
    source IP instead, checking the call against LiveKit Cloud's published
    static ranges. Setting credentials here would just be inert, since
    EnableX never challenges with a 407.
    """
    trunk_id = calls_db.get_setting(OUTBOUND_TRUNK_ID_SETTING, calls_db.PLATFORM_ACCOUNT_ID)
    info = SIPOutboundTrunkInfo(name=OUTBOUND_TRUNK_NAME, address=address, numbers=[caller_id])

    def _remember(resolved_trunk_id: str) -> None:
        calls_db.set_setting(OUTBOUND_TRUNK_ID_SETTING, resolved_trunk_id, calls_db.PLATFORM_ACCOUNT_ID)
        calls_db.set_setting(OUTBOUND_TRUNK_ADDRESS_SETTING, address, calls_db.PLATFORM_ACCOUNT_ID)
        calls_db.set_setting(OUTBOUND_TRUNK_CALLER_ID_SETTING, caller_id, calls_db.PLATFORM_ACCOUNT_ID)

    async with api.LiveKitAPI() as lkapi:
        if trunk_id:
            await lkapi.sip.update_outbound_trunk(trunk_id, info)
            _remember(trunk_id)
            return trunk_id

        try:
            trunk = await lkapi.sip.create_outbound_trunk(CreateSIPOutboundTrunkRequest(trunk=info))
            _remember(trunk.sip_trunk_id)
            return trunk.sip_trunk_id
        except TwirpError as exc:
            if exc.code != "invalid_argument" or "Conflicting" not in exc.message:
                raise
            # Same recovery as ensure_inbound_trunk: the setting can go
            # missing even though LiveKit still has a trunk for this number.
            existing = await lkapi.sip.list_outbound_trunk(ListSIPOutboundTrunkRequest(numbers=[caller_id]))
            if not existing.items:
                raise
            trunk_id = existing.items[0].sip_trunk_id
            await lkapi.sip.update_outbound_trunk(trunk_id, info)
            _remember(trunk_id)
            return trunk_id


# How long an empty outbound room is kept alive before LiveKit reclaims it -
# only matters if create_sip_participant fails after the room is already
# created (the normal case deletes the room itself, see below). Same value
# token_api.py's widget/browser rooms use.
_OUTBOUND_ROOM_EMPTY_TIMEOUT_S = 120


async def place_outbound_call(
    to_number: str,
    from_number: str,
    account_id: int,
    agent_id: int,
    *,
    visitor_name: str = "",
    visitor_email: str = "",
    company: str = "",
    custom_fields: str = "{}",
) -> dict:
    """Place a real outbound call directly through LiveKit's own outbound SIP
    trunk, replacing the EnableX-REST + webhook + reconnect-through-our-OWN-
    inbound-trunk dance in calls_db.place_test_call.

    The old flow: place the call via EnableX's REST /call, wait for their
    "connected" webhook, then tell EnableX to bridge the now-answered leg
    into a SIP URI on our own INBOUND trunk — disguised as an inbound call
    FROM our own tenant number, which is why agent/main.py's direction-
    detection heuristic exists at all (caller_number == dialled_number is
    the only signal that coincidence leaves behind). It also needed an
    in-memory dict (_TEST_CALL_FROM_BY_VOICE_ID) to survive the webhook round
    trip, and a best-effort polling loop (tag_newest_room) to guess which
    room to backfill contact-name personalization onto after the fact,
    because there was no way to set real metadata before the room existed.

    This flow creates the room ourselves first, with correct metadata from
    the start (agent_id, account_id, direction="outbound", the contact's
    name/email/company) - agent/main.py reads it exactly like it already
    does for a widget or browser call, no heuristics, no polling, no partial
    in-memory state that a restart would lose. wait_until_answered blocks
    this call until the destination actually answers (or declines/times
    out), so the caller gets a real ok/not-answered result synchronously,
    same contract place_test_call already has.

    Returns {"ok": True, "room": str} or {"ok": False, "error"/"blocked": ...}.
    """
    allowed, reason = calls_db.check_call_allowed(account_id, to_number)
    if not allowed:
        return {"ok": False, "blocked": True, "error": reason}

    trunk_id = calls_db.get_setting(OUTBOUND_TRUNK_ID_SETTING, calls_db.PLATFORM_ACCOUNT_ID)
    if not trunk_id:
        # Not a bug - the trunk hasn't been provisioned yet (needs EnableX's
        # confirmed outbound SBC address; see ensure_outbound_trunk). Fails
        # loudly rather than silently falling through to the old flow, so a
        # half-migrated deploy can't accidentally run both paths at once.
        return {
            "ok": False,
            "error": "Outbound SIP trunk is not configured yet (ensure_outbound_trunk has not been run).",
        }

    room_name = f"phone-{to_number.lstrip('+')}_vistrow-{secrets.token_hex(4)}"
    metadata = json.dumps(
        {
            "agent_id": agent_id,
            "account_id": account_id,
            # Truthy phone_number is what makes _call_context_from_job
            # classify this as call_type="phone" (see agent/main.py).
            "phone_number": from_number,
            "direction": "outbound",
            "visitor_name": visitor_name,
            "visitor_phone": to_number,
            "visitor_email": visitor_email,
            "company": company,
            "custom_fields": custom_fields,
        }
    )

    async with api.LiveKitAPI() as lkapi:
        await lkapi.room.create_room(
            CreateRoomRequest(name=room_name, metadata=metadata, empty_timeout=_OUTBOUND_ROOM_EMPTY_TIMEOUT_S)
        )
        try:
            await lkapi.sip.create_sip_participant(
                CreateSIPParticipantRequest(
                    sip_trunk_id=trunk_id,
                    sip_call_to=to_number,
                    room_name=room_name,
                    participant_identity=f"sip-{to_number.lstrip('+')}",
                    participant_name=visitor_name or to_number,
                    wait_until_answered=True,
                )
            )
        except TwirpError as exc:
            # No answer / declined / trunk rejected it - the room never got a
            # real participant, so there is nothing for the agent to do with
            # it. Clean up rather than leaving an empty room for empty_timeout
            # to eventually reap.
            try:
                await lkapi.room.delete_room(DeleteRoomRequest(room=room_name))
            except TwirpError:
                pass
            logger.info("outbound call to %s not connected: %s", to_number, exc.message)
            return {"ok": False, "error": exc.message}

    return {"ok": True, "room": room_name}


TRUNK_ID_SETTING = "lk_inbound_trunk_id"
AUTH_USERNAME_SETTING = "lk_inbound_auth_username"
AUTH_PASSWORD_SETTING = "lk_inbound_auth_password"


def number_variants(number: str) -> list[str]:
    """Both the bare-digit and +E.164 spelling of one number.

    LiveKit matches an inbound INVITE to a trunk on the *exact* number
    string — it does NOT treat "917713128715" and "+917713128715" as the
    same number. Verified against LiveKit Cloud on 2026-08-21: creating two
    inbound trunks, one per spelling of the same number, is accepted rather
    than rejected as a conflict. Providers differ on which spelling lands in
    the INVITE's Request-URI/To (EnableX's Asterisk sends the +E.164 form),
    and registering only the DB's spelling is what produced a live
    "404 No trunk found" on every inbound call. So register both and let
    whichever arrives match.

    Only the trunk needs this — SIP *dispatch rules* do normalize, and in
    fact reject both spellings in one rule as a duplicate.
    """
    digits = (number or "").strip().lstrip("+")
    if not digits:
        return []
    return [digits, f"+{digits}"]


def _trunk_numbers() -> list[str]:
    """Every registered number, in both spellings, de-duplicated."""
    seen: dict[str, None] = {}
    for row in calls_db.list_all_phone_numbers():
        for variant in number_variants(row["number"]):
            seen.setdefault(variant, None)
    return list(seen)


def ensure_inbound_auth() -> tuple[str, str]:
    """Username/password every SIP provider's INVITEs must carry to reach our
    shared inbound trunk (see ensure_inbound_trunk). One pair for the whole
    platform, not per-tenant or per-provider: the trunk itself is shared
    across every account's phone numbers (numbers list mirrors
    phone_numbers globally, routing to the right agent happens afterwards
    via each number's dispatch rule), so a single credential pair covers
    every tenant automatically as new numbers/providers are added. Generated
    once and persisted; safe to call repeatedly."""
    username = calls_db.get_setting(AUTH_USERNAME_SETTING, calls_db.PLATFORM_ACCOUNT_ID)
    password = calls_db.get_setting(AUTH_PASSWORD_SETTING, calls_db.PLATFORM_ACCOUNT_ID)
    if not username or not password:
        username = username or f"vistrow-{secrets.token_hex(4)}"
        password = password or secrets.token_urlsafe(24)
        calls_db.set_setting(AUTH_USERNAME_SETTING, username, calls_db.PLATFORM_ACCOUNT_ID)
        calls_db.set_setting(AUTH_PASSWORD_SETTING, password, calls_db.PLATFORM_ACCOUNT_ID)
    return username, password


def sip_host() -> str:
    """SIP endpoint to hand a provider (EnableX) for inbound INVITEs.

    IMPORTANT: LiveKit Cloud's SIP subdomain is the *project ID*, NOT the
    websocket subdomain. A project whose URL is
    wss://artha-voice-i8fimsza.livekit.cloud but whose project ID is
    p_4an9t157nkc has the SIP URI 4an9t157nkc.sip.livekit.cloud (docs show
    the same shape: sip:bwwn08a2m4o.sip.livekit.cloud). The two identifiers
    are unrelated strings — you cannot derive one from the other.

    This is not a cosmetic detail: *.sip.livekit.cloud is a wildcard, so a
    wrong subdomain still resolves and the INVITE still reaches LiveKit's
    shared SIP frontend — it just can't be mapped to any project, and every
    call is rejected with "404 No trunk found" no matter how the trunk,
    numbers, auth, or dispatch rules are configured. That failure cost us
    months of debugging against the wrong layer.

    So LIVEKIT_SIP_HOST must be set to "<project-id-without-p_>.sip.livekit.cloud"
    (LiveKit Cloud dashboard -> Telephony -> Configuration). The fallback
    below is a last resort that is very likely WRONG; it only exists so a
    self-hosted deployment pointing at its own SIP host keeps working.
    """
    override = os.environ.get("LIVEKIT_SIP_HOST")
    if override:
        return override
    livekit_url = os.environ.get("LIVEKIT_URL", "")
    host = livekit_url.split("://", 1)[-1].rstrip("/")
    if host.endswith(".livekit.cloud"):
        logger.warning(
            "LIVEKIT_SIP_HOST is not set — falling back to deriving the SIP host from "
            "LIVEKIT_URL (%s). On LiveKit Cloud this is almost certainly wrong: the SIP "
            "subdomain is the project ID, not the websocket subdomain, and a wrong host "
            "still resolves (wildcard DNS) but rejects every call with 404 No trunk found.",
            host,
        )
    return host.replace(".livekit.cloud", ".sip.livekit.cloud")


TRUNK_NAME = "EnableX inbound"


async def ensure_inbound_trunk() -> str | None:
    """Create/resync the shared inbound trunk to hold exactly the numbers
    currently in phone_numbers. Returns the trunk id, or None when there are
    no numbers left.

    LiveKit rejects a trunk that has none of numbers / auth / allowed_addresses
    set (an open trunk is a security hole), so when the last number is removed
    we tear the trunk down entirely rather than trying to empty it — it's
    recreated when the next number is added. Uses the full replace API (not a
    field update) so the numbers list is set to exactly the current set;
    a partial "update numbers" call treats an empty list as "no change".

    NOTE: registering a number's '+'-prefixed AND bare-digit form together
    was tried as a fix for an EnableX "404 No trunk found" test failure, but
    LiveKit's own dispatch-rule uniqueness check treats '+917713128715' and
    '917713128715' as the SAME number (confirmed directly against the API —
    creating two rules, one per variant, on one trunk 400s with "...already
    exists in dispatch rule ..."), which means LiveKit's inbound matching is
    almost certainly '+'-agnostic too. So a format mismatch was very likely
    never the actual cause of that 404 — don't reintroduce dual-variant
    registration without new evidence it's needed.

    Locked down via auth_username/auth_password (see ensure_inbound_auth)
    rather than allowed_addresses/IP allowlisting: LiveKit Cloud's SIP nodes
    aren't behind a fixed IP either, so a provider whitelisting our egress IP
    isn't an option on our end. Every SIP provider we connect (EnableX today,
    others later) is handed the same one username/password pair and must
    stamp it on every INVITE it sends toward this trunk.
    """
    numbers = _trunk_numbers()
    trunk_id = calls_db.get_setting(TRUNK_ID_SETTING, calls_db.PLATFORM_ACCOUNT_ID)
    auth_username, auth_password = ensure_inbound_auth()

    async with api.LiveKitAPI() as lkapi:
        if not numbers:
            if trunk_id:
                try:
                    await lkapi.sip.delete_trunk(DeleteSIPTrunkRequest(sip_trunk_id=trunk_id))
                except Exception:
                    pass
                calls_db.set_setting(TRUNK_ID_SETTING, "", calls_db.PLATFORM_ACCOUNT_ID)
            return None

        if trunk_id:
            await lkapi.sip.update_inbound_trunk(
                trunk_id,
                SIPInboundTrunkInfo(
                    name=TRUNK_NAME, numbers=numbers, auth_username=auth_username, auth_password=auth_password
                ),
            )
            return trunk_id

        try:
            trunk = await lkapi.sip.create_inbound_trunk(
                CreateSIPInboundTrunkRequest(
                    trunk=SIPInboundTrunkInfo(
                        name=TRUNK_NAME, numbers=numbers, auth_username=auth_username, auth_password=auth_password
                    )
                )
            )
            calls_db.set_setting(TRUNK_ID_SETTING, trunk.sip_trunk_id, calls_db.PLATFORM_ACCOUNT_ID)
            return trunk.sip_trunk_id
        except TwirpError as exc:
            if exc.code != "invalid_argument" or "Conflicting" not in exc.message:
                raise
            # TRUNK_ID_SETTING can go missing (e.g. restored from an older
            # backup, or set on a different environment) even though a trunk
            # we created earlier still exists on LiveKit and still owns these
            # numbers — LiveKit then refuses to create a second one for the
            # same number(s). Recover by finding and adopting that existing
            # trunk instead of failing the whole add/assign/delete flow.
            existing = await lkapi.sip.list_inbound_trunk(
                ListSIPInboundTrunkRequest(numbers=numbers)
            )
            if not existing.items:
                raise
            trunk_id = existing.items[0].sip_trunk_id
            await lkapi.sip.update_inbound_trunk(
                trunk_id,
                SIPInboundTrunkInfo(
                    name=TRUNK_NAME, numbers=numbers, auth_username=auth_username, auth_password=auth_password
                ),
            )
            calls_db.set_setting(TRUNK_ID_SETTING, trunk_id, calls_db.PLATFORM_ACCOUNT_ID)
            return trunk_id


async def _drop_rules_for_number(lkapi, trunk_id: str, number: str) -> None:
    """Delete every dispatch rule LiveKit currently holds for this trunk+number.

    The DB's stored lkDispatchRuleId can drift out of sync with what LiveKit
    actually has — a rule created on an earlier deploy, a DB restored from an
    older backup, or a create that half-succeeded. When it drifts,
    create_dispatch_rule below 400s with "... already exists in dispatch rule
    SDR_xxx", the whole add/reassign silently fails, and (worse) the stale rule
    keeps routing the number to whatever agent_id it was FIRST stamped with —
    so reassigning the number to a different agent appears to work in the
    dashboard but the old agent still answers the phone. Rather than trust the
    DB pointer alone, ask LiveKit for the rules it really has on this trunk and
    drop any bound to this number, so the recreate always wins and always
    carries the current agent_id."""
    try:
        existing = await lkapi.sip.list_dispatch_rule(ListSIPDispatchRuleRequest(trunk_ids=[trunk_id]))
    except Exception:
        return  # best-effort; the create below will still surface a hard error
    # Drop rules bound to this number in EITHER spelling, and any unfiltered
    # rule on the trunk. The unfiltered case matters because that rule serves
    # this number too, so leaving it in place makes the create below 400 with
    # "... already exists in dispatch rule SDR_xxx".
    wanted = set(number_variants(number))
    for item in existing.items:
        numbers = set(item.inbound_numbers)
        if numbers and not (wanted & numbers):
            continue
        try:
            await lkapi.sip.delete_dispatch_rule(
                DeleteSIPDispatchRuleRequest(sip_dispatch_rule_id=item.sip_dispatch_rule_id)
            )
        except Exception:
            pass


async def upsert_dispatch_rule(number_row: dict) -> None:
    """(Re)create the SIP dispatch rule for one phone number so it routes to
    its currently-assigned agent. Safe to call whenever a number is added or
    its agent assignment changes."""
    trunk_id = await ensure_inbound_trunk()
    if trunk_id is None:
        # No numbers registered — nothing to route to. Shouldn't happen since
        # this runs right after a number is saved, but guard anyway.
        return
    number = number_row["number"]
    agent_id = number_row.get("agentId")

    async with api.LiveKitAPI() as lkapi:
        # Clear any rule LiveKit already has for this trunk+number (whether or
        # not the DB knows its id) so the create below can't collide with a
        # stale duplicate and the fresh rule carries the current agent_id.
        await _drop_rules_for_number(lkapi, trunk_id, number)

        safe_prefix = "".join(c for c in number if c.isalnum()) or "call"
        rule = await lkapi.sip.create_dispatch_rule(
            CreateSIPDispatchRuleRequest(
                rule=SIPDispatchRule(
                    dispatch_rule_individual=SIPDispatchRuleIndividual(room_prefix=f"phone-{safe_prefix}")
                ),
                trunk_ids=[trunk_id],
                # NO inbound_numbers filter. Verified 2026-08-21 by placing a
                # real authenticated INVITE at LiveKit: with inbound_numbers
                # set to the dialed number — in either the "+91..." or "91..."
                # spelling — the call authenticates, reaches 180 Ringing, then
                # dies with "404 Does not match Trunks or Dispatch Rules".
                # Removing the filter entirely makes the same call answer 200 OK
                # and the agent join the room. inbound_numbers filters on the
                # CALLER's number, not the number that was dialled, so listing
                # the dialled number here can never match.
                #
                # Consequence: the trunk pools every tenant's numbers and one
                # unfiltered rule serves all of them, so per-number routing
                # cannot happen here. It happens in agent/main.py instead,
                # which reads the dialled number off the SIP participant
                # (sip.trunkPhoneNumber) and looks up the owning tenant.
                name=f"riya-inbound-{number}",
                # Informational only. The agent no longer trusts this to pick
                # the tenant: with one shared trunk and one unfiltered rule,
                # whichever number was saved last would win for everybody.
                # agent/main.py resolves the real owner from the dialled number
                # (the SIP participant's sip.trunkPhoneNumber) instead, so this
                # metadata is a hint/debugging aid, not the routing decision.
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


async def tag_newest_room(
    number: str, contact_name: str, contact_phone: str, contact_company: str, contact_custom_fields: str, exclude: set
) -> str | None:
    """Best-effort: find the most recently created, not-yet-tagged room for
    this number's dispatch prefix and stamp the contact's identity onto it —
    visitor_name/visitor_phone (the same metadata keys agent/main.py's
    _call_context_from_job/lead_data pre-seed already read, so a campaign
    dial gets the same name-personalization the widget flow gets, with no
    agent-side changes) plus company/custom_fields, which agent/main.py
    substitutes into {{company}}/{{custom.X}} template tokens in the agent's
    own prompt. Both visitor_name/visitor_phone are required together:
    RealEstateAgent's "greet by name" instruction only activates when
    visitor_name AND visitor_phone are both present (agent/main.py:470).

    Necessary because EnableX's outbound-test bridge (see
    calls_db.enablex_test_call_connected) always uses our own number as both
    the "from" and the SIP URI's user-part — the contact's identity never
    appears anywhere in the SIP signaling LiveKit receives, so there's no
    other channel to carry it across.

    Racy under concurrent campaign dials to the same number: two calls
    bridging within the same instant could both see the same "newest" room
    before either tags it. `exclude` (rooms this process has already
    claimed) narrows the window but a caller placing many simultaneous
    dials to one number should expect occasional misattribution — accurate
    personalization isn't guaranteed above a couple of concurrent calls per
    number today. Returns the claimed room name, or None if no untagged
    room was found yet (caller should retry briefly)."""
    safe_prefix = "".join(c for c in number if c.isalnum()) or "call"
    prefix = f"phone-{safe_prefix}"
    async with api.LiveKitAPI() as lkapi:
        rooms = (await lkapi.room.list_rooms(ListRoomsRequest())).rooms
        candidates = [r for r in rooms if r.name.startswith(prefix) and r.name not in exclude]
        if not candidates:
            return None
        newest = max(candidates, key=lambda r: r.creation_time)
        try:
            meta = json.loads(newest.metadata) if newest.metadata else {}
        except ValueError:
            meta = {}
        if meta.get("visitor_name"):
            return None  # already tagged by another concurrent dial
        meta["visitor_name"] = contact_name
        meta["visitor_phone"] = contact_phone
        meta["company"] = contact_company
        meta["custom_fields"] = contact_custom_fields
        await lkapi.room.update_room_metadata(
            UpdateRoomMetadataRequest(room=newest.name, metadata=json.dumps(meta))
        )
        return newest.name
