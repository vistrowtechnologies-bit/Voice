# -*- coding: utf-8 -*-
"""The agent must not go quiet until a colleague is really on the line.

Call 1073 (2026-09-22) is the whole reason this file exists. The caller asked
to be put through, the bridge dialled +917020950304, and EnableX answered that
leg itself in 800ms and cleared it 80ms later — the phone never rang. Because
the agent stood down the moment the SIP participant appeared, it then sat mute
while the caller asked to be connected three more times over 90 seconds and
hung up.

These assert the source, not a live session: the handlers are defined inside
entrypoint() and closed over ctx/session/userdata, so exercising them for real
means standing up a LiveKit job. What can be checked cheaply is the thing that
actually broke — that arrival alone never sets handed_off, and that a leg which
drops gets the call back immediately instead of after the 45s watchdog.
"""

import os
import re
import unittest

_MAIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py")


def _source() -> str:
    with open(_MAIN, encoding="utf-8") as handle:
        return handle.read()


def _block(name: str, src: str) -> str:
    """The body of a nested def, up to the next def/decorator at its level."""
    match = re.search(rf"\n(\s+)(?:async )?def {re.escape(name)}\(", src)
    if not match:
        raise AssertionError(f"{name} is gone from main.py")
    indent = len(match.group(1))
    lines = src[match.end():].splitlines()
    body = []
    for line in lines:
        if line.strip() and not line.startswith(" " * (indent + 1)):
            if line.lstrip().startswith(("def ", "async def ", "@")):
                break
        body.append(line)
    return "\n".join(body)


class StandDownGate(unittest.TestCase):
    def test_participant_arrival_does_not_stand_the_agent_down(self):
        body = _block("_on_participant_connected", _source())
        self.assertNotIn(
            'userdata["handed_off"] = True', body,
            "arrival is dialling, not answering — this is the call 1073 bug",
        )
        self.assertIn("_stand_down_when_answered", body)

    def test_stand_down_waits_for_a_real_answer(self):
        body = _block("_stand_down_when_answered", _source())
        self.assertIn("_wait_for_sip_answer", body)
        self.assertIn('userdata["handed_off"] = True', body)
        # A carrier can answer and clear while we wait for their audio.
        self.assertIn("remote_participants", body)

    def test_stand_down_is_gated_by_the_watchdog_timeout(self):
        body = _block("_stand_down_when_answered", _source())
        self.assertIn("_HANDOFF_ANSWER_WAIT_S", body)


class TakeCallBack(unittest.TestCase):
    def test_dropped_colleague_leg_resumes_the_call_at_once(self):
        body = _block("_on_colleague_disconnected", _source())
        self.assertIn("_take_call_back", body)
        self.assertIn("human-", body)

    def test_taking_the_call_back_clears_every_handoff_flag(self):
        body = _block("_take_call_back", _source())
        for flag in ("handed_off", "handoff_pending", "handoff_started_at", "transfer_started"):
            self.assertIn(flag, body, f"{flag} would keep the agent muted or block a retry")
        self.assertIn("generate_reply", body)

    def test_watchdog_uses_the_same_recovery_path(self):
        body = _block("_watch_handoff", _source())
        self.assertIn("_take_call_back", body)


if __name__ == "__main__":
    unittest.main()
