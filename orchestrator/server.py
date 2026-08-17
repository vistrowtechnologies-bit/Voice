"""Phase 2 — EnableX phone-call adapter. A standalone FastAPI service,
deliberately separate from server/token_api.py's production routes so this
can be deployed and tested against ONE feature-flagged test number
(TEST_ACCOUNT_ID/TEST_AGENT_ID/TEST_PHONE_NUMBER env vars) with zero risk
to any tenant currently on the LiveKit-routed path — per the migration
plan's parallel-run rollout.

Flow (mirrors developer.enablex.io/voice/media-streaming.html exactly):
  incomingcall webhook -> accept_call
  connected webhook    -> issue a signed stream token, start_stream(wss_url)
  EnableX opens a WebSocket to /stream?token=... -> connected/start_media/
  media(x N)/stop_media events; we run session.handle_utterance() per
  detected utterance (audio.UtteranceVAD) and stream the reply back as
  outbound `media` events.

Run: uvicorn server:app --host 0.0.0.0 --port 8080
Needs a publicly reachable HTTPS/WSS address (Railway deploy, or an ngrok
tunnel for local testing) — EnableX connects OUT to us, we never connect
to EnableX except via their REST API.
"""

from __future__ import annotations

import asyncio
import audioop
import base64
import collections
import itertools
import json
import logging
import os
import time
import uuid

import numpy as np
from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import audio
import db
import enablex
import recording
import session as session_module
import stt
import tts
import ws_security

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("orchestrator-server")

app = FastAPI(title="Vistrow Voice orchestrator (Phase 2/3 — EnableX + browser adapters)")

# The phone path is server-to-server (EnableX -> us) and never needs CORS.
# /browser/token does — it's called via fetch() directly from a page in the
# visitor's browser (marketing site, widget test page, eventually the real
# widget), a different origin than this service. Wide open for the Phase 3
# proving stage; tighten to the actual widget/marketing origins before the
# real cutover.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# --- Phase 2 feature flag: ONE test number, hardcoded via env vars rather
# than the production phone_numbers table, so this can't accidentally pick
# up a real tenant's number before it's proven. Phase 4 replaces this with
# the real per-tenant routing once cutover happens.
TEST_ACCOUNT_ID = int(os.environ.get("TEST_ACCOUNT_ID", "0") or 0)
TEST_AGENT_ID = int(os.environ.get("TEST_AGENT_ID", "0") or 0)
TEST_PHONE_NUMBER = os.environ.get("TEST_PHONE_NUMBER", "")

# Barge-in: how many consecutive loud 20ms frames during agent playback
# count as the caller genuinely interrupting (not a single noise blip) —
# 4 frames = 80ms, well under the 300ms min_speech_ms a full utterance
# needs, so an interruption is caught fast without being trigger-happy.
# Only safe for the browser path, where this check runs behind the client's
# own speaking_start/speaking_end (real client-side VAD with acoustic echo
# cancellation) — see the `client_speaking` gate below.
_BARGE_IN_FRAMES = 4
# The phone (EnableX) leg has no acoustic echo cancellation at all — nothing
# stops the agent's own voice, reflected back by the caller's handset/line,
# from arriving as "caller audio" the instant the agent starts talking. At
# the browser's 4-frame/plain-energy-threshold settings that reads as an
# immediate barge-in on every single reply: cancel the reply, play the
# listening cue, repeat forever — reported live as the agent answering every
# real phone call with nothing but "ji bataiye" on a loop. Real speech is
# both louder and more sustained than a line-echo reflection of our own
# (already volume-limited for the 20ms-frame-paced ulaw send) TTS output, so
# demanding more of both cuts the false-positive rate without meaningfully
# slowing down a genuine interruption.
_PHONE_BARGE_IN_FRAMES = 15  # 300ms
_PHONE_BARGE_IN_ENERGY_MULTIPLIER = 2.5
# Was disabled outright (2026-08-07): even at 2.5x/300ms, a live test call
# still had every single reply barged-in on and cancelled by its own echo —
# 3/3 turns in one call ended with no assistant reply ever recorded and
# nothing but the "ji bataiye" listening cue on a loop, since no energy/
# duration threshold alone can tell the agent's own voice apart from a
# genuine interruption without real acoustic echo cancellation.
#
# Was briefly re-enabled (2026-08-14) once the barge-in check ran against
# audio.EchoCanceller's output (an NLMS adaptive filter + double-talk
# detector) instead of the raw mic signal — verified synthetically first
# (97%+ echo suppression, real speech still clearing the threshold), but
# a live test call that same day reproduced the exact 2026-08-07 symptom:
# the "ji bataiye" listening cue looping on interruption, then the agent
# going silent instead of giving a real reply. Disabled again immediately
# per this file's own stated policy above. The AEC code and wiring are
# left in place (audio.EchoCanceller, the reference-audio queue in this
# file) for the next attempt, but do not flip this back to True without
# first adding real logging around _barge_in()/the residual-energy check
# — the 2026-08-14 attempt had no log line marking when barge-in actually
# fired, so the live failure couldn't be diagnosed from logs alone, only
# inferred from what the caller heard. Re-enabled again (same day) once
# diagnostic logging (phone barge-in triggered / candidate) was added, to
# get real evidence instead of guessing.
#
# That evidence came back the same day and disabled this again: even on
# frames where the echo canceller DID have a reference to cancel against
# (ref_empty=False), residual_energy was still 1100-3300 against a 1000
# threshold - well above what the synthetic sine-tone tests predicted
# (~20-30). A real caller's voice has far richer harmonic content than a
# test tone, and real telephony lines add nonlinear distortion (companding,
# AGC, handset nonlinearities) that a purely linear NLMS filter cannot
# model - this is a known, real limitation of linear-only echo
# cancellation, not a tuning problem. A working fix needs a nonlinear
# residual echo suppression stage on top of the linear filter (standard in
# production AEC systems), not just retuning thresholds/filter length.
# Don't re-enable without that - or without a clear reason to believe this
# specific attempt differs from the ones above.
#
# Re-enabled 2026-08-17 for one deliberate test call, not because the
# nonlinear-suppression gap above got fixed - it didn't. What changed is
# purely diagnostic: this same file's _barge_in() and session.py's
# handle_utterance_streaming now record the listening cue and any
# interrupted reply into session.transcript (previously silent - see their
# own comments), so this run produces real transcript + call-recording
# evidence instead of only the caller's account of what they heard. Expect
# this to very possibly reproduce the same failure; that's fine, the goal
# this time is evidence, not success. Revert to False after the test call
# unless the evidence says otherwise.
_PHONE_BARGE_IN_ENABLED = True
# Suppress barge-in detection for this long after a reply starts sending.
# TTS synthesis takes a second or two; the caller's audio backs up
# unprocessed during that wait and arrives all at once the moment we
# resume reading — without this grace window that backlog alone satisfies
# _BARGE_IN_FRAMES and cancels the reply before any of it is heard.
_BARGE_IN_GRACE_MS = 500

