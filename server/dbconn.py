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
every dashboard request and every live-call DB touch used to open a brand
new TCP+TLS connection to Postgres and tear it down immediately, which
caps real concurrency far below Postgres's own max_connections (each open
costs a full handshake, and connections pile up under any concurrent load).
Pooling reuses a small set of warm connections instead.
"""

import os
import threading

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


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
    # than making pool construction an app-startup hard dependency. Guarded
    # by a lock since FastAPI runs sync request handlers across a thread
    # pool, so the very first concurrent requests could otherwise race to
    # each construct their own pool.
    global _pool
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                # max_size stays modest — this process and the agent
                # worker's own pool (agent/dbconn.py) both hold connections
                # against the same Postgres instance, well under its
                # max_connections ceiling.
                _pool = ConnectionPool(
                    _database_url(),
                    min_size=1,
                    max_size=10,
                    kwargs={"row_factory": dict_row},
                    open=True,
                    # Railway/Postgres can drop a pooled connection
                    # server-side before the pool's own max_idle cleanup
                    # runs, leaving a "zombie" that looks fine to the pool
                    # but fails on first real use (agent/dbconn.py hit this
                    # exact crash — job died on every call after ~15min
                    # idle). check_connection round-trips a cheap query
                    # before handing a pooled connection back out, so a dead
                    # one gets discarded and replaced instead of reaching
                    # request code.
                    check=ConnectionPool.check_connection,
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

    @property
    def rowcount(self) -> int:
        return self._raw.rowcount


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
        _get_pool().putconn(self._raw)


def connect() -> Conn:
    return Conn(_get_pool().getconn())
