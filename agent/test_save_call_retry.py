"""The end-of-call write survives a brief DB stall without double-writing.

A failed save_call used to lose the call outright: no transcript, no
recording link, and no credits charged (usage is summed from calls rows).
"""
import asyncio
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import main

RECORD = {"room_name": "r1", "started_at": "2026-10-10T09:00:00+00:00"}


def save(save_effects, find_effects=()):
    with mock.patch.object(main, "_SAVE_CALL_RETRY_DELAY_S", 0), \
            mock.patch.object(main.db, "save_call", side_effect=list(save_effects)) as saver, \
            mock.patch.object(main.db, "find_saved_call", side_effect=list(find_effects)) as finder:
        try:
            result = asyncio.run(main._save_call_with_retry("r1", 7, RECORD))
        except Exception as exc:  # noqa: BLE001
            result = exc
    return result, saver, finder


class SaveCallRetry(unittest.TestCase):
    def test_first_attempt_succeeds(self):
        result, saver, finder = save([41])
        self.assertEqual(result, 41)
        self.assertEqual(saver.call_count, 1)
        finder.assert_not_called()

    def test_transient_failure_is_retried(self):
        result, saver, _ = save([RuntimeError("PoolTimeout"), 42], find_effects=[None])
        self.assertEqual(result, 42)
        self.assertEqual(saver.call_count, 2)

    def test_insert_that_committed_before_failing_is_not_written_twice(self):
        result, saver, finder = save([RuntimeError("connection lost after commit")], find_effects=[40])
        self.assertEqual(result, 40)
        self.assertEqual(saver.call_count, 1, "a second insert would bill the call twice")
        finder.assert_called_once_with("r1", RECORD["started_at"])

    def test_persistent_failure_raises_for_the_caller_to_report(self):
        result, saver, _ = save([RuntimeError("down")] * 3, find_effects=[None, None])
        self.assertIsInstance(result, RuntimeError)
        self.assertEqual(saver.call_count, 3)

    def test_failed_save_is_reported_to_system_health(self):
        import inspect
        src = inspect.getsource(main)
        block = src[src.index("saved_call_id = await _save_call_with_retry("):]
        block = block[:block.index("link_campaign_contact_call")]
        self.assertIn("db.log_platform_error", block)
        self.assertIn("Call record lost after retries", block)


@unittest.skipUnless(os.environ.get("DATABASE_URL", "").startswith("postgresql://postgres@127.0.0.1"),
                     "needs the local throwaway Postgres")
class FindSavedCallAgainstPostgres(unittest.TestCase):
    def test_matches_room_and_exact_start_time_only(self):
        import db
        conn = db.dbconn.connect()
        with conn:
            conn.execute(
                "INSERT INTO calls (room_name, started_at, ended_at, duration_seconds, transcript_json) "
                "VALUES (?, ?, ?, ?, ?)",
                ("retry-room", "2026-10-10T09:00:00+00:00", "2026-10-10T09:01:00+00:00", 60, "[]"),
            )
        conn.close()
        self.assertIsNotNone(db.find_saved_call("retry-room", "2026-10-10T09:00:00+00:00"))
        self.assertIsNone(db.find_saved_call("retry-room", "2026-10-10T09:00:01+00:00"))
        self.assertIsNone(db.find_saved_call("other-room", "2026-10-10T09:00:00+00:00"))


if __name__ == "__main__":
    unittest.main()
