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

import call_intelligence
import calls_db
import telephony
import campaign_window
import integrations_dispatch
import plan_policy
import worker_leader

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
# EnableX enforces CPS across the whole carrier account, not per campaign
# (their reply, 2026-09-17: 5-6 running campaigns each dialing on the same
# tick is 5-6 INVITEs at once). So every dial on a telephony pool waits until
# _DIAL_STAGGER_SECONDS after the previous one on that pool (see _pace_dial).
_last_dial_at: dict = {}

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


def _pace_dial(min_gap_seconds: float = _DIAL_STAGGER_SECONDS, pool_id: int | None = None) -> None:
    """Hold until the carrier account may carry another INVITE.

    min_gap_seconds is the campaign's own, slower rate when it set one — it can
    only ever be larger than the stagger, because that stagger is what keeps
    us inside the carrier's CPS limit. The carrier counts CPS per ACCOUNT
    (EnableX, 2026-09-17), i.e. per telephony pool, so the stagger is kept per
    pool: today every number is on the one platform pool, so this is exactly
    the old single trunk-wide stagger.
    """
    key = pool_id if pool_id is not None else "legacy"
    gap = max(_DIAL_STAGGER_SECONDS, float(min_gap_seconds or 0))
    wait = _last_dial_at.get(key, 0.0) + gap - time.monotonic()
    if wait > 0:
        time.sleep(wait)
    _last_dial_at[key] = time.monotonic()


def _line_room(from_number: str) -> tuple[int, int | None, str]:
    """(free lines, stagger key, label) for the trunk a campaign dials out on.

    Two caps (plan section 2a): the trunk's own lines (what this customer
    bought) and its pool's lines minus the inbound reserve (what the carrier
    accepts across every customer on that account). With no telephony
    pool set up yet, the old trunk-wide _OUTBOUND_CHANNELS ceiling applies.

    The stagger key is the pool id for a customer's own carrier account and
    None for the shared platform pool AND for the fallback, so a campaign
    that fell back still paces with the shared pool's dials (same carrier
    account, same CPS limit)."""
    try:
        trunk = telephony.trunk_for_number(from_number)
        if trunk is not None:
            room = telephony.trunk_room(trunk["id"])
            key = None if trunk["pool_id"] == telephony.platform_pool_id() else trunk["pool_id"]
            return int(room["free"]), key, (
                f"trunk {trunk['id']}: {room['trunk_free']} free of its lines, pool {room['pool_free']} free")
    except Exception:
        logger.warning("line room lookup failed for %s; using the trunk-wide ceiling", from_number, exc_info=True)
    free = _OUTBOUND_CHANNELS - calls_db.campaign_inflight_all()
    return free, None, f"trunk has {_OUTBOUND_CHANNELS} outbound channel(s)"


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

# Set by notify() when a new lead is queued, so the dialer runs a pass now
# instead of up to _TICK_SECONDS later. The owner's promise is a call within
# 30s of an ArthaLeads lead arriving; a 15s sleep spent half of it waiting.
# Waking only starts a normal pass: the window, concurrency, channel, stagger
# and breaker gates in _dial_one all still apply.
_wake = threading.Event()

# Instant-lead campaigns (see calls_db.get_or_create_instant_campaign) go
# first in a pass, so a fresh lead is not dialled after a long list's batch
# has used the trunk's channels.
_INSTANT_CAMPAIGN_NAMES = ("ArthaLeads Instant Follow-up", "Instant Lead Follow-up", "Meta Instant Follow-up")


def notify() -> None:
    """Wake the dialer for an immediate pass. Safe from any thread."""
    _wake.set()


def notify_after(seconds: float) -> None:
    """Wake the dialer when a delayed lead becomes due (agent's "call new
    leads after" setting), instead of waiting for the next tick."""
    timer = threading.Timer(max(0.0, float(seconds)) + 0.5, notify)
    timer.daemon = True
    timer.start()


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


