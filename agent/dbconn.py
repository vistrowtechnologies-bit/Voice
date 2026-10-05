"""Postgres connection helper — a thin sqlite3-compatibility shim.

calls_db.py and agent/db.py were both written against sqlite3's API
(`?` placeholders, `conn.execute(...)`, `with conn: ...` committing without
closing, `cursor.lastrowid`). Rather than rewrite every call site's SQL and
control flow, this module reproduces just enough of that surface over
psycopg so the existing query strings and transaction patterns work
unchanged — only the schema DDL and a handful of SQLite-only functions
(PRAGMA, date()/datetime()/strftime(), INSERT OR IGNORE) needed real
per-call-site changes.

Verified against a live Postgres instance: psycopg3's `with conn:` CLOSES
the connection on exit (unlike sqlite3's, which only commits/rolls back and
leaves it open for further use) — Conn.__exit__ below deliberately does NOT
delegate to psycopg's own context manager, to preserve the sqlite3 behavior
every call site in calls_db.py/agent/db.py already relies on.

connect()/close() are backed by a pool, not a raw connection per call —
every live-call DB touch (agent config lookup, saved call row) used to open
a brand new TCP+TLS connection to Postgres and tear it down immediately,
which caps real concurrency far below Postgres's own max_connections (each
open costs a full handshake, and connections pile up under concurrent
calls). Pooling reuses a small set of warm connections instead.
"""

import logging
import os
import threading
import time

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout

logger = logging.getLogger("vistrow-dbconn")

# The worker runs on LiveKit's cloud and reaches Postgres through Railway's
# public TCP proxy, a link that drops idle connections and sometimes stalls a
# new one. With no connect timeout the pool waited its whole 30 s default and
# the job died with PoolTimeout, leaving the caller on "Connecting..." (seen
# on a live demo call, 5 Oct 2026). Detect dead sockets quickly, give up on a
# stalled attempt quickly, and retry on a fresh pool instead.
_CONNECT_KWARGS = {
    "connect_timeout": 5,
    "keepalives": 1,
    "keepalives_idle": 20,
    "keepalives_interval": 5,
    "keepalives_count": 3,
}
_GETCONN_TIMEOUT_S = 6.0
_CONNECT_ATTEMPTS = 3
# A pooled connection used this recently is certainly alive, so skip the
# health-check round trip. Each check costs a full network round trip to the
# proxy (~0.9 s from India), and one call's config load makes several
# back-to-back DB calls.
_FRESH_S = 15.0


def _check_if_stale(conn: psycopg.Connection) -> None:
    """Pool `check` hook: only round-trip a connection that has sat idle."""
    last = getattr(conn, "_vv_last_used", 0.0)
    if time.monotonic() - last < _FRESH_S:
        return
    ConnectionPool.check_connection(conn)


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set — Postgres is required (SQLite support was removed "
            "once the product moved to Postgres for multi-tenant durability)."
        )
    return url


_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()


def _get_pool() -> ConnectionPool:
    # Lazy — DATABASE_URL isn't read (and no connections opened) until the
    # first real query, matching the old connect()-per-call behavior rather
    # than making pool construction a hard dependency at worker startup.
    # Guarded by a lock since concurrent calls can each hit this on their
    # first DB touch before the pool exists yet.
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                # LiveKit dispatches each concurrent call to its own OS
                # subprocess (see num_idle_processes in main.py), and every
                # subprocess constructs its own pool here — so this size
                # multiplies by concurrent-call count, not just by how much
                # one call needs. A single call only ever touches the DB for
                # a config lookup and a handful of writes, never more than
                # one or two at once, so keep this tight: at 100 concurrent
                # calls, max_size=5 would mean up to 500 Postgres
                # connections from the agent fleet alone. min_size=0 avoids
                # holding a connection open for the (common) call that never
                # needs one.
                _pool = ConnectionPool(
                    _database_url(),
                    # One warm connection per process: the TCP+TLS handshake to
                    # the proxy is the slowest part of a call's first query
                    # (~2.5 s from India), so pay it at process start, not at
                    # the caller's expense.
                    min_size=1,
                    max_size=2,
                    max_idle=1800,
                    kwargs={"row_factory": dict_row, **_CONNECT_KWARGS},
                    open=True,
                    # A worker subprocess can sit idle for many minutes
                    # between calls (each LiveKit job gets its own OS
                    # process). Railway/Postgres can drop that idle
                    # connection server-side well before the pool's own
                    # max_idle cleanup runs, leaving a "zombie" connection
                    # that looks fine to the pool but is actually dead —
                    # every real call crashed the job on the first query
                    # after the idle gap. check_connection round-trips a
                    # cheap query before handing a pooled connection back
                    # out, so a dead one gets discarded and replaced instead
                    # of reaching call code.
                    check=_check_if_stale,
                )
    return _pool


