"""Campaign concurrency accounting.

Campaign 20 (2026-09-17): 16 real leads, concurrency 3. The dialer marked
each contact 'done' the instant the dial was handed off, so
campaign_inflight() (which counts 'calling') always read 0, every 15s tick
launched 3 more on top of calls still live, and live calls peaked at 10.
Audio broke up on the calls that did connect, and the dashboard's "Answered"
(= done) read 10 when 3 people actually talked.

Two layers of test:
  * SQL-shape tests on the REAL calls_db functions, pinning the semantics.
  * A replay of campaign 20 through the REAL dialer loop against an in-memory
    store implementing those same semantics, asserting the cap holds.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import calls_db
import campaign_dialer


class CapturingConn:
    def __init__(self, reads=None, rowcount=1):
        self.reads, self.writes, self.rowcount = list(reads or []), [], rowcount

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def close(self):
        pass

    def execute(self, sql, params=()):
        cur = MagicMock()
        if sql.lstrip().upper().startswith("SELECT"):
            val = self.reads.pop(0) if self.reads else None
            cur.fetchone.return_value = val
            cur.fetchall.return_value = val or []
        else:
            self.writes.append((" ".join(sql.split()), params))
            cur.rowcount = self.rowcount
        return cur


class RealSqlSemantics(unittest.TestCase):
    def test_placed_keeps_the_contact_in_flight(self):
        conn = CapturingConn(reads=[{"max_attempts": 1, "retry_minutes": 60}, {"attempts": 1}])
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.record_campaign_dial_result(5, 20, "placed", room_name="phone-91x_vistrow-ab")
        sql, params = conn.writes[0]
        self.assertNotIn("'done'", sql)
        self.assertIn("AND status = 'calling'", sql)
        self.assertIn("phone-91x_vistrow-ab", params)

    def test_only_if_calling_guards_every_resolution(self):
        for outcome in ("failed", "no_answer", "blocked"):
            conn = CapturingConn(reads=[{"max_attempts": 2, "retry_minutes": 60}, {"attempts": 1}])
            with patch.object(calls_db, "_connect", return_value=conn):
                calls_db.record_campaign_dial_result(5, 20, outcome, only_if_calling=True)
            self.assertIn("AND status = 'calling'", conn.writes[0][0], outcome)

    def test_null_retry_policy_does_not_strand_the_contact(self):
        conn = CapturingConn(reads=[{"max_attempts": None, "retry_minutes": None}, {"attempts": None}])
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.record_campaign_dial_result(5, 20, "failed")
        self.assertEqual(len(conn.writes), 1)

    def test_claim_is_conditional_and_loses_races_cleanly(self):
        row = {"id": 9, "status": "pending", "phone": "+91900", "name": "x"}
        conn = CapturingConn(reads=[row], rowcount=0)
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertIsNone(calls_db.claim_next_campaign_contact(20))
        self.assertIn("AND status = ?", conn.writes[0][0])
        self.assertEqual(conn.writes[0][1], (9, "pending"))


class Reaper(unittest.TestCase):
    def _run(self, rows):
        conn = CapturingConn(reads=[rows])
        with patch.object(calls_db, "_connect", return_value=conn), \
             patch.object(calls_db, "record_campaign_dial_result") as rec:
            n = calls_db.reap_stale_campaign_calls(20)
        return n, rec

    def test_live_room_is_never_reaped_however_old(self):
        n, rec = self._run([{"id": 1, "last_attempt_at": "2000-01-01 00:00:00", "room_name": "r", "live": True}])
        self.assertEqual(n, 0); rec.assert_not_called()

    def test_dead_room_past_grace_is_reaped_without_clobbering(self):
        n, rec = self._run([{"id": 1, "last_attempt_at": "2000-01-01 00:00:00", "room_name": "r", "live": False}])
        self.assertEqual(n, 1)
        rec.assert_called_once_with(1, 20, "failed", only_if_calling=True)

    def test_recent_dial_is_left_alone(self):
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        n, rec = self._run([{"id": 1, "last_attempt_at": now, "room_name": "r", "live": False}])
        self.assertEqual(n, 0)

    def test_no_room_uses_the_long_grace(self):
        import datetime
        ten_min = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")
        n, _ = self._run([{"id": 1, "last_attempt_at": ten_min, "room_name": None, "live": False}])
        self.assertEqual(n, 0)


class ReplayCampaign20(unittest.TestCase):
    """16 contacts, concurrency 3, 15s ticks, 50s calls - through the real dialer."""

    def _replay(self, placed_marks_done: bool):
        clock = {"t": 0.0}
        contacts = {i: {"id": i, "phone": f"+9190000{i:05d}", "name": f"lead{i}", "status": "pending"} for i in range(16)}
        call_end = {}
        peak = {"live": 0}

        db = MagicMock()
        db.within_calling_window.return_value = (True, "")
        db.concurrent_call_limit.return_value = 10 ** 9   # platform-owner account
        db.count_active_calls.return_value = 0
        db.reap_stale_campaign_calls.return_value = 0
        db.campaign_inflight.side_effect = lambda cid: sum(c["status"] == "calling" for c in contacts.values())

        def claim(cid):
            for c in contacts.values():
                if c["status"] == "pending":
                    c["status"] = "calling"
                    return dict(c)
            return None

        def place(phone, *a, **k):
            cid = k["campaign_contact_id"]
            call_end[cid] = clock["t"] + 50.0
            live = sum(1 for e in call_end.values() if e > clock["t"])
            peak["live"] = max(peak["live"], live)
            return {"ok": True, "room": f"room-{cid}"}

        def record(cid, camp, outcome, **k):
            if outcome == "placed" and placed_marks_done:
                contacts[cid]["status"] = "done"

        db.claim_next_campaign_contact.side_effect = claim
        db.place_outbound_call_direct.side_effect = place
        db.record_campaign_dial_result.side_effect = record
        db.campaign_has_open_work.side_effect = lambda cid: any(c["status"] in ("pending", "calling") for c in contacts.values())

        def sleep(s):
            clock["t"] += s

        with patch.object(campaign_dialer, "calls_db", db), \
             patch.object(campaign_dialer, "_on_orchestrator_pipeline", return_value=False), \
             patch.object(campaign_dialer.time, "sleep", side_effect=sleep):
            campaign = {"id": 20, "account_id": 2, "from_number": "+917713128715", "agent_id": 26, "concurrency": 3}
            for _ in range(200):
                # agent reconciles calls that have ended
                for cid, end in call_end.items():
                    if end <= clock["t"] and contacts[cid]["status"] == "calling":
                        contacts[cid]["status"] = "done"
                campaign_dialer._dial_one(campaign)
                if all(c["status"] == "done" for c in contacts.values()):
                    break
                clock["t"] += campaign_dialer._TICK_SECONDS
        return peak["live"], all(c["status"] == "done" for c in contacts.values())

    def test_fixed_dialer_never_exceeds_configured_concurrency(self):
        peak, finished = self._replay(placed_marks_done=False)
        self.assertLessEqual(peak, 3)
        self.assertTrue(finished)

    def test_old_behaviour_reproduces_the_incident(self):
        # Documents what happened on 2026-09-17, so this file stands alone.
        peak, _ = self._replay(placed_marks_done=True)
        self.assertGreaterEqual(peak, 9)


class LeakedActiveCallRows(unittest.TestCase):
    """A worker that dies mid-call never deletes its active_calls row. Found
    live 2026-09-18: a room started 2026-09-03 was still holding one of
    Prophunt's 30 concurrent-call slots."""

    def test_count_ignores_rows_older_than_any_real_call(self):
        conn = CapturingConn(reads=[{"c": 0}])
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.count_active_calls(1)
        self.assertEqual(calls_db._ACTIVE_CALL_MAX_AGE_S, 4 * 60 * 60)

    def test_count_query_carries_the_cutoff(self):
        seen = {}

        class Probe(CapturingConn):
            def execute(self, sql, params=()):
                seen["sql"] = " ".join(sql.split())
                return super().execute(sql, params)

        with patch.object(calls_db, "_connect", return_value=Probe(reads=[{"c": 3}])):
            self.assertEqual(calls_db.count_active_calls(1), 3)
        self.assertIn("started_at::timestamp >", seen["sql"])
        self.assertIn("interval '4 hours'", seen["sql"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
