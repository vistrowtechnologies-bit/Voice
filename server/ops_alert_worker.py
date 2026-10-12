"""Emails the platform owner when the platform needs them.

notification_worker.py only emails customers; before this the owner heard
about a failed backup, a failed payment or a dead LiveKit worker only by
opening System Health (admin audit, 2026-10-11). Checked every 10 minutes:

- new error-level error_events, batched (one email listing up to 20);
- an invoice turning failed;
- an account with at least one live agent and no credits left;
- a database backup failure;
- 5 or more failed calls across the platform in the last hour;
- a worker heartbeat older than 5 minutes;
- a vendor failing its health check (vendor_health.py, run every 3 hours),
  plus a daily vendor digest after 09:00 IST.

Each alert key is emailed at most once per 6 hours (per-event keys only
once); the times sent live in settings (account 0) so a restart never
re-sends. Goes to OPS_ALERT_EMAIL, else the platform owner's email. Off in
APP_ENV=staging unless OPS_ALERT_EMAIL is set. Same daemon-thread shape as
notification_worker.py.
"""

import datetime
import html
import logging
import os
import threading
import time
from zoneinfo import ZoneInfo

import admin_db
import calls_db
import email_sender
import env_guard
import vendor_health

logger = logging.getLogger("vistrow-ops-alerts")

_CHECK_INTERVAL_S = 10 * 60
_REPEAT_S = 6 * 3600
_MARK = "ops_alert."  # + alert key; value = epoch seconds it was emailed
_ERRORS_MARK = "ops_alert_errors_last_id"
_MAX_ERRORS_PER_EMAIL = 20
_FAILED_CALLS_PER_HOUR = 5
_WORKER_STALE_S = 5 * 60
_VENDOR_EVERY_S = 3 * 3600
_VENDOR_RAN = "vendor_health.ran_at"
_DIGEST_HOUR_IST = 9
_STATUS_LABEL = {"ok": "OK", "warn": "Warning", "fail": "FAILING", "skipped": "Not configured"}

_started = False
_lock = threading.Lock()


def recipient() -> str | None:
    configured = (os.environ.get("OPS_ALERT_EMAIL") or "").strip()
    if configured:
        return configured
    if env_guard.is_staging():
        return None  # staging never emails the real owner by default
    conn = calls_db._connect()
    try:
        row = conn.execute(
            "SELECT u.email FROM users u JOIN accounts a ON a.id = u.account_id "
            "WHERE a.is_platform_owner = 1 ORDER BY a.id, u.id LIMIT 1"
        ).fetchone()
        return row["email"] if row else None
    finally:
        conn.close()


def due(key: str, now: float, repeat_s: float | None) -> bool:
    """True when this alert may be emailed now: never sent, or (repeat_s set)
    sent more than repeat_s ago. repeat_s None = a one-off event."""
    sent = calls_db.get_setting(_MARK + key, calls_db.PLATFORM_ACCOUNT_ID)
    if not sent:
        return True
    return repeat_s is not None and now - float(sent) >= repeat_s


def _alert(key: str, subject: str, body_html: str, repeat_s: float | None = _REPEAT_S, after_send=None) -> dict:
    return {"key": key, "subject": subject, "body": body_html, "repeat_s": repeat_s, "after_send": after_send}


# ----------------------------------------------------------------- checks


