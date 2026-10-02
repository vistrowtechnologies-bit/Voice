"""A lost recording must be visible, not just a log line.

The agent stamps recording_status on every call when it ends. Only the cases
below are a problem the operator should see ('failed'); a deliberate discard
after declined consent and an unconfigured store are not.
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recording

FULL = {"B2_ENDPOINT_URL": "e", "B2_KEY_ID": "k", "B2_APPLICATION_KEY": "s", "B2_BUCKET_NAME": "b", "B2_REGION": "r"}


class OutcomeStatus(unittest.TestCase):
    def test_a_saved_upload_is_saved(self):
        self.assertEqual(recording.outcome_status("recordings/2/9.wav", True), "saved")

    def test_a_failed_upload_with_storage_configured_is_failed(self):
        self.assertEqual(recording.outcome_status(None, True), "failed")

    def test_unconfigured_storage_is_not_a_failure(self):
        self.assertEqual(recording.outcome_status(None, False), "not_configured")


class B2Configured(unittest.TestCase):
    def test_all_five_settings_are_required(self):
        with mock.patch.dict(os.environ, FULL, clear=True):
            self.assertTrue(recording.b2_configured())
        for missing in FULL:
            env = {k: v for k, v in FULL.items() if k != missing}
            with mock.patch.dict(os.environ, env, clear=True):
                self.assertFalse(recording.b2_configured(), missing)


if __name__ == "__main__":
    unittest.main()
