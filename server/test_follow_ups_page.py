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

    def test_calls_list_tags_follow_up_calls(self):
        conn = calls_db._connect()
        try:
            with conn:
                agent_id = conn.execute("SELECT MIN(id) id FROM agents WHERE account_id = ?", (self.a,)).fetchone()["id"]
                call_id = conn.execute(
                    "INSERT INTO calls (account_id, room_name, visitor_identity, started_at, ended_at, duration_seconds, "
                    "transcript_json, call_type, agent_id, direction) VALUES (?, ?, 'v', ?, ?, 74, '[]', 'phone', ?, 'outbound') RETURNING id",
                    (self.a, f"fu-call-{os.urandom(3).hex()}", _utc(-5), _utc(-4), agent_id),
                ).fetchone()["id"]
                plain = conn.execute(
                    "INSERT INTO calls (account_id, room_name, visitor_identity, started_at, ended_at, duration_seconds, "
                    "transcript_json, call_type, agent_id) VALUES (?, ?, 'v', ?, ?, 30, '[]', 'phone', ?) RETURNING id",
                    (self.a, f"fu-plain-{os.urandom(3).hex()}", _utc(-6), _utc(-5), agent_id),
                ).fetchone()["id"]
                conn.execute("UPDATE campaign_contacts SET call_id = ? WHERE id = ?", (call_id, self.gone))
        finally:
            conn.close()
        calls = {str(c["id"]): c for c in calls_db.list_calls(self.a)}
        self.assertEqual(calls[str(call_id)]["followUpKind"], "nurture")
        self.assertEqual(calls[str(call_id)]["followUpLabel"], "Follow-up on their interest")
        self.assertIsNone(calls[str(plain)]["followUpKind"])

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