def _error_events() -> list[dict]:
    mark = calls_db.get_setting(_ERRORS_MARK, calls_db.PLATFORM_ACCOUNT_ID)
    conn = calls_db._connect()
    try:
        if mark is None:
            # First run: start from now, never replay history.
            top = conn.execute("SELECT COALESCE(MAX(id), 0) m FROM error_events").fetchone()["m"]
            calls_db.set_setting(_ERRORS_MARK, str(top), calls_db.PLATFORM_ACCOUNT_ID)
            return []
        rows = [dict(r) for r in conn.execute(
            "SELECT id, source, message, account_id, created_at FROM error_events "
            "WHERE level = 'error' AND id > ? ORDER BY id LIMIT ?",
            (int(mark), _MAX_ERRORS_PER_EMAIL),
        ).fetchall()]
    finally:
        conn.close()
    if not rows:
        return []
    last = rows[-1]["id"]
    items = "".join(
        f"<li><code>{html.escape(r['source'] or '')}</code> {html.escape((r['message'] or '')[:300])}"
        + (f" (account {r['account_id']})" if r["account_id"] else "")
        + f" <span style='color:#666'>{html.escape(r['created_at'] or '')}</span></li>"
        for r in rows
    )
    return [_alert(
        f"errors:{last}", f"{len(rows)}{'+' if len(rows) == _MAX_ERRORS_PER_EMAIL else ''} new platform error(s)",
        f"<ul>{items}</ul>", repeat_s=None,
        after_send=lambda: calls_db.set_setting(_ERRORS_MARK, str(last), calls_db.PLATFORM_ACCOUNT_ID),
    )]


def _failed_invoices() -> list[dict]:
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT i.id, i.account_id, i.kind, i.amount_inr, a.name FROM invoices i LEFT JOIN accounts a ON a.id = i.account_id "
            "WHERE i.status = 'failed' AND i.created_at::timestamp >= (now() AT TIME ZONE 'UTC') - INTERVAL '7 days'"
        ).fetchall()
    finally:
        conn.close()
    return [
        _alert(
            f"invoice_failed:{r['id']}", f"Payment failed: {r['name'] or 'account ' + str(r['account_id'])}",
            f"<p>Invoice #{r['id']} ({html.escape(r['kind'] or '')}, ₹{float(r['amount_inr'] or 0):g}) "
            f"for {html.escape(r['name'] or '')} (account {r['account_id']}) failed.</p>",
            repeat_s=None,
        )
        for r in rows
    ]


def _zero_balance_live() -> list[dict]:
    return [
        _alert(
            f"zero_balance:{p['accountId']}", f"Out of credits with a live agent: {p['name']}",
            f"<p>{html.escape(p['name'] or '')} (account {p['accountId']}) has {p['liveAgents']} live agent(s) "
            "and no credits left, so its calls will not connect.</p>",
        )
        for p in admin_db.credit_positions()
        if p["remaining"] <= 0 and p["liveAgents"] > 0
    ]


def _backup_failures() -> list[dict]:
    conn = calls_db._connect()
    try:
        rows = conn.execute(
            "SELECT id, message FROM error_events WHERE source = 'db_backup' "
            "AND created_at::timestamp >= (now() AT TIME ZONE 'UTC') - INTERVAL '24 hours'"
        ).fetchall()
    finally:
        conn.close()
    return [
        _alert(f"backup_failed:{r['id']}", "Database backup failed", f"<p>{html.escape(r['message'] or '')}</p>", repeat_s=None)
        for r in rows
    ]


def _failed_calls() -> list[dict]:
    conn = calls_db._connect()
    try:
        n = conn.execute(
            f"SELECT COUNT(*) c FROM calls c WHERE {admin_db._failed_call_sql()} "
            "AND c.started_at::timestamp >= (now() AT TIME ZONE 'UTC') - INTERVAL '1 hour'"
        ).fetchone()["c"]
    finally:
        conn.close()
    if n < _FAILED_CALLS_PER_HOUR:
        return []
    return [_alert("failed_calls", f"{n} failed calls in the last hour", f"<p>{n} calls failed across the platform in the last hour.</p>")]


def _stale_workers(now: float) -> list[dict]:
    return [
        _alert(
            f"worker_stale:{w['name']}", f"LiveKit worker '{w['name']}' stopped reporting",
            f"<p>The {html.escape(w['name'])} worker ({w['agentId']}) was last seen {w['ageSeconds'] // 60} minutes ago "
            f"({html.escape(w['lastSeenAt'] or '')} UTC).</p>",
        )
        for w in admin_db.worker_statuses(now=now)
        if w["ageSeconds"] is not None and w["ageSeconds"] > _WORKER_STALE_S
    ]


