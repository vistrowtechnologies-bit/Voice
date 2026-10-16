"""Automatic conversation intelligence for finished calls (owner decision
2026-10-16): campaign_dialer.run_auto_analysis_once, kicked from the dialer
tick. Runs against a throwaway Postgres (TEST_DATABASE_URL); the model call
(call_intelligence.analyze_transcript) is faked, so no network and no cost."""
import datetime
import json
import os
import sys
import threading
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

TEST_DB = os.environ.get("TEST_DATABASE_URL")

INTEL = {"summary": "Asked about 2BHK.", "sentiment": "positive", "outcome": "qualified", "qa_score": 90,
         "disqualification_reason": "", "key_points": [], "action_items": []}
TURNS = [{"role": "assistant", "text": "Namaste, how can I help?"},
         {"role": "user", "text": "I want a 2BHK in Khopoli under 50 lakh."},
         {"role": "assistant", "text": "We have one from 45 lakh."}]


class _Stop(Exception):
    pass


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class AutoCallAnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import call_intelligence
        import calls_db
        import campaign_dialer

        cls.db, cls.dialer, cls.intel = calls_db, campaign_dialer, call_intelligence
        calls_db.init_tables()
        cls._real_analyze = call_intelligence.analyze_transcript

    @classmethod
    def tearDownClass(cls):
        cls.intel.analyze_transcript = cls._real_analyze

    def setUp(self):
        os.environ.pop("AUTO_CALL_ANALYSIS", None)
        stamp = os.urandom(4).hex()
        self.aid = self.db.create_account_with_owner("Acme", "A", f"auto-{stamp}@example.com", "h",
                                                     email_verified=True)["account_id"]
        conn = self.db._connect()
        with conn:
            # Calls other tests left behind are not this test's business.
            conn.execute("UPDATE calls SET intelligence_attempts = 99")
        conn.close()
        self.sent = []
        self.fail_with = None
        self.intel.analyze_transcript = self._fake_analyze

    def _fake_analyze(self, transcript, usage_out=None):
        self.sent.append(transcript)
        if self.fail_with:
            raise self.fail_with
        if usage_out is not None:
            usage_out.update({"model": "fake", "prompt_tokens": 900, "completion_tokens": 120, "cached_tokens": 0})
        return dict(INTEL)

    def call(self, ended_ago_s=600, turns=TURNS, room=None, test_run_id=""):
        now = datetime.datetime.now(datetime.timezone.utc)
        ended = now - datetime.timedelta(seconds=ended_ago_s)
        started = ended - datetime.timedelta(seconds=90)
        conn = self.db._connect()
        with conn:
            row = conn.execute(
                "INSERT INTO calls (account_id, room_name, started_at, ended_at, duration_seconds, "
                "transcript_json, call_type, test_run_id) VALUES (?, ?, ?, ?, 90, ?, 'phone', ?) RETURNING id",
                (self.aid, room or f"call-{os.urandom(6).hex()}", started.isoformat(), ended.isoformat(),
                 json.dumps(turns), test_run_id),
            ).fetchone()
        conn.close()
        return row["id"]

    def row(self, call_id):
        conn = self.db._connect()
        row = conn.execute(
            "SELECT intelligence_json, intelligence_attempts, intelligence_error FROM calls WHERE id = ?",
            (call_id,),
        ).fetchone()
        conn.close()
        return dict(row)

    def age_attempt(self, call_id):
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE calls SET intelligence_attempted_at = '2000-01-01 00:00:00' WHERE id = ?", (call_id,))
        conn.close()

    def test_eligible_call_is_analyzed_and_saved(self):
        call_id = self.call()
        self.assertEqual(self.dialer.run_auto_analysis_once(), 1)
        self.assertEqual(self.db.get_call_intelligence(call_id, self.aid)["outcome"], "qualified")
        self.assertEqual(len(self.sent), 1)
        # Analyzed calls are never sent again.
        self.assertEqual(self.dialer.run_auto_analysis_once(), 0)
        self.assertEqual(len(self.sent), 1)

    def test_ineligible_calls_are_skipped(self):
        skipped = [
            self.call(test_run_id="run-1"),                          # Testing Lab run
            self.call(room=f"test-agent-1-{os.urandom(3).hex()}"),    # dashboard Test Call
            self.call(room=f"test-phone-{os.urandom(3).hex()}"),
            self.call(turns=TURNS[:1]),                              # one turn
            self.call(turns=[]),
            self.call(ended_ago_s=30),                               # too recent
            self.call(ended_ago_s=26 * 3600),                        # older than 24 h
        ]
        done = self.call()
        self.db.save_call_intelligence(done, self.aid, {"outcome": "other"})  # already analyzed
        self.assertEqual(self.dialer.run_auto_analysis_once(), 0)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.db.get_call_intelligence(done, self.aid), {"outcome": "other"})
        for call_id in skipped:
            self.assertIn(self.row(call_id)["intelligence_json"] or "", ("",), call_id)

    def test_short_transcript_is_not_looked_at_again(self):
        call_id = self.call(turns=TURNS[:1])
        self.dialer.run_auto_analysis_once()
        self.assertEqual(self.row(call_id)["intelligence_attempts"], self.db.AUTO_ANALYSIS_MAX_ATTEMPTS)
        self.assertEqual(self.sent, [])

    def test_cap_per_pass(self):
        ids = [self.call() for _ in range(7)]
        self.assertEqual(self.dialer.run_auto_analysis_once(), 5)
        self.assertEqual(len(self.sent), 5)
        self.assertEqual(self.dialer.run_auto_analysis_once(), 2)
        self.assertTrue(all(self.row(i)["intelligence_json"] for i in ids))

    def test_failures_counted_and_stop_after_three(self):
        call_id = self.call()
        self.fail_with = RuntimeError("Analysis model returned HTTP 500")
        self.dialer.run_auto_analysis_once()
        self.assertEqual(self.row(call_id)["intelligence_attempts"], 1)
        self.assertIn("HTTP 500", self.row(call_id)["intelligence_error"])
        # Not retried within the back-off window.
        self.dialer.run_auto_analysis_once()
        self.assertEqual(len(self.sent), 1)
        for expected in (2, 3):
            self.age_attempt(call_id)
            self.dialer.run_auto_analysis_once()
            self.assertEqual(self.row(call_id)["intelligence_attempts"], expected)
        self.age_attempt(call_id)
        self.dialer.run_auto_analysis_once()
        self.assertEqual(len(self.sent), 3)
        self.assertEqual(self.row(call_id)["intelligence_json"] or "", "")

    def test_claim_is_single_runner(self):
        call_id = self.call()
        self.assertTrue(self.db.claim_auto_analysis(call_id, self.aid))
        self.assertFalse(self.db.claim_auto_analysis(call_id, self.aid))

    def test_flag_off_does_nothing(self):
        call_id = self.call()
        for off in ("0", "false", "off"):
            os.environ["AUTO_CALL_ANALYSIS"] = off
            self.assertEqual(self.dialer.run_auto_analysis_once(), 0)
        self.assertEqual(self.sent, [])
        self.assertEqual(self.row(call_id)["intelligence_attempts"], 0)

    def test_analysis_error_does_not_stop_dialing(self):
        d = self.dialer
        saved = {n: getattr(d, n) for n in ("_kick_auto_analysis", "_dial_one", "_report_exhausted_contacts",
                                             "_deliver_idle_widget_chats", "_wake")}
        dialed = []

        def boom():
            raise RuntimeError("analysis exploded")

        class _Wake:
            def wait(self, _):
                raise _Stop

        try:
            d._kick_auto_analysis = boom
            d._dial_one = dialed.append
            d._report_exhausted_contacts = lambda: None
            d._deliver_idle_widget_chats = lambda: None
            d._wake = _Wake()
            real_running = d.calls_db.running_campaigns
            d.calls_db.running_campaigns = lambda: [{"id": 1, "name": "c"}]
            try:
                with self.assertRaises(_Stop):
                    d._loop()
            finally:
                d.calls_db.running_campaigns = real_running
        finally:
            for n, v in saved.items():
                setattr(d, n, v)
        self.assertEqual(dialed, [{"id": 1, "name": "c"}])

    def test_kick_runs_in_background_and_is_throttled(self):
        call_id = self.call()
        d = self.dialer
        d._auto_analysis_thread, d._auto_analysis_last_start = None, 0.0
        d._kick_auto_analysis()
        first = d._auto_analysis_thread
        self.assertIsInstance(first, threading.Thread)
        first.join(30)
        self.assertTrue(self.row(call_id)["intelligence_json"])
        d._kick_auto_analysis()  # within the minute: no new pass
        self.assertIs(d._auto_analysis_thread, first)


if __name__ == "__main__":
    unittest.main()
