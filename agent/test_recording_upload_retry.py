"""A recording upload must survive a brief storage hiccup.

The upload is one network call at the end of a call and the audio cannot be
recreated, so a single transient failure used to lose the recording for good.
"""
import os
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recording

ENV = {
    "B2_ENDPOINT_URL": "https://s3.example", "B2_KEY_ID": "k", "B2_APPLICATION_KEY": "s",
    "B2_BUCKET_NAME": "b", "B2_REGION": "r",
}


class _Client:
    def __init__(self, failures):
        self.failures = failures
        self.calls = 0

    def upload_file(self, *a, **k):
        self.calls += 1
        if self.calls <= self.failures:
            raise RuntimeError("storage hiccup")


def _run(failures):
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    client = _Client(failures)
    fake_boto3 = types.SimpleNamespace(client=lambda *a, **k: client)
    with mock.patch.dict(os.environ, ENV), mock.patch.dict(sys.modules, {"boto3": fake_boto3}), \
            mock.patch.object(recording.time, "sleep") as sleep:
        key = recording.upload_recording(path, 2, 1098)
    return key, client, path, sleep


class UploadRetry(unittest.TestCase):
    def test_a_first_try_success_uploads_once(self):
        key, client, path, sleep = _run(0)
        self.assertEqual(key, "recordings/2/1098.wav")
        self.assertEqual(client.calls, 1)
        sleep.assert_not_called()
        self.assertFalse(os.path.exists(path))

    def test_two_transient_failures_still_save_the_recording(self):
        key, client, path, sleep = _run(2)
        self.assertEqual(key, "recordings/2/1098.wav")
        self.assertEqual(client.calls, 3)
        self.assertEqual(sleep.call_count, 2)
        self.assertFalse(os.path.exists(path))

    def test_a_persistent_failure_gives_up_cleanly(self):
        key, client, path, _ = _run(99)
        self.assertIsNone(key)
        self.assertEqual(client.calls, 3)
        self.assertFalse(os.path.exists(path))


if __name__ == "__main__":
    unittest.main()