# voice_id -> account_id, populated on `incomingcall` so the `connected`
# event (which doesn't repeat the dialed number reliably enough to re-derive
# this) knows which tenant's EnableX credentials to use. Single-instance,
# in-memory — fine as long as this service runs as one Railway replica (not
# horizontally scaled); revisit as Postgres-backed if that ever changes.
_PENDING_ACCOUNT_BY_VOICE_ID: dict[str, int] = {}
# voice_id -> agent_id, populated alongside _PENDING_ACCOUNT_BY_VOICE_ID on
# both the inbound (real phone-number lookup) and outbound (explicit
# agentId in the request) paths, so the `connected` handler builds the
# session for the right dashboard agent instead of always TEST_AGENT_ID.
_PENDING_AGENT_BY_VOICE_ID: dict[str, int] = {}

# voice_id -> (Session, greeting-synthesis Task) — started the moment the
# `connected` webhook fires, running concurrently with start_stream()'s
# retry loop and the EnableX->us WebSocket handshake instead of only
# starting once `start_media` arrives. TTS synthesis was previously the
# last step before any audio reached the caller, stacking on top of the
# handshake latency as several extra seconds of dead air; overlapping it
# here means the greeting is usually already synthesized by the time
# start_media shows up.
_PENDING_GREETING_BY_VOICE_ID: dict[str, tuple[session_module.Session, asyncio.Task]] = {}


async def _build_session_for_test_call(
    call_type: str = "phone",
    account_id: int | None = None,
    agent_id: int | None = None,
    contact_name: str = "",
    contact_phone: str = "",
    contact_company: str = "",
    contact_custom_fields: str = "{}",
) -> session_module.Session:
    """Loads agent_id's dashboard config into a fresh Session, defaulting to
    the feature-flagged TEST_ACCOUNT_ID/TEST_AGENT_ID when the caller
    (inbound number lookup, or an explicit outbound-call request) doesn't
    supply real ones — keeps the original single-test-account behavior
    working unchanged for callers that never pass these."""
    return await _build_session(
        account_id or TEST_ACCOUNT_ID,
        agent_id or TEST_AGENT_ID,
        call_type,
        contact_name,
        contact_phone,
        contact_company,
        contact_custom_fields,
    )


async def _build_session(
    account_id: int,
    agent_id: int,
    call_type: str,
    contact_name: str = "",
    contact_phone: str = "",
    contact_company: str = "",
    contact_custom_fields: str = "{}",
) -> session_module.Session:
    """Loads agent_id's dashboard config into a fresh Session — same
    per-call config lookup agent/main.py did via db.get_agent_config.

    contact_* let a campaign dial (or any outbound call placed on someone
    else's behalf) personalize the greeting/system prompt the same way
    calls_db.place_test_call's contact_name/contact_company params always
    did on the old LiveKit path - without these an orchestrator-routed
    campaign call greets every contact identically, no name, no context.

    async, wrapping db.get_agent_config in asyncio.to_thread - see
    session.build_system_prompt's docstring for why a blocking DB call
    here would otherwise freeze every other concurrent call, not just
    this one.
    """
    cfg = await asyncio.to_thread(db.get_agent_config, agent_id) or {}
    try:
        custom_fields = json.loads(contact_custom_fields) if contact_custom_fields else {}
        if not isinstance(custom_fields, dict):
            custom_fields = {}
    except (ValueError, TypeError):
        custom_fields = {}
    sess = session_module.Session(
        account_id=account_id or None,
        agent_id=agent_id or None,
        call_type=call_type,
        voice=cfg.get("voice") or "shubh",
        reply_language=cfg.get("language") or "hi-IN",
        agent_name=cfg.get("name") or "Artha",
        business_name=cfg.get("name") or "this business",
        model=cfg.get("model") or "gpt-4o-mini",
        custom_system_prompt=cfg.get("system_prompt") or "",
        kb_id=cfg.get("kb_id"),
        memory_enabled=bool(cfg.get("memory_enabled")),
        transfer_phone=cfg.get("transfer_phone") or "",
        first_speaker=(cfg.get("first_speaker") or "agent").lower(),
        welcome_message=cfg.get("welcome_message") or "",
        visitor_name=contact_name,
        visitor_phone=contact_phone,
        company=contact_company,
        custom_fields=custom_fields,
    )
    session_module.build_tools_for_session(sess, cfg.get("custom_functions"))
    return sess


