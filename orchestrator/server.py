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

import audioop
import base64
import itertools
import logging
import os
import time

from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect

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

app = FastAPI(title="Vistrow Voice orchestrator (Phase 2 — EnableX adapter)")

# --- Phase 2 feature flag: ONE test number, hardcoded via env vars rather
# than the production phone_numbers table, so this can't accidentally pick
# up a real tenant's number before it's proven. Phase 4 replaces this with
# the real per-tenant routing once cutover happens.
TEST_ACCOUNT_ID = int(os.environ.get("TEST_ACCOUNT_ID", "0") or 0)
TEST_AGENT_ID = int(os.environ.get("TEST_AGENT_ID", "0") or 0)
TEST_PHONE_NUMBER = os.environ.get("TEST_PHONE_NUMBER", "")

# voice_id -> account_id, populated on `incomingcall` so the `connected`
# event (which doesn't repeat the dialed number reliably enough to re-derive
# this) knows which tenant's EnableX credentials to use. Single-instance,
# in-memory — fine for a one-test-number Phase 2 deployment; Phase 4's real
# multi-tenant routing will need this to be durable (Postgres-backed) since
# it'll run across multiple replicas.
_PENDING_ACCOUNT_BY_VOICE_ID: dict[str, int] = {}


def _build_session_for_test_call() -> session_module.Session:
    """Loads TEST_AGENT_ID's dashboard config into a fresh Session — same
    per-call config lookup agent/main.py did via db.get_agent_config."""
    cfg = db.get_agent_config(TEST_AGENT_ID) or {}
    sess = session_module.Session(
        account_id=TEST_ACCOUNT_ID or None,
        agent_id=TEST_AGENT_ID or None,
        call_type="phone",
        voice=cfg.get("voice") or "shubh",
        reply_language=cfg.get("language") or "hi-IN",
        agent_name=cfg.get("name") or "Artha",
        business_name=cfg.get("name") or "this business",
        model=cfg.get("model") or "gpt-4o-mini",
        custom_system_prompt=cfg.get("system_prompt") or "",
        kb_id=cfg.get("kb_id"),
        transfer_phone=cfg.get("transfer_phone") or "",
    )
    session_module.build_tools_for_session(sess, cfg.get("custom_functions"))
    return sess


@app.post("/telephony/enablex/inbound-event")
async def enablex_inbound_event(event: dict = Body(...)) -> dict:
    state = event.get("state")
    voice_id = event.get("voice_id")
    dialed_number = event.get("to")
    logger.info("EnableX event: state=%s voice_id=%s to=%s", state, voice_id, dialed_number)

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
    logger.info("stream connected for voice_id=%s", voice_id)

    try:
        while True:
            msg = await websocket.receive_json()
            event = msg.get("event")

            if event == "connected":
                continue

            if event == "start_media":
                stream_ctx["stream_id"] = msg["stream_id"]
                stream_ctx["voice_id"] = msg["start"]["voice_id"]
                continue

            if event == "media":
                ulaw_frame = base64.b64decode(msg["media"]["payload"])
                recorder.append_caller_audio(audioop.ulaw2lin(ulaw_frame, 2))
                utterance_ulaw = vad.push_ulaw_frame(ulaw_frame)
                if not utterance_ulaw:
                    continue
                try:
                    wav_bytes = audio.ulaw_b64_frames_to_wav(utterance_ulaw)
                    reply_text, reply_audio, content_type = await session_module.handle_utterance(sess, wav_bytes)
                except stt.STTError as e:
                    logger.info("skipping turn, no speech detected: %s", e)
                    continue
                except tts.TTSError as e:
                    logger.warning("TTS failed mid-call: %s", e)
                    continue
                logger.info("agent replied: %s", reply_text)
                reply_ulaw = audio.wav_or_mp3_to_ulaw(reply_audio, content_type)
                recorder.append_agent_audio(audioop.ulaw2lin(reply_ulaw, 2))
                for chunk in audio.chunk_ulaw(reply_ulaw):
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
                if sess.ending_call:
                    break
                continue

            if event == "stop_media":
                break
    except WebSocketDisconnect:
        logger.info("stream disconnected for voice_id=%s", voice_id)
    finally:
        wav_path = recorder.stop()
        call_id = await session_module.finalize_call(sess, room_name=f"phone-{voice_id}")
        if wav_path:
            key = recording.upload_recording(wav_path, sess.account_id, call_id)
            if key:
                db.set_call_recording(call_id, key)
        _PENDING_ACCOUNT_BY_VOICE_ID.pop(voice_id, None)
        logger.info("call finalized: voice_id=%s call_id=%s", voice_id, call_id)
