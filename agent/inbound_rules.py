"""Whether an inbound route accepts a call right now.

inbound_routes has carried max_concurrent, business hours, active days and a
start/end date since the table was created, and the dashboard lets operators
set all of them — but nothing ever read the table at call time (verified
2026-09-18: its only reader was the dashboard's own list endpoint). A tenant
could set "Mon-Fri, 9-5, one call at a time" and we would still answer ten
calls at 2am. Worse than a missing feature, because the control looks real.

Kept pure and free of DB/LiveKit imports so every branch is testable: this
decides whether to answer a real customer's call, and a wrong "block" is
invisible to us and very visible to them. Absent settings always mean "no
restriction" — an operator who filled nothing in gets today's behaviour.
"""

import datetime

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
    """None to answer the call, else a short reason for the log.

    `route` is None when the number has no configured route at all, which
    means "no restrictions" — that is every number's behaviour today and must
    not change. `now_local` is already in the route's timezone; `live_calls`
    counts calls in progress on this number, excluding this one.
    """
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
