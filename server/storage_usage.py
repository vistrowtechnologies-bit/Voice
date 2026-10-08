"""How much recording storage an account is using.

Recordings are stored under recordings/<account_id>/ in the B2 bucket. The total is
summed from the bucket listing, so it stays correct when recordings are deleted by
retention or by hand. It is cached for a few minutes because /entitlements is called
on every dashboard load and a listing is one request per 1,000 files.

A lookup that fails returns None, never an exception: the sidebar warning and any
future gate treat "unknown" as "do not warn / do not block".
"""
import logging
import threading
import time

from storage import b2_client

logger = logging.getLogger("storage_usage")

CACHE_TTL_S = 300
_cache: dict[int, tuple[float, int]] = {}
_lock = threading.Lock()


def _sum_prefix(client, bucket: str, prefix: str) -> int:
    total = 0
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        page = client.list_objects_v2(**kwargs)
        total += sum(int(obj.get("Size") or 0) for obj in page.get("Contents", []))
        if not page.get("IsTruncated"):
            return total
        token = page.get("NextContinuationToken")


def account_storage_bytes(account_id: int, *, now=time.monotonic, fresh: bool = False) -> "int | None":
    """Bytes of recordings stored for this account, or None if it cannot be read."""
    with _lock:
        hit = _cache.get(account_id)
        if hit and not fresh and now() - hit[0] < CACHE_TTL_S:
            return hit[1]
    try:
        client, bucket = b2_client()
        if client is None:
            return None
        used = _sum_prefix(client, bucket, f"recordings/{int(account_id)}/")
    except Exception:
        logger.warning("could not read storage usage for account %s", account_id, exc_info=True)
        return None
    with _lock:
        _cache[account_id] = (now(), used)
    return used


def forget(account_id: int) -> None:
    """Drop the cached total, e.g. right after a bulk delete."""
    with _lock:
        _cache.pop(account_id, None)
