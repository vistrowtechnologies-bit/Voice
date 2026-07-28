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
import itertools
import json
import logging
import os
import time
import uuid

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
_BARGE_IN_FRAMES = 4
# Suppress barge-in detection for this long after a reply starts sending.
# TTS synthesis takes a second or two; the caller's audio backs up
# unprocessed during that wait and arrives all at once the moment we
# resume reading — without this grace window that backlog alone satisfies
# _BARGE_IN_FRAMES and cancels the reply before any of it is heard.
_BARGE_IN_GRACE_MS = 500

# voice_id -> account_id, populated on `incomingcall` so the `connected`
# event (which doesn't repeat the dialed number reliably enough to re-derive
# this) knows which tenant's EnableX credentials to use. Single-instance,
# in-memory — fine for a one-test-number Phase 2 deployment; Phase 4's real
# multi-tenant routing will need this to be durable (Postgres-backed) since
# it'll run across multiple replicas.
_PENDING_ACCOUNT_BY_VOICE_ID: dict[str, int] = {}


def _build_session_for_test_call(call_type: str = "phone") -> session_module.Session:
    """Loads TEST_AGENT_ID's dashboard config into a fresh Session — same
    per-call config lookup agent/main.py did via db.get_agent_config."""
    cfg = db.get_agent_config(TEST_AGENT_ID) or {}
    sess = session_module.Session(
        account_id=TEST_ACCOUNT_ID or None,
        agent_id=TEST_AGENT_ID or None,
        call_type=call_type,
        voice=cfg.get("voice") or "shubh",
        reply_language=cfg.get("language") or "hi-IN",
        agent_name=cfg.get("name") or "Artha",
        business_name=cfg.get("name") or "this business",
        model=cfg.get("model") or "gpt-4o-mini",
        custom_system_prompt=cfg.get("system_prompt") or "",
        kb_id=cfg.get("kb_id"),
        transfer_phone=cfg.get("transfer_phone") or "",
        first_speaker=(cfg.get("first_speaker") or "agent").lower(),
        welcome_message=cfg.get("welcome_message") or "",
    )
    session_module.build_tools_for_session(sess, cfg.get("custom_functions"))
    return sess


