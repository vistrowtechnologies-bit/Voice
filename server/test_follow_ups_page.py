"""The Follow-ups page: every follow-up call the AI scheduled (a campaign_contacts
row whose custom_fields carry follow_up_kind), with Call now / Reschedule /
Cancel, plus the bell items for "scheduled" and "AI called". Owner, 22 Oct 2026:
a nurture follow-up rang at 11:00 with nothing on the dashboard beforehand.

Runs against a real Postgres (TEST_DATABASE_URL): the point is the SQL and the
status rules the dialer relies on."""
import datetime
import json
import os
import unittest

import calls_db

TEST_DB = os.environ.get("TEST_DATABASE_URL")


def _utc(minutes: int) -> str:
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class FollowUpsPage(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("F", "F", f"fu-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.other = calls_db.create_account_with_owner("G", "G", f"fu2-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        try:
            with conn:
                agent_id = conn.execute("SELECT MIN(id) id FROM agents WHERE account_id = ?", (cls.a,)).fetchone()["id"]
                cls.campaign = conn.execute(
                    "INSERT INTO campaigns (account_id, name, agent_id, status) VALUES (?, 'Follow-up calls', ?, 'running') RETURNING id",
                    (cls.a, agent_id),
                ).fetchone()["id"]

                def add(name, status, kind, due, *, source=None, call_id=None, last=None, outcome=""):
                    fields = {"follow_up_kind": kind, "follow_up_summary": f"{name} summary"} if kind else {"source": "csv"}
                    if source:
                        fields["previous_call_id"] = source
                    return conn.execute(
                        "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, custom_fields, "
                        "status, next_attempt_at, call_id, last_attempt_at, outcome, attempts) "
                        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id",
                        (cls.campaign, cls.a, name, f"+9198{abs(hash(name)) % 10**8:08d}", f"98{abs(hash(name)) % 10**8:08d}",
                         json.dumps(fields), status, due, call_id, last, outcome, 1 if last else 0),
                    ).fetchone()["id"]

                cls.waiting = add("Asha", "pending", "nurture", _utc(60), source=1430)
                cls.retry = add("Ravi", "no_answer", "callback", _utc(30), source=1431, last=_utc(-5), outcome="no answer")
                cls.done = add("Meera", "done", "visit_reminder", None, source=1432, call_id=1461, last=_utc(-10), outcome="connected")
                cls.gone = add("Kiran", "no_answer", "nurture", None, source=1433, last=_utc(-20), outcome="no answer")
                cls.calling = add("Dev", "calling", "callback", _utc(-1), source=1434)
                cls.plain = add("Csv Lead", "pending", None, None)
        finally:
            conn.close()

    def _ids(self, view):
        return {i["id"] for i in calls_db.list_follow_ups(self.a, view=view)["items"]}

    def test_views_split_by_state(self):
        self.assertEqual(self._ids("upcoming"), {self.waiting, self.retry, self.calling})
        self.assertEqual(self._ids("done"), {self.done, self.gone})
        self.assertNotIn(self.plain, self._ids("all"))  # not a follow-up

    def test_item_fields(self):
        item = next(i for i in calls_db.list_follow_ups(self.a, view="done")["items"] if i["id"] == self.done)
        self.assertEqual((item["kind"], item["label"]), ("visit_reminder", "Appointment reminder"))
        self.assertEqual((item["sourceCallId"], item["callId"]), (1432, 1461))
        self.assertTrue(item["lastAttemptAt"].endswith("Z"))

    def test_upcoming_sorted_by_due_time(self):
        items = calls_db.list_follow_ups(self.a, view="upcoming")["items"]
        self.assertEqual([i["dueAt"] for i in items], sorted(i["dueAt"] for i in items))

    def test_call_page_lookup_by_source_and_follow_up_call(self):
        self.assertEqual([i["id"] for i in calls_db.list_follow_ups(self.a, source_call_id=1430)["items"]], [self.waiting])
        self.assertEqual([i["id"] for i in calls_db.list_follow_ups(self.a, source_call_id=1461)["items"]], [self.done])

    def test_other_account_cannot_see_or_touch(self):
        self.assertEqual(calls_db.list_follow_ups(self.other, view="all")["items"], [])
        with self.assertRaises(LookupError):
            calls_db.act_on_follow_up(self.other, self.waiting, "cancel")

    def test_reschedule_rules(self):
        later = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=5)).isoformat()
        item = calls_db.act_on_follow_up(self.a, self.retry, "reschedule", later)
        self.assertEqual(item["status"], "no_answer")  # a retry keeps its status
        self.assertEqual(item["dueAt"][:16], later[:16])
        for bad in ("2020-01-01T10:00:00+00:00", "tomorrow", "2026-10-22T10:00:00"):
            with self.assertRaises(ValueError, msg=bad):
                calls_db.act_on_follow_up(self.a, self.retry, "reschedule", bad)

    def test_finished_or_calling_cannot_change(self):
        with self.assertRaises(ValueError):
            calls_db.act_on_follow_up(self.a, self.done, "call_now")
        with self.assertRaises(ValueError):
            calls_db.act_on_follow_up(self.a, self.calling, "cancel")

    def test_call_now_makes_it_due_and_the_dialer_claims_it(self):
        conn = calls_db._connect()
        try:
            with conn:  # keep the other waiting rows out of this claim
                conn.execute("UPDATE campaign_contacts SET next_attempt_at = ? WHERE id = ?", (_utc(600), self.retry))
        finally:
            conn.close()
        calls_db.act_on_follow_up(self.a, self.waiting, "call_now")
        claimed = calls_db.claim_next_campaign_contact(self.campaign)
        self.assertIsNotNone(claimed)
        self.assertIn(claimed["id"], {self.waiting, self.plain})
        # Put it back for the other tests.
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute("UPDATE campaign_contacts SET status = 'pending', next_attempt_at = ? WHERE id IN (?, ?)",
                             (_utc(60), self.waiting, self.plain))
        finally:
            conn.close()

    def test_cancel_stops_the_dialer(self):
        conn = calls_db._connect()
        try:
            with conn:
                fid = conn.execute(
                    "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, custom_fields, status, next_attempt_at) "
                    "VALUES (?, ?, 'Nina', '+919811111111', '9811111111', ?, 'pending', ?) RETURNING id",
                    (self.campaign, self.a, json.dumps({"follow_up_kind": "callback"}), _utc(-1)),
                ).fetchone()["id"]
        finally:
            conn.close()
        item = calls_db.act_on_follow_up(self.a, fid, "cancel")
        self.assertEqual((item["state"], item["dueAt"]), ("cancelled", None))
        self.assertIn(fid, self._ids("cancelled"))
        with self.assertRaises(ValueError):
            calls_db.act_on_follow_up(self.a, fid, "call_now")
        # The dialer never picks a cancelled row, even though it was due.
        for _ in range(6):
            got = calls_db.claim_next_campaign_contact(self.campaign)
            self.assertNotEqual(got and got["id"], fid)
            if got is None:
                break

    def test_bell_items(self):
        items = [i for i in calls_db.notifications(self.a) if i.get("kind") == "follow_up"]
        titles = [i["title"] for i in items]
        self.assertTrue(any(t.startswith("Follow-up scheduled: Asha") for t in titles), titles)
        self.assertTrue(any(t == "AI called Meera (follow-up) – connected" for t in titles), titles)
        meera = next(i for i in items if i["title"].startswith("AI called Meera"))
        self.assertEqual(meera["to"], "/dashboard/calls/1461")
        ravi = next(i for i in items if i["title"].startswith("AI called Ravi"))
        self.assertIn("trying again", ravi["body"])
        # Only follow-ups still waiting announce a schedule, each with its time.
        self.assertFalse(any(t.startswith("Follow-up scheduled: Meera") for t in titles), titles)
        asha = next(i for i in items if i["title"].startswith("Follow-up scheduled: Asha"))
        self.assertRegex(asha["body"], r"· \d{1,2} \w{3}, \d{1,2}:\d{2} (am|pm)$")


if __name__ == "__main__":
    unittest.main(verbosity=2)
