"""Applies each tenant's retention window on a schedule.

calls_db.purge_expired_calls has always existed, but its only caller was the
GET /compliance/settings route — so a tenant's "delete calls older than N
days" was enforced only while somebody had the Compliance page open
(verified 2026-09-18). A workspace that set 30-day retention and never
revisited that page kept every recording and transcript forever, which is the
opposite of what the setting promises and what DPDP data-minimisation
requires.

Same daemon-thread shape as db_backup.py: check periodically, run once per
UTC day, never let a failure kill the thread.
"""

import datetime
import logging
import os
import threading
import time

import calls_db

logger = logging.getLogger("vistrow-retention")

_LAST_RUN_SETTING = "retention_purge_last_run_date"
# 02:00 UTC (~07:30 IST) — before Indian business hours, so a purge never
# competes with live call traffic for the database.
_TARGET_HOUR_UTC = 2
_CHECK_INTERVAL_S = 30 * 60

_started = False
_lock = threading.Lock()


def _account_ids() -> list[int]:
    conn = calls_db._connect()
    try:
        return [r["id"] for r in conn.execute("SELECT id FROM accounts ORDER BY id").fetchall()]
    finally:
        conn.close()


def run_purge_now() -> int:
    """Purge every tenant. One tenant's failure must not skip the rest."""
    total = 0
    for account_id in _account_ids():
        try:
            deleted = calls_db.purge_expired_calls(account_id)
        except Exception:
            logger.exception("retention purge failed for account %s", account_id)
            continue
        if deleted:
            logger.info("retention: purged %s call(s) for account %s", deleted, account_id)
            total += deleted
    return total


def _loop() -> None:
    logger.info("retention purge scheduler started (target hour %s:00 UTC)", _TARGET_HOUR_UTC)
    while True:
        try:
            now = datetime.datetime.now(datetime.timezone.utc)
            today = now.strftime("%Y-%m-%d")
            last_run = calls_db.get_setting(_LAST_RUN_SETTING, calls_db.PLATFORM_ACCOUNT_ID)
            if now.hour >= _TARGET_HOUR_UTC and last_run != today:
                total = run_purge_now()
                calls_db.set_setting(_LAST_RUN_SETTING, today, calls_db.PLATFORM_ACCOUNT_ID)
                logger.info("retention purge complete for %s (%s call(s))", today, total)
        except Exception:
            logger.exception("retention purge tick failed")
        time.sleep(_CHECK_INTERVAL_S)


def start_retention_worker() -> None:
    """Idempotent — safe to call from FastAPI startup even if it fires twice.

    Set DISABLE_RETENTION_PURGE=1 to keep it off. This one DELETES tenant
    call rows and their recordings, so a local instance pointed at the
    production DATABASE_URL must not run it — same reasoning as
    DISABLE_CAMPAIGN_DIALER and DISABLE_DB_BACKUP.
    """
    if os.environ.get("DISABLE_RETENTION_PURGE", "").strip() not in ("", "0", "false", "False"):
        logger.info("retention purge disabled via DISABLE_RETENTION_PURGE")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="retention-purge", daemon=True).start()
