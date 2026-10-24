"""Sends the operational emails behind Settings → Preferences → Notifications.

Those toggles (qualified leads, call issues, billing) were saved from the
dashboard and nothing ever sent the emails they control — every email the
platform sent was transactional (sign-up code, reset, invite, ticket), found
2026-09-24. This worker is the sender; each toggle now decides whether that
person gets that kind of email.

- Qualified leads: new leads from real calls (test runs and dashboard test
  calls excluded), batched — one email per check, one line per person, each
  saying where it came from (website demo, widget + page, phone) and when.
- Call issues: an integration starting to fail (e.g. Zoho), once per failure,
  re-armed when it recovers.
- Billing: credits running low, once, re-armed after a top-up.

Watermarks live in the settings table, so a restart never re-sends and the
first run only records a starting point (no flood of historical leads).
Same daemon-thread shape as retention_worker.py.
"""

import html
import logging
import os
import threading
import time

import calls_db
import email_sender
import visitor_info

logger = logging.getLogger("vistrow-notify")

_CHECK_INTERVAL_S = 120
_LEADS_MARK = "notify.leads_last_call_id"
_INTEGRATION_MARK = "notify.integration_error."  # + integration key
_LOW_CREDIT_MARK = "notify.low_credit_sent"
# Low when under 10% of the allocation. No absolute floor: small starter
# allocations (10 credits) would read as "low" while completely unused — a
# 20-credit floor would have emailed four untouched workspaces on deploy.
_LOW_CREDIT_FRACTION = 0.10
_PREF_DEFAULTS = {"notify_leads": 1, "notify_calls": 1, "notify_billing": 1}

_started = False
_lock = threading.Lock()


def _app_url() -> str:
    return (os.environ.get("APP_BASE_URL") or "https://app.vistrowvoice.com").rstrip("/")


def recipients(account_id: int, pref: str) -> list[str]:
    """Everyone in the workspace who has this kind of email switched on. A
    user who never opened Preferences has no row and gets the default (on)."""
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            f"SELECT u.email, p.{pref} AS pref FROM users u "
            "LEFT JOIN user_preferences p ON p.user_id = u.id WHERE u.account_id = ?",
            (account_id,),
        ).fetchall()
    finally:
        conn.close()
    return [
        r["email"] for r in rows
        if r["email"] and (_PREF_DEFAULTS[pref] if r["pref"] is None else int(r["pref"]))
    ]


def _send(to_list: list[str], subject: str, heading: str, body_html: str, cta_label: str, cta_path: str) -> int:
    html_body = email_sender.render_email(
        preheader=subject, heading=heading, body_html=body_html,
        cta_label=cta_label, cta_url=_app_url() + cta_path,
    )
    return sum(1 for to in to_list if email_sender.send_email(to, subject, html_body))


def _account_ids() -> list[int]:
    conn = calls_db._connect()
    try:
        return [r["id"] for r in conn.execute("SELECT id FROM accounts ORDER BY id").fetchall()]
    finally:
        conn.close()


# ----------------------------------------------------------------- leads


def new_leads(account_id: int, after_id: int) -> list[dict]:
    """New calls that captured a phone or email, with what the email needs to
    say where each came from. Dashboard test calls (incl. runtime's automated
    test-agent-<id>-auto rooms) are never leads."""
    test_rooms = " ".join("AND COALESCE(c.room_name, '') NOT LIKE ?" for _ in visitor_info.TEST_ROOM_PREFIXES)
    conn = calls_db._connect()
    try:
        return [dict(r) for r in conn.execute(
            "SELECT c.id, c.lead_name, c.lead_phone, c.lead_email, c.call_type, c.direction, "
            "c.duration_seconds, c.room_name, c.page_path, c.started_at, a.name AS agent_name, "
            "COALESCE(a.public_demo_slug, '') AS demo_slug, COALESCE(s.allowed_domain, s.name, '') AS website, "
            "COALESCE(v.ip, '') AS ip, COALESCE(v.user_agent, '') AS user_agent "
            "FROM calls c LEFT JOIN agents a ON a.id = c.agent_id LEFT JOIN sites s ON s.id = c.site_id "
            "LEFT JOIN visitor_ips v ON v.room_name = c.room_name "
            f"WHERE c.account_id = ? AND c.id > ? AND COALESCE(c.test_run_id, '') = '' {test_rooms} "
            "AND (COALESCE(c.lead_phone, '') <> '' OR COALESCE(c.lead_email, '') <> '') "
            "ORDER BY c.id",
            (account_id, after_id, *(f"{p}%" for p in visitor_info.TEST_ROOM_PREFIXES)),
        ).fetchall()]
    finally:
        conn.close()


