"""Signed, single-use, short-expiry tokens for EnableX's WebSocket
connection — implements the exact scheme EnableX's Media Streaming docs
describe (developer.enablex.io/voice/media-streaming.html, "Securing the
WebSocket Connection"): a JWT embedded in the wss_host query string,
validated by us during the WebSocket upgrade handshake before accepting
the connection. EnableX doesn't inspect the token itself — validation is
entirely our responsibility.
"""

from __future__ import annotations

import os
import time
import uuid

import jwt

_ALGORITHM = "HS256"
_EXPIRY_SECONDS = 45  # keep short per EnableX's own guidance (30-60s window)

_consumed_jti: set[str] = set()
_CONSUMED_MAX = 10_000  # defensive cap; single-instance Phase 2 scope


def _secret() -> str:
    secret = os.environ.get("ORCHESTRATOR_WS_SECRET")
    if not secret:
        raise RuntimeError("ORCHESTRATOR_WS_SECRET is not set — required to sign/verify streaming tokens.")
    return secret


def issue_stream_token(voice_id: str, account_id: int) -> str:
    """One signed, single-use token authorizing exactly one streaming
    session for this voice_id. Embed as `?token=...` in the wss_host URL
    passed to enablex.start_stream/place_outbound_call."""
    now = int(time.time())
    payload = {
        "jti": str(uuid.uuid4()),
        "voice_id": voice_id,
        "account_id": account_id,
        "iat": now,
        "exp": now + _EXPIRY_SECONDS,
    }
    return jwt.encode(payload, _secret(), algorithm=_ALGORITHM)


class TokenError(Exception):
    pass


def verify_stream_token(token: str) -> dict:
    """Validates signature, expiry, and single-use; returns the payload
    ({voice_id, account_id, ...}) on success. Raises TokenError otherwise —
    the WebSocket route rejects the upgrade on any TokenError."""
    try:
        payload = jwt.decode(token, _secret(), algorithms=[_ALGORITHM])
    except jwt.ExpiredSignatureError as e:
        raise TokenError("Stream token expired.") from e
    except jwt.InvalidTokenError as e:
        raise TokenError(f"Invalid stream token: {e}") from e
    jti = payload.get("jti")
    if not jti or jti in _consumed_jti:
        raise TokenError("Stream token already used or malformed.")
    if len(_consumed_jti) >= _CONSUMED_MAX:
        _consumed_jti.clear()
    _consumed_jti.add(jti)
    return payload
