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
from livekit.protocol.room import ListRoomsRequest, RoomConfiguration, UpdateRoomMetadataRequest
from livekit.protocol.sip import (
    CreateSIPDispatchRuleRequest,
    CreateSIPInboundTrunkRequest,
    DeleteSIPDispatchRuleRequest,
    DeleteSIPTrunkRequest,
    ListSIPDispatchRuleRequest,
    ListSIPInboundTrunkRequest,
    SIPDispatchRule,
    SIPDispatchRuleIndividual,
    SIPInboundTrunkInfo,
)

import calls_db

logger = logging.getLogger(__name__)

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
    # Compare on bare digits, not the raw string: a rule created from a
    # differently-spelled copy of the same number ("+91..." vs "91...")
    # is still the rule that will win at match time, since dispatch rules
    # normalize. Comparing exact strings would leave it in place and the
    # create below would then 400 on the duplicate.
    wanted = set(number_variants(number))
    for item in existing.items:
        if wanted & set(item.inbound_numbers):
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
                # LIMITATION: the trunk pools every tenant's numbers, so with no
                # per-rule filter one rule serves them all and the agent_id in
                # room_config below is whichever number was saved last. That is
                # correct while exactly one number is registered. Before a second
                # number goes live, per-number routing has to move to one trunk
                # per number (rules attach to trunks), or the agent must resolve
                # its config from the dialled number at runtime instead of from
                # this static metadata.
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
