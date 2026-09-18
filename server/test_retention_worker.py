"""Retention used to run only while somebody had the Compliance page open
(its sole caller was GET /compliance/settings, verified 2026-09-18), so a
workspace that set 30-day retention and never returned kept everything.
These pin the scheduled behaviour, including that it deletes NOTHING when
retention is off - every production account is 'off' as of 2026-09-18.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import retention_worker


class Purge(unittest.TestCase):
    def _run(self, purge_side_effect):
        conn = MagicMock()
        conn.execute.return_value.fetchall.return_value = [{"id": 1}, {"id": 2}, {"id": 3}]
        with patch.object(retention_worker.calls_db, "_connect", return_value=conn), \
             patch.object(retention_worker.calls_db, "purge_expired_calls", side_effect=purge_side_effect) as purge:
            total = retention_worker.run_purge_now()
        return total, purge

    def test_every_account_is_purged(self):
        total, purge = self._run(lambda account_id: 2)
        self.assertEqual([c.args[0] for c in purge.call_args_list], [1, 2, 3])
        self.assertEqual(total, 6)

    def test_retention_off_deletes_nothing(self):
        # purge_expired_calls returns 0 when retention_days is 0.
        total, purge = self._run(lambda account_id: 0)
        self.assertEqual(total, 0)
        self.assertEqual(purge.call_count, 3)

    def test_one_failing_account_does_not_skip_the_others(self):
        def flaky(account_id):
            if account_id == 2:
                raise RuntimeError("db gone")
            return 1
        total, purge = self._run(flaky)
        self.assertEqual(purge.call_count, 3)
        self.assertEqual(total, 2)

    def test_connection_is_closed_even_when_listing_fails(self):
        conn = MagicMock()
        conn.execute.side_effect = RuntimeError("boom")
        with patch.object(retention_worker.calls_db, "_connect", return_value=conn):
            with self.assertRaises(RuntimeError):
                retention_worker._account_ids()
        conn.close.assert_called_once()


class StartUp(unittest.TestCase):
    def setUp(self):
        retention_worker._started = False

    def tearDown(self):
        retention_worker._started = False

    def test_kill_switch_stops_the_thread_starting(self):
        with patch.dict(os.environ, {"DISABLE_RETENTION_PURGE": "1"}), \
             patch.object(retention_worker.threading, "Thread") as thread:
            retention_worker.start_retention_worker()
        thread.assert_not_called()

    def test_starting_twice_runs_one_thread(self):
        with patch.dict(os.environ, {"DISABLE_RETENTION_PURGE": ""}), \
             patch.object(retention_worker.threading, "Thread") as thread:
            retention_worker.start_retention_worker()
            retention_worker.start_retention_worker()
        self.assertEqual(thread.call_count, 1)
        self.assertTrue(thread.call_args.kwargs["daemon"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
