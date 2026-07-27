"""EnableX Voice REST client — accept/place calls and control Media
Streaming, replacing server/calls_db.py's enablex_accept_call/
enablex_connect_to_sip (which bridged into LiveKit's SIP host). This
version starts a WebSocket media stream directly instead of a SIP bridge —
see developer.enablex.io/voice/media-streaming.html for the full flow this
mirrors: place/accept -> wait for `connected` webhook -> PUT .../stream
with our wss_host -> EnableX opens a WebSocket to us.

Same HTTP Basic Auth (App ID:App Key, per-tenant, from db.get_enablex_credentials)
and error-handling conventions as server/calls_db.py's _enablex_request —
EnableX sometimes reports failure with HTTP 200 and an error body instead
of a real error status, so a 200 alone isn't success; only the absence of
an explicit error field/4xx+ statusCode is.
"""

from __future__ import annotations

import asyncio
import base64
import os

import httpx

import db

ENABLEX_API_BASE = "https://api.enablex.io/voice/v1"
_TIMEOUT_S = 15.0


def public_base_url() -> str | None:
    """Publicly reachable HTTPS base URL of this service, for EnableX's
    webhook `event_url`. Same env-var convention as server/calls_db.py's
    public_base_url (Railway's auto-set RAILWAY_PUBLIC_DOMAIN, or an
    explicit PUBLIC_BASE_URL override for local/ngrok testing)."""
    override = os.environ.get("PUBLIC_BASE_URL")
    if override:
        return override.rstrip("/")
    domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN")
    return f"https://{domain}" if domain else None


def public_wss_host() -> str | None:
    """Publicly reachable WSS base for EnableX's Media Streaming API to
    connect to (wss://..., not https://...) — a separate env var since the
    streaming WebSocket port/path is not necessarily the same as the REST
    webhook host in every deployment. Falls back to deriving it from
    public_base_url() when WSS_PUBLIC_HOST isn't set explicitly."""
    override = os.environ.get("WSS_PUBLIC_HOST")
    if override:
        return override.rstrip("/")
    base = public_base_url()
    if base and base.startswith("https://"):
        return "wss://" + base[len("https://"):]
    return None


async def _request(path: str, method: str, body: dict | None, account_id: int) -> dict:
    app_id, app_key = db.get_enablex_credentials(account_id)
    if not app_id or not app_key:
        return {"ok": False, "error": "EnableX is not connected for this account."}
    auth = base64.b64encode(f"{app_id}:{app_key}".encode()).decode()
    headers = {"Authorization": f"Basic {auth}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
        try:
            resp = await client.request(method, f"{ENABLEX_API_BASE}{path}", json=body, headers=headers)
        except httpx.HTTPError as exc:
            return {"ok": False, "error": f"Could not reach EnableX: {exc}"}
    try:
        payload = resp.json() if resp.content else {}
    except ValueError:
        payload = {}
    if resp.status_code >= 400:
        return {"ok": False, "error": f"EnableX returned {resp.status_code}: {resp.text[:400]}"}
    if isinstance(payload, dict):
        status_code = payload.get("statusCode")
        error_msg = payload.get("error") or payload.get("errorMessage")
        is_error_status = isinstance(status_code, int) and status_code >= 400
        if error_msg or is_error_status:
            return {"ok": False, "error": f"EnableX returned 200 with an error body: {payload}"[:400]}
    return {"ok": True, "response": payload}


async def _request_with_retry(path: str, method: str, body: dict | None, account_id: int, attempts: int = 3) -> dict:
    """Same retry rationale as server/calls_db.py's _enablex_request_with_retry:
    EnableX's call-control API can 4xx/error-body a step taken immediately
    after the prior one, before the call is fully in that state on their
    side yet."""
    delays = (0, 1.0, 2.5, 4.0)[:attempts]
    result: dict = {"ok": False, "error": "no attempt made"}
    for delay in delays:
        if delay:
            await asyncio.sleep(delay)
        result = await _request(path, method, body, account_id)
        if result.get("ok"):
            return result
    return result


async def accept_call(voice_id: str, account_id: int) -> dict:
    """Answer a ringing inbound call leg (PUT /call/{id}/accept)."""
    return await _request_with_retry(f"/call/{voice_id}/accept", "PUT", None, account_id)


async def start_stream(voice_id: str, wss_url: str, account_id: int) -> dict:
    """Instructs EnableX to open a WebSocket connection to `wss_url` (our
    server, including the signed auth token in its query string) and begin
    streaming this call's audio both ways. Call only after the `connected`
    webhook event — a call still ringing/initiated will fail (per EnableX's
    documented prerequisite)."""
    return await _request_with_retry(f"/call/{voice_id}/stream", "PUT", {"wss_host": wss_url}, account_id)


async def stop_stream(voice_id: str, account_id: int) -> dict:
    """Stops media streaming without ending the call itself (DELETE
    /call/{id}/stream) — used for a clean early teardown; normally the
    stream just stops on its own when the call ends."""
    return await _request_with_retry(f"/call/{voice_id}/stream", "DELETE", None, account_id)


async def place_outbound_call(from_number: str, to_number: str, account_id: int, event_url: str) -> dict:
    """POST /call — places an outbound call. Auto-starts streaming the
    moment it's answered via `action_on_connect.stream` (per EnableX's
    docs), skipping the extra start_stream round trip start_stream() above
    handles for the inbound path."""
    wss_url = public_wss_host()
    body: dict = {
        "name": "Vistrow Voice orchestrator call",
        "owner_ref": "vistrow-orchestrator",
        "from": from_number,
        "to": to_number,
        "event_url": event_url,
    }
    if wss_url:
        body["action_on_connect"] = {"stream": {"wss_host": wss_url}}
    return await _request(("/call"), "POST", body, account_id)