@app.post("/telephony/enablex/outbound-test-call")
async def enablex_outbound_test_call(body: dict = Body(...)) -> dict:
    """Places an outbound call from fromNumber/TEST_PHONE_NUMBER to `to`.
    Streaming starts on the `connected` webhook event, same as inbound —
    see enablex.place_outbound_call's docstring.

    Also the endpoint server/campaign_dialer.py proxies to for any campaign
    whose account is on this pipeline (db.is_on_orchestrator_pipeline)
    instead of calling calls_db.place_test_call's LiveKit-bridge path
    directly - fromNumber/accountId/agentId let it (and the dashboard's own
    per-tenant test-call button) dial as a real tenant instead of always
    the single feature-flagged test account; omitting them keeps the
    original single-test-account behavior for any caller that doesn't pass
    them. The optional contact* fields personalize the greeting the same
    way calls_db.place_test_call's contact_name/contact_company always did.
    """
    to_number = body.get("to")
    from_number = body.get("fromNumber") or TEST_PHONE_NUMBER
    account_id = body.get("accountId") or TEST_ACCOUNT_ID
    agent_id = body.get("agentId")
    if not agent_id and from_number:
        # Caller (e.g. the dashboard's own "test call" button) knows which
        # virtual number to dial from but not necessarily which dashboard
        # agent owns it — resolve it the same way a real inbound call would,
        # instead of requiring every outbound caller to look this up itself.
        number_row = await asyncio.to_thread(db.get_phone_number_by_number, from_number)
        if number_row:
            agent_id = number_row.get("agent_id")
    agent_id = agent_id or TEST_AGENT_ID
    contact_name = (body.get("contactName") or "").strip()
    contact_company = (body.get("contactCompany") or "").strip()
    contact_custom_fields = body.get("contactCustomFields") or "{}"
    if not to_number:
        return {"ok": False, "error": "Missing 'to' in request body."}
    if not account_id or not from_number:
        return {"ok": False, "error": "accountId/fromNumber not configured."}
    base = enablex.public_base_url()
    if not base:
        return {"ok": False, "error": "PUBLIC_BASE_URL/RAILWAY_PUBLIC_DOMAIN not set."}
    event_url = f"{base}/telephony/enablex/inbound-event"
    result = await enablex.place_outbound_call(from_number, to_number, account_id, event_url)
    if not result.get("ok"):
        logger.warning("place_outbound_call failed: %s", result.get("error"))
        return result
    voice_id = (result.get("response") or {}).get("voice_id")
    if voice_id:
        _PENDING_ACCOUNT_BY_VOICE_ID[voice_id] = account_id
        _PENDING_AGENT_BY_VOICE_ID[voice_id] = agent_id
        # Build the session (incl. the DB round-trip for agent config) and
        # kick off greeting TTS right now, overlapping with the destination
        # phone actually ringing — previously this only started once
        # "connected" fired, so the callee's ring time was pure dead air on
        # top of it instead of hidden behind it. The "connected" handler
        # below reuses this instead of rebuilding when it's already here.
        sess = await _build_session_for_test_call(
            account_id=account_id,
            agent_id=agent_id,
            contact_name=contact_name,
            contact_phone=to_number,
            contact_company=contact_company,
            contact_custom_fields=contact_custom_fields,
        )
        _PENDING_GREETING_BY_VOICE_ID[voice_id] = (
            sess,
            asyncio.create_task(session_module.build_greeting_audio(sess)),
        )
    logger.info("outbound test call placed: voice_id=%s to=%s", voice_id, to_number)
    return {"ok": True, "voice_id": voice_id}


