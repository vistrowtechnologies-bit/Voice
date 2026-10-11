"""Operator alert worker: who gets it, the staging gate, the 6-hour dedupe
(one-off events only once), retry after a failed send, and the checks
themselves against a throwaway Postgres. No real email is sent."""
import datetime
import json
import os
import unittest
from unittest import mock

import ops_alert_worker as worker

TEST_DB = os.environ.get("TEST_DATABASE_URL")


class DecisionTests(unittest.TestCase):
    def setUp(self):
        self.store = {}
        patches = [
            mock.patch.object(worker.calls_db, "get_setting", side_effect=lambda k, a: self.store.get((a, k))),
            mock.patch.object(worker.calls_db, "set_setting", side_effect=lambda k, v, a: self.store.__setitem__((a, k), v)),
            mock.patch.object(worker, "recipient", return_value="ops@example.com"),
            mock.patch.object(worker.email_sender, "render_email", return_value="<html>"),
        ]
        self.send = mock.patch.object(worker.email_sender, "send_email", return_value=True).start()
        for p in patches:
            p.start()
        self.addCleanup(mock.patch.stopall)
        self.after = mock.MagicMock()
        self.alerts = [
            worker._alert("failed_calls", "5 failed calls", "<p>x</p>"),
            worker._alert("invoice_failed:7", "Payment failed", "<p>y</p>", repeat_s=None, after_send=self.after),
        ]
        mock.patch.object(worker, "gather", side_effect=lambda now: self.alerts).start()

    def test_each_key_at_most_once_per_six_hours_and_one_offs_once(self):
        t0 = 1_760_000_000
        self.assertEqual(worker.run_once(t0), 2)
        self.assertEqual(self.send.call_args_list[0].args[:2], ("ops@example.com", "Vistrow ops: 5 failed calls"))
        self.after.assert_called_once()
        self.assertEqual(worker.run_once(t0 + 600), 0)
        self.assertEqual(worker.run_once(t0 + 6 * 3600 - 1), 0)
        self.assertEqual(worker.run_once(t0 + 6 * 3600), 1, "the repeating alert again, the one-off never")
        self.assertEqual(self.send.call_count, 3)

    def test_a_failed_send_is_retried_next_tick(self):
        self.send.return_value = False
        self.assertEqual(worker.run_once(1_000), 0)
        self.after.assert_not_called()
        self.assertEqual(self.store, {})
        self.send.return_value = True
        self.assertEqual(worker.run_once(1_600), 2)

    def test_no_recipient_sends_nothing(self):
        worker.recipient.return_value = None
        self.assertEqual(worker.run_once(1_000), 0)
        self.send.assert_not_called()


