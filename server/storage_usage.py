"""How much recording storage an account is using, and how old it is.

Recordings are stored under recordings/<account_id>/ in the B2 bucket. The totals are
summed from the bucket listing, so they stay correct when recordings are deleted by
retention or by hand. The result is cached for a few minutes because /entitlements is
called on every dashboard load and a listing is one request per 1,000 files.

A lookup that fails returns None, never an exception: the sidebar warning and the
recording gate treat "unknown" as "do not warn / do not block".
"""
import datetime
import logging
import threading
import time

from storage import b2_client

logger = logging.getLogger("storage_usage")

CACHE_TTL_S = 300
# "Older than N days" thresholds offered when someone is freeing space.
AGE_THRESHOLDS_DAYS = (30, 90, 180, 365)
_cache: dict[int, tuple[float, dict]] = {}
_lock = threading.Lock()


def _scan_prefix(client, bucket: str, prefix: str, now_utc: datetime.datetime) -> dict:
    used = 0
    files = 0
    older = {days: 0 for days in AGE_THRESHOLDS_DAYS}
    older_files = {days: 0 for days in AGE_THRESHOLDS_DAYS}
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        page = client.list_objects_v2(**kwargs)
        for obj in page.get("Contents", []):
            size = int(obj.get("Size") or 0)
            used += size
            files += 1
            modified = obj.get("LastModified")
            if modified is None:
                continue
            if modified.tzinfo is None:
                modified = modified.replace(tzinfo=datetime.timezone.utc)
            age_days = (now_utc - modified).days
            for days in AGE_THRESHOLDS_DAYS:
                if age_days >= days:
                    older[days] += size
                    older_files[days] += 1
        if not page.get("IsTruncated"):
            return {
                "usedBytes": used,
                "files": files,
                "olderThan": {str(d): {"bytes": older[d], "files": older_files[d]} for d in AGE_THRESHOLDS_DAYS},
            }
        token = page.get("NextContinuationToken")


def account_storage_summary(account_id: int, *, now=time.monotonic, fresh: bool = False) -> "dict | None":
    """{usedBytes, files, olderThan: {"30": {bytes, files}, ...}} or None if unreadable."""
    with _lock:
        hit = _cache.get(account_id)
        if hit and not fresh and now() - hit[0] < CACHE_TTL_S:
            return hit[1]
    try:
        client, bucket = b2_client()
        if client is None:
            return None
        summary = _scan_prefix(
            client, bucket, f"recordings/{int(account_id)}/", datetime.datetime.now(datetime.timezone.utc)
        )
    except Exception:
        logger.warning("could not read storage usage for account %s", account_id, exc_info=True)
        return None
    with _lock:
        _cache[account_id] = (now(), summary)
    return summary


def account_storage_bytes(account_id: int, *, now=time.monotonic, fresh: bool = False) -> "int | None":
    """Bytes of recordings stored for this account, or None if it cannot be read."""
    summary = account_storage_summary(account_id, now=now, fresh=fresh)
    return None if summary is None else summary["usedBytes"]


def forget(account_id: int) -> None:
    """Drop the cached total, e.g. right after a bulk delete."""
    with _lock:
        _cache.pop(account_id, None)