@app.post("/telephony/enablex/inbound-event")
async def enablex_inbound_event(event: dict = Body(...)) -> dict:
    state = event.get("state")
    voice_id = event.get("voice_id")
    dialed_number = event.get("to")
    logger.info(
        "EnableX event: state=%s voice_id=%s to=%s reason=%s cause_code=%s",
        state, voice_id, dialed_number, event.get("disconnect_reason"), event.get("disconnect_cause_code"),
    )

    if state == "incomingcall":
        # Real per-tenant routing: whichever account registered this exact
        # number (any digit format - db.get_phone_number_by_number
        # normalizes the lookup, same fix already applied here once before
        # for the single-test-number comparison this replaces) owns the
        # call. Falls back to the single feature-flagged test number only
        # if it isn't found in phone_numbers at all, so the original
        # Phase 2 test account keeps working even before it's ever been
        # registered as a real phone_numbers row.
        number_row = await asyncio.to_thread(db.get_phone_number_by_number, dialed_number or "")
        if number_row is None:
            dialed_digits = "".join(c for c in (dialed_number or "") if c.isdigit())
            test_digits = "".join(c for c in TEST_PHONE_NUMBER if c.isdigit())
            if not test_digits or dialed_digits != test_digits:
                logger.info("ignoring call to %s — no registered tenant number", dialed_number)
                return {"ok": True}
            account_id, agent_id = TEST_ACCOUNT_ID, TEST_AGENT_ID
        else:
            account_id, agent_id = number_row["account_id"], number_row["agent_id"]
        if not account_id:
            logger.warning("no account_id resolved for call to %s — cannot accept", dialed_number)
            return {"ok": True}
        if not await asyncio.to_thread(db.is_on_orchestrator_pipeline, account_id) and account_id != TEST_ACCOUNT_ID:
            logger.info("account %s not on orchestrator pipeline — ignoring call to %s", account_id, dialed_number)
            return {"ok": True}
        _PENDING_ACCOUNT_BY_VOICE_ID[voice_id] = account_id
        _PENDING_AGENT_BY_VOICE_ID[voice_id] = agent_id
        # Start building the session and synthesizing the greeting right
        # now, overlapping with accept_call's round trip and the gap before
        # `connected` fires - not just after. Inbound has no earlier "call
        # placed" moment to hide this behind the way outbound does (ringing
        # time absorbs it there); `incomingcall` is the earliest point we
        # have, and skipping this head start was reported live as a
        # 10-11s gap between the call connecting and the agent's voice
        # actually starting - almost entirely the greeting TTS call itself
        # (~6-8s measured), previously only ever kicked off once `connected`
        # already fired. The `connected` handler below reuses this instead
        # of rebuilding when it's already here.
        sess = await _build_session_for_test_call(account_id=account_id, agent_id=agent_id)
        _PENDING_GREETING_BY_VOICE_ID[voice_id] = (
            sess,
            asyncio.create_task(session_module.build_greeting_audio(sess)),
        )
        result = await enablex.accept_call(voice_id, account_id)
        if not result.get("ok"):
            logger.warning("accept_call failed: %s", result.get("error"))
            _pop_pending_greeting(voice_id)
        return {"ok": True}

    if state == "connected":
        account_id = _PENDING_ACCOUNT_BY_VOICE_ID.get(voice_id)
        if account_id is None:
            return {"ok": True}  # not one of ours
        wss_base = enablex.public_wss_host()
        if not wss_base:
            logger.warning("PUBLIC_BASE_URL/WSS_PUBLIC_HOST not set — cannot start streaming")
            return {"ok": True}
        if voice_id not in _PENDING_GREETING_BY_VOICE_ID:
            # Inbound calls (or an outbound call whose pre-build above never
            # ran) don't have a session yet — build it now, for the actual
            # resolved tenant/agent rather than always the test account.
            agent_id = _PENDING_AGENT_BY_VOICE_ID.get(voice_id)
            sess = await _build_session_for_test_call(account_id=account_id, agent_id=agent_id)
            _PENDING_GREETING_BY_VOICE_ID[voice_id] = (
                sess,
                asyncio.create_task(session_module.build_greeting_audio(sess)),
            )
        token = ws_security.issue_stream_token(voice_id, account_id)
        wss_url = f"{wss_base}/stream?token={token}"
        result = await enablex.start_stream(voice_id, wss_url, account_id)
        if not result.get("ok"):
            logger.warning("start_stream failed: %s", result.get("error"))
            _pop_pending_greeting(voice_id)
        return {"ok": True}

    if state in ("disconnected", "stream_stopped", "stream_failed"):
        _PENDING_ACCOUNT_BY_VOICE_ID.pop(voice_id, None)
        _PENDING_AGENT_BY_VOICE_ID.pop(voice_id, None)
        _pop_pending_greeting(voice_id)
        return {"ok": True}

    return {"ok": True}


def _pop_pending_greeting(voice_id: str) -> None:
    """Cancels and discards a pre-started greeting task that was never
    consumed by stream_ws (start_stream failed, or the call ended before
    start_media ever arrived) — otherwise it'd run to completion unawaited
    and leak in _PENDING_GREETING_BY_VOICE_ID forever."""
    pending = _PENDING_GREETING_BY_VOICE_ID.pop(voice_id, None)
    if pending:
        _, task = pending
        if not task.done():
            task.cancel()


async def _prefetch_listening_cue(voice: str, reply_language: str) -> None:
    try:
        await session_module.get_listening_cue_audio(voice, reply_language)
    except Exception:
        logger.exception("listening cue prefetch failed (non-fatal, will retry on next barge-in)")


