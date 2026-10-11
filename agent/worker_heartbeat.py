"""Tells the admin System Health page this LiveKit worker is alive.

Every 60 s the worker's main process writes settings(0,
'worker_heartbeat.<name>') = {seenAt, version, host}; the server lists both
expected workers and marks one stale after 3 minutes (and emails the owner
after 5, see server/ops_alert_worker.py). Before this, nothing showed
whether the tenant or the platform-demo worker was running.

One daemon thread per worker process (started from main.py's __main__, not
per call or per job subprocess). It must never take the worker down, so
every failure is logged and the loop carries on.
"""

import json
import logging
import os
import socket
import threading
import time

logger = logging.getLogger("worker-heartbeat")

INTERVAL_S = 60

_started = False
_lock = threading.Lock()


def worker_name() -> str:
    # The platform-demo deployment sets LIVEKIT_AGENT_NAME; the tenant one
    # runs with implicit dispatch and leaves it empty.
    return "platform-demo" if os.environ.get("LIVEKIT_AGENT_NAME") else "tenant"


def payload(now: float | None = None) -> str:
    seen = time.gmtime(time.time() if now is None else now)
    return json.dumps({
        "seenAt": time.strftime("%Y-%m-%d %H:%M:%S", seen),
        # LiveKit Cloud sets LIVEKIT_AGENT_DEPLOYMENT on hosted agents
        # (livekit-agents worker.py); LIVEKIT_AGENT_VERSION wins if set.
        "version": os.environ.get("LIVEKIT_AGENT_VERSION") or os.environ.get("LIVEKIT_AGENT_DEPLOYMENT") or None,
        "host": socket.gethostname() or None,
    })


def beat_once(write=None) -> bool:
    try:
        if write is None:
            import db  # deferred: keeps this module importable without a database

            write = db.write_worker_heartbeat
        write(worker_name(), payload())
        return True
    except Exception:
        logger.warning("worker heartbeat write failed", exc_info=True)
        return False


def _loop(write=None, sleep=time.sleep) -> None:
    while True:
        beat_once(write)
        sleep(INTERVAL_S)


def start() -> None:
    """Idempotent; never raises."""
    global _started
    try:
        with _lock:
            if _started:
                return
            _started = True
        threading.Thread(target=_loop, name="worker-heartbeat", daemon=True).start()
    except Exception:
        logger.exception("could not start the worker heartbeat")
