"""Whether an inbound route accepts a call right now — the orchestrator's
copy of agent/inbound_rules.py plus agent/db.py's get_inbound_route (this
service cannot import agent/ or server/).

inbound_routes (server/calls_db.py owns the table) carries a status, start/end
date, active days ("Mon,Tue,..." as the dashboard saves them), a calling
window ("HH:MM" from a time input, in the route's timezone) and
max_concurrent. Absent settings always mean "no restriction", and a number
with no route — or any lookup failure — still answers, exactly as agent/.
"""

from __future__ import annotations

import datetime
import logging
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import psycopg

import db
import dbconn

logger = logging.getLogger("orchestrator-agent-rules")

DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _parse_hhmm(value) -> tuple[int, int] | None:
    if not value:
        return None
    try:
        hh, mm = str(value).strip().split(":")[:2]
        hh, mm = int(hh), int(mm)
    except (ValueError, AttributeError):
        return None
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        return None
    return hh, mm


def _parse_date(value) -> datetime.date | None:
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def within_window(now_local: datetime.datetime, start, end) -> bool:
    """A window that ends before it starts (22:00-06:00) wraps midnight."""
    s, e = _parse_hhmm(start), _parse_hhmm(end)
    if s is None or e is None:
        return True
    minutes = now_local.hour * 60 + now_local.minute
    s_min, e_min = s[0] * 60 + s[1], e[0] * 60 + e[1]
    if s_min == e_min:
        return True
    if s_min < e_min:
        return s_min <= minutes <= e_min
    return minutes >= s_min or minutes <= e_min


def route_rejection(route: dict | None, now_local: datetime.datetime, live_calls: int) -> str | None:
    """None to answer the call, else a short reason for the log. `now_local`
    is in the route's timezone; `live_calls` excludes this call."""
    if not route:
        return None

    status = (route.get("status") or "active").strip().lower()
    if status != "active":
        return f"route is {status}"

    start_date = _parse_date(route.get("start_date"))
    if start_date and now_local.date() < start_date:
        return f"route starts on {start_date.isoformat()}"
    end_date = _parse_date(route.get("end_date"))
    if end_date and now_local.date() > end_date:
        return f"route ended on {end_date.isoformat()}"

    raw_days = route.get("active_days")
    if raw_days:
        allowed = {d.strip()[:3].title() for d in str(raw_days).split(",") if d.strip()}
        # An unparseable list must not silently block every call.
        if allowed and allowed & set(DAY_ABBR):
            if DAY_ABBR[now_local.weekday()] not in allowed:
                return f"{DAY_ABBR[now_local.weekday()]} is not an active day"

    if not within_window(now_local, route.get("window_start"), route.get("window_end")):
        return f"outside {route.get('window_start')}-{route.get('window_end')}"

    try:
        limit = int(route.get("max_concurrent") or 0)
    except (TypeError, ValueError):
        limit = 0
    # 0 or missing means unlimited: never let a bad value block every call.
    if limit > 0 and live_calls >= limit:
        return f"at its {limit}-call limit"

    return None


def get_inbound_route(number: str) -> dict | None:
    """The newest route on a dialled number, only if the account that owns
    the number made it (agent/db.py's query). None on no route or DB error."""
    key = db._normalize_sip_number(number)
    conn = dbconn.connect()
    try:
        row = conn.execute(
            "SELECT id, account_id, phone_number, agent_id, timezone, max_concurrent, "
            "start_date, end_date, window_start, window_end, active_days, status "
            "FROM inbound_routes WHERE phone_number = ? "
            "AND account_id = (SELECT account_id FROM phone_numbers WHERE number = ?) "
            "ORDER BY id DESC LIMIT 1",
            (key, key),
        ).fetchone()
        return dict(row) if row else None
    except psycopg.Error:
        logger.warning("inbound route lookup failed for %s", key, exc_info=True)
        return None
    finally:
        conn.close()


def inbound_rejection(number: str, live_calls: int, now: datetime.datetime | None = None) -> str | None:
    """Blocking (DB read). None to answer, else why the route refuses it."""
    route = get_inbound_route(number)
    if not route:
        return None
    try:
        tz = ZoneInfo(route.get("timezone") or "Asia/Kolkata")
    except (ZoneInfoNotFoundError, ValueError):
        tz = ZoneInfo("Asia/Kolkata")
    now = now or datetime.datetime.now(datetime.timezone.utc)
    return route_rejection(route, now.astimezone(tz), live_calls)