def _person_key(lead: dict) -> str:
    digits = "".join(ch for ch in (lead.get("lead_phone") or "") if ch.isdigit())
    return digits[-10:] if digits else (lead.get("lead_email") or "").strip().lower()


def group_leads(leads: list[dict]) -> list[dict]:
    """One line per person: the same caller trying the demo twice inside one
    check used to appear twice. Keeps the newest call and counts the rest."""
    by_person: dict[str, dict] = {}
    for lead in leads:
        key = _person_key(lead)
        prior = by_person.get(key)
        by_person[key] = {**lead, "calls": (prior["calls"] if prior else 0) + 1}
    return sorted(by_person.values(), key=lambda l: l["id"])


def _visitor_location(account_id: int, phone: str) -> str:
    """City, region, country the website form recorded for this phone (Vistrow's
    own workspace only; see check_leads)."""
    phone = calls_db.canonical_contact_phone(phone, account_id) if phone else ""
    if not phone:
        return ""
    conn = calls_db._connect()
    try:
        row = conn.execute("SELECT custom_fields FROM contacts WHERE account_id = ? AND phone = ?",
                           (account_id, phone)).fetchone()
    finally:
        conn.close()
    fields = calls_db._safe_json_loads(row["custom_fields"]) if row else {}
    return ", ".join(p for p in (fields.get("visitor_city"), fields.get("visitor_region"),
                                 fields.get("visitor_country")) if p)


def _lead_row(lead: dict, account_id: int, with_visitor: bool) -> str:
    source = visitor_info.call_source(lead.get("room_name") or "", lead.get("call_type") or "",
                                      lead.get("direction") or "", website=lead.get("website") or "",
                                      page=lead.get("page_path") or "", demo_slug=lead.get("demo_slug") or "")
    details = [visitor_info.ist(lead["started_at"]) if lead.get("started_at") else ""]
    if lead.get("calls", 1) > 1:
        details.append(f"{lead['calls']} calls")
    if with_visitor:
        # IP, location and browser of a website visitor who reached Vistrow
        # itself. Not added for tenants: their leads are their own visitors.
        details += [f"IP {lead['ip']}" if lead.get("ip") else "",
                    _visitor_location(account_id, lead.get("lead_phone") or ""),
                    visitor_info.browser_family(lead.get("user_agent") or "")]
    link = f"{_app_url()}/dashboard/calls/{lead['id']}"
    contact = lead["lead_phone"] or lead["lead_email"] or ""
    return (
        "<tr><td style='padding:8px 10px 2px'>"
        f"<a href='{html.escape(link)}' style='font-weight:700;color:#1a1033'>{html.escape(lead['lead_name'] or 'Unknown')}</a>"
        f" &nbsp;{html.escape(contact)} &nbsp;·&nbsp; {html.escape(lead['agent_name'] or '')}</td></tr>"
        f"<tr><td style='padding:0 10px 2px;font-size:13px;color:#5b21b6'>{html.escape(source)}</td></tr>"
        "<tr><td style='padding:0 10px 10px;font-size:12px;color:#6b7280'>"
        f"{html.escape(' · '.join(d for d in details if d))}</td></tr>"
    )


def _max_call_id(account_id: int) -> int:
    conn = calls_db._connect()
    try:
        row = conn.execute("SELECT COALESCE(MAX(id), 0) AS m FROM calls WHERE account_id = ?", (account_id,)).fetchone()
        return int(row["m"])
    finally:
        conn.close()


# A long email outage must not turn into one enormous email afterwards.
_MAX_LEADS_PER_EMAIL = 50