@app.websocket("/stream")
async def stream_ws(websocket: WebSocket, token: str) -> None:
    try:
        payload = ws_security.verify_stream_token(token)
    except ws_security.TokenError as e:
        logger.warning("rejecting stream connection: %s", e)
        await websocket.close(code=4401)
        return

    await websocket.accept()
    voice_id = payload["voice_id"]
    pending_greeting = _PENDING_GREETING_BY_VOICE_ID.pop(voice_id, None)
    if pending_greeting:
        sess, greeting_task = pending_greeting
    else:
        # Fallback for the token being verified without a matching pending
        # entry (e.g. a service restart between the `connected` webhook and
        # this WebSocket connecting) — same session build as before, just
        # without the head start.
        sess = await _build_session_for_test_call()
        greeting_task = None
    recorder = recording.CallRecorder()
    vad = audio.UtteranceVAD()
    # Real echo cancellation for the barge-in detector — see
    # audio.EchoCanceller's docstring. Persists (and keeps its learned
    # filter weights) for the whole call: the echo path's characteristics
    # don't change turn to turn, so keeping them speeds up reconvergence
    # on later turns instead of relearning from scratch each time.
    echo_canceller = audio.EchoCanceller()
    # PCM16 samples of what we've actually sent, in send order — the
    # barge-in check consumes from the front as each incoming mic frame
    # arrives, keeping the two streams aligned by real time without needing
    # explicit timestamps (the AEC's own adaptive delay absorbs the actual
    # network/telephony round trip). Empty means "nothing sent recently" —
    # the AEC then sees an all-zero reference, which is a safe no-op.
    ref_queue: collections.deque[np.ndarray] = collections.deque()
    seq_counter = itertools.count()
    stream_ctx: dict = {}
    speaking_task: asyncio.Task | None = None
    speaking_started_at = 0.0
    loud_streak = 0
    logger.info("stream connected for voice_id=%s", voice_id)

    async def _send_reply_audio(reply_audio: bytes, content_type: str) -> None:
        # Paced at real time (one frame's worth of sleep per frame sent) —
        # sending all chunks back-to-back as fast as the network allows
        # overruns EnableX's playback buffer and comes out as crackling.
        #
        # Scheduled against an absolute deadline (start + i*frame_ms) rather
        # than a fixed `sleep(frame_ms)` after every send - the naive fixed
        # sleep only accounts for the sleep itself, not however long
        # websocket.send_json's own network I/O took, so any send slower
        # than usual pushes every following frame's real send time later by
        # that same amount, with no way to recover - the delay just keeps
        # compounding for the rest of the reply. Reported live as crackling
        # audio after this service's WebSocket media path got longer/less
        # predictable (a region move). Recomputing the remaining time to
        # the next deadline on every iteration means a single slow send
        # only costs that one frame's slack, not a permanent, growing
        # offset for everything after it.
        reply_ulaw = audio.wav_or_mp3_to_ulaw(reply_audio, content_type)
        recorder.append_agent_audio(audioop.ulaw2lin(reply_ulaw, 2))
        frame_ms = 20
        frame_s = frame_ms / 1000
        loop = asyncio.get_event_loop()
        start = loop.time()
        for i, chunk in enumerate(audio.chunk_ulaw(reply_ulaw, frame_ms=frame_ms)):
            await websocket.send_json({
                "event": "media",
                "voice_id": stream_ctx.get("voice_id", voice_id),
                "stream_id": stream_ctx.get("stream_id"),
                "media": {
                    "seq": next(seq_counter),
                    "timestamp": int(time.time() * 1000),
                    "format": {"encoding": "ulaw", "sample_rate": 8000, "channels": 1},
                    "payload": base64.b64encode(chunk).decode(),
                },
            })
            if chunk:
                # Feed the echo canceller's reference stream with exactly
                # what we just sent, in send order — see ref_queue above.
                ref_queue.append(np.frombuffer(audioop.ulaw2lin(chunk, 2), dtype=np.int16))
            deadline = start + (i + 1) * frame_s
            remaining = deadline - loop.time()
            if remaining > 0:
                await asyncio.sleep(remaining)

    async def _speak(reply_audio: bytes, content_type: str) -> None:
        try:
            await _send_reply_audio(reply_audio, content_type)
        except asyncio.CancelledError:
            pass
        except Exception:
            # Backgrounded task — an uncaught exception here would otherwise
            # die silently (visible only as "Task exception was never
            # retrieved" deep in asyncio's own logging, easy to miss) and
            # the caller just hears nothing with no trace of why.
            logger.exception("unexpected error sending audio")

    async def _process_turn(wav_bytes: bytes) -> None:
        # Whole turn (STT -> streamed LLM -> per-sentence TTS -> send) runs
        # as one backgrounded task, same as _speak — cancelling it at any
        # point (still thinking, or partway through a sentence) is what
        # makes barge-in work uniformly across the whole turn, not just
        # during playback.
        try:
            reply_text = await session_module.handle_utterance_streaming(sess, wav_bytes, _send_reply_audio)
        except stt.STTError as e:
            logger.info("skipping turn, no speech detected: %s", e)
            return
        except tts.TTSError as e:
            logger.warning("TTS failed mid-call: %s", e)
            return
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("unexpected error processing turn")
            return
        logger.info("agent replied: %s", reply_text)
        if sess.ending_call:
            # Goodbye already played out (streamed like any other reply) —
            # close explicitly rather than waiting for EnableX's own
            # teardown, so the call actually ends now.
            await websocket.close()

    async def _barge_in() -> None:
        # Caller started talking over the agent — stop the in-flight reply
        # immediately and tell EnableX to drop whatever's still queued on
        # its side, per the clear_media event in EnableX's streaming docs.
        #
        # Logged explicitly (added 2026-08-14, after a live test call with
        # _PHONE_BARGE_IN_ENABLED=True reproduced the pre-AEC "ji bataiye
        # loop then mute" failure with no way to tell from logs alone
        # whether this actually fired, fired falsely, or something else
        # broke downstream of it) — next attempt should have real evidence.
        logger.info("phone barge-in triggered for voice_id=%s", voice_id)
        nonlocal speaking_task
        if speaking_task and not speaking_task.done():
            speaking_task.cancel()
        speaking_task = None
        if stream_ctx.get("stream_id"):
            await websocket.send_json({
                "event": "clear_media",
                "stream_id": stream_ctx.get("stream_id"),
                "voice_id": stream_ctx.get("voice_id", voice_id),
            })
        vad.reset()
        # Instant "I heard you" acknowledgment — the real reply is still
        # 1-2s away (STT/LLM/TTS haven't even started), and without this
        # that gap reads as dead air and callers hang up early.
        try:
            cue_audio, cue_content_type = await session_module.get_listening_cue_audio(
                sess.voice, sess.reply_language
            )
            # Recorded in the transcript, not just the WAV: the cue is a real
            # thing the caller hears, and its absence here is why a barge-in
            # loop showed up as an empty transcript while the caller was
            # hearing "जी, बताइए।" over and over. Flagged `cue` so it reads
            # as an acknowledgment, not something the agent chose to say.
            sess.transcript.append({
                "role": "assistant",
                "text": session_module.listening_cue_text(sess.reply_language),
                "cue": True,
            })
            await _send_reply_audio(cue_audio, cue_content_type)
        except tts.TTSError as e:
            logger.warning("listening cue TTS failed: %s", e)
        except Exception:
            # Never let the acknowledgment cue take the whole call down —
            # worst case is just no cue this time, not a dead call.
            logger.exception("unexpected error playing listening cue")

    try:
        while True:
            msg = await websocket.receive_json()
            event = msg.get("event")

            if event == "connected":
                continue

            if event == "start_media":
                stream_ctx["stream_id"] = msg["stream_id"]
                stream_ctx["voice_id"] = msg["start"]["voice_id"]
                # Speak first, like agent/main.py's on_enter() — otherwise the
                # caller sits in silence and the VAD's first "utterance" ends
                # up being call-start noise instead of real speech. Usually
                # already-synthesized by now (kicked off back at the
                # `connected` webhook, well before start_media) — the
                # fallback path only re-synthesizes if that head start
                # wasn't available.
                try:
                    greeting = await greeting_task if greeting_task else await session_module.build_greeting_audio(sess)
                except tts.TTSError as e:
                    logger.warning("greeting TTS failed: %s", e)
                    greeting = None
                if greeting:
                    greeting_audio, greeting_content_type = greeting
                    logger.info("greeting: %s", sess.transcript[-1]["text"])
                    ref_queue.clear()
                    speaking_task = asyncio.create_task(_speak(greeting_audio, greeting_content_type))
                    speaking_started_at = time.monotonic()
                # Warm the listening-cue cache now (process-wide, keyed by
                # voice+language) so it's already synthesized by the time a
                # barge-in could plausibly happen partway through the
                # greeting — first-ever call on a voice still pays for it
                # once, but never again after that.
                asyncio.create_task(_prefetch_listening_cue(sess.voice, sess.reply_language))
                continue

            if event == "media":
                ulaw_frame = base64.b64decode(msg["media"]["payload"])
                recorder.append_caller_audio(audioop.ulaw2lin(ulaw_frame, 2))

                if speaking_task and not speaking_task.done():
                    if not _PHONE_BARGE_IN_ENABLED:
                        # See _PHONE_BARGE_IN_ENABLED above — no reliable way
                        # to tell the agent's own echoed voice apart from a
                        # real interruption on this leg yet, so let the
                        # reply finish instead of self-cancelling it.
                        continue
                    # Grace period right after starting to speak: TTS
                    # synthesis takes a second or two, during which the
                    # caller's real-time audio backs up unprocessed. The
                    # instant we resume reading, that whole backlog arrives
                    # at once and looks exactly like "sustained loudness" —
                    # without this window it triggers a false barge-in
                    # before a single frame of the reply has gone out.
                    if (time.monotonic() - speaking_started_at) * 1000 < _BARGE_IN_GRACE_MS:
                        loud_streak = 0
                        continue
                    # Echo-cancel before the energy check — see
                    # audio.EchoCanceller. ref is what we actually sent
                    # around this point in time (empty queue -> zeros,
                    # a safe no-op). Still layered under the same elevated
                    # threshold/frame-count as before (not loosened) since
                    # this is the first time real echo cancellation runs
                    # against live telephony line conditions.
                    mic_pcm16 = np.frombuffer(audioop.ulaw2lin(ulaw_frame, 2), dtype=np.int16)
                    ref_empty = not ref_queue
                    ref_pcm16 = ref_queue.popleft() if ref_queue else np.zeros_like(mic_pcm16)
                    residual = echo_canceller.process(mic_pcm16, ref_pcm16)
                    residual_energy = int(np.sqrt(np.mean(residual * residual)))
                    # Agent is talking — only track sustained loudness for
                    # barge-in, don't run full utterance detection yet.
                    if residual_energy >= vad.energy_threshold * _PHONE_BARGE_IN_ENERGY_MULTIPLIER:
                        if loud_streak == 0:
                            # First loud frame of a potential barge-in run —
                            # log once here (not every frame) with enough to
                            # diagnose a false trigger after the fact:
                            # ref_empty=True means the echo canceller had
                            # nothing to cancel against for this frame (the
                            # reply's audio queue had drained, but the phone
                            # line may still be finishing playback of it) -
                            # a real gap where echo could pass through
                            # uncancelled. See _PHONE_BARGE_IN_ENABLED above.
                            logger.info(
                                "phone barge-in candidate: residual_energy=%d threshold=%d ref_empty=%s",
                                residual_energy,
                                int(vad.energy_threshold * _PHONE_BARGE_IN_ENERGY_MULTIPLIER),
                                ref_empty,
                            )
                        loud_streak += 1
                    else:
                        loud_streak = 0
                    if loud_streak >= _PHONE_BARGE_IN_FRAMES:
                        loud_streak = 0
                        ref_queue.clear()
                        await _barge_in()
                        vad.push_ulaw_frame(ulaw_frame)
                    continue

                utterance_ulaw = vad.push_ulaw_frame(ulaw_frame)
                if not utterance_ulaw:
                    continue
                wav_bytes = audio.ulaw_b64_frames_to_wav(utterance_ulaw)
                ref_queue.clear()
                speaking_task = asyncio.create_task(_process_turn(wav_bytes))
                speaking_started_at = time.monotonic()
                continue

            if event == "stop_media":
                break
    except WebSocketDisconnect:
        logger.info("stream disconnected for voice_id=%s", voice_id)
    finally:
        if speaking_task and not speaking_task.done():
            speaking_task.cancel()
        if greeting_task and not greeting_task.done():
            greeting_task.cancel()
        wav_path = recorder.stop()
        call_id = await session_module.finalize_call(sess, room_name=f"phone-{voice_id}")
        if wav_path:
            key = recording.upload_recording(wav_path, sess.account_id, call_id)
            if key:
                await asyncio.to_thread(db.set_call_recording, call_id, key)
        _PENDING_ACCOUNT_BY_VOICE_ID.pop(voice_id, None)
        _PENDING_AGENT_BY_VOICE_ID.pop(voice_id, None)
        logger.info("call finalized: voice_id=%s call_id=%s", voice_id, call_id)