class Cursor:
    """Wraps a psycopg cursor to add sqlite3's `.lastrowid` convenience —
    every INSERT that needs it now ends in `RETURNING id`, so this is just
    a one-row fetch cached on first access."""

    def __init__(self, raw: psycopg.Cursor) -> None:
        self._raw = raw
        self._lastrowid: int | None = None
        self._fetched = False

    def fetchone(self):
        return self._raw.fetchone()

    def fetchall(self):
        return self._raw.fetchall()

    @property
    def lastrowid(self) -> int | None:
        if not self._fetched:
            row = self._raw.fetchone()
            self._lastrowid = row["id"] if row else None
            self._fetched = True
        return self._lastrowid


class Conn:
    """sqlite3.Connection-shaped wrapper around a psycopg connection."""

    def __init__(self, raw: psycopg.Connection) -> None:
        self._raw = raw

    def execute(self, sql: str, params=()) -> Cursor:
        # sqlite3 uses `?` placeholders; psycopg/Postgres use `%s`. No SQL
        # string in this codebase uses a literal `?` outside a placeholder
        # position (verified — no LIKE patterns or JSON operators using it),
        # so this blind replace is safe.
        return Cursor(self._raw.execute(sql.replace("?", "%s"), params))

    def __enter__(self) -> "Conn":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if exc_type is None:
            self._raw.commit()
        else:
            self._raw.rollback()
        return False

    def close(self) -> None:
        # Every call site treats this as "I'm done with this connection",
        # the way sqlite3's implicit per-request connection worked — under
        # pooling that means returning it to the pool, not tearing down the
        # socket. A plain SELECT never calls commit()/rollback(), leaving
        # the connection idle-in-transaction; roll it back here so the
        # pool's own dirty-connection handling — which logs a WARNING every
        # time it has to do this — never finds anything to clean up. Without
        # this, that warning fires on nearly every read-only request.
        if self._raw.info.transaction_status != psycopg.pq.TransactionStatus.IDLE:
            self._raw.rollback()
        self._raw._vv_last_used = time.monotonic()
        _get_pool().putconn(self._raw)


def warm() -> None:
    """Open the pool now (best effort) so the first call's query finds a live
    connection instead of dialling the proxy."""
    try:
        _get_pool()
    except Exception:  # noqa: BLE001 - warming must never break process start
        logger.warning("could not warm the database pool", exc_info=True)


def _reset_pool() -> None:
    """Drop the pool so the next attempt builds a fresh one (and fresh sockets)."""
    global _pool
    with _pool_lock:
        old, _pool = _pool, None
    if old is not None:
        try:
            old.close(timeout=1)
        except Exception:  # noqa: BLE001 - best effort; the pool is being discarded anyway
            pass


def connect() -> Conn:
    last: PoolTimeout | None = None
    for attempt in range(1, _CONNECT_ATTEMPTS + 1):
        try:
            return Conn(_get_pool().getconn(timeout=_GETCONN_TIMEOUT_S))
        except PoolTimeout as exc:
            last = exc
            logger.warning("database connection attempt %d/%d timed out; retrying on a fresh pool", attempt, _CONNECT_ATTEMPTS)
            _reset_pool()
    assert last is not None
    raise last


def listen_connection() -> psycopg.Connection:
    """Return a dedicated autocommit connection for PostgreSQL LISTEN.

    A listener is intentionally not borrowed from the request pool: it stays
    open for the lifetime of a LiveKit worker process, while ordinary config
    reads and call writes must still have both pooled connections available.
    """
    return psycopg.connect(
        _database_url(),
        autocommit=True,
        row_factory=dict_row,
        **_CONNECT_KWARGS,
    )
