"""Checks every vendor the platform depends on, with the smallest real request
each one allows, so "out of credit" shows up here before a customer finds it
(OpenAI and Gemini both ran dry unnoticed on 2026-10-12).

ops_alert_worker.py runs this every 3 hours and emails the owner when a
vendor fails, plus a daily digest; /admin/health shows the last result and
/admin/vendor-health/run checks on demand. Results never carry a key or a
response body: only a status code, the provider's own error code, and
non-secret facts (e.g. ElevenLabs characters used).
"""

from __future__ import annotations

import asyncio
import base64
import datetime
import json
import logging
import os
import time
import urllib.error
import urllib.request

import admin_db
import calls_db

logger = logging.getLogger("vendor-health")

TIMEOUT_S = 15
LAST_KEY = "vendor_health.last"


class _Fail(Exception):
    pass


def _http(url: str, *, headers: dict | None = None, body: dict | None = None) -> dict:
    """JSON from a GET (or POST with body). Raises _Fail("HTTP 402 CODE")."""
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        url, data=data, method="POST" if data is not None else "GET",
        # Cloudflare-fronted APIs (Resend) refuse Python's default agent.
        headers={"Content-Type": "application/json", "User-Agent": "Vistrow-Voice-HealthCheck/1.0", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            raw = response.read()
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        raise _Fail(f"HTTP {exc.code}{_provider_code(exc)}") from exc
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise _Fail(f"unreachable ({type(exc).__name__})") from exc


def _provider_code(exc: urllib.error.HTTPError) -> str:
    """The provider's machine-readable error code, never its message text."""
    try:
        payload = json.loads(exc.read().decode("utf-8", "replace"))
        error = payload.get("error")
    except Exception:
        return ""
    if not isinstance(error, dict):
        error = payload  # Resend: {"statusCode", "name": "restricted_api_key", ...}
    if isinstance(error, dict):
        # OpenAI: code "credit_balance_exhausted"; Google: status "RESOURCE_EXHAUSTED".
        for field in ("code", "status", "type", "name"):
            code = error.get(field)
            if isinstance(code, str) and 0 < len(code) < 60:
                return f" {code}"
    return ""


def _key(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise LookupError(f"{name} not set")
    return value


# ----------------------------------------------------------------- probes
# Each returns a short detail string on success, raises _Fail on failure and
# LookupError when the vendor isn't configured here (reported as skipped).


def _database() -> str:
    conn = calls_db._connect()
    try:
        conn.execute("SELECT 1").fetchone()
    finally:
        conn.close()
    return "query ok"


def _openai() -> str:
    _http(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {_key('OPENAI_API_KEY')}"},
        body={"model": "gpt-4.1-mini", "max_tokens": 1, "messages": [{"role": "user", "content": "ok"}]},
    )
    return "gpt-4.1-mini answered"


def _gemini() -> str:
    _http(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        headers={"x-goog-api-key": _key("GEMINI_API_KEY")},
        body={"contents": [{"parts": [{"text": "ok"}]}],
              "generationConfig": {"maxOutputTokens": 1, "thinkingConfig": {"thinkingBudget": 0}}},
    )
    return "gemini-2.5-flash answered"


def _sarvam() -> str:
    _http(
        "https://api.sarvam.ai/v1/chat/completions",
        headers={"Authorization": f"Bearer {_key('SARVAM_API_KEY')}"},
        body={"model": "sarvam-105b-conversations", "max_tokens": 1, "messages": [{"role": "user", "content": "ok"}]},
    )
    return "sarvam-105b-conversations answered"


def _elevenlabs() -> str:
    key = os.environ.get("ELEVEN_API_KEY") or _key("ELEVENLABS_API_KEY")
    sub = _http("https://api.elevenlabs.io/v1/user/subscription", headers={"xi-api-key": key.strip()})
    used, limit = sub.get("character_count") or 0, sub.get("character_limit") or 0
    if limit and used >= limit:
        raise _Fail(f"character quota used up ({used:,}/{limit:,})")
    detail = f"{used:,}/{limit:,} characters used" if limit else "subscription ok"
    if limit and used / limit >= 0.9:
        return "WARN " + detail
    return detail


def _livekit() -> str:
    from livekit import api
    from livekit.protocol.room import ListRoomsRequest

    _key("LIVEKIT_API_KEY")

    async def rooms() -> int:
        lkapi = api.LiveKitAPI()
        try:
            return len((await lkapi.room.list_rooms(ListRoomsRequest())).rooms)
        finally:
            await lkapi.aclose()

    try:
        count = asyncio.run(rooms())
    except Exception as exc:
        raise _Fail(f"API error ({type(exc).__name__})") from exc
    return f"API ok, {count} room{'s' if count != 1 else ''} open"


def _workers() -> str:
    workers = admin_db.system_health().get("workers") or []
    bad = [w["name"] for w in workers if w.get("status") != "ok"]
    if bad:
        raise _Fail("no recent heartbeat: " + ", ".join(bad))
    return f"{len(workers)} workers reporting"


def _razorpay() -> str:
    key_id = _key("RAZORPAY_KEY_ID")
    token = base64.b64encode(f"{key_id}:{_key('RAZORPAY_KEY_SECRET')}".encode()).decode()
    _http("https://api.razorpay.com/v1/payments?count=1", headers={"Authorization": f"Basic {token}"})
    return "live keys ok" if key_id.startswith("rzp_live_") else "test keys ok"


def _b2() -> str:
    from storage import b2_client

    s3, bucket = b2_client()
    if s3 is None:
        raise LookupError("B2 not configured")
    try:
        s3.list_objects_v2(Bucket=bucket, MaxKeys=1)
    except Exception as exc:
        raise _Fail(f"bucket error ({type(exc).__name__})") from exc
    return "bucket reachable"


def _resend() -> str:
    try:
        _http("https://api.resend.com/domains", headers={"Authorization": f"Bearer {_key('RESEND_API_KEY')}"})
    except _Fail as exc:
        # A sending-only key may not list domains, but it is a valid key.
        if "restricted_api_key" in str(exc):
            return "sending key ok"
        raise
    return "API key ok"


def _orchestrator() -> str:
    url = (os.environ.get("ORCHESTRATOR_URL") or "").strip().rstrip("/")
    if not url:
        raise LookupError("ORCHESTRATOR_URL not set")
    # It has no health route: any answer below 500 means it is up.
    try:
        _http(url)
    except _Fail as exc:
        code = str(exc).split()[1] if str(exc).startswith("HTTP ") else ""
        if not (code.isdigit() and int(code) < 500):
            raise
        return f"reachable (HTTP {code})"
    return "reachable"


PROBES: tuple[tuple[str, callable], ...] = (
    ("Database", _database),
    ("OpenAI", _openai),
    ("Gemini", _gemini),
    ("Sarvam", _sarvam),
    ("ElevenLabs", _elevenlabs),
    ("LiveKit API", _livekit),
    ("LiveKit workers", _workers),
    ("Razorpay", _razorpay),
    ("Backblaze B2", _b2),
    ("Resend email", _resend),
    ("Orchestrator", _orchestrator),
)


def run_checks() -> dict:
    """Run every probe, store and return {"checkedAt", "results": [...]}."""
    results = []
    for name, probe in PROBES:
        started = time.monotonic()
        try:
            detail = probe()
            status = "warn" if detail.startswith("WARN ") else "ok"
            detail = detail.removeprefix("WARN ")
        except LookupError as exc:
            status, detail = "skipped", str(exc)
        except _Fail as exc:
            status, detail = "fail", str(exc)
        except Exception as exc:  # noqa: BLE001 - one broken probe must not stop the rest
            logger.warning("vendor probe %s crashed", name, exc_info=True)
            status, detail = "fail", f"check crashed ({type(exc).__name__})"
        results.append({
            "name": name, "status": status, "detail": detail,
            "latencyMs": int((time.monotonic() - started) * 1000),
        })
    report = {"checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "results": results}
    calls_db.set_setting(LAST_KEY, json.dumps(report), calls_db.PLATFORM_ACCOUNT_ID)
    return report


def last_report() -> dict | None:
    raw = calls_db.get_setting(LAST_KEY, calls_db.PLATFORM_ACCOUNT_ID)
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return None
