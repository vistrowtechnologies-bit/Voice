"""Daily Postgres backup to B2, with retention pruning and an email receipt.

Runs as a background thread inside this same always-on Voice process — same
shape as campaign_dialer.py's dialer loop — rather than a separate Railway
cron service, so it ships via the normal git-push deploy with no extra
dashboard configuration. Checks roughly hourly whether today's backup has
already run (tracked in the settings table, not in-memory, so a mid-day
restart can't cause a duplicate run) and fires once past the target hour.

Reuses the B2 credentials already wired up for call recordings
(agent/recording.py, orchestrator/recording.py) — same bucket, a separate
db-backups/ prefix, no new storage account needed.
"""

import datetime
import logging
import os
import subprocess
import tempfile
import threading
import time

import boto3
from botocore.client import Config

import calls_db
import email_sender

logger = logging.getLogger("vistrow-db-backup")

_LAST_RUN_SETTING = "db_backup_last_run_date"
_TARGET_HOUR_UTC = 3  # ~8:30am IST — after the day's last US/EU business hours, before Indian business hours
_CHECK_INTERVAL_S = 30 * 60
_RETENTION_DAYS = 30
_B2_PREFIX = "db-backups/"

_started = False
_lock = threading.Lock()


def _b2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["B2_ENDPOINT_URL"],
        aws_access_key_id=os.environ["B2_KEY_ID"],
        aws_secret_access_key=os.environ["B2_APPLICATION_KEY"],
        config=Config(signature_version="s3v4"),
        region_name=os.environ.get("B2_REGION", "us-east-005"),
    )


def _notify(subject: str, body_html: str) -> None:
    to = os.environ.get("BACKUP_NOTIFY_EMAIL") or os.environ.get("SALES_NOTIFY_EMAIL") or "vistrowai@gmail.com"
    html = email_sender.render_email(preheader=subject, heading=subject, body_html=body_html)
    email_sender.send_email(to, subject, html)


def _prune_old_backups(client, bucket: str) -> int:
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=_RETENTION_DAYS)
    deleted = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=_B2_PREFIX):
        for obj in page.get("Contents", []):
            if obj["LastModified"] < cutoff:
                client.delete_object(Bucket=bucket, Key=obj["Key"])
                deleted += 1
    return deleted


def run_backup_now() -> dict:
    """Dumps the database, uploads it to B2, prunes anything past retention,
    and emails a receipt either way — success or failure. Safe to call
    directly (e.g. a manual/test run from a shell); the scheduler below
    just calls this same function on its own schedule."""
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    database_url = os.environ["DATABASE_URL"]
    bucket = os.environ["B2_BUCKET_NAME"]
    key = f"{_B2_PREFIX}vistrow-{today}.dump"

    with tempfile.NamedTemporaryFile(suffix=".dump", delete=False) as tmp:
        dump_path = tmp.name
    try:
        # --format=custom: pg_dump's own compressed binary format — no
        # separate gzip step, and it supports selective/parallel pg_restore
        # later instead of only "restore the whole thing or nothing".
        result = subprocess.run(
            ["pg_dump", "--format=custom", f"--file={dump_path}", database_url],
            capture_output=True, text=True, timeout=600,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr[-2000:]}")

        size_mb = os.path.getsize(dump_path) / (1024 * 1024)
        client = _b2_client()
        client.upload_file(dump_path, bucket, key)
        deleted = _prune_old_backups(client, bucket)

        calls_db.set_setting(_LAST_RUN_SETTING, today, calls_db.PLATFORM_ACCOUNT_ID)
        logger.info("db backup uploaded: %s (%.1f MB), pruned %s old backup(s)", key, size_mb, deleted)
        _notify(
            "Vistrow Voice: daily backup succeeded",
            f"<p>Backed up to <code>{key}</code> — {size_mb:.1f} MB.</p>"
            f"<p>Pruned {deleted} backup(s) older than {_RETENTION_DAYS} days.</p>",
        )
        return {"ok": True, "key": key, "size_mb": size_mb, "pruned": deleted}
    except Exception as exc:
        logger.exception("db backup failed")
        _notify(
            "Vistrow Voice: daily backup FAILED",
            f"<p>The daily database backup did not complete.</p><p>Error: {exc}</p>",
        )
        return {"ok": False, "error": str(exc)}
    finally:
        try:
            os.unlink(dump_path)
        except OSError:
            pass


def _loop() -> None:
    logger.info(
        "db backup scheduler started (target hour %s:00 UTC, retention %sd)",
        _TARGET_HOUR_UTC, _RETENTION_DAYS,
    )
    while True:
        try:
            now = datetime.datetime.now(datetime.timezone.utc)
            today = now.strftime("%Y-%m-%d")
            last_run = calls_db.get_setting(_LAST_RUN_SETTING, calls_db.PLATFORM_ACCOUNT_ID)
            if now.hour >= _TARGET_HOUR_UTC and last_run != today:
                run_backup_now()
        except Exception:
            logger.exception("db backup scheduler tick failed")
        time.sleep(_CHECK_INTERVAL_S)


def start_backup_scheduler() -> None:
    """Idempotent — safe to call from FastAPI startup even if it fires twice.

    Set DISABLE_DB_BACKUP=1 to keep it off entirely. That matters for running
    this app locally: a local instance pointed at the production
    DATABASE_URL would otherwise happily dump production and email out a
    receipt from a laptop run — same reasoning as campaign_dialer's
    DISABLE_CAMPAIGN_DIALER flag.
    """
    if os.environ.get("DISABLE_DB_BACKUP", "").strip() not in ("", "0", "false", "False"):
        logger.info("db backup scheduler disabled via DISABLE_DB_BACKUP")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="db-backup", daemon=True).start()
