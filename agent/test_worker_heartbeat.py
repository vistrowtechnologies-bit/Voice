"""Worker heartbeat for the admin System Health page: the name and payload
the server reads, a failing write never raising, and the loop beating every
60 s. Offline, with a stub writer; plus a real write when TEST_DATABASE_URL
is set."""
import json
import os
import unittest
from unittest import mock

import worker_heartbeat


class HeartbeatTests(unittest.TestCase):
    def test_name_follows_the_dispatch_mode(self):
        with mock.patch.dict(os.environ, {"LIVEKIT_AGENT_NAME": ""}):
            self.assertEqual(worker_heartbeat.worker_name(), "tenant")
        with mock.patch.dict(os.environ, {"LIVEKIT_AGENT_NAME": "platform-demo"}):
            self.assertEqual(worker_heartbeat.worker_name(), "platform-demo")

    def test_payload_shape(self):
        with mock.patch.dict(os.environ, {"LIVEKIT_AGENT_VERSION": "", "LIVEKIT_AGENT_DEPLOYMENT": "diFo98U8pV2u"}), \
                mock.patch.object(worker_heartbeat.socket, "gethostname", return_value="pod-1"):
            beat = json.loads(worker_heartbeat.payload(now=1_760_188_805))
        self.assertEqual(beat, {"seenAt": "2025-10-11 13:20:05", "version": "diFo98U8pV2u", "host": "pod-1"})
        with mock.patch.dict(os.environ, {"LIVEKIT_AGENT_VERSION": "", "LIVEKIT_AGENT_DEPLOYMENT": ""}):
            self.assertIsNone(json.loads(worker_heartbeat.payload())["version"])

    def test_beat_writes_and_a_failure_never_raises(self):
        writes = []
        with mock.patch.dict(os.environ, {"LIVEKIT_AGENT_NAME": ""}):
            self.assertTrue(worker_heartbeat.beat_once(lambda name, value: writes.append((name, json.loads(value)))))
        self.assertEqual(writes[0][0], "tenant")
        self.assertIn("seenAt", writes[0][1])

        def boom(name, value):
            raise RuntimeError("database down")
        self.assertFalse(worker_heartbeat.beat_once(boom))

    def test_loop_keeps_beating_every_minute_after_failures(self):
        calls, sleeps = [], []

        def flaky(name, value):
            calls.append(name)
            if len(calls) == 1:
                raise RuntimeError("PoolTimeout")

        class Stop(Exception):
            pass

        def sleep(seconds):
            sleeps.append(seconds)
            if len(sleeps) == 3:
                raise Stop

        with self.assertRaises(Stop):
            worker_heartbeat._loop(flaky, sleep)
        self.assertEqual((len(calls), sleeps), (3, [60, 60, 60]))

    def test_start_is_idempotent(self):
        with mock.patch.object(worker_heartbeat, "_started", False), \
                mock.patch.object(worker_heartbeat.threading, "Thread") as thread:
            worker_heartbeat.start()
            worker_heartbeat.start()
        thread.assert_called_once()
        self.assertTrue(thread.call_args.kwargs["daemon"])


@unittest.skipUnless(os.environ.get("TEST_DATABASE_URL"), "set TEST_DATABASE_URL to a throwaway Postgres database")
class HeartbeatDbTests(unittest.TestCase):
    def test_real_write_upserts_the_settings_row(self):
        os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
        import db
        import dbconn
        # The server owns the schema (calls_db.init_tables); a fresh test
        # database has none, so create the one table this write needs.
        conn = dbconn.connect()
        try:
            with conn:
                conn.execute(
                    "CREATE TABLE IF NOT EXISTS settings (account_id INTEGER NOT NULL, key TEXT NOT NULL, "
                    "value TEXT, PRIMARY KEY (account_id, key))"
                )
        finally:
            conn.close()
        db.write_worker_heartbeat("test-worker", '{"seenAt": "a"}')
        db.write_worker_heartbeat("test-worker", '{"seenAt": "b"}')
        conn = dbconn.connect()
        try:
            rows = conn.execute(
                "SELECT value FROM settings WHERE account_id = 0 AND key = 'worker_heartbeat.test-worker'"
            ).fetchall()
            self.assertEqual([r["value"] for r in rows], ['{"seenAt": "b"}'])
            with conn:
                conn.execute("DELETE FROM settings WHERE account_id = 0 AND key = 'worker_heartbeat.test-worker'")
        finally:
            conn.close()


if __name__ == "__main__":
    unittest.main()
