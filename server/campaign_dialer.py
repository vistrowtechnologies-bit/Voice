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

import logging
import threading
import time

import calls_db

logger = logging.getLogger("vistrow-dialer")

# How often the dialer wakes to place due calls. 15s keeps pacing gentle
# (well under any sane per-minute dial rate) while still feeling responsive
# in the dashboard.
_TICK_SECONDS = 15

_started = False
_lock = threading.Lock()


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

    for _ in range(slots):
        contact = calls_db.claim_next_campaign_contact(cid)
        if contact is None:
            break
        try:
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
    """Idempotent — safe to call from FastAPI startup even if it fires twice."""
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="campaign-dialer", daemon=True).start()
