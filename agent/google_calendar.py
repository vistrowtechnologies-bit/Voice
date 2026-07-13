"""Native Google Calendar API client for the OAuth-connected booking path.

Used when a tenant connected via the one-click "Connect Google Calendar"
button (server/token_api.py's gcal_oauth_* routes) rather than the older Apps
Script bridge. Talks to Google's Calendar API v3 directly with a per-tenant
OAuth token, refreshing it via the stored refresh_token when it's expired —
so a booking works even if the tenant hasn't opened the dashboard in weeks.

Kept deliberately dependency-free (aiohttp, already an agent dependency)
rather than the google-api-python-client — same reasoning as the rest of
this codebase's external-API modules (kb_extract, email_sender): fewer
moving parts in the deploy image for a handful of REST calls.
"""

import datetime
import logging
import os

import aiohttp

import db

logger = logging.getLogger("google-calendar")

TOKEN_URL = "https://oauth2.googleapis.com/token"
FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freebusy"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

# Booking-window defaults — mirrors the Apps Script bridge's defaults so
# behavior is consistent regardless of which connection method a tenant used.
_OPEN_HOUR = 10
_CLOSE_HOUR = 19
_SLOT_MINUTES = 30
_TIMEZONE = "Asia/Kolkata"

# Refresh a bit before actual expiry so a booking mid-call never races an
# access token dying between the freebusy check and the event insert.
_REFRESH_SKEW_SECONDS = 120


async def _refresh_access_token(account_id: int, refresh_token: str) -> str | None:
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as http:
            async with http.post(
                TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            ) as resp:
                if resp.status != 200:
                    logger.warning("gcal token refresh failed: HTTP %s", resp.status)
                    return None
                data = await resp.json()
    except Exception:
        logger.warning("gcal token refresh request failed", exc_info=True)
        return None
    access_token = data.get("access_token")
    if not access_token:
        return None
    expires_at = int(datetime.datetime.now().timestamp()) + int(data.get("expires_in", 3600))
    db.update_gcal_access_token(account_id, access_token, expires_at)
    return access_token


async def _valid_token(account_id: int, cfg: dict) -> str | None:
    """The connected tenant's current access token, refreshed if it's expired
    or about to be. None if there's no way to get a valid one (revoked, no
    refresh_token, refresh call failed)."""
    now = int(datetime.datetime.now().timestamp())
    if cfg.get("access_token") and cfg.get("token_expires_at", 0) - _REFRESH_SKEW_SECONDS > now:
        return cfg["access_token"]
    refresh_token = cfg.get("refresh_token")
    if not refresh_token:
        return None
    return await _refresh_access_token(account_id, refresh_token)


def _day_window(date: str) -> tuple[datetime.datetime, datetime.datetime, datetime.datetime]:
    """(open, close, now) as naive local-time datetimes for the given date."""
    open_dt = datetime.datetime.strptime(f"{date} {_OPEN_HOUR:02d}:00", "%Y-%m-%d %H:%M")
    close_dt = datetime.datetime.strptime(f"{date} {_CLOSE_HOUR:02d}:00", "%Y-%m-%d %H:%M")
    return open_dt, close_dt, datetime.datetime.now()


async def check_availability(account_id: int, cfg: dict, date: str, duration_minutes: int) -> list[str] | None:
    """Real open HH:MM slots for `date`, or None if the calendar can't be
    reached (expired/revoked token, network failure) — caller treats None as
    'fall back to an honest no-calendar message', same as an unconnected tenant."""
    token = await _valid_token(account_id, cfg)
    if not token:
        return None
    open_dt, close_dt, now = _day_window(date)
    body = {
        "timeMin": open_dt.strftime("%Y-%m-%dT%H:%M:%S") + "+05:30",
        "timeMax": close_dt.strftime("%Y-%m-%dT%H:%M:%S") + "+05:30",
        "timeZone": _TIMEZONE,
        "items": [{"id": "primary"}],
    }
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as http:
            async with http.post(
                FREEBUSY_URL, headers={"Authorization": f"Bearer {token}"}, json=body
            ) as resp:
                if resp.status != 200:
                    logger.warning("gcal freebusy failed: HTTP %s", resp.status)
                    return None
                data = await resp.json()
    except Exception:
        logger.warning("gcal freebusy request failed", exc_info=True)
        return None

    busy_raw = (data.get("calendars", {}).get("primary", {}) or {}).get("busy", [])
    busy = []
    for b in busy_raw:
        try:
            busy.append(
                (
                    datetime.datetime.strptime(b["start"][:19], "%Y-%m-%dT%H:%M:%S"),
                    datetime.datetime.strptime(b["end"][:19], "%Y-%m-%dT%H:%M:%S"),
                )
            )
        except (KeyError, ValueError):
            continue

    slots = []
    cursor = open_dt
    step = datetime.timedelta(minutes=_SLOT_MINUTES)
    duration = datetime.timedelta(minutes=duration_minutes)
    while cursor + duration <= close_dt:
        slot_end = cursor + duration
        free = cursor > now and not any(cursor < be and slot_end > bs for bs, be in busy)
        if free:
            slots.append(cursor.strftime("%H:%M"))
        cursor += step
    return slots


async def book_event(
    account_id: int, cfg: dict, date: str, time_str: str, duration_minutes: int, name: str, phone: str, purpose: str
) -> dict:
    """Create a real calendar event. Returns {"ok": True, "eventId": ...} or
    {"ok": False, "error": ...}. Re-checks the slot is still free right before
    inserting — closes the same race the Apps Script bridge guards against
    (two callers booking the same slot seconds apart)."""
    token = await _valid_token(account_id, cfg)
    if not token:
        return {"ok": False, "error": "calendar not connected"}

    start = datetime.datetime.strptime(f"{date} {time_str}", "%Y-%m-%d %H:%M")
    end = start + datetime.timedelta(minutes=duration_minutes)
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as http:
            async with http.post(
                FREEBUSY_URL,
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "timeMin": start.strftime("%Y-%m-%dT%H:%M:%S") + "+05:30",
                    "timeMax": end.strftime("%Y-%m-%dT%H:%M:%S") + "+05:30",
                    "timeZone": _TIMEZONE,
                    "items": [{"id": "primary"}],
                },
            ) as resp:
                clash_data = await resp.json() if resp.status == 200 else {}
            busy = (clash_data.get("calendars", {}).get("primary", {}) or {}).get("busy", [])
            if busy:
                return {"ok": False, "error": "slot no longer available"}

            title = f"{purpose} — {name}" if purpose else f"Appointment — {name}"
            event = {
                "summary": title,
                "description": f"Booked by Vistrow Voice AI agent.\nName: {name}\nPhone: {phone}\nPurpose: {purpose}",
                "start": {"dateTime": start.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": _TIMEZONE},
                "end": {"dateTime": end.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": _TIMEZONE},
            }
            async with http.post(
                EVENTS_URL, headers={"Authorization": f"Bearer {token}"}, json=event
            ) as resp:
                if resp.status not in (200, 201):
                    detail = await resp.text()
                    logger.warning("gcal event insert failed: HTTP %s %s", resp.status, detail[:300])
                    return {"ok": False, "error": f"HTTP {resp.status}"}
                created = await resp.json()
                return {"ok": True, "eventId": created.get("id")}
    except Exception:
        logger.warning("gcal booking request failed", exc_info=True)
        return {"ok": False, "error": "network error"}
