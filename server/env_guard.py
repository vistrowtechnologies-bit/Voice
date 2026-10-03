"""Staging safety lock.

APP_ENV=staging marks a deployment that must never reach a real person. In
that mode every outbound dial is refused unless the number is on
STAGING_DIAL_ALLOWLIST (comma-separated; matched on the last 10 digits, so
"+91 90670 97779" and "9067097779" are the same number). Unset or any other
APP_ENV (including production, the default) leaves dialling untouched.

orchestrator/env_guard.py is a copy: that service is built from its own
folder and cannot import from server/. Keep the two files identical.
"""
from __future__ import annotations

import os
import re


def app_env() -> str:
    return (os.environ.get("APP_ENV") or "production").strip().lower()


def is_staging() -> bool:
    return app_env() == "staging"


def _tail(number: str) -> str:
    return re.sub(r"\D", "", number or "")[-10:]


def dial_block_reason(to_number: str) -> str | None:
    """None when the call may proceed; otherwise a message for the caller."""
    if not is_staging():
        return None
    allowed = {_tail(n) for n in os.environ.get("STAGING_DIAL_ALLOWLIST", "").split(",")}
    allowed.discard("")
    tail = _tail(to_number)
    if tail and tail in allowed:
        return None
    return (
        "Blocked: this is the staging environment, which only dials numbers on "
        "STAGING_DIAL_ALLOWLIST."
    )
