"""Maximum call length, with a spoken wrap-up before the hard cut.

An agent's max_call_duration_s used to hang up the room with no warning, so a
caller could be cut off mid-sentence. The guard now starts a short farewell a
little before the limit, waits for a quiet moment so it never talks over the
caller or an answer in progress, and lets the existing "goodbye finished, then
hang up" handler end the call. The hard cut at the limit stays as a backstop.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable

_LEAD_MAX_S = 25.0   # how long before the limit the farewell begins
_POLL_S = 0.3        # how often we re-check for a quiet moment
_BUSY_AGENT_STATES = {"thinking", "speaking"}


def wrapup_lead_seconds(max_s: int) -> float:
    """Seconds before the limit at which the farewell starts."""
    return max(0.0, min(_LEAD_MAX_S, max_s / 3.0))


def wrapup_instructions(is_platform_demo: bool) -> str:
    text = (
        "The time limit for this call has been reached. In the language the caller has been "
        "speaking, say one or two short, warm sentences: thank them, tell them the call has to "
        "end now, and say goodbye. Do not ask a question and do not start a new topic."
    )
    if is_platform_demo:
        text += (
            " You may add that they are welcome to call again any time, or book a demo with the "
            "team on the website."
        )
    return text


def _busy(userdata: dict) -> bool:
    return userdata.get("user_state") == "speaking" or userdata.get("agent_state") in _BUSY_AGENT_STATES


async def run_guard(
    max_s: int,
    *,
    userdata: dict,
    speak: Callable[[str], object],
    hang_up: Callable[[], Awaitable[None]],
    is_platform_demo: bool = False,
    before_speak: Callable[[], None] | None = None,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    log: logging.Logger | None = None,
) -> None:
    """Runs for the life of the call: farewell near the limit, hang up at the limit."""
    log = log or logging.getLogger(__name__)
    lead = wrapup_lead_seconds(max_s)
    elapsed = max_s - lead
    try:
        await sleep(elapsed)
        # Wait (briefly) until nobody is speaking and the agent isn't mid-answer.
        patience = max(1.0, lead * 0.5)
        waited = 0.0
        while _busy(userdata) and waited < patience:
            await sleep(_POLL_S)
            waited += _POLL_S
        elapsed += waited
        if userdata.get("ending_call") or userdata.get("handed_off"):
            log.info("time limit reached while the call was already ending/handed off; no wrap-up")
        else:
            userdata["ending_call"] = True  # the agent-state handler hangs up once the goodbye has played
            try:
                if before_speak is not None:
                    # Stop the silence/check-in timers: any of them speaking over
                    # the farewell would interrupt it, and an interruption looks
                    # like "goodbye finished" to the hang-up handler.
                    before_speak()
                speak(wrapup_instructions(is_platform_demo))
                log.info("time-limit wrap-up started %.0fs before the %ds limit", max_s - elapsed, max_s)
            except Exception:  # noqa: BLE001 - the hard cut below still ends the call
                userdata["ending_call"] = False
                log.exception("time-limit wrap-up could not be started")
        await sleep(max(0.0, max_s - elapsed))
        log.info("hanging up after max duration %ds", max_s)
        await hang_up()
    except asyncio.CancelledError:
        pass