def check_leads(account_id: int) -> int:
    mark = calls_db.get_setting(_LEADS_MARK, account_id)
    if mark is None:
        # First run for this workspace: start from now, never replay history.
        calls_db.set_setting(_LEADS_MARK, str(_max_call_id(account_id)), account_id)
        return 0
    leads = new_leads(account_id, int(mark))
    if not leads:
        return 0
    leads = leads[:_MAX_LEADS_PER_EMAIL]
    to = recipients(account_id, "notify_leads")
    if not to:
        calls_db.set_setting(_LEADS_MARK, str(leads[-1]["id"]), account_id)
        return 0
    people = group_leads(leads)
    with_visitor = calls_db.is_platform_owner(account_id)
    rows = "".join(_lead_row(l, account_id, with_visitor) for l in people)
    n = len(people)
    subject = f"{n} new leads from your AI agent" if n > 1 else f"New lead: {people[0]['lead_name'] or people[0]['lead_phone']}"
    sent = _send(
        to, subject, subject,
        f"<p>Your agent just captured {'these leads' if n > 1 else 'a lead'}:</p>"
        f"<table style='border-collapse:collapse;font-size:14px'>{rows}</table>",
        "Open the calls", "/dashboard/calls",
    )
    # Advance only once the email went out. The mark used to move before the
    # send, so an email-provider outage silently dropped those leads' alerts;
    # now the next tick retries them.
    if sent:
        calls_db.set_setting(_LEADS_MARK, str(leads[-1]["id"]), account_id)
    return sent


# -------------------------------------------------------- integrations


def check_integrations(account_id: int) -> int:
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT key, name, status, last_error FROM integrations WHERE account_id = ? AND status = 'connected'",
            (account_id,),
        ).fetchall()
    finally:
        conn.close()
    sent = 0
    for r in rows:
        mark_key = _INTEGRATION_MARK + r["key"]
        notified = calls_db.get_setting(mark_key, account_id)
        error = (r["last_error"] or "").strip()
        if not error:
            if notified:
                calls_db.set_setting(mark_key, "", account_id)  # recovered: re-arm
            continue
        if notified:
            continue  # already told them about this failure
        calls_db.set_setting(mark_key, error[:200], account_id)
        to = recipients(account_id, "notify_calls")
        if to:
            name = r["name"] or r["key"]
            sent += _send(
                to, f"{name} has stopped receiving your leads", f"{name} delivery is failing",
                f"<p>Leads from your calls are not reaching <strong>{html.escape(name)}</strong>.</p>"
                f"<p style='color:#666'>Last error: {html.escape(error)}</p>"
                "<p>Reconnect it from Integrations. We'll email again only if it fails after recovering.</p>",
                "Open Integrations", "/dashboard/integrations",
            )
    return sent


# ------------------------------------------------------------- credits


def check_credits(account_id: int) -> int:
    billing = calls_db.billing_summary(account_id)
    remaining = float(billing.get("creditsRemaining") or 0)
    total = float(billing.get("creditsTotal") or 0)
    if total <= 0:
        return 0
    low = remaining < total * _LOW_CREDIT_FRACTION
    notified = calls_db.get_setting(_LOW_CREDIT_MARK, account_id) == "1"
    if not low:
        if notified:
            calls_db.set_setting(_LOW_CREDIT_MARK, "0", account_id)  # topped up: re-arm
        return 0
    if notified:
        return 0
    calls_db.set_setting(_LOW_CREDIT_MARK, "1", account_id)
    to = recipients(account_id, "notify_billing")
    if not to:
        return 0
    return _send(
        to, f"Credits running low: {remaining:g} left", "Your call credits are running low",
        f"<p>Your workspace has <strong>{remaining:g}</strong> of {total:g} credits left. "
        "When they run out, your agents stop taking calls.</p>",
        "Add credits", "/dashboard/billing",
    )


# ---------------------------------------------------------------- loop


def run_once() -> None:
    for account_id in _account_ids():
        for check in (check_leads, check_integrations, check_credits):
            try:
                check(account_id)
            except Exception:
                logger.exception("%s failed for account %s", check.__name__, account_id)


def _loop() -> None:
    logger.info("notification worker started (every %ss)", _CHECK_INTERVAL_S)
    while True:
        try:
            run_once()
        except Exception:
            logger.exception("notification tick failed")
        time.sleep(_CHECK_INTERVAL_S)


def start_notification_worker() -> None:
    """Idempotent. Set DISABLE_NOTIFICATIONS=1 to keep it off — a local
    server pointed at the production DATABASE_URL must not email customers,
    same reasoning as DISABLE_CAMPAIGN_DIALER."""
    if os.environ.get("DISABLE_NOTIFICATIONS", "").strip() not in ("", "0", "false", "False"):
        logger.info("notifications disabled via DISABLE_NOTIFICATIONS")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="notifications", daemon=True).start()
