"""Whether a campaign may dial right now, on top of the account's own window.

The account-wide compliance window (9-9 by default) is the outer limit and
never moves: a campaign can only ever be MORE restrictive than it, never less.
That ordering matters — a per-campaign window is a convenience for the
operator ("only call these leads on weekday mornings"), not a way around the
tenant's compliance settings, and a campaign must not be able to widen the
hours somebody configured on the Compliance page.

Pure, so every branch is testable without a database: an unset field means no
restriction, and anything malformed is ignored rather than blocking a dial,
which is the same rule agent/inbound_rules.py follows for inbound routes.
"""

import datetime

DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _hhmm(value) -> tuple[int, int] | None:
    if not value:
        return None
    try:
        hh, mm = str(value).strip().split(":")[:2]
        hh, mm = int(hh), int(mm)
    except (ValueError, AttributeError):
        return None
    return (hh, mm) if 0 <= hh <= 23 and 0 <= mm <= 59 else None


def _date(value) -> datetime.date | None:
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(str(value).strip()[:10])
    except ValueError:
        return None


def campaign_block_reason(campaign: dict, now_local: datetime.datetime) -> str | None:
    """None if this campaign's own schedule allows dialling now, else why not.

    `now_local` is already in the tenant's timezone. Only the campaign's own
    fields are considered here; the account window is checked separately by
    the dialer, before this.
    """
    if not campaign:
        return None

    end_date = _date(campaign.get("end_date"))
    if end_date and now_local.date() > end_date:
        return f"campaign ended on {end_date.isoformat()}"

    raw_days = campaign.get("active_days")
    if raw_days:
        allowed = {d.strip()[:3].title() for d in str(raw_days).split(",") if d.strip()}
        if allowed and allowed & set(DAY_ABBR) and DAY_ABBR[now_local.weekday()] not in allowed:
            return f"{DAY_ABBR[now_local.weekday()]} is not an active day for this campaign"

    start, end = _hhmm(campaign.get("window_start")), _hhmm(campaign.get("window_end"))
    if start is None or end is None:
        return None
    minutes = now_local.hour * 60 + now_local.minute
    start_min, end_min = start[0] * 60 + start[1], end[0] * 60 + end[1]
    if start_min == end_min:
        return None
    inside = (
        start_min <= minutes <= end_min
        if start_min < end_min
        # A window that ends before it starts (22:00-06:00) wraps midnight.
        else minutes >= start_min or minutes <= end_min
    )
    if not inside:
        return (
            f"outside this campaign's {campaign.get('window_start')}-"
            f"{campaign.get('window_end')} window"
        )
    return None
