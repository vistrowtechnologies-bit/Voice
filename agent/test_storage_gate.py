"""Offline tests for the recording storage gate. No database, no bucket."""
import unittest

import storage_gate

GB = 1024 ** 3


class RecordingGateTests(unittest.TestCase):
    def setUp(self):
        storage_gate._cache.clear()

    def test_no_limit_or_no_account_always_stores(self):
        never = lambda account_id: self.fail("must not look at storage")
        self.assertTrue(storage_gate.recording_allowed(5, None, scan=never))
        self.assertTrue(storage_gate.recording_allowed(None, 5 * GB, scan=never))
        self.assertTrue(storage_gate.recording_allowed(0, 5 * GB, scan=never))

    def test_under_the_limit_stores_and_at_or_over_does_not(self):
        self.assertTrue(storage_gate.recording_allowed(5, 5 * GB, scan=lambda a: 5 * GB - 1))
        storage_gate._cache.clear()
        self.assertFalse(storage_gate.recording_allowed(5, 5 * GB, scan=lambda a: 5 * GB))
        storage_gate._cache.clear()
        self.assertFalse(storage_gate.recording_allowed(5, 5 * GB, scan=lambda a: 7 * GB))

    def test_unreadable_usage_stores_the_recording(self):
        self.assertTrue(storage_gate.recording_allowed(5, 5 * GB, scan=lambda a: None))

    def test_a_crashing_lookup_stores_the_recording(self):
        def boom(account_id):
            raise RuntimeError("bucket down")
        self.assertTrue(storage_gate.recording_allowed(5, 5 * GB, scan=boom))

    def test_usage_is_cached_per_account(self):
        calls = []
        def scan(account_id):
            calls.append(account_id)
            return 6 * GB
        storage_gate.recording_allowed(5, 5 * GB, scan=scan)
        storage_gate.recording_allowed(5, 5 * GB, scan=scan)
        storage_gate.recording_allowed(6, 5 * GB, scan=scan)
        self.assertEqual(calls, [5, 6])

    def test_forget_lets_a_cleanup_take_effect_immediately(self):
        usage = {"bytes": 6 * GB}
        scan = lambda a: usage["bytes"]
        self.assertFalse(storage_gate.recording_allowed(5, 5 * GB, scan=scan))
        usage["bytes"] = 1 * GB
        self.assertFalse(storage_gate.recording_allowed(5, 5 * GB, scan=scan))  # still cached
        storage_gate.forget(5)
        self.assertTrue(storage_gate.recording_allowed(5, 5 * GB, scan=scan))


class WorkerWiringTests(unittest.TestCase):
    """main.py cannot be imported offline, so check the wiring in its source."""
    def test_the_gate_sits_between_stopping_the_recorder_and_the_upload(self):
        src = open(__file__.replace("test_storage_gate.py", "main.py"), encoding="utf-8").read()
        stop = src.index("local_path = await recorder.stop()")
        gate = src.index("storage_gate.recording_allowed", stop)
        upload = src.index("recording.upload_recording, local_path", stop)
        self.assertLess(stop, gate)
        self.assertLess(gate, upload)
        self.assertIn('rec_status = "skipped_storage_full"', src[gate:upload])
        self.assertIn("os.remove(local_path)", src[gate:upload])


if __name__ == "__main__":
    unittest.main()
