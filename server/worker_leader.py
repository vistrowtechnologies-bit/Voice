"""Only one Voice process at a time runs the side-effecting background loops.

Railway overlaps deployments once the service has no volume attached: the new
container boots (and starts its worker threads) while the old one keeps
serving until the new one passes /healthz. Without a leader, both containers
would dial campaigns from the same free-slot count (overrunning the outbound
trunk's channel budget) and could send the same alert email twice.

The leader is whichever process holds a Postgres session advisory lock on one
dedicated connection (not a pooled one — a session lock would leak into the
pool). The lock is released when the old process exits and its connection
closes; the new process takes over on its next tick. Server-side TCP
keepalives are shortened so a connection that dies silently frees the lock in
about a minute instead of the OS default of hours.
"""

import logging
import threading

import psycopg

import dbconn

logger = logging.getLogger("vistrow-worker-leader")

# Arbitrary constant shared by every Voice process; nothing else in the app
# uses session-level advisory locks (calls_db only uses transaction-level ones).
_LOCK_KEY = 0x56535752  # "VSWR"
_KEEPALIVE_OPTIONS = "-c tcp_keepalives_idle=30 -c tcp_keepalives_interval=10 -c tcp_keepalives_count=3"

_conn: psycopg.Connection | None = None
_lock = threading.Lock()


def is_leader() -> bool:
    """True when this process holds (or just took) the worker lock."""
    global _conn
    with _lock:
        if _conn is not None:
            try:
                _conn.execute("SELECT 1")
                return True
            except Exception:
                logger.warning("worker leader connection lost; re-electing")
                try:
                    _conn.close()
                except Exception:
                    pass
                _conn = None
        try:
            conn = psycopg.connect(
                dbconn._database_url(), autocommit=True, connect_timeout=10,
                keepalives=1, keepalives_idle=30, keepalives_interval=10, keepalives_count=3,
                options=_KEEPALIVE_OPTIONS,
            )
        except Exception:
            logger.exception("worker leader election could not connect")
            return False
        try:
            got = conn.execute("SELECT pg_try_advisory_lock(%s)", (_LOCK_KEY,)).fetchone()[0]
        except Exception:
            logger.exception("worker leader election failed")
            got = False
        if not got:
            conn.close()
            return False
        _conn = conn
        logger.info("this process now runs the background workers")
        return True