@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class ManualFollowUps(unittest.TestCase):
    """Phase 1 (owner, 22 Oct 2026): scheduling a follow-up by hand, and not
    ringing a nurture follow-up to someone who has since talked to us."""

    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.stamp = stamp
        cls.a = calls_db.create_account_with_owner("M", "M", f"mf-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.starter = calls_db.create_account_with_owner("S", "S", f"ms-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute("UPDATE accounts SET plan = 'growth' WHERE id = ?", (cls.a,))
                cls.agent = conn.execute("SELECT MIN(id) id FROM agents WHERE account_id = ?", (cls.a,)).fetchone()["id"]
                cls.bare_agent = conn.execute(
                    "INSERT INTO agents (account_id, name) VALUES (?, 'No number') RETURNING id", (cls.a,)
                ).fetchone()["id"]
                cls.number = "+9179" + str(int(stamp, 16) % 10**8).zfill(8)
                conn.execute(
                    "INSERT INTO phone_numbers (account_id, number, agent_id, status) VALUES (?, ?, ?, 'active')",
                    (cls.a, cls.number, cls.agent),
                )
                cls.call = conn.execute(
                    "INSERT INTO calls (account_id, room_name, visitor_identity, started_at, ended_at, duration_seconds, "
                    "transcript_json, call_type, agent_id, direction, lead_name, lead_phone) "
                    "VALUES (?, ?, 'v', ?, ?, 90, '[]', 'phone', ?, 'inbound', 'Priya', '9876501234') RETURNING id",
                    (cls.a, f"mf-src-{stamp}", _utc(-60), _utc(-58), cls.agent),
                ).fetchone()["id"]
        finally:
            conn.close()

    def _at(self, hours=3):
        return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=hours)).isoformat()

    def test_from_a_call_uses_its_person_agent_and_number(self):
        out = calls_db.create_follow_up(self.a, {"source_call_id": self.call, "kind": "callback", "at": self._at(),
                                                 "note": "Ask whether the loan came through"}, user_id=7)
        item = out["item"]
        self.assertEqual((item["name"], item["kind"], item["sourceCallId"], item["agentId"], item["state"]),
                         ("Priya", "callback", self.call, self.agent, "upcoming"))
        conn = calls_db._connect()
        try:
            row = conn.execute(
                "SELECT cc.phone, cc.phone_norm, cc.custom_fields, cp.from_number, cp.name, cp.status FROM campaign_contacts cc "
                "JOIN campaigns cp ON cp.id = cc.campaign_id WHERE cc.id = ?", (item["id"],)).fetchone()
        finally:
            conn.close()
        fields = json.loads(row["custom_fields"])
        self.assertEqual(fields["note_for_this_call"], "Ask whether the loan came through")
        self.assertEqual(fields["previous_call_id"], self.call)
        self.assertEqual(fields["scheduled_by_user_id"], 7)
        self.assertEqual(row["phone"], "+919876501234")  # E.164, like the agent writes
        self.assertEqual((row["from_number"], row["name"], row["status"]), (self.number, "Follow-up calls", "running"))
        # The dialer claims it once due, like an agent-scheduled one.
        conn = calls_db._connect()
        try:
            camp = conn.execute("SELECT campaign_id FROM campaign_contacts WHERE id = ?", (item["id"],)).fetchone()["campaign_id"]
            with conn:  # only this one due in the campaign
                conn.execute("UPDATE campaign_contacts SET next_attempt_at = ? WHERE campaign_id = ? AND status = 'pending'",
                             (_utc(600), camp))
                conn.execute("UPDATE campaign_contacts SET next_attempt_at = ? WHERE id = ?", (_utc(-1), item["id"]))
        finally:
            conn.close()
        claimed = calls_db.claim_next_campaign_contact(camp)
        self.assertEqual(claimed["id"], item["id"])
        calls_db.release_campaign_contact(item["id"])

    def test_second_one_for_the_same_person_moves_the_first(self):
        first = calls_db.create_follow_up(self.a, {"agent_id": self.agent, "phone": "+91 98765 00001", "name": "Ravi",
                                                   "kind": "nurture", "at": self._at(5)})
        second = calls_db.create_follow_up(self.a, {"agent_id": self.agent, "phone": "9876500001", "name": "Ravi K",
                                                    "kind": "callback", "at": self._at(8)})
        self.assertFalse(first["replaced"])
        self.assertTrue(second["replaced"])
        self.assertEqual(second["item"]["id"], first["item"]["id"])
        self.assertEqual((second["item"]["kind"], second["item"]["name"]), ("callback", "Ravi K"))

    def test_refusals(self):
        cases = [
            ({"agent_id": self.bare_agent, "phone": "9876500002", "kind": "callback", "at": self._at()}, "no phone number"),
            ({"agent_id": self.agent, "phone": "12", "kind": "callback", "at": self._at()}, "valid phone"),
            ({"agent_id": self.agent, "phone": "9876500003", "kind": "visit_reminder", "at": self._at()}, "type"),
            ({"agent_id": self.agent, "phone": "9876500003", "kind": "callback", "at": "2020-01-01T10:00:00+00:00"}, "future"),
            ({"phone": "9876500003", "kind": "callback", "at": self._at()}, "agent"),
        ]
        for data, words in cases:
            with self.assertRaises(ValueError, msg=data) as ctx:
                calls_db.create_follow_up(self.a, data)
            self.assertIn(words, str(ctx.exception))
        with self.assertRaises(LookupError):  # no such call in this account
            calls_db.create_follow_up(self.a, {"source_call_id": 10**8, "kind": "callback", "at": self._at()})
        with self.assertRaises(LookupError):  # no such agent in this account
            calls_db.create_follow_up(self.a, {"agent_id": 10**8, "phone": "9876500005", "kind": "callback", "at": self._at()})
        with self.assertRaises(ValueError) as ctx:  # plan without campaigns
            calls_db.create_follow_up(self.starter, {"agent_id": self.agent, "phone": "9876500004", "kind": "callback", "at": self._at()})
        self.assertIn("Growth", str(ctx.exception))

    def test_dnc_number_is_refused(self):
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute("INSERT INTO dnc_list (account_id, phone, phone_norm) VALUES (?, ?, ?)",
                             (self.a, "9876500006", calls_db._normalize_phone("9876500006", self.a)))
        finally:
            conn.close()
        with self.assertRaises(ValueError) as ctx:
            calls_db.create_follow_up(self.a, {"agent_id": self.agent, "phone": "+919876500006", "kind": "callback", "at": self._at()})
        self.assertIn("Do-Not-Call", str(ctx.exception))

    # --- skip rule -------------------------------------------------------
    def _nurture(self, phone, kind="nurture"):
        out = calls_db.create_follow_up(self.a, {"agent_id": self.agent, "phone": phone, "kind": kind, "at": self._at(1)})
        conn = calls_db._connect()
        try:
            return dict(conn.execute("SELECT * FROM campaign_contacts WHERE id = ?", (out["item"]["id"],)).fetchone())
        finally:
            conn.close()

    def _call(self, phone, *, direction, seconds, room="", call_type="phone"):
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO calls (account_id, room_name, visitor_identity, started_at, ended_at, duration_seconds, "
                    "transcript_json, call_type, agent_id, direction, lead_phone) VALUES (?, ?, 'v', ?, ?, ?, '[]', ?, ?, ?, ?)",
                    (self.a, room or f"mf-{os.urandom(4).hex()}", _utc(1), _utc(2), seconds, call_type, self.agent, direction, phone),
                )
        finally:
            conn.close()

    def test_nurture_skipped_after_they_call_in(self):
        contact = self._nurture("9876511111")
        self.assertIsNone(calls_db.follow_up_skip_reason(contact))
        self._call("+91 98765 11111", direction="inbound", seconds=40)
        self.assertIn("talked to us", calls_db.follow_up_skip_reason(contact))

    def test_nurture_skipped_after_a_website_call_with_their_number(self):
        contact = self._nurture("9876511112")
        self._call("9876511112", direction=None, seconds=30, call_type="widget")
        self.assertIsNotNone(calls_db.follow_up_skip_reason(contact))

    def test_nurture_skipped_after_a_booking(self):
        contact = self._nurture("9876511113")
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO appointments (account_id, contact_name, contact_phone, appt_date, start_time, status, source) "
                    "VALUES (?, 'B', '+919876511113', '2026-11-01', '10:00', 'confirmed', 'agent')", (self.a,))
        finally:
            conn.close()
        self.assertIn("appointment booked for 2026-11-01", calls_db.follow_up_skip_reason(contact))

    def test_what_does_not_count(self):
        contact = self._nurture("9876511114")
        self._call("9876511114", direction="outbound", seconds=120)        # our own dial
        self._call("9876511114", direction="inbound", seconds=8)           # a drop
        self._call("9876511114", direction="inbound", seconds=60, room="test-agent-1-x")  # dashboard test
        self._call("9876500000", direction="inbound", seconds=60)          # someone else
        self.assertIsNone(calls_db.follow_up_skip_reason(contact))

    def test_callbacks_are_always_honoured(self):
        contact = self._nurture("9876511115", kind="callback")
        self._call("9876511115", direction="inbound", seconds=60)
        self.assertIsNone(calls_db.follow_up_skip_reason(contact))

    def test_dialer_skips_instead_of_dialling(self):
        import campaign_dialer
        from unittest.mock import patch
        contact = self._nurture("9876511116")
        self._call("9876511116", direction="inbound", seconds=60)
        conn = calls_db._connect()
        try:
            with conn:
                conn.execute("UPDATE campaign_contacts SET next_attempt_at = ? WHERE id = ?", (_utc(-1), contact["id"]))
                # Only this contact due in the campaign for this tick.
                conn.execute("UPDATE campaign_contacts SET next_attempt_at = ? WHERE campaign_id = ? AND id <> ? AND status = 'pending'",
                             (_utc(600), contact["campaign_id"], contact["id"]))
            camp = dict(conn.execute("SELECT * FROM campaigns WHERE id = ?", (contact["campaign_id"],)).fetchone())
        finally:
            conn.close()
        # Rows other tests leave in flight must not make the trunk look full.
        with patch.object(calls_db, "place_outbound_call_direct") as place, \
             patch.object(calls_db, "campaign_inflight_all", return_value=0), \
             patch.object(calls_db, "campaign_inflight", return_value=0), \
             patch.object(calls_db, "count_active_calls", return_value=0), \
             patch.object(calls_db, "concurrent_call_limit", return_value=10), \
             patch.object(calls_db, "within_calling_window", return_value=(True, "")), \
             patch.object(campaign_dialer, "_on_orchestrator_pipeline", return_value=False), \
             patch.object(campaign_dialer, "_pace_dial"), \
             patch.object(campaign_dialer.campaign_window, "campaign_block_reason", return_value=None):
            campaign_dialer._dial_one(camp)
        place.assert_not_called()
        item = next(i for i in calls_db.list_follow_ups(self.a, view="cancelled")["items"] if i["id"] == contact["id"])
        self.assertTrue(item["outcome"].startswith("Skipped: they talked to us"), item["outcome"])
        self.assertEqual(item["attempts"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
