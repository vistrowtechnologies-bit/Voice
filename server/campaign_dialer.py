"""Background campaign dialer.

A single daemon thread that walks every 'running' campaign and places its due
calls, honoring three limits on every dial:

  1. Compliance — each dial goes through calls_db.place_test_call, which scrubs
     the DNC list and enforces the calling window before a ring leaves the box.
  2. Concurrency — never more than a campaign's `concurrency` calls in flight.
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

logger = logging.getLogger("vistrow-dialer")

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
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.URLError as e:
        return {"ok": False, "error": f"Could not reach orchestrator: {e}"}


def _dial_one(campaign: dict) -> None:
    account_id = campaign["account_id"]
    cid = campaign["id"]
    from_number = (campaign.get("from_number") or "").strip()

    # A campaign with no from-number can never dial — surface it and pause so
    # the operator notices instead of silently spinning.
    if not from_number:
        logger.warning("campaign %s has no from_number; pausing", cid)
        calls_db.set_campaign_status(cid, "paused", account_id)
        return

    # Calling window is the same gate real dials use; skip the whole campaign
    # this tick if we're outside it (no point claiming contacts we can't dial).
    allowed, _reason = calls_db.within_calling_window(account_id)
    if not allowed:
        return

    inflight = calls_db.campaign_inflight(cid)
    slots = max(0, int(campaign.get("concurrency", 1) or 1) - inflight)

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
        try:
            if _on_orchestrator_pipeline(account_id):
                result = _place_via_orchestrator(
                    contact["phone"], from_number, account_id, campaign.get("agent_id"), contact
                )
            else:
                result = calls_db.place_test_call(
                    from_number,
                    contact["phone"],
                    account_id,
                    contact.get("name", ""),
                    contact.get("company", ""),
                    contact.get("custom_fields", "{}"),
                )
        except Exception:
            logger.exception("dial failed for contact %s", contact["id"])
            calls_db.record_campaign_dial_result(contact["id"], cid, "failed")
            continue
        if result.get("blocked"):
            calls_db.record_campaign_dial_result(contact["id"], cid, "blocked", result.get("error", ""))
        elif result.get("ok"):
            calls_db.record_campaign_dial_result(contact["id"], cid, "placed")
        else:
            logger.warning("dial not placed for contact %s: %s", contact["id"], result.get("error"))
            calls_db.record_campaign_dial_result(contact["id"], cid, "failed")

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
