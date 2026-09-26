"""db_backup: a backup that reached B2 is not reported as FAILED just because
recording its run date failed (2026-09-25: relation "settings" does not
exist), and the scheduler does not redo it every 30 minutes."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db_backup


class RecordingFailsAfterUpload(unittest.TestCase):
    def setUp(self):
        db_backup._last_ok_date = None
        env = {"DATABASE_URL": "postgresql://x", "B2_BUCKET_NAME": "b"}
        self.patches = [
            mock.patch.dict(os.environ, env),
            mock.patch.object(db_backup.subprocess, "run", return_value=mock.Mock(returncode=0)),
            mock.patch.object(db_backup.os.path, "getsize", return_value=1024 * 1024),
            mock.patch.object(db_backup, "_b2_client", return_value=mock.Mock()),
            mock.patch.object(db_backup, "_prune_old_backups", return_value=0),
        ]
        for p in self.patches:
            p.start()
        self.notify = mock.patch.object(db_backup, "_notify").start()
        self.addCleanup(mock.patch.stopall)

    def test_upload_ok_but_settings_missing_is_not_a_failure(self):
        with mock.patch.object(
            db_backup.calls_db, "set_setting", side_effect=Exception('relation "settings" does not exist')
        ):
            result = db_backup.run_backup_now()
        self.assertTrue(result["ok"])
        self.assertIn("settings", result["warning"])
        self.notify.assert_called_once()
        self.assertNotIn("FAILED", self.notify.call_args.args[0])
        self.assertEqual(db_backup._last_ok_date, result["key"][-15:-5])

    def test_clean_run_sends_no_email(self):
        with mock.patch.object(db_backup.calls_db, "set_setting"):
            result = db_backup.run_backup_now()
        self.assertTrue(result["ok"])
        self.notify.assert_not_called()

    def test_dump_failure_still_emails_failed(self):
        db_backup.subprocess.run.return_value = mock.Mock(returncode=1, stderr="boom")
        result = db_backup.run_backup_now()
        self.assertFalse(result["ok"])
        self.assertIn("FAILED", self.notify.call_args.args[0])
        self.assertIsNone(db_backup._last_ok_date)


if __name__ == "__main__":
    unittest.main(verbosity=2)
