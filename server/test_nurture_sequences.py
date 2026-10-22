"""Nurture sequences (owner, 22 Oct 2026: calls on day 2, 5 and 10, Sundays
skipped): when a nurture step's retries run out with no answer, the follow-up
moves to the next step instead of ending. record_campaign_dial_result is the
server's terminal writer; agent/db.py has the same rule for the agent's.

Runs against a real Postgres (TEST_DATABASE_URL): the point is the SQL and
the guards that keep a changed row (cancelled, re-claimed) untouched."""
import datetime
import json
import os
import unittest
from zoneinfo import ZoneInfo

import calls_db
import retry_rules

TEST_DB = os.environ.get("TEST_DATABASE_URL")
IST = ZoneInfo("Asia/Kolkata")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class AdvanceOnNoAnswer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("N", "N", f"ns-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        try:
            with conn:
                cls.agent = conn.execute("SELECT MIN(id) id FROM agents WHERE account_id = ?", (cls.a,)).fetchone()["id"]
                cls.camp = conn.execute(
                    "INSERT INTO campaigns (account_id, name, agent_id, status, max_attempts, retry_minutes) "
                    "VALUES (?, 'Follow-up calls', ?, 'running', 3, 30) RETURNING id", (cls.a, cls.agent)).fetchone()["id"]
                cls.bulk = conn.execute(
                    "INSERT INTO campaigns (account_id, name, agent_id, status, max_attempts, retry_minutes) "
                    "VALUES (?, 'Diwali offer', ?, 'running', 1, 30) RETURNING id", (cls.a, cls.agent)).fetchone()["id"]
        finally:
            conn.close()
        cls.n = 0

    def _contact(self, fields, campaign=None, attempts=3, phone=None):
        type(self).n += 1
        phone = phone or f"+9198700{self.n:05d}"
        conn = calls_db._connect()
        try:
            with conn:
                return conn.execute(
                    "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, custom_fields, status, attempts) "
                    "VALUES (?, ?, 'L', ?, ?, ?, 'calling', ?) RETURNING id",
                    (campaign or self.camp, self.a, phone, calls_db._normalize_phone(phone, self.a), json.dumps(fields), attempts),
                ).fetchone()["id"]
        finally:
            conn.close()

    def _row(self, cid):
        conn = calls_db._connect()
        try:
            r = dict(conn.execute("SELECT * FROM campaign_contacts WHERE id = ?", (cid,)).fetchone())
        finally:
            conn.close()
        r["fields"] = json.loads(r["custom_fields"])
        return r

    def _set_policy(self, policy):
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute("UPDATE agents SET follow_up_policy = ? WHERE id = ?", (json.dumps(policy), self.agent))
        finally:
            conn.close()

    def setUp(self):
        self._set_policy({})

    def _nurture(self, step=1, origin=None):
        origin = origin or datetime.datetime.now(IST).date().isoformat()
        return {"follow_up_kind": "nurture", "follow_up_step": step, "nurture_origin": origin}

    def test_exhausted_step_moves_to_the_next_one(self):
        cid = self._contact(self._nurture(1))
        calls_db.record_campaign_dial_result(cid, self.camp, "no_answer")
        r = self._row(cid)
        self.assertEqual((r["status"], r["attempts"], r["fields"]["follow_up_step"]), ("pending", 0, 2))
        self.assertTrue(r["outcome"].endswith("moved to step 2"), r["outcome"])
        due = datetime.datetime.strptime(r["next_attempt_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc).astimezone(IST)
        self.assertEqual((due.hour, due.minute), (11, 0))
        self.assertNotEqual(due.strftime("%a"), "Sun")
        origin = datetime.date.fromisoformat(r["fields"]["nurture_origin"])
        self.assertGreaterEqual(due.date(), origin + datetime.timedelta(days=5))

    def test_a_retry_still_left_does_not_advance(self):
        cid = self._contact(self._nurture(1), attempts=1)
        calls_db.record_campaign_dial_result(cid, self.camp, "no_answer")
        r = self._row(cid)
        self.assertEqual((r["status"], r["fields"]["follow_up_step"]), ("no_answer", 1))
        self.assertIsNotNone(r["next_attempt_at"])

    def test_the_last_step_ends(self):
        cid = self._contact(self._nurture(3))
        calls_db.record_campaign_dial_result(cid, self.camp, "no_answer")
        r = self._row(cid)
        self.assertEqual((r["status"], r["next_attempt_at"]), ("no_answer", None))

    def test_dnc_or_a_booking_since_stops_it(self):
        cid = self._contact(self._nurture(1))
        conn = calls_db._connect()
        try:
            with conn:
                p = self._row(cid)["phone"]
                conn.execute("INSERT INTO dnc_list (account_id, phone, phone_norm) VALUES (?, ?, ?)",
                             (self.a, p, calls_db._normalize_phone(p, self.a)))
        finally:
            conn.close()
        calls_db.record_campaign_dial_result(cid, self.camp, "no_answer")
        self.assertEqual(self._row(cid)["status"], "no_answer")

        cid = self._contact(self._nurture(1))
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO appointments (account_id, contact_name, contact_phone, appt_date, start_time, status, source) "
                    "VALUES (?, 'L', ?, '2026-11-02', '10:00', 'confirmed', 'manual')", (self.a, self._row(cid)["phone"]))
        finally:
            conn.close()
        calls_db.record_campaign_dial_result(cid, self.camp, "voicemail")
        self.assertEqual(self._row(cid)["status"], "voicemail")

    def test_only_nurture_in_the_follow_up_campaign_and_only_when_switched_on(self):
        cid = self._contact({"follow_up_kind": "callback"})
        calls_db.record_campaign_dial_result(cid, self.camp, "no_answer")
        self.assertEqual(self._row(cid)["status"], "no_answer")
        cid = self._contact(self._nurture(1), campaign=self.bulk, attempts=1)
        calls_db.record_campaign_dial_result(cid, self.bulk, "no_answer")
        self.assertEqual(self._row(cid)["status"], "no_answer")
        self._set_policy({"nurtureAdvanceOnNoAnswer": False})
        cid = self._contact(self._nurture(1))
        calls_db.record_campaign_dial_result(cid, self.camp, "no_answer")
        self.assertEqual(self._row(cid)["status"], "no_answer")

    def test_a_row_that_changed_is_left_alone(self):
        cid = self._contact(self._nurture(1))
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute("UPDATE campaign_contacts SET status = 'cancelled' WHERE id = ?", (cid,))
        finally:
            conn.close()
        # The guarded writer skips it, and the advance must not revive it.
        calls_db.record_campaign_dial_result(cid, self.camp, "no_answer", only_if_calling=True)
        self.assertEqual(self._row(cid)["status"], "cancelled")
        calls_db._advance_nurture_after_no_answer(cid)
        self.assertEqual(self._row(cid)["status"], "cancelled")

    def test_sunday_moves_to_monday(self):
        friday = datetime.datetime(2026, 10, 16, 10, 0, tzinfo=IST)
        at = retry_rules.nurture_step_at(retry_rules.follow_up_policy(""), friday.date(), 1, friday)
        self.assertEqual(at, datetime.datetime(2026, 10, 19, 11, 0, tzinfo=IST))


if __name__ == "__main__":
    unittest.main(verbosity=2)
