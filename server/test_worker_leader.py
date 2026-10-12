"""worker_leader: while Railway overlaps two deployments, only one process runs
the side-effecting loops, and the new one takes over once the old one exits.

The election test uses real separate processes against a throwaway Postgres
(TEST_DATABASE_URL), since the lock is a Postgres session lock."""
import os
import subprocess
import sys
import textwrap
import time
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import campaign_dialer
import notification_worker
import worker_leader

TEST_DB = os.environ.get("TEST_DATABASE_URL")

# Child process: report its election result, then keep running (and holding
# the lock if it won) until killed — like an old container awaiting SIGTERM.
_CHILD = textwrap.dedent("""
    import sys, time
    sys.path.insert(0, %r)
    import worker_leader
    while True:
        print("leader" if worker_leader.is_leader() else "follower", flush=True)
        time.sleep(0.2)
""") % HERE


def _spawn():
    env = dict(os.environ, DATABASE_URL=TEST_DB)
    return subprocess.Popen([sys.executable, "-c", _CHILD], stdout=subprocess.PIPE, text=True, env=env)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class OverlappingProcesses(unittest.TestCase):
    def test_new_process_waits_then_takes_over(self):
        old = _spawn()
        self.addCleanup(old.kill)
        self.assertEqual(old.stdout.readline().strip(), "leader")
        new = _spawn()
        self.addCleanup(new.kill)
        # Several ticks while the old process is still alive: never leader.
        for _ in range(3):
            self.assertEqual(new.stdout.readline().strip(), "follower")
        old.kill()
        old.wait()
        deadline = time.time() + 10
        while time.time() < deadline:
            if new.stdout.readline().strip() == "leader":
                break
        else:
            self.fail("new process never became leader after the old one exited")
        # And it stays leader on later ticks.
        self.assertEqual(new.stdout.readline().strip(), "leader")


class LoopsSkipWorkWhenNotLeader(unittest.TestCase):
    def _one_iteration(self, module, leader, work_attr):
        stop = RuntimeError("stop loop")
        with mock.patch.object(worker_leader, "is_leader", return_value=leader), \
                mock.patch.object(module, work_attr) as work, \
                mock.patch.object(module.time, "sleep", side_effect=stop):
            with self.assertRaises(RuntimeError):
                module._loop()
        return work

    def test_dialer(self):
        with mock.patch.object(campaign_dialer.calls_db, "running_campaigns", return_value=[]):
            self.assertFalse(self._one_iteration(
                campaign_dialer, False, "_dial_one").called)
            with mock.patch.object(campaign_dialer.calls_db, "promote_due_scheduled_campaigns") as promote:
                promote.return_value = 0
                self._one_iteration(campaign_dialer, True, "_dial_one")
                promote.assert_called_once()
            with mock.patch.object(campaign_dialer.calls_db, "promote_due_scheduled_campaigns") as promote:
                self._one_iteration(campaign_dialer, False, "_dial_one")
                promote.assert_not_called()

    def test_notifications(self):
        self.assertFalse(self._one_iteration(notification_worker, False, "run_once").called)
        self.assertTrue(self._one_iteration(notification_worker, True, "run_once").called)


if __name__ == "__main__":
    unittest.main()
