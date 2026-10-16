"""The billed call ends when the caller's leg drops, not when the job shuts down.

Production 2026-10-16: realtime calls 1369-1380 were billed 17-29 s more than
their own "Call ended" diagnostic. log_call (a job shutdown callback) stamped
the end itself, and after a caller hang-up the job only shuts down once
LiveKit closes the empty room (~20 s departure timeout). Call 1380: caller left
after 4 s, billed 33 s.
"""
import inspect
import os
import re
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import main

T0 = datetime(2026, 10, 16, 9, 0, tzinfo=timezone.utc)


class FakeClock:
    def __init__(self):
        self.t = T0

    def __call__(self):
        return self.t

    def advance(self, seconds):
        self.t += timedelta(seconds=seconds)


def _log_call_source() -> str:
    src = inspect.getsource(main.entrypoint)
    start = src.index("async def log_call")
    return src[start:start + 400]


class BilledCallEnd(unittest.TestCase):
    def test_caller_hangup_then_room_departure_wait_is_not_billed(self):
        clock = FakeClock()
        end = main._CallEndClock(now=clock)
        started_at = clock()
        clock.advance(4)       # caller hangs up after 4 s
        end.caller_left()
        clock.advance(29)      # room departure timeout + teardown before log_call runs
        self.assertEqual((end.ended_at() - started_at).total_seconds(), 4)

    def test_first_disconnect_wins(self):
        clock = FakeClock()
        end = main._CallEndClock(now=clock)
        clock.advance(10)
        end.caller_left()
        clock.advance(5)
        end.caller_left()
        self.assertEqual(end.ended_at(), T0 + timedelta(seconds=10))

    def test_without_a_caller_disconnect_the_end_is_now(self):
        # Agent hang-up: _hang_up deletes the room and the job shuts down at once.
        clock = FakeClock()
        end = main._CallEndClock(now=clock)
        clock.advance(60)
        self.assertEqual(end.ended_at(), T0 + timedelta(seconds=60))

    def test_caller_rejoin_keeps_the_call_open(self):
        clock = FakeClock()
        end = main._CallEndClock(now=clock)
        clock.advance(5)
        end.caller_left()
        clock.advance(2)
        end.caller_rejoined()
        clock.advance(30)
        self.assertEqual(end.ended_at(), T0 + timedelta(seconds=37))

    def test_log_call_bills_to_the_caller_disconnect(self):
        src = _log_call_source()
        self.assertIn("ended_at = call_end_clock.ended_at()", src)
        self.assertNotRegex(src, r"ended_at = datetime\.now")
        handler = inspect.getsource(main.entrypoint)
        handler = handler[handler.index("def _on_participant_disconnected"):]
        handler = handler[:handler.index("_record_diagnostic(")]
        self.assertTrue(re.search(r"first_participant\.identity:\s*\n\s*return\s*\n\s*call_end_clock\.caller_left\(\)", handler))


if __name__ == "__main__":
    unittest.main()
