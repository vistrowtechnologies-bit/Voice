"""Offline tests for deleting recordings to free storage. No database, no bucket."""
import unittest
from unittest.mock import MagicMock, patch

import calls_db


def _conn(rows):
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = rows
    return conn


class DeleteCallRecordingsTests(unittest.TestCase):
    def _run(self, rows, *, gone, **kwargs):
        selects, updates = _conn(rows), MagicMock()
        conns = iter([selects, updates])
        with patch.object(calls_db, "_connect", side_effect=lambda: next(conns)), \
                patch.object(calls_db, "_remove_recording_objects", return_value=set(gone)) as remove, \
                patch.object(calls_db.storage_usage, "account_storage_bytes", side_effect=[1000, 400]), \
                patch.object(calls_db.storage_usage, "forget"):
            result = calls_db.delete_call_recordings(7, **kwargs)
        return result, selects, updates, remove

    def test_exactly_one_selector_is_required(self):
        with self.assertRaises(ValueError):
            calls_db.delete_call_recordings(7)
        with self.assertRaises(ValueError):
            calls_db.delete_call_recordings(7, call_id=1, older_than_days=30)
        with self.assertRaises(ValueError):
            calls_db.delete_call_recordings(7, older_than_days=0)

    def test_selection_is_scoped_to_the_account(self):
        _, selects, _, _ = self._run([{"id": 1, "recording_key": "recordings/7/1.wav"}],
                                     gone={"recordings/7/1.wav"}, older_than_days=90)
        sql, params = selects.execute.call_args.args
        self.assertIn("account_id = ?", sql)
        self.assertEqual(params, (7, 90))
        _, selects, _, _ = self._run([{"id": 5, "recording_key": "recordings/7/5.wav"}],
                                     gone={"recordings/7/5.wav"}, call_id=5)
        self.assertEqual(selects.execute.call_args.args[1], (5, 7))

    def test_deletes_audio_then_clears_pointers_and_reports_freed_bytes(self):
        rows = [{"id": 1, "recording_key": "recordings/7/1.wav"}, {"id": 2, "recording_key": "recordings/7/2.wav"}]
        result, _, updates, remove = self._run(rows, gone={"recordings/7/1.wav", "recordings/7/2.wav"}, older_than_days=30)
        self.assertEqual(result, {"deleted": 2, "failed": 0, "freedBytes": 600})
        remove.assert_called_once_with(["recordings/7/1.wav", "recordings/7/2.wav"])
        sql, params = updates.execute.call_args.args
        self.assertIn("recording_key = NULL", sql)
        self.assertIn("recording_status = 'deleted'", sql)
        self.assertEqual(params, (7, 1, 2))

    def test_a_failed_object_delete_keeps_that_calls_pointer(self):
        rows = [{"id": 1, "recording_key": "recordings/7/1.wav"}, {"id": 2, "recording_key": "recordings/7/2.wav"}]
        result, _, updates, _ = self._run(rows, gone={"recordings/7/1.wav"}, older_than_days=30)
        self.assertEqual((result["deleted"], result["failed"]), (1, 1))
        self.assertEqual(updates.execute.call_args.args[1], (7, 1))

    def test_never_deletes_an_object_outside_the_accounts_prefix(self):
        rows = [{"id": 1, "recording_key": "recordings/8/1.wav"}, {"id": 2, "recording_key": "recordings/7/2.wav"}]
        result, _, _, remove = self._run(rows, gone={"recordings/7/2.wav"}, older_than_days=30)
        remove.assert_called_once_with(["recordings/7/2.wav"])
        self.assertEqual((result["deleted"], result["failed"]), (1, 1))

    def test_nothing_to_delete_does_not_touch_storage(self):
        conns = iter([_conn([])])
        with patch.object(calls_db, "_connect", side_effect=lambda: next(conns)), \
                patch.object(calls_db, "_remove_recording_objects") as remove:
            self.assertEqual(calls_db.delete_call_recordings(7, older_than_days=30), {"deleted": 0, "failed": 0, "freedBytes": 0})
        remove.assert_not_called()


class RemoveObjectsTests(unittest.TestCase):
    def test_reports_which_keys_are_gone(self):
        client = MagicMock()
        client.delete_objects.return_value = {"Errors": [{"Key": "b", "Code": "InternalError"}]}
        with patch.object(calls_db, "b2_client", return_value=(client, "bucket")):
            self.assertEqual(calls_db._remove_recording_objects(["a", "b", "c"]), {"a", "c"})

    def test_an_already_missing_object_counts_as_gone(self):
        client = MagicMock()
        client.delete_objects.return_value = {"Errors": [{"Key": "a", "Code": "NoSuchKey"}]}
        with patch.object(calls_db, "b2_client", return_value=(client, "bucket")):
            self.assertEqual(calls_db._remove_recording_objects(["a"]), {"a"})

    def test_a_failed_batch_deletes_nothing_and_does_not_raise(self):
        client = MagicMock()
        client.delete_objects.side_effect = RuntimeError("down")
        with patch.object(calls_db, "b2_client", return_value=(client, "bucket")):
            self.assertEqual(calls_db._remove_recording_objects(["a"]), set())

    def test_not_configured_is_reported(self):
        with patch.object(calls_db, "b2_client", return_value=(None, None)):
            with self.assertRaises(calls_db.StorageNotConfigured):
                calls_db._remove_recording_objects(["a"])

    def test_large_deletes_are_batched_at_1000(self):
        client = MagicMock()
        client.delete_objects.return_value = {}
        keys = [f"k{i}" for i in range(2500)]
        with patch.object(calls_db, "b2_client", return_value=(client, "bucket")):
            self.assertEqual(len(calls_db._remove_recording_objects(keys)), 2500)
        self.assertEqual(client.delete_objects.call_count, 3)


if __name__ == "__main__":
    unittest.main()
