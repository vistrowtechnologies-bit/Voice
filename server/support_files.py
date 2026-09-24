"""Deletes support-ticket attachments 14 days after a ticket is solved.

Only the stored FILES go (screenshots, PDFs, logs) — to keep them from filling
storage. The ticket, its conversation and each file's name stay, so the thread
still reads "shot.png · deleted 14 days after solving" where the file was.

The clock is resolved_at, which is set when a ticket is marked resolved or
closed and cleared when it is reopened (any customer reply or "Reopen"), so a
reopened ticket keeps its files. Same daemon-thread shape as
retention_worker.py.
"""

import datetime
import json
import logging
import os
import threading
import time

import calls_db
import storage

logger = logging.getLogger("vistrow-support-files")

FILE_RETENTION_DAYS = 14
_CHECK_INTERVAL_S = 60 * 60

_started = False
_lock = threading.Lock()


def _purge_list(raw_json, client, bucket) -> tuple[str, int]:
    """Delete every stored object in this attachment list; return the list
    rewritten without storage keys (marked purged) and how many went."""
    try:
        files = json.loads(raw_json or "[]")
    except ValueError:
        return raw_json, 0
    deleted = 0
    for f in files:
        key = f.get("key")
        if not key:
            continue
        try:
            client.delete_object(Bucket=bucket, Key=key)
        except Exception:
            # Leave the key so the next run retries; never mark a file gone
            # that is still sitting in storage.
            logger.exception("could not delete support file %s", key)
            continue
        f.pop("key", None)
        f["purged"] = True
        deleted += 1
    return json.dumps(files), deleted


def purge_solved_ticket_files(now: datetime.datetime | None = None) -> int:
    client, bucket = storage.b2_client()
    if client is None or bucket is None:
        return 0
    now = now or datetime.datetime.now(datetime.timezone.utc)
    cutoff = (now - datetime.timedelta(days=FILE_RETENTION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    total = 0
    conn = calls_db._connect()
    try:
        tickets = conn.execute(
            "SELECT id, attachments_json FROM support_tickets "
            "WHERE status IN ('resolved', 'closed') AND resolved_at IS NOT NULL AND resolved_at <= ?",
            (cutoff,),
        ).fetchall()
        for t in tickets:
            with conn:
                new_json, n = _purge_list(t["attachments_json"], client, bucket)
                if n:
                    conn.execute("UPDATE support_tickets SET attachments_json = ? WHERE id = ?", (new_json, t["id"]))
                for m in conn.execute(
                    "SELECT id, attachments_json FROM support_ticket_messages WHERE ticket_id = ?", (t["id"],)
                ).fetchall():
                    m_json, mn = _purge_list(m["attachments_json"], client, bucket)
                    if mn:
                        conn.execute("UPDATE support_ticket_messages SET attachments_json = ? WHERE id = ?", (m_json, m["id"]))
                    n += mn
            if n:
                logger.info("deleted %s file(s) from solved ticket VV-%s", n, t["id"])
            total += n
    finally:
        conn.close()
    return total


def _loop() -> None:
    logger.info("support file purge started (%s days after solving)", FILE_RETENTION_DAYS)
    while True:
        try:
            purge_solved_ticket_files()
        except Exception:
            logger.exception("support file purge tick failed")
        time.sleep(_CHECK_INTERVAL_S)


def start_support_file_purge() -> None:
    """Idempotent. DISABLE_SUPPORT_FILE_PURGE=1 keeps it off — it deletes
    stored files, so a local server on the production database must not run
    it (same reasoning as DISABLE_RETENTION_PURGE)."""
    if os.environ.get("DISABLE_SUPPORT_FILE_PURGE", "").strip() not in ("", "0", "false", "False"):
        logger.info("support file purge disabled via DISABLE_SUPPORT_FILE_PURGE")
        return
    global _started
    with _lock:
        if _started:
            return
        _started = True
    threading.Thread(target=_loop, name="support-file-purge", daemon=True).start()