# --------------------------------------------------------------------------
# Phase 3 — browser/widget adapter. Same orchestrator, same Session/
# handle_utterance_streaming pipeline as the phone path above, but the
# transport is different: no EnableX, no ulaw, no REST call-control. The
# browser mic delivers raw PCM16 directly (decoded client-side via Web
# Audio), and replies go back as whole WAV/MP3 clips the browser can feed
# straight to decodeAudioData — no chunking/pacing/fade-edges needed since
# there's no fixed-rate telephony wire format to match.
#
# Defaults to TEST_ACCOUNT_ID/TEST_AGENT_ID (the standalone test page never
# passes account_id/agent_id) but accepts an explicit pair too — used by
# server/token_api.py's authenticated /orchestrator/browser-token proxy so
# the dashboard's own agent-test mic button can target the operator's real
# account/agent instead of only the one fixed test agent. That proxy is the
# trust boundary: this route itself does no dashboard auth of its own.
# --------------------------------------------------------------------------


@app.get("/browser/token")
async def browser_token(account_id: int | None = None, agent_id: int | None = None) -> dict:
    account_id = account_id or TEST_ACCOUNT_ID or None
    agent_id = agent_id or TEST_AGENT_ID or None
    if not account_id or not agent_id:
        return {"ok": False, "error": "account_id/agent_id not provided and TEST_ACCOUNT_ID/TEST_AGENT_ID not configured."}
    wss_base = enablex.public_wss_host()
    if not wss_base:
        return {"ok": False, "error": "PUBLIC_BASE_URL/WSS_PUBLIC_HOST not set."}
    session_id = str(uuid.uuid4())
    token = ws_security.issue_stream_token(session_id, account_id, agent_id)
    return {"ok": True, "wssUrl": f"{wss_base}/browser/stream?token={token}"}


