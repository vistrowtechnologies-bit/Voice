"""Nurture sequences, agent side (owner, 22 Oct 2026: calls on day 2, 5 and
10, Sundays skipped): when the agent writes a nurture step's last no-answer
(record_campaign_voicemail, finish_campaign_contact), the follow-up moves to
the next step instead of ending. Mirrors server/test_nurture_sequences.py.

Runs against a real Postgres (TEST_DATABASE_URL): the point is the SQL."""
import datetime
import json
import os
import unittest
from zoneinfo import ZoneInfo

TEST_DB = os.environ.get("TEST_DATABASE_URL")
IST = ZoneInfo("Asia/Kolkata")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class AgentAdvanceOnNoAnswer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import db
        import dbconn

        cls.db, cls.dbconn = db, dbconn
        conn = dbconn.connect()
        try:
            with conn:
                cls.a = conn.execute("INSERT INTO accounts (name) VALUES ('NA') RETURNING id").fetchone()["id"]
                cls.agent = conn.execute(
                    "INSERT INTO agents (account_id, name) VALUES (?, 'N') RETURNING id", (cls.a,)).fetchone()["id"]
                cls.camp = conn.execute(
                    "INSERT INTO campaigns (account_id, name, agent_id, status, max_attempts, retry_minutes) "
                    "VALUES (?, 'Follow-up calls', ?, 'running', 3, 30) RETURNING id", (cls.a, cls.agent)).fetchone()["id"]
        finally:
            conn.close()
        cls.n = 0

    def _contact(self, step, attempts=3):
        type(self).n += 1
        phone = f"+9198711{self.n:05d}"
        fields = {"follow_up_kind": "nurture", "follow_up_step": step,
                  "nurture_origin": datetime.datetime.now(IST).date().isoformat()}
        conn = self.dbconn.connect()
        try:
            with conn:
                return conn.execute(
                    "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, custom_fields, status, attempts) "
                    "VALUES (?, ?, 'L', ?, ?, ?, 'calling', ?) RETURNING id",
                    (self.camp, self.a, phone, self.db._normalize_dnc_phone(phone, self.a), json.dumps(fields), attempts),
                ).fetchone()["id"]
        finally:
            conn.close()

    def _row(self, cid):
        conn = self.dbconn.connect()
        try:
            r = dict(conn.execute("SELECT * FROM campaign_contacts WHERE id = ?", (cid,)).fetchone())
        finally:
            conn.close()
        r["fields"] = json.loads(r["custom_fields"])
        return r

    def test_voicemail_on_the_last_retry_moves_to_the_next_step(self):
        cid = self._contact(1)
        self.db.record_campaign_voicemail(cid, self.camp, "voicemail")
        r = self._row(cid)
        self.assertEqual((r["status"], r["attempts"], r["fields"]["follow_up_step"]), ("pending", 0, 2))
        self.assertTrue(r["outcome"].endswith("moved to step 2"), r["outcome"])
        due = datetime.datetime.strptime(str(r["next_attempt_at"]), "%Y-%m-%d %H:%M:%S").replace(
            tzinfo=datetime.timezone.utc).astimezone(IST)
        self.assertEqual((due.hour, due.minute), (11, 0))
        self.assertNotEqual(due.strftime("%a"), "Sun")

    def test_an_unanswered_call_end_moves_to_the_next_step(self):
        cid = self._contact(2)
        self.db.finish_campaign_contact(cid, self.camp, "no_answer")
        r = self._row(cid)
        self.assertEqual((r["status"], r["fields"]["follow_up_step"]), ("pending", 3))

    def test_a_retry_still_left_or_the_last_step_does_not_advance(self):
        cid = self._contact(1, attempts=1)
        self.db.record_campaign_voicemail(cid, self.camp, "no_answer")
        r = self._row(cid)
        self.assertEqual((r["status"], r["fields"]["follow_up_step"]), ("no_answer", 1))
        cid = self._contact(3)
        self.db.finish_campaign_contact(cid, self.camp, "no_answer")
        r = self._row(cid)
        self.assertEqual((r["status"], r["next_attempt_at"]), ("no_answer", None))


if __name__ == "__main__":
    unittest.main(verbosity=2)
