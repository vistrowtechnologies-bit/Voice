"""Small, dependency-free helpers for describing where and when a lead came
from: the browser family from a User-Agent, a timestamp in IST, and the
words for the channel a call arrived on. Shared by token_api (forms, demo)
and notification_worker (lead emails)."""
from __future__ import annotations

import datetime

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))

# Dashboard "Test call", Testing Lab and runtime's automated combo calls
# (test-agent-<id>-auto<hex>): never a lead.
TEST_ROOM_PREFIXES = ("test-agent-", "test-lab-", "test-phone-")


def browser_family(user_agent: str) -> str:
    """"Chrome on Android" from a User-Agent, for a human reading a lead."""
    ua = user_agent or ""
    browser = next((name for pattern, name in (
        ("Edg/", "Edge"), ("OPR/", "Opera"), ("SamsungBrowser", "Samsung Internet"), ("CriOS", "Chrome"),
        ("FxiOS", "Firefox"), ("Chrome/", "Chrome"), ("Firefox/", "Firefox"), ("Safari/", "Safari"),
    ) if pattern in ua), "")
    system = next((name for pattern, name in (
        ("Android", "Android"), ("iPhone", "iPhone"), ("iPad", "iPad"), ("Windows", "Windows"),
        ("Mac OS X", "Mac"), ("Linux", "Linux"),
    ) if pattern in ua), "")
    return " on ".join(part for part in (browser, system) if part)


def ist(moment: datetime.datetime | str | None = None) -> str:
    """"24 Oct 2026, 03:53:07 PM IST". A naive datetime or a stored
    "YYYY-MM-DD HH:MM:SS" string is UTC (how calls.started_at is written)."""
    if moment is None:
        moment = datetime.datetime.now(datetime.timezone.utc)
    elif isinstance(moment, str):
        try:
            moment = datetime.datetime.fromisoformat(moment.strip().replace("Z", "+00:00"))
        except ValueError:
            return moment
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=datetime.timezone.utc)
    return moment.astimezone(IST).strftime("%d %b %Y, %I:%M:%S %p IST")


def call_source(room_name: str, call_type: str, direction: str, *, website: str = "", page: str = "",
                demo_slug: str = "") -> str:
    """Where a call came from, in words, from what every call row already
    carries (room name prefix, call type, site, page)."""
    room = room_name or ""
    where = f"{website}{page}" if website else page
    if room.startswith(TEST_ROOM_PREFIXES):
        return "Dashboard test call"
    if room.startswith("voice-agent-demo"):
        label = f"Industry demo ({demo_slug})" if demo_slug else "Website live demo (Talk to Artha)"
        return f"{label} · {page}" if page else label
    if room.startswith("widget-chat-"):
        return f"Chat widget · {where}" if where else "Chat widget"
    if call_type == "widget" or room.startswith("widget-"):
        return f"Website voice widget · {where}" if where else "Website voice widget"
    if call_type == "phone":
        return "Phone call · outbound" if direction == "outbound" else "Phone call · inbound"
    return "Web call"
