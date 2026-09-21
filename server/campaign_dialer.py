"""Background campaign dialer.

A single daemon thread that walks every 'running' campaign and places its due
calls, honoring three limits on every dial:

  1. Compliance — each dial goes through calls_db.check_call_allowed (inside
     livekit_sip.place_outbound_call), which scrubs the DNC list and enforces
     the calling window before a ring leaves the box.
  2. Concurrency — never more than a campaign's `concurrency` calls in flight.
     A contact stays 'calling' until the agent resolves it at call end, so
     campaign_inflight() counts live calls, not dials placed this tick.
  3. Retry backoff — a failed/no-answer contact isn't retried until its
     next_attempt_at, up to the campaign's max_attempts.

Runs synchronously in its own thread (the DB layer and EnableX client are
sync urllib) so it never blocks the FastAPI event loop. claim_next_campaign_
contact flips a row to 'calling' atomically, so even if two ticks (or two
replicas) overlap, the same contact is never double-dialed.

Deliberately conservative: a campaign only dials while an operator has it in
'running'; pausing it stops new dials immediately. When a campaign runs out of
open work it auto-completes.
"""

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.request

import calls_db
import campaign_window
import plan_policy

logger = logging.getLogger("vistrow-dialer")


def _orchestrator_headers() -> dict[str, str]:
    secret = os.environ.get("ORCHESTRATOR_SERVICE_SECRET", "").strip()
    if not secret:
        raise RuntimeError("ORCHESTRATOR_SERVICE_SECRET is not configured")
    return {
        "Content-Type": "application/json",
        "X-Vistrow-Orchestrator-Secret": secret,
    }

# Accounts on the Railway-native orchestrator pipeline (see
# calls_db.is_on_orchestrator_pipeline, the same per-account flag
# server/token_api.py's /telephony/test-call and the inbound-event proxy
# check) get their campaign dials placed there too, instead of
# calls_db.place_test_call's LiveKit-SIP-bridge path - discovered live when
# a campaign showed every contact as "Done" but the calls that actually
# rang were dead air: "Done" only ever meant EnableX accepted the dial
# request, never that the LiveKit bridge behind it worked.

# How often the dialer wakes to place due calls. 15s keeps pacing gentle
# (well under any sane per-minute dial rate) while still feeling responsive
# in the dashboard.
_TICK_SECONDS = 15

# Gap between individual dials placed within the SAME tick. Without this, a
# campaign at concurrency=3 placed all 3 calls back-to-back with no delay at
# all - confirmed live (campaign 20, 2026-09-17): three real outbound SIP
# calls landed at 11:48:56.387/.388/.481, sub-100ms apart. Three brand-new
# LiveKit rooms plus three STT/TTS/LLM pipelines all cold-starting at the
# same instant is a real resource-contention spike, not just a number - it's
# what the operator heard as crackling audio and some calls not landing.
# "Concurrent" still means concurrent (all `slots` calls are in flight
# together for most of their duration); this only staggers the moment each
# one is FIRST placed.
_DIAL_STAGGER_SECONDS = 2.0
# EnableX enforces CPS across the whole SIP trunk, not per campaign (their
# reply, 2026-09-17: 5-6 running campaigns each dialing on the same tick is
# 5-6 INVITEs at once). So the stagger is global: every dial from every
# campaign waits until _DIAL_STAGGER_SECONDS after the previous one.
_last_dial_at = 0.0

# Outbound channels available on the SIP trunk. EnableX sells "dedicated
# capacity" per channel and REJECTS any call past it (their reply,
# 2026-09-17), and the same pool serves inbound — so this is the number of
# channels bought MINUS the ones reserved for inbound. It is a trunk-wide
# ceiling: the sum of live dials across every campaign and every tenant
# stays at or below it, and a new dial only goes out when a live one ends.
# Campaign concurrency still applies on top and can only be lower.
_OUTBOUND_CHANNELS = max(1, int(os.environ.get("OUTBOUND_CHANNEL_LIMIT", "2") or 2))