def _is_nurture_follow_up(contact: dict) -> bool:
    """A scheduled nurture follow-up (custom_fields.follow_up_kind)."""
    raw = contact.get("custom_fields")
    if not isinstance(raw, str) or "nurture" not in raw:
        return False
    try:
        fields = json.loads(raw)
    except ValueError:
        return False
    return isinstance(fields, dict) and fields.get("follow_up_kind") == "nurture"


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

    # Line ceiling: the campaign's trunk and its carrier pool. A campaign set
    # to 3 on a 2-line trunk dials 2, then one more each time a live call
    # ends — the carrier would reject the third outright. One customer's
    # lines are theirs; another customer's burst cannot use them.
    trunk_free, pool_id, room_label = _line_room(from_number)
    if trunk_free < slots:
        logger.info("campaign %s: %s slot(s) held back, %s", cid, slots - max(0, trunk_free), room_label)
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
        # A nurture follow-up to someone who has since called us or booked is
        # not rung (owner, 22 Oct 2026). Decided from the contact's own fields
        # first, so only nurture rows touch the database here; if the check
        # itself fails, the call goes out as it always did.
        if _is_nurture_follow_up(contact):
            try:
                reason = calls_db.follow_up_skip_reason(contact)
            except Exception:
                logger.warning("follow-up skip check failed for contact %s; dialling", contact["id"], exc_info=True)
                reason = None
            if reason:
                calls_db.skip_claimed_follow_up(contact["id"], reason)
                logger.info("campaign %s: follow-up contact %s not dialled (%s)", cid, contact["id"], reason)
                continue
        _pace_dial(_campaign_gap_seconds(campaign), pool_id)
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


def _report_exhausted_contacts() -> None:
    """Tell ArthaLeads about leads whose auto-call attempts ran out, once
    each. The agent and the server both resolve a contact's final attempt,
    so this is done from the dialer's tick (DB rows, survives restarts)
    rather than at either write site."""
    for contact in calls_db.exhausted_arthaleads_contacts():
        try:
            ok, detail = integrations_dispatch.report_contact_not_reachable(contact["account_id"], contact)
            if not ok:
                logger.warning("not-reachable report for contact %s failed: %s", contact["id"], detail)
        except Exception:
            logger.exception("not-reachable report for contact %s failed", contact["id"])
        # Stamped either way: a report that keeps failing must not be
        # retried every 15 s forever.
        calls_db.mark_contact_crm_notified(contact["id"])


def _deliver_idle_widget_chats() -> None:
    """Fan out widget text chats the visitor stopped typing in 3 minutes ago
    (voice calls deliver from the agent at call end; a text chat has no
    agent and no end signal the visitor is guaranteed to send). Done from
    the tick for the same reason as _report_exhausted_contacts: DB rows,
    survives restarts. deliver_widget_chat stamps the row either way."""
    for chat in calls_db.idle_widget_chats():
        try:
            results = integrations_dispatch.deliver_widget_chat(chat)
            logger.info("widget chat %s delivered: %s", chat["id"], results)
        except Exception:
            logger.exception("widget chat %s delivery failed", chat["id"])
    # Chats ArthaLeads got only part of (sent mid-chat, more turns after).
    for chat in calls_db.stale_delivered_widget_chats():
        try:
            results = integrations_dispatch.resync_widget_chat_arthaleads(chat)
            logger.info("widget chat %s re-sent to ArthaLeads: %s", chat["id"], results)
        except Exception:
            logger.exception("widget chat %s re-send failed", chat["id"])


# Automatic conversation intelligence (owner decision 2026-10-16): every real
# call gets the same analysis the call page's Analyze button runs. One paid
# model request per call (call_intelligence.INTEL_MODEL), so it is capped per
# pass and switchable off with AUTO_CALL_ANALYSIS=0 without a code change.
# It runs in its own thread: a pass can take minutes (60 s model timeout per
# call) and must never delay a campaign dial or an instant lead.
_AUTO_ANALYSIS_PER_PASS = 5
_AUTO_ANALYSIS_EVERY_SECONDS = 60
_auto_analysis_thread: threading.Thread | None = None
_auto_analysis_last_start = 0.0


def auto_analysis_enabled() -> bool:
    return os.environ.get("AUTO_CALL_ANALYSIS", "1").strip().lower() not in ("0", "false", "off", "no")


def _transcript_turns(transcript_json: str | None) -> list[dict]:
    try:
        turns = json.loads(transcript_json or "[]")
    except ValueError:
        return []
    if not isinstance(turns, list):
        return []
    return [t for t in turns
            if isinstance(t, dict) and str(t.get("text") or t.get("content") or "").strip()]


