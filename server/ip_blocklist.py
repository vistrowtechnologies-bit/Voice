"""Visitor IPs and the admin IP blocklist (owner request 2026-10-15).

People were opening the website demo and widget and keeping the agent busy
for minutes at a time (call 1376: 5 min on the realtime model). This records
the visitor IP behind every public call (website demo, dashboard test call,
embedded widget) so the admin call page can show it, and lets the platform
owner block an IP or a whole range (CIDR, e.g. an IPv6 /64, since mobile
networks rotate addresses inside one). A blocked visitor gets 403 from every
API route except sign-in and /admin, so they can't start calls, sign up,
send the contact form or load the widget. The static marketing pages are
served by Vercel and are not covered here.

Visitor IPs are personal data: they are kept VISITOR_IP_RETENTION_DAYS and
purged by the daily retention run.
"""
from __future__ import annotations

import ipaddress
import logging
import threading
import time

import dbconn

logger = logging.getLogger(__name__)

VISITOR_IP_RETENTION_DAYS = 90
_CACHE_TTL_S = 30.0
_NOW = "(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))"

_cache_lock = threading.Lock()
_cache: tuple[float, list[tuple[int, ipaddress._BaseNetwork]]] = (0.0, [])


class InvalidIp(ValueError):
    pass


def normalize(value: str) -> str:
    """'203.0.113.7' / '2001:db8::/64' -> canonical network string. Raises
    InvalidIp. A bare address becomes a /32 or /128."""
    raw = (value or "").strip()
    if not raw:
        raise InvalidIp("Enter an IP address or a range like 203.0.113.0/24")
    try:
        net = ipaddress.ip_network(raw, strict=False)
    except ValueError:
        raise InvalidIp(f"'{raw}' is not a valid IP address or range") from None
    # Refuse ranges so wide they would block a whole provider or country.
    if (net.version == 4 and net.prefixlen < 16) or (net.version == 6 and net.prefixlen < 32):
        raise InvalidIp("That range is too wide to block (IPv4 /16 or narrower, IPv6 /32 or narrower)")
    return str(net)


def _parse_ip(ip: str):
    try:
        return ipaddress.ip_address((ip or "").strip())
    except ValueError:
        return None


def _active_blocks() -> list[tuple[int, ipaddress._BaseNetwork]]:
    global _cache
    now = time.monotonic()
    with _cache_lock:
        if now - _cache[0] < _CACHE_TTL_S:
            return _cache[1]
    conn = dbconn.connect()
    try:
        rows = conn.execute(
            f"SELECT id, network FROM blocked_ips WHERE expires_at IS NULL OR expires_at > {_NOW}"
        ).fetchall()
    finally:
        conn.close()
    blocks = []
    for r in rows:
        try:
            blocks.append((r["id"], ipaddress.ip_network(r["network"], strict=False)))
        except ValueError:
            logger.warning("ignoring malformed blocked_ips row %s", r["id"])
    with _cache_lock:
        _cache = (now, blocks)
    return blocks


def invalidate_cache() -> None:
    global _cache
    with _cache_lock:
        _cache = (0.0, [])


def blocked_by(ip: str) -> int | None:
    """Id of the block covering `ip`, else None. Fails open: a database
    problem never locks real visitors out."""
    addr = _parse_ip(ip)
    if addr is None:
        return None
    try:
        blocks = _active_blocks()
    except Exception:
        logger.exception("IP blocklist unavailable; allowing the request")
        return None
    for block_id, net in blocks:
        if addr.version == net.version and addr in net:
            return block_id
    return None


def record_visitor(room_name: str, ip: str, user_agent: str = "", source: str = "") -> None:
    """Best effort: a failure here must never stop a call from starting."""
    if not room_name or _parse_ip(ip) is None:
        return
    try:
        conn = dbconn.connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO visitor_ips (room_name, ip, user_agent, source) VALUES (?, ?, ?, ?) "
                    "ON CONFLICT (room_name) DO NOTHING",
                    (room_name, ip.strip(), (user_agent or "")[:300], source),
                )
        finally:
            conn.close()
    except Exception:
        logger.exception("could not record the visitor IP for room %s", room_name)


def visitor_for_room(room_name: str | None) -> dict | None:
    if not room_name:
        return None
    conn = dbconn.connect()
    try:
        row = conn.execute(
            "SELECT ip, user_agent, source, created_at FROM visitor_ips WHERE room_name = ?", (room_name,)
        ).fetchone()
        if row is None:
            return None
        recent = conn.execute(
            f"SELECT COUNT(*) c FROM visitor_ips WHERE ip = ? AND created_at::timestamp >= (now() AT TIME ZONE 'UTC') - INTERVAL '30 days'",
            (row["ip"],),
        ).fetchone()["c"]
    finally:
        conn.close()
    block = blocked_by(row["ip"])
    return {
        "ip": row["ip"], "userAgent": row["user_agent"] or "", "source": row["source"] or "",
        "seenAt": row["created_at"], "callsFromIp30d": int(recent or 0), "blockId": block,
    }


def list_blocks() -> list[dict]:
    conn = dbconn.connect()
    try:
        rows = conn.execute(
            f"""SELECT b.id, b.network, b.reason, b.created_at, b.created_by_email, b.expires_at,
                       (b.expires_at IS NULL OR b.expires_at > {_NOW}) active
                FROM blocked_ips b ORDER BY b.id DESC LIMIT 500"""
        ).fetchall()
    finally:
        conn.close()
    return [
        {"id": r["id"], "network": r["network"], "reason": r["reason"], "createdAt": r["created_at"],
         "createdBy": r["created_by_email"] or "", "expiresAt": r["expires_at"], "active": bool(r["active"])}
        for r in rows
    ]


def add_block(value: str, reason: str, admin_email: str, expires_days: int | None = None) -> dict:
    network = normalize(value)
    if expires_days is not None and not (1 <= int(expires_days) <= 3650):
        raise InvalidIp("Expiry must be between 1 and 3650 days")
    conn = dbconn.connect()
    try:
        with conn:
            existing = conn.execute("SELECT id FROM blocked_ips WHERE network = ?", (network,)).fetchone()
            if existing:
                raise InvalidIp(f"{network} is already blocked")
            expires = (
                f"to_char((now() AT TIME ZONE 'UTC') + make_interval(days => {int(expires_days)}), 'YYYY-MM-DD HH24:MI:SS')"
                if expires_days else "NULL"
            )
            row = conn.execute(
                f"INSERT INTO blocked_ips (network, reason, created_by_email, expires_at) VALUES (?, ?, ?, {expires}) RETURNING id",
                (network, reason, admin_email),
            ).fetchone()
    finally:
        conn.close()
    invalidate_cache()
    return {"id": row["id"], "network": network}


def remove_block(block_id: int) -> str | None:
    conn = dbconn.connect()
    try:
        with conn:
            row = conn.execute("DELETE FROM blocked_ips WHERE id = ? RETURNING network", (block_id,)).fetchone()
    finally:
        conn.close()
    invalidate_cache()
    return row["network"] if row else None


def purge_old_visitor_ips(days: int = VISITOR_IP_RETENTION_DAYS) -> int:
    conn = dbconn.connect()
    try:
        with conn:
            rows = conn.execute(
                "DELETE FROM visitor_ips WHERE created_at::timestamp < (now() AT TIME ZONE 'UTC') - (? || ' days')::interval RETURNING room_name",
                (days,),
            ).fetchall()
    finally:
        conn.close()
    return len(rows)