# Carrier circuit breaker.
#
# On 2026-09-21 EnableX answered every INVITE with "100 Trying" and then
# never routed the call: each dial died after a 30s timeout, for every
# destination, for hours. A dialer that keeps going through an outage like
# that burns one attempt per contact on calls nobody ever received, and with
# retries enabled it burns those too — a 100-contact list can be spent on a
# problem that has nothing to do with the contacts.
#
# So after this many dials in a row fail to LEAVE THE BUILDING, running
# campaigns are paused with the reason recorded, and each contact is handed
# back unspent. One success anywhere resets the count.
_CARRIER_FAILURE_LIMIT = max(2, int(os.environ.get("CARRIER_FAILURE_LIMIT", "3") or 3))

# Errors that mean the call never reached the person: the carrier or the
# media platform did not take it. A rejection aimed at THIS number (an
# invalid number, a blocked destination) is a fact about the contact and
# must still spend their attempt, or a bad row would be retried forever.
_CARRIER_ERROR_MARKERS = (
    "timed out", "timeout", "unavailable", "connection", "twirp",
    "no trunk", "internal error", "503", "504",
)

_consecutive_dial_failures = 0


def _looks_like_carrier_trouble(error: str) -> bool:
    text = (error or "").lower()
    return any(marker in text for marker in _CARRIER_ERROR_MARKERS)


def _note_dial_outcome(placed: bool) -> int:
    """Track dials that never left the building. Returns the current streak."""
    global _consecutive_dial_failures
    _consecutive_dial_failures = 0 if placed else _consecutive_dial_failures + 1
    return _consecutive_dial_failures


def _trip_breaker(reason: str) -> None:
    """Pause every running campaign — an outage is never campaign-specific."""
    global _consecutive_dial_failures
    _consecutive_dial_failures = 0
    try:
        running = calls_db.running_campaigns()
    except Exception:
        logger.exception("could not list running campaigns to pause them")
        return
    for campaign in running:
        try:
            calls_db.pause_campaign_with_reason(campaign["id"], campaign["account_id"], reason)
        except Exception:
            logger.exception("could not pause campaign %s", campaign.get("id"))


def _pace_dial(min_gap_seconds: float = _DIAL_STAGGER_SECONDS) -> None:
    """Hold until the trunk may carry another INVITE.

    min_gap_seconds is the campaign's own, slower rate when it set one — it can
    only ever be larger than the trunk-wide stagger, because that stagger is
    what keeps us inside the carrier's CPS limit.
    """
    global _last_dial_at
    gap = max(_DIAL_STAGGER_SECONDS, float(min_gap_seconds or 0))
    wait = _last_dial_at + gap - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_dial_at = time.monotonic()


def _campaign_gap_seconds(campaign: dict) -> float:
    """A campaign's 'attempts per minute' as a gap between dials (0 = no limit).

    Sarvam exposes dial rate as attempts per second; per MINUTE is the honest
    unit at our scale, where the trunk-wide floor is already one dial every
    two seconds.
    """
    try:
        per_minute = int(campaign.get("attempts_per_minute") or 0)
    except (TypeError, ValueError):
        return 0.0
    return 60.0 / per_minute if per_minute > 0 else 0.0

_started = False
_lock = threading.Lock()


def _on_orchestrator_pipeline(account_id: int) -> bool:
    return bool(os.environ.get("ORCHESTRATOR_URL")) and calls_db.is_on_orchestrator_pipeline(account_id)


