"""Which follow-up call a finished call earns, and when.

Owner decisions (2026-10-15), switched per agent in the dashboard's
"Follow-ups" panel (agents.follow_up_policy, retry_rules.follow_up_policy):

  - callback: the caller asked to be rung back on a date/time
    (lead_data["callback"], tools.request_callback) -> call them then.
  - visit_reminder: a site visit booked (lead_data["site_visit"]) more than
    24 h ahead -> a confirm-or-reschedule call the day before at the
    reminder time; sooner than that -> 2 h before the visit.
  - nurture: the call ended interested (post-call interest_level) with no
    visit booked and no callback asked -> a sequence of calls on the
    agent's nurtureSteps days (default 2, 5, 10; owner, 22 Oct 2026) after
    that call, at nurtureTime, moved off non-calling days. Each nurture call
    that does not end "not interested" earns the next step; the last step,
    "not interested" or an opt-out ends it.

One follow-up per call, in that order of precedence. Times are in the
account's timezone (`now` carries it). The moment is only when the contact
becomes due: the dialer dials it inside the calling window, so a time
outside the window is dialled when the window next opens — same place a
shifted time would land. A caller who opted out gets nothing (and the DNC
list stops any dial anyway). main.py's _schedule_follow_up turns the plan
into a campaign contact (db.schedule_follow_up_call).
"""
import datetime

import retry_rules

KINDS = ("callback", "visit_reminder", "nurture")
# Time of day for a callback the caller gave only a date for, and the
# default nurture time (policy["nurtureTime"] sets it per agent).
NURTURE_TIME = "11:00"
_VISIT_DEFAULT_TIME = "10:00"
_REMINDER_AHEAD = datetime.timedelta(hours=24)
_REMINDER_SOON_BEFORE = datetime.timedelta(hours=2)
# Mirrors agent/tools.py's crm_outcome reading of interest_level.
_INTERESTED = ("high", "hot", "interested", "very interested", "medium", "warm")
_NOT_INTERESTED = ("not interested", "not_interested", "no interest", "none", "uninterested")
_SUMMARY_CAP = 300


def _at(date: str, time: str, now: datetime.datetime) -> datetime.datetime | None:
    """'YYYY-MM-DD' + 'HH:MM' in now's timezone; None when unparseable."""
    try:
        return datetime.datetime.strptime(
            f"{str(date).strip()} {str(time).strip()[:5]}", "%Y-%m-%d %H:%M"
        ).replace(tzinfo=now.tzinfo)
    except ValueError:
        return None


def _on_day(day: datetime.date, hhmm: str, now: datetime.datetime) -> datetime.datetime:
    hour, minute = (int(x) for x in hhmm.split(":"))
    return datetime.datetime.combine(day, datetime.time(hour, minute), tzinfo=now.tzinfo)


def _callback_at(callback: dict, now: datetime.datetime) -> datetime.datetime | None:
    date = str(callback.get("date") or "").strip()
    time = str(callback.get("time") or "").strip()
    if not (date or time):
        return None
    if date and time:
        when = _at(date, time, now)
    elif date:
        when = _at(date, NURTURE_TIME, now)
    else:
        # A time with no day: today if still ahead, else tomorrow.
        when = _at(now.strftime("%Y-%m-%d"), time, now)
        if when is not None and when <= now:
            when += datetime.timedelta(days=1)
    if when is None:
        return None
    # An asked-for time already behind us (e.g. "call me in the evening"
    # parsed as today 18:00 at 19:00): as soon as the dialer can.
    return max(when, now)


def _visit_reminder_at(visit: dict, policy: dict, now: datetime.datetime) -> datetime.datetime | None:
    visit_at = _at(visit.get("date"), visit.get("time") or _VISIT_DEFAULT_TIME, now)
    if visit_at is None:
        return None
    if visit_at - now > _REMINDER_AHEAD:
        when = _on_day(visit_at.date() - datetime.timedelta(days=1), policy["visitReminderTime"], now)
    else:
        when = visit_at - _REMINDER_SOON_BEFORE
    # Too late for a reminder: the visit is (nearly) here.
    return when if when > now else None


def interested(extracted: dict) -> bool:
    interest = str((extracted or {}).get("interest_level") or "").strip().casefold()
    if not interest or any(word == interest or word in interest for word in _NOT_INTERESTED):
        return False
    return any(word == interest or interest.startswith(word) for word in _INTERESTED)


def not_interested(extracted: dict) -> bool:
    """The call ended with them saying no (post-call interest_level)."""
    interest = str((extracted or {}).get("interest_level") or "").strip().casefold()
    return bool(interest) and any(word == interest or word in interest for word in _NOT_INTERESTED)


def plan(policy: dict, lead_data: dict, extracted: dict, now: datetime.datetime, previous_kind: str = "",
         previous_fields: dict | None = None, active_days=None) -> dict | None:
    """{"kind", "at" (aware, now's timezone), "summary", "fields"} or None.

    policy is retry_rules.follow_up_policy(...) — complete and validated.
    previous_kind / previous_fields are the follow_up_kind and custom_fields
    of the call that just ended, if it was itself a scheduled follow-up.
    "fields" are extra custom_fields for the new row (a nurture step's
    follow_up_step and nurture_origin). active_days is compliance's calling
    days, so a nurture step never lands on a day the dialer cannot ring.
    A nurture call earns the next step unless it ended "not interested" and
    the sequence ends at its last step, so an undecided lead is never rung
    for ever. A callback they asked for, or a visit they booked, is always
    honoured."""
    if lead_data.get("opted_out"):
        return None
    callback = lead_data.get("callback") or {}
    visit = lead_data.get("site_visit") or {}
    summary = str(
        (extracted or {}).get("business_summary") or callback.get("purpose") or visit.get("purpose") or ""
    ).strip()[:_SUMMARY_CAP]
    if callback.get("date") or callback.get("time"):
        if not policy["callbackEnabled"]:
            return None
        when = _callback_at(callback, now)
        return {"kind": "callback", "at": when, "summary": summary} if when else None
    if visit.get("date"):
        if not policy["visitReminderEnabled"]:
            return None
        when = _visit_reminder_at(visit, policy, now)
        return {"kind": "visit_reminder", "at": when, "summary": summary} if when else None
    if not policy["nurtureEnabled"]:
        return None
    if previous_kind == "nurture":
        if not_interested(extracted):
            return None
        step = retry_rules.next_nurture_step(previous_fields or {}, policy, now, active_days)
        if step is None:
            return None
        return {"kind": "nurture", "at": step["at"], "summary": summary, "fields": step["fields"]}
    if interested(extracted):
        origin = now.date()
        at = retry_rules.nurture_step_at(policy, origin, 1, now, active_days)
        if at is None:
            return None
        return {"kind": "nurture", "at": at, "summary": summary,
                "fields": {"follow_up_step": 1, "nurture_origin": origin.isoformat()}}
    return None
