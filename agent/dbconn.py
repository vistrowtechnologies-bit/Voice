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
"""

import os

import psycopg
from psycopg.rows import dict_row


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set — Postgres is required (SQLite support was removed "
            "once the product moved to Postgres for multi-tenant durability)."
        )
    return url


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
        self._raw.close()


def connect() -> Conn:
    return Conn(psycopg.connect(_database_url(), row_factory=dict_row))