def _place_via_orchestrator(to_number: str, from_number: str, account_id: int, agent_id: int | None, contact: dict) -> dict:
    """Same shape of result as calls_db.place_test_call ({"ok": bool, ...})
    so _dial_one doesn't need to know which pipeline placed the call."""
    orchestrator_url = os.environ.get("ORCHESTRATOR_URL", "").rstrip("/")
    body = json.dumps({
        "to": to_number,
        "fromNumber": from_number,
        "accountId": account_id,
        "agentId": agent_id,
        "contactName": contact.get("name", ""),
        "contactCompany": contact.get("company", ""),
        "contactCustomFields": contact.get("custom_fields", "{}"),
    }).encode()
    request = urllib.request.Request(
        f"{orchestrator_url}/telephony/enablex/outbound-test-call",
        data=body,
        headers=_orchestrator_headers(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"Could not reach orchestrator: {e}"}


def _handle_failed_dial(contact_id: int, campaign_id: int, error: str) -> bool:
    """Record a dial that did not go out. True when the breaker just tripped.

    A carrier failure hands the contact back unspent — they were never
    called, so it must not count against them — while a rejection aimed at
    this particular number is recorded against the contact as before.
    """
    if not _looks_like_carrier_trouble(error):
        _note_dial_outcome(placed=True)
        calls_db.record_campaign_dial_result(contact_id, campaign_id, "failed")
        return False

    calls_db.release_campaign_contact(contact_id)
    streak = _note_dial_outcome(placed=False)
    logger.warning(
        "dial never left the building (%s of %s in a row): %s",
        streak, _CARRIER_FAILURE_LIMIT, error,
    )
    if streak < _CARRIER_FAILURE_LIMIT:
        return False
    _trip_breaker(
        f"Paused automatically: {streak} calls in a row could not be placed "
        f"({error.strip()[:120]}). Your contacts were not called and keep their "
        f"attempts. Resume once calling is working again."
    )
    return True


def _dial_one(campaign: dict) -> None:
    account_id = campaign["account_id"]
    cid = campaign["id"]
    try:
        calls_db.require_feature(account_id, "campaigns")
    except plan_policy.EntitlementError:
        calls_db.set_campaign_status(cid, "paused", account_id)
        logger.info("campaign %s paused: workspace plan no longer includes campaigns", cid)
        return
    from_number = (campaign.get("from_number") or "").strip()

    # A campaign with no from-number can never dial — surface it and pause so
    # the operator notices instead of silently spinning.
    if not from_number:
        logger.warning("campaign %s has no from_number; pausing", cid)
        calls_db.set_campaign_status(cid, "paused", account_id)
        return

    # The direct-SIP path stamps agent_id into the room metadata itself, so
    # unlike the old bridge-back flow there is no dispatch rule to infer the
    # agent from the dialled number. Fall back to whichever agent owns the
    # from-number when the campaign doesn't name one, so a campaign without
    # an explicit agent still reaches the same agent it used to.
    agent_id = campaign.get("agent_id")
    if not agent_id:
        # camelCase: _phone_number_dict maps the columns, agent_id -> agentId.
        number_row = calls_db.get_phone_number_by_number(from_number)
        agent_id = (number_row or {}).get("agentId")
    if not agent_id:
        logger.warning("campaign %s has no agent (campaign or number); pausing", cid)
        calls_db.set_campaign_status(cid, "paused", account_id)
        return

    # Reaping never dials, so it runs even outside the calling window.
    reaped = calls_db.reap_stale_campaign_calls(cid)
    if reaped:
        logger.warning("campaign %s: resolved %s stale in-flight contact(s) no agent reconciled", cid, reaped)

    # Calling window is the same gate real dials use; skip the whole campaign
    # this tick if we're outside it (no point claiming contacts we can't dial).
    allowed, _reason = calls_db.within_calling_window(account_id)
    if not allowed:
        return

    # The campaign's own schedule narrows (never widens) the account window.
    blocked = campaign_window.campaign_block_reason(campaign, calls_db.account_local_now(account_id))
    if blocked:
        logger.debug("campaign %s not dialling: %s", cid, blocked)
        return

    inflight = calls_db.campaign_inflight(cid)
    slots = max(0, int(campaign.get("concurrency", 1) or 1) - inflight)

    # Trunk-wide channel ceiling, shared by every campaign and tenant. A
    # campaign set to 3 on a 2-channel trunk dials 2, then one more each time
    # a live call ends — the carrier would reject the third outright.
    trunk_free = _OUTBOUND_CHANNELS - calls_db.campaign_inflight_all()
    if trunk_free < slots:
        logger.info(
            "campaign %s: %s slot(s) held back, trunk has %s outbound channel(s)",
            cid, slots - max(0, trunk_free), _OUTBOUND_CHANNELS,
        )
    slots = min(slots, max(0, trunk_free))

    # Account-wide plan cap, separate from (and often tighter than) the
    # campaign's own concurrency setting — a campaign can't dial past it even
    # if other campaigns/inbound calls are already using up the account's
    # headroom. The agent's own check (agent/main.py) is what actually
    # enforces this; skipping the dial here just avoids placing a real
    # outbound call only to have the agent immediately decline it.
    headroom = calls_db.concurrent_call_limit(account_id) - calls_db.count_active_calls(account_id)
    slots = min(slots, max(0, headroom))

    for _ in range(slots):
        contact = calls_db.claim_next_campaign_contact(cid)
        if contact is None:
            break
        _pace_dial(_campaign_gap_seconds(campaign))
        # claim_next_campaign_contact returns the row as it was BEFORE the
        # attempt counter was incremented, so contact["attempts"] is how many
        # times this person has already been rung — which is exactly the
        # rotation index (0 = first attempt = from_number).
        caller_id = calls_db.campaign_caller_id(campaign, contact.get("attempts") or 0)
        try:
            if _on_orchestrator_pipeline(account_id):
                result = _place_via_orchestrator(
                    contact["phone"], caller_id, account_id, agent_id, contact
                )
            else:
                # wait_for_answer=False on purpose: this loop places up to
                # `slots` calls per tick, so blocking each one until the
                # callee picks up would serialise dials that are meant to
                # overlap, and a single no-answer would stall every campaign
                # for the full ringing timeout. "placed" has always meant
                # "the dial went out", never "they answered" (see the note
                # at the top of this module), so not waiting also keeps the
                # recorded result honest.
                result = calls_db.place_outbound_call_direct(
                    contact["phone"],
                    caller_id,
                    account_id,
                    agent_id,
                    contact_name=contact.get("name", ""),
                    contact_company=contact.get("company", ""),
                    contact_custom_fields=contact.get("custom_fields", "{}"),
                    wait_for_answer=False,
                    # So the agent can report back that a machine answered —
                    # "placed" below only means the dial went out.
                    campaign_contact_id=contact["id"],
                    campaign_id=cid,
                )
        except Exception as exc:
            logger.exception("dial failed for contact %s", contact["id"])
            if _handle_failed_dial(contact["id"], cid, str(exc)):
                return
            continue
        if result.get("blocked"):
            _note_dial_outcome(placed=True)
            calls_db.record_campaign_dial_result(contact["id"], cid, "blocked", result.get("error", ""))
        elif result.get("ok"):
            _note_dial_outcome(placed=True)
            calls_db.record_campaign_dial_result(contact["id"], cid, "placed", room_name=result.get("room"))
        else:
            logger.warning("dial not placed for contact %s: %s", contact["id"], result.get("error"))
            if _handle_failed_dial(contact["id"], cid, result.get("error", "")):
                return

    # Auto-complete once nothing is pending, in flight, or awaiting retry.
    if not calls_db.campaign_has_open_work(cid):
        calls_db.set_campaign_status(cid, "completed", account_id)
        logger.info("campaign %s completed", cid)


def _loop() -> None:
    logger.info("campaign dialer started (tick=%ss)", _TICK_SECONDS)
    while True:
        try:
            promoted = calls_db.promote_due_scheduled_campaigns()
            if promoted:
                logger.info("promoted %s scheduled campaign(s) to running", promoted)
            for campaign in calls_db.running_campaigns():
                _dial_one(campaign)
        except Exception:
            logger.exception("dialer tick failed")
        time.sleep(_TICK_SECONDS)


def start_dialer() -> None:
    """Idempotent — safe to call from FastAPI startup even if it fires twice.

    Set DISABLE_CAMPAIGN_DIALER=1 to keep it off entirely. That matters for
    running this app locally: the idempotence below is per-process only, and
    a local instance pointed at the production DATABASE_URL dials the same
    running campaigns as the deployed service — i.e. real outbound calls to
    real contacts, placed twice. Nothing about "it's just my laptop" stops
    that, so local runs should set this flag.
    """
    if os.environ.get("DISABLE_CAMPAIGN_DIALER", "").strip() not in ("", "0", "false", "False"):
        logger.info("campaign dialer disabled via DISABLE_CAMPAIGN_DIALER")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="campaign-dialer", daemon=True).start()