def run_auto_analysis_once(limit: int = _AUTO_ANALYSIS_PER_PASS) -> int:
    """Analyze up to `limit` finished, unanalyzed real calls (eligibility in
    calls_db.auto_analysis_candidates). Returns how many were saved. A call
    under 2 turns is marked done without a model request; a failed request
    is recorded and retried later, at most AUTO_ANALYSIS_MAX_ATTEMPTS times
    in all. Only calls this replica claimed are sent to the model."""
    if not auto_analysis_enabled():
        return 0
    claimed = saved = 0
    for call in calls_db.auto_analysis_candidates():
        if claimed >= limit:
            break
        call_id, account_id = call["id"], call["account_id"]
        turns = _transcript_turns(call.get("transcript_json"))
        if len(turns) < 2:
            calls_db.record_auto_analysis_error(call_id, account_id, "too few turns to analyze", give_up=True)
            continue
        if not calls_db.claim_auto_analysis(call_id, account_id):
            continue  # another replica took it
        claimed += 1
        usage: dict = {}
        try:
            data = call_intelligence.analyze_transcript(turns, usage_out=usage)
        except Exception as exc:
            logger.warning("auto-analysis of call %s (account %s) failed: %s", call_id, account_id, exc)
            calls_db.record_auto_analysis_error(call_id, account_id, str(exc) or type(exc).__name__)
            continue
        calls_db.save_call_intelligence(call_id, account_id, data)
        saved += 1
        logger.info(
            "auto-analysis call %s (account %s): outcome=%s model=%s prompt_tokens=%s cached_tokens=%s completion_tokens=%s",
            call_id, account_id, data.get("outcome"), usage.get("model"),
            usage.get("prompt_tokens"), usage.get("cached_tokens"), usage.get("completion_tokens"),
        )
    return saved


def _auto_analysis_pass() -> None:
    try:
        run_auto_analysis_once()
    except Exception:
        logger.exception("auto-analysis pass failed")


def _kick_auto_analysis() -> None:
    """Start an analysis pass in the background at most once a minute, and
    never while the previous pass is still running."""
    global _auto_analysis_thread, _auto_analysis_last_start
    if not auto_analysis_enabled():
        return
    if _auto_analysis_thread is not None and _auto_analysis_thread.is_alive():
        return
    now = time.monotonic()
    if _auto_analysis_last_start and now - _auto_analysis_last_start < _AUTO_ANALYSIS_EVERY_SECONDS:
        return
    _auto_analysis_last_start = now
    _auto_analysis_thread = threading.Thread(target=_auto_analysis_pass, name="call-auto-analysis", daemon=True)
    _auto_analysis_thread.start()


def _loop() -> None:
    logger.info("campaign dialer started (tick=%ss)", _TICK_SECONDS)
    while True:
        try:
            # Overlapping deploys: only the leader process dials (worker_leader.py).
            if not worker_leader.is_leader():
                time.sleep(_TICK_SECONDS)
                continue
            promoted = calls_db.promote_due_scheduled_campaigns()
            if promoted:
                logger.info("promoted %s scheduled campaign(s) to running", promoted)
            _report_exhausted_contacts()
            _deliver_idle_widget_chats()
            # Own guard: analysis is optional, dialing is not.
            try:
                _kick_auto_analysis()
            except Exception:
                logger.exception("auto-analysis kick failed")
            # Orphan cloned-voice cleanup: off unless VOICE_CLONE_RECONCILE=1,
            # hourly, one replica (custom_voices.kick_reconcile).
            try:
                import custom_voices
                custom_voices.kick_reconcile()
            except Exception:
                logger.exception("voice clone reconcile kick failed")
            campaigns = calls_db.running_campaigns()
            # Stable sort: instant-lead campaigns first, the rest unchanged.
            campaigns.sort(key=lambda c: c.get("name") not in _INSTANT_CAMPAIGN_NAMES)
            for campaign in campaigns:
                _dial_one(campaign)
        except Exception:
            logger.exception("dialer tick failed")
        # A notify() during the pass above leaves the event set, so the next
        # pass starts at once rather than losing that lead to a full tick.
        _wake.wait(_TICK_SECONDS)
        _wake.clear()


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