@app.post("/telephony/enablex/outbound-test-call")
async def enablex_outbound_test_call(body: dict = Body(...)) -> dict:
    """Places an outbound call from TEST_PHONE_NUMBER to `to` using the
    same feature-flagged test account/agent as the inbound path. Streaming
    starts on the `connected` webhook event, same as inbound — see
    enablex.place_outbound_call's docstring."""
    to_number = body.get("to")
    if not to_number:
        return {"ok": False, "error": "Missing 'to' in request body."}
    if not TEST_ACCOUNT_ID or not TEST_PHONE_NUMBER:
        return {"ok": False, "error": "TEST_ACCOUNT_ID/TEST_PHONE_NUMBER not configured."}
    base = enablex.public_base_url()
    if not base:
        return {"ok": False, "error": "PUBLIC_BASE_URL/RAILWAY_PUBLIC_DOMAIN not set."}
    event_url = f"{base}/telephony/enablex/inbound-event"
    result = await enablex.place_outbound_call(TEST_PHONE_NUMBER, to_number, TEST_ACCOUNT_ID, event_url)
    if not result.get("ok"):
        logger.warning("place_outbound_call failed: %s", result.get("error"))
        return result
    voice_id = (result.get("response") or {}).get("voice_id")
    if voice_id:
        _PENDING_ACCOUNT_BY_VOICE_ID[voice_id] = TEST_ACCOUNT_ID
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
        if not TEST_PHONE_NUMBER or dialed_number != TEST_PHONE_NUMBER:
            logger.info("ignoring call to %s — not the flagged Phase 2 test number", dialed_number)
            return {"ok": True}
        if not TEST_ACCOUNT_ID:
            logger.warning("TEST_ACCOUNT_ID not configured — cannot accept call")
            return {"ok": True}
        _PENDING_ACCOUNT_BY_VOICE_ID[voice_id] = TEST_ACCOUNT_ID
        result = await enablex.accept_call(voice_id, TEST_ACCOUNT_ID)
        if not result.get("ok"):
            logger.warning("accept_call failed: %s", result.get("error"))
        return {"ok": True}

    if state == "connected":
        account_id = _PENDING_ACCOUNT_BY_VOICE_ID.get(voice_id)
        if account_id is None:
            return {"ok": True}  # not one of ours
        wss_base = enablex.public_wss_host()
        if not wss_base:
            logger.warning("PUBLIC_BASE_URL/WSS_PUBLIC_HOST not set — cannot start streaming")
            return {"ok": True}
        token = ws_security.issue_stream_token(voice_id, account_id)
        wss_url = f"{wss_base}/stream?token={token}"
        result = await enablex.start_stream(voice_id, wss_url, account_id)
        if not result.get("ok"):
            logger.warning("start_stream failed: %s", result.get("error"))
        return {"ok": True}

    if state in ("disconnected", "stream_stopped", "stream_failed"):
        _PENDING_ACCOUNT_BY_VOICE_ID.pop(voice_id, None)
        return {"ok": True}

    return {"ok": True}


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
    sess = _build_session_for_test_call()
    recorder = recording.CallRecorder()
    vad = audio.UtteranceVAD()
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
        reply_ulaw = audio.wav_or_mp3_to_ulaw(reply_audio, content_type)
        recorder.append_agent_audio(audioop.ulaw2lin(reply_ulaw, 2))
        frame_ms = 20
        for chunk in audio.chunk_ulaw(reply_ulaw, frame_ms=frame_ms):
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
            await asyncio.sleep(frame_ms / 1000)

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
                # up being call-start noise instead of real speech.
                try:
                    greeting = await session_module.build_greeting_audio(sess)
                except tts.TTSError as e:
                    logger.warning("greeting TTS failed: %s", e)
                    greeting = None
                if greeting:
                    greeting_audio, greeting_content_type = greeting
                    logger.info("greeting: %s", sess.transcript[-1]["text"])
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
                    # Agent is talking — only track sustained loudness for
                    # barge-in, don't run full utterance detection yet.
                    if audio.frame_energy(ulaw_frame) >= vad.energy_threshold:
                        loud_streak += 1
                    else:
                        loud_streak = 0
                    if loud_streak >= _BARGE_IN_FRAMES:
                        loud_streak = 0
                        await _barge_in()
                        vad.push_ulaw_frame(ulaw_frame)
                    continue

                utterance_ulaw = vad.push_ulaw_frame(ulaw_frame)
                if not utterance_ulaw:
                    continue
                wav_bytes = audio.ulaw_b64_frames_to_wav(utterance_ulaw)
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
        wav_path = recorder.stop()
        call_id = await session_module.finalize_call(sess, room_name=f"phone-{voice_id}")
        if wav_path:
            key = recording.upload_recording(wav_path, sess.account_id, call_id)
            if key:
                db.set_call_recording(call_id, key)
        _PENDING_ACCOUNT_BY_VOICE_ID.pop(voice_id, None)
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
# Feature-flagged to the same TEST_ACCOUNT_ID/TEST_AGENT_ID as the phone
# path for this proving stage — not yet wired into the production widget.
# --------------------------------------------------------------------------


@app.get("/browser/token")
async def browser_token() -> dict:
    if not TEST_ACCOUNT_ID or not TEST_AGENT_ID:
        return {"ok": False, "error": "TEST_ACCOUNT_ID/TEST_AGENT_ID not configured."}
    wss_base = enablex.public_wss_host()
    if not wss_base:
        return {"ok": False, "error": "PUBLIC_BASE_URL/WSS_PUBLIC_HOST not set."}
    session_id = str(uuid.uuid4())
    token = ws_security.issue_stream_token(session_id, TEST_ACCOUNT_ID)
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
    sess = _build_session_for_test_call(call_type="browser")
    vad = audio.UtteranceVAD()
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
        await websocket.send_bytes(reply_audio)

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

            if client_speaking:
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
        call_id = await session_module.finalize_call(sess, room_name=f"browser-{session_id}")
        logger.info("browser call finalized: session_id=%s call_id=%s", session_id, call_id)