def _vendor_table(results: list[dict]) -> str:
    rows = "".join(
        f"<tr><td style='padding:4px 12px 4px 0'><b>{html.escape(r['name'])}</b></td>"
        f"<td style='padding:4px 12px 4px 0'>{_STATUS_LABEL.get(r['status'], r['status'])}</td>"
        f"<td style='padding:4px 0'>{html.escape(r['detail'])}</td></tr>"
        for r in results
    )
    return f"<table style='border-collapse:collapse;font-size:14px'>{rows}</table>"


def _vendor_health(now: float) -> list[dict]:
    """Probe vendors every 3 hours (fresh for the daily digest); alert on any
    failure, at most once per 6 hours per vendor."""
    ist = datetime.datetime.fromtimestamp(now, ZoneInfo("Asia/Kolkata"))
    digest_key = f"vendor_digest.{ist.date().isoformat()}"
    digest_due = ist.hour >= _DIGEST_HOUR_IST and due(digest_key, now, None)
    ran = calls_db.get_setting(_VENDOR_RAN, calls_db.PLATFORM_ACCOUNT_ID)
    if digest_due or not ran or now - float(ran) >= _VENDOR_EVERY_S:
        report = vendor_health.run_checks()
        calls_db.set_setting(_VENDOR_RAN, str(int(now)), calls_db.PLATFORM_ACCOUNT_ID)
    else:
        report = vendor_health.last_report()
    if not report:
        return []
    results = report["results"]
    alerts = [
        _alert(
            f"vendor.{r['name'].lower().replace(' ', '_')}",
            f"{r['name']} is failing",
            f"<p>The {html.escape(r['name'])} health check failed: <b>{html.escape(r['detail'])}</b>.</p>"
            "<p>Calls or features that depend on it may be failing right now. "
            "See System Health in the admin panel.</p>",
        )
        for r in results if r["status"] == "fail"
    ]
    if digest_due:
        failing = sum(r["status"] == "fail" for r in results)
        warned = sum(r["status"] == "warn" for r in results)
        summary = (f"{failing} failing" if failing else "all OK") + (f", {warned} warning" if warned else "")
        alerts.append(_alert(
            digest_key,
            f"Daily vendor health: {summary}",
            f"<p>Checked {html.escape(report['checkedAt'])} UTC.</p>{_vendor_table(results)}",
            repeat_s=None,
        ))
    return alerts


def gather(now: float) -> list[dict]:
    alerts: list[dict] = []
    for check in (_error_events, _failed_invoices, _zero_balance_live, _backup_failures, _failed_calls):
        try:
            alerts += check()
        except Exception:
            logger.exception("ops alert check %s failed", check.__name__)
    for timed in (_stale_workers, _vendor_health):
        try:
            alerts += timed(now)
        except Exception:
            logger.exception("ops alert check %s failed", timed.__name__)
    return alerts


# ----------------------------------------------------------------- loop


def run_once(now: float | None = None) -> int:
    to = recipient()
    if not to:
        return 0
    now = time.time() if now is None else now
    sent = 0
    for alert in gather(now):
        if not due(alert["key"], now, alert["repeat_s"]):
            continue
        subject = f"Vistrow ops: {alert['subject']}"
        body = email_sender.render_email(preheader=subject, heading=alert["subject"], body_html=alert["body"])
        if not email_sender.send_email(to, subject, body):
            continue  # not marked: the next tick tries again
        calls_db.set_setting(_MARK + alert["key"], str(int(now)), calls_db.PLATFORM_ACCOUNT_ID)
        if alert["after_send"]:
            alert["after_send"]()
        sent += 1
    return sent


def _loop() -> None:
    logger.info("ops alert worker started (every %ss)", _CHECK_INTERVAL_S)
    while True:
        try:
            run_once()
        except Exception:
            logger.exception("ops alert tick failed")
        time.sleep(_CHECK_INTERVAL_S)


def start_ops_alert_worker() -> None:
    """Idempotent. DISABLE_NOTIFICATIONS=1 keeps it off too, for the same
    reason as notification_worker (a local server on the production DB)."""
    if os.environ.get("DISABLE_NOTIFICATIONS", "").strip() not in ("", "0", "false", "False"):
        logger.info("ops alerts disabled via DISABLE_NOTIFICATIONS")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="ops-alerts", daemon=True).start()