@app.get("/browser/token/platform-demo")
async def browser_token_platform_demo() -> dict:
    """Public (no auth) token for the marketing site's live demo — used as
    a fallback when LiveKit's demo worker doesn't pick up (see
    server/token_api.py's /orchestrator/platform-demo-token, which is the
    actual public-facing, rate-limited entry point; this route itself does
    no rate limiting since it's only ever called server-to-server from
    there). Resolves the SAME agent LiveKit's public /token route resolves
    for an unrouted browser call: db.get_agent_config(None) prefers
    whichever agent is flagged is_platform_demo, reading the same `agents`
    table — no separate config needed here."""
    cfg = await asyncio.to_thread(db.get_agent_config, None) or {}
    account_id = cfg.get("account_id")
    agent_id = cfg.get("id")
    if not account_id or not agent_id:
        return {"ok": False, "error": "No platform demo agent configured."}
    wss_base = enablex.public_wss_host()
    if not wss_base:
        return {"ok": False, "error": "PUBLIC_BASE_URL/WSS_PUBLIC_HOST not set."}
    session_id = str(uuid.uuid4())
    token = ws_security.issue_stream_token(session_id, account_id, agent_id)
    return {"ok": True, "wssUrl": f"{wss_base}/browser/stream?token={token}"}


@app.websocket("/browser/stream")
async def browser_stream_ws(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token", "")
    try:
        payload = ws_security.verify_stream_token(token)
    except ws_security.TokenError as e:
        logger.warning("rejecting browser stream connection: %s", e)
        await websocket.close(code=4401)
        return

    await websocket.accept()
    session_id = payload["voice_id"]
    account_id = payload.get("account_id") or TEST_ACCOUNT_ID
    agent_id = payload.get("agent_id") or TEST_AGENT_ID
    sess = await _build_session(account_id, agent_id, call_type="browser")
    # UtteranceVAD's default energy_threshold=400 was tuned against
    # mu-law-decoded 8kHz phone audio, which runs much hotter than a raw
    # browser mic capture — real sessions here logged a median frame energy
    # of ~36 and a mean of ~158, almost entirely under 400. That meant most
    # actual speech was being classified as silence, cutting utterances off
    # mid-word (STT "not listening properly"). 80 comfortably clears typical
    # room-noise-floor readings (10-40) while still requiring real voice.
    vad = audio.UtteranceVAD(energy_threshold=80)
    frame_count = 0
    recorder = recording.CallRecorder()
    # CallRecorder assumes 16kHz PCM16 input (matches the phone path's
    # decoded-ulaw rate); the browser mic runs at whatever rate the client's
    # AudioContext used (typically 48000), so both directions get resampled
    # down. audioop.ratecv's `state` must persist across calls for a
    # continuous, click-free resample — reassigned each call below.
    caller_ratecv_state = None
    speaking_task: asyncio.Task | None = None
    # Unlike the phone path, sending a reply clip here is near-instant (one
    # websocket.send_bytes, no real-time pacing) — actual playback happens
    # client-side over the next several seconds. So speaking_task.done()
    # says nothing about whether audio is still audible; barge-in instead
    # gates on client_speaking, which the client toggles via speaking_start/
    # speaking_end messages as its own playback queue starts/drains.
    client_speaking = False
    speaking_started_at = 0.0
    loud_streak = 0
    sample_rate = 48000  # overwritten by the client's "start" message
    logger.info("browser stream connected for session_id=%s", session_id)

    async def _send_reply_audio(reply_audio: bytes, content_type: str) -> None:
        # No chunking/pacing needed — the browser decodes and plays a
        # whole clip at once, unlike EnableX's fixed-rate `media` wire
        # protocol. content_type isn't sent explicitly: both WAV and MP3
        # are self-describing formats decodeAudioData can sniff.
        try:
            agent_pcm16 = audio.wav_or_mp3_to_pcm16(reply_audio, content_type, recording.RECORDING_SAMPLE_RATE)
            recorder.append_agent_audio(agent_pcm16)
        except Exception:
            logger.exception("failed to append agent audio to recording")
        await websocket.send_bytes(reply_audio)

    async def _send_transcript(role: str, text: str) -> None:
        try:
            await websocket.send_json({"event": "transcript", "role": role, "text": text})
        except Exception:
            logger.exception("unexpected error sending transcript event")

    async def _speak(reply_audio: bytes, content_type: str) -> None:
        try:
            await _send_reply_audio(reply_audio, content_type)
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("unexpected error sending browser reply audio")

    async def _barge_in() -> None:
        nonlocal speaking_task, client_speaking
        if speaking_task and not speaking_task.done():
            speaking_task.cancel()
        speaking_task = None
        client_speaking = False
        try:
            await websocket.send_json({"event": "clear_audio"})
        except Exception:
            logger.exception("unexpected error sending clear_audio")
        vad.reset()

    async def _process_turn(wav_bytes: bytes) -> None:
        try:
            await websocket.send_json({"event": "state", "state": "thinking"})
        except Exception:
            logger.exception("unexpected error sending state event")
        try:
            reply_text = await session_module.handle_utterance_streaming(
                sess, wav_bytes, _send_reply_audio, _send_transcript
            )
        except stt.STTError as e:
            logger.info("skipping turn, no speech detected: %s", e)
            return
        except tts.TTSError as e:
            logger.warning("TTS failed mid-call: %s", e)
            return
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("unexpected error processing browser turn")
            return
        logger.info("agent replied: %s", reply_text)
        if sess.ending_call:
            await websocket.close()

    try:
        # Speak first, like the phone path's greeting — otherwise the
        # visitor sits in silence waiting for the mic to pick something up.
        try:
            greeting = await session_module.build_greeting_audio(sess)
        except tts.TTSError as e:
            logger.warning("greeting TTS failed: %s", e)
            greeting = None
        if greeting:
            greeting_audio, greeting_content_type = greeting
            logger.info("greeting: %s", sess.transcript[-1]["text"])
            await _send_transcript("assistant", sess.transcript[-1]["text"])
            speaking_task = asyncio.create_task(_speak(greeting_audio, greeting_content_type))
        asyncio.create_task(_prefetch_listening_cue(sess.voice, sess.reply_language))

        while True:
            try:
                msg = await websocket.receive()
            except RuntimeError:
                # Raised if the socket was already closed (by us, e.g. from
                # _process_turn on call end, or by the client) — treat like
                # a disconnect rather than letting it blow up as an
                # unhandled ASGI exception.
                break
            if msg.get("type") == "websocket.disconnect":
                break
            if "text" in msg and msg["text"] is not None:
                data = json.loads(msg["text"])
                event = data.get("event")
                if event == "start":
                    sample_rate = int(data.get("sampleRate") or 48000)
                    logger.info("browser stream got start event: sampleRate=%s", sample_rate)
                elif event == "stop":
                    break
                elif event == "speaking_start":
                    client_speaking = True
                    speaking_started_at = time.monotonic()
                elif event == "speaking_end":
                    client_speaking = False
                continue

            if "bytes" not in msg or msg["bytes"] is None:
                continue
            pcm16_frame = msg["bytes"]
            frame_ms = int((len(pcm16_frame) / 2) / sample_rate * 1000) or 1
            try:
                caller_pcm16, caller_ratecv_state = audioop.ratecv(
                    pcm16_frame, 2, 1, sample_rate, recording.RECORDING_SAMPLE_RATE, caller_ratecv_state
                )
                recorder.append_caller_audio(caller_pcm16)
            except Exception:
                logger.exception("failed to append caller audio to recording")
            frame_count += 1
            if frame_count == 1 or frame_count % 50 == 0:
                logger.info(
                    "browser stream frame #%s: %d bytes, energy=%d, sample_rate=%s",
                    frame_count, len(pcm16_frame), audio.frame_energy_pcm16(pcm16_frame), sample_rate,
                )

            if speaking_task is not None and not speaking_task.done():
                if not client_speaking:
                    # Still generating this reply (STT/LLM, nothing audible
                    # yet to interrupt) — wait rather than starting a second
                    # concurrent turn against the same message history.
                    # Two turns racing on session.messages is what corrupts
                    # OpenAI's tool_call/tool pairing and 400s the next call.
                    continue
                if (time.monotonic() - speaking_started_at) * 1000 < _BARGE_IN_GRACE_MS:
                    loud_streak = 0
                    continue
                if audio.frame_energy_pcm16(pcm16_frame) >= vad.energy_threshold:
                    loud_streak += 1
                else:
                    loud_streak = 0
                if loud_streak >= _BARGE_IN_FRAMES:
                    loud_streak = 0
                    await _barge_in()
                    vad.push_pcm16_frame(pcm16_frame, frame_ms)
                continue

            utterance_pcm16 = vad.push_pcm16_frame(pcm16_frame, frame_ms)
            if not utterance_pcm16:
                continue
            wav_bytes = audio.pcm16_to_wav(utterance_pcm16, sample_rate)
            speaking_task = asyncio.create_task(_process_turn(wav_bytes))
    except WebSocketDisconnect:
        logger.info("browser stream disconnected for session_id=%s", session_id)
    finally:
        if speaking_task and not speaking_task.done():
            speaking_task.cancel()
        wav_path = recorder.stop()
        call_id = await session_module.finalize_call(sess, room_name=f"browser-{session_id}")
        if wav_path:
            key = recording.upload_recording(wav_path, sess.account_id, call_id)
            if key:
                await asyncio.to_thread(db.set_call_recording, call_id, key)
        logger.info("browser call finalized: session_id=%s call_id=%s", session_id, call_id)
