"""Decides, when a call ends, whether its recording may be stored.

A workspace that has used its plan's recording storage keeps taking calls; only the
audio of new calls is not stored (the call itself, transcript and summary are saved as
normal). The check runs after the call has finished, never on the live call path.

Fails open everywhere: if the plan, the limit or the bucket cannot be read, the recording
is stored. Losing a recording because a check broke is worse than storing one over the limit.
"""
import logging
import threading
import time

logger = logging.getLogger("storage_gate")

CACHE_TTL_S = 120
_cache: dict[int, tuple[float, int]] = {}
_lock = threading.Lock()


def _used_bytes(account_id: int, scan) -> "int | None":
    with _lock:
        hit = _cache.get(account_id)
        if hit and time.monotonic() - hit[0] < CACHE_TTL_S:
            return hit[1]
    used = scan(account_id)
    if used is not None:
        with _lock:
            _cache[account_id] = (time.monotonic(), used)
    return used


def _scan_bucket(account_id: int) -> "int | None":
    """Total bytes under recordings/<account_id>/ in B2, or None if it cannot be read."""
    import os
    try:
        endpoint, key_id, app_key = (os.environ.get(k) for k in ("B2_ENDPOINT_URL", "B2_KEY_ID", "B2_APPLICATION_KEY"))
        bucket, region = os.environ.get("B2_BUCKET_NAME"), os.environ.get("B2_REGION")
        if not (endpoint and key_id and app_key and bucket and region):
            return None
        import boto3
        client = boto3.client("s3", endpoint_url=endpoint, aws_access_key_id=key_id,
                              aws_secret_access_key=app_key, region_name=region)
        total, token = 0, None
        while True:
            kwargs = {"Bucket": bucket, "Prefix": f"recordings/{int(account_id)}/"}
            if token:
                kwargs["ContinuationToken"] = token
            page = client.list_objects_v2(**kwargs)
            total += sum(int(o.get("Size") or 0) for o in page.get("Contents", []))
            if not page.get("IsTruncated"):
                return total
            token = page.get("NextContinuationToken")
    except Exception:
        logger.warning("storage gate: could not read usage for account %s", account_id, exc_info=True)
        return None


def recording_allowed(account_id, limit_bytes, *, scan=_scan_bucket) -> bool:
    """True when this account's recording should be stored.

    `limit_bytes` is the plan's allowance (plan_policy.storage_limit_bytes), None for no
    limit. The usage lookup is injectable so tests need no bucket."""
    if not account_id or not limit_bytes:
        return True
    try:
        used = _used_bytes(int(account_id), scan)
    except Exception:
        logger.warning("storage gate failed for account %s; storing the recording", account_id, exc_info=True)
        return True
    if used is None:
        return True
    return used < limit_bytes


def forget(account_id: int) -> None:
    with _lock:
        _cache.pop(account_id, None)