class RecipientTests(unittest.TestCase):
    def test_staging_is_silent_unless_an_address_is_set(self):
        with mock.patch.dict(os.environ, {"APP_ENV": "staging", "OPS_ALERT_EMAIL": ""}), \
                mock.patch.object(worker.calls_db, "_connect", side_effect=AssertionError("must not look up the owner")):
            self.assertIsNone(worker.recipient())
            with mock.patch.object(worker.email_sender, "send_email") as send:
                self.assertEqual(worker.run_once(1_000), 0)
                send.assert_not_called()
        with mock.patch.dict(os.environ, {"APP_ENV": "staging", "OPS_ALERT_EMAIL": "qa@example.com"}):
            self.assertEqual(worker.recipient(), "qa@example.com")

    def test_disabled_flag_keeps_the_thread_off(self):
        with mock.patch.dict(os.environ, {"DISABLE_NOTIFICATIONS": "1"}), mock.patch.object(worker.threading, "Thread") as thread:
            worker.start_ops_alert_worker()
            thread.assert_not_called()


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class CheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()

    def sql(self, query, params=()):
        conn = self.db._connect()
        with conn:
            cur = conn.execute(query, params)
            row = cur.fetchone() if "RETURNING" in query.upper() else None
        conn.close()
        return row

    def test_checks_find_each_alert(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        text = lambda **d: (now + datetime.timedelta(**d)).strftime("%Y-%m-%d %H:%M:%S")  # noqa: E731
        stamp = os.urandom(4).hex()
        aid = self.db.create_account_with_owner("Z", "Z", f"z-{stamp}@example.com", "h", email_verified=True)["account_id"]
        self.db.end_trial(aid)
        self.sql("INSERT INTO settings (account_id, key, value) VALUES (?, 'credits_total', '1') "
                 "ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value", (aid,))
        self.sql("INSERT INTO agents (account_id, name, status) VALUES (?, 'A', 'live')", (aid,))
        for _ in range(5):
            self.sql("INSERT INTO calls (room_name, started_at, ended_at, duration_seconds, transcript_json, account_id, failure_reason) "
                     "VALUES ('r', ?, ?, 120, '[]', ?, 'sip 503')", (text(minutes=-5), text(minutes=-5), aid))
        invoice = self.sql("INSERT INTO invoices (account_id, kind, amount_inr, status) VALUES (?, 'topup', 590, 'failed') RETURNING id", (aid,))

        # Errors from earlier tests are history: start the watermark here.
        conn = self.db._connect()
        top = conn.execute("SELECT COALESCE(MAX(id), 0) m FROM error_events").fetchone()["m"]
        conn.close()
        self.db.set_setting(worker._ERRORS_MARK, str(top), 0)
        backup = self.sql("INSERT INTO error_events (source, level, message) VALUES ('db_backup', 'error', 'pg_dump failed') RETURNING id")
        self.sql("INSERT INTO error_events (source, level, message) VALUES ('agent', 'warning', 'just a warning')")
        self.db.set_setting("worker_heartbeat.tenant", json.dumps({"seenAt": text(minutes=-6)}), 0)
        self.db.set_setting("worker_heartbeat.platform-demo", json.dumps({"seenAt": text(seconds=-30)}), 0)
        try:
            alerts = {a["key"]: a for a in worker.gather(now.timestamp())}
        finally:
            self.sql("DELETE FROM settings WHERE account_id = 0 AND starts_with(key, 'worker_heartbeat.')")
        self.assertIn(f"errors:{backup['id']}", alerts, "error-level events batched, warnings left out")
        self.assertIn("1 new platform error", alerts[f"errors:{backup['id']}"]["subject"])
        self.assertIn(f"invoice_failed:{invoice['id']}", alerts)
        self.assertIn(f"zero_balance:{aid}", alerts)
        self.assertIn(f"backup_failed:{backup['id']}", alerts)
        self.assertIn("failed_calls", alerts)
        self.assertIn("worker_stale:tenant", alerts)
        self.assertNotIn("worker_stale:platform-demo", alerts)

        for key in ("failed_calls", "worker_stale:tenant"):  # repeating keys a previous run may have marked
            self.sql("DELETE FROM settings WHERE account_id = 0 AND key = ?", (worker._MARK + key,))
        self.db.set_setting("worker_heartbeat.tenant", json.dumps({"seenAt": text(minutes=-6)}), 0)
        with mock.patch.object(worker, "recipient", return_value="ops@example.com"), \
                mock.patch.object(worker.email_sender, "send_email", return_value=True) as send:
            try:
                first = worker.run_once(now.timestamp())
                self.assertEqual(worker.run_once(now.timestamp() + 60), 0, "nothing twice within 6 hours")
            finally:
                self.sql("DELETE FROM settings WHERE account_id = 0 AND starts_with(key, 'worker_heartbeat.')")
            self.assertEqual(send.call_count, first)
        for key in alerts:
            self.assertIsNotNone(self.db.get_setting(worker._MARK + key, 0), key)
        self.assertEqual(self.db.get_setting(worker._ERRORS_MARK, 0), str(backup["id"]), "watermark moved after the send")

    def test_first_run_records_a_starting_point_without_alerting(self):
        self.sql("DELETE FROM settings WHERE account_id = 0 AND key = ?", (worker._ERRORS_MARK,))
        self.sql("INSERT INTO error_events (source, level, message) VALUES ('agent', 'error', 'old news')")
        self.assertEqual(worker._error_events(), [])
        self.assertIsNotNone(self.db.get_setting(worker._ERRORS_MARK, 0))


if __name__ == "__main__":
    unittest.main()
