"""Speed to lead and the missed-money queue, against a throwaway Postgres
(TEST_DATABASE_URL): the point is the SQL that joins leads, queued calls,
calls and contacts, so it runs on the real database engine."""
import json
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class SpeedToLeadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("A", "A", f"stl-a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.other = calls_db.create_account_with_owner("B", "B", f"stl-b-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        with conn:
            cls.campaign = conn.execute(
                "INSERT INTO campaigns (account_id, name, agent_id, status) VALUES (?, 'Leads', NULL, 'running') RETURNING id",
                (cls.a,),
            ).fetchone()["id"]
        conn.close()

    def sql(self, query, params=()):
        conn = self.db._connect()
        try:
            with conn:
                row = conn.execute(query, params).fetchone()
            return row
        finally:
            conn.close()

    def lead(self, external_id, minutes_ago, *, account=None, phone=None, name="", queued=None):
        """A lead that arrived minutes_ago, with its contact row. queued: None
        (never queued) or a dict of campaign_contacts columns."""
        account = account or self.a
        phone = phone or f"+9198{abs(hash(external_id)) % 10**8:08d}"
        contact_id = self.sql(
            "INSERT INTO contacts (account_id, name, phone, source, custom_fields) VALUES (?, ?, ?, 'arthaleads', ?) RETURNING id",
            (account, name, phone, json.dumps({"external_id": external_id, "channel_source": "facebook", "project": "Treetopia"})),
        )["id"]
        cc_id = None
        if queued is not None:
            cols = {"status": "done", "attempts": 1, **queued}
            cc_id = self.sql(
                "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, status, attempts, "
                "first_attempt_at, last_attempt_at, next_attempt_at, custom_fields) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}') RETURNING id",
                (self.campaign, account, name, phone, phone[1:], cols["status"], cols["attempts"],
                 cols.get("first_attempt_at"), cols.get("last_attempt_at"), cols.get("next_attempt_at")),
            )["id"]
        self.sql(
            "INSERT INTO inbound_lead_events (account_id, source, external_id, campaign_contact_id, created_at) "
            "VALUES (?, 'arthaleads', ?, ?, ((now() AT TIME ZONE 'UTC') - make_interval(mins => ?))::text) RETURNING external_id",
            (account, external_id, cc_id, minutes_ago),
        )
        return contact_id, phone

    @staticmethod
    def ago(seconds):
        return f"((now() AT TIME ZONE 'UTC') - make_interval(secs => {seconds}))::text"

    def ts(self, seconds_ago):
        return self.sql(f"SELECT {self.ago(seconds_ago)} t")["t"]

    def test_speed_counts_called_and_uncalled_leads(self):
        account = self.db.create_account_with_owner("S", "S", f"stl-s-{os.urandom(4).hex()}@example.com", "h", email_verified=True)["account_id"]
        # Lead 10 min ago, first dial 5 s after it arrived.
        self.lead("s1", 10, account=account, queued={"first_attempt_at": self.ts(600 - 5)})
        # Lead 20 min ago, first dial 65 s later; a retry later overwrote last_attempt_at.
        self.lead("s2", 20, account=account, queued={"first_attempt_at": self.ts(1200 - 65), "last_attempt_at": self.ts(60), "attempts": 2})
        # Older row (before first_attempt_at existed): one attempt, use last_attempt_at.
        self.lead("s3", 30, account=account, queued={"last_attempt_at": self.ts(1800 - 7)})
        # Never queued (auto-calling off).
        self.lead("s4", 40, account=account)
        stats = self.db.speed_to_lead(account, days=14)
        self.assertEqual((stats["received"], stats["called"], stats["notCalled"]), (4, 3, 1))
        self.assertEqual(stats["medianSeconds"], 7)
        self.assertEqual(stats["withinMinutePct"], 67)

    def test_speed_is_per_account_and_empty_is_none(self):
        account = self.db.create_account_with_owner("E", "E", f"stl-e-{os.urandom(4).hex()}@example.com", "h", email_verified=True)["account_id"]
        stats = self.db.speed_to_lead(account)
        self.assertEqual((stats["received"], stats["medianSeconds"], stats["withinMinutePct"]), (0, None, None))

    def test_queue_lists_uncalled_leads_but_not_ones_called_since(self):
        cid, _ = self.lead(f"q-uncalled-{os.urandom(3).hex()}", 30, name="Riya")
        _, phone = self.lead(f"q-called-{os.urandom(3).hex()}", 30, name="Arjun")
        # Arjun was called after the lead arrived (e.g. by hand): not missed.
        self.sql(
            f"INSERT INTO calls (account_id, room_name, started_at, ended_at, call_type, lead_phone, duration_seconds, transcript_json) "
            f"VALUES (?, ?, {self.ago(60)}, {self.ago(0)}, 'phone', ?, 90, '[]') RETURNING id",
            (self.a, f"r-{os.urandom(3).hex()}", phone),
        )
        queue = self.db.missed_money_queue(self.a)
        titles = [i["title"] for i in queue["items"] if i["kind"] == "uncalled_lead"]
        self.assertIn("Riya", titles)
        self.assertNotIn("Arjun", titles)
        riya = next(i for i in queue["items"] if i["title"] == "Riya")
        self.assertEqual(riya["contactId"], cid)
        self.assertIn("Facebook lead", riya["detail"])
        self.assertIn("Treetopia", riya["detail"])

    def test_queue_follow_ups_overdue_vs_upcoming_and_dropped_calls(self):
        def follow_up(name, kind, due_offset_minutes):
            self.sql(
                "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, status, attempts, next_attempt_at, custom_fields) "
                "VALUES (?, ?, ?, ?, ?, 'pending', 0, ((now() AT TIME ZONE 'UTC') + make_interval(mins => ?))::text, ?) RETURNING id",
                (self.campaign, self.a, name, f"+9197{os.urandom(4).hex()[:8]}", "x", due_offset_minutes, json.dumps({"follow_up_kind": kind})),
            )
        follow_up("Late Callback", "callback", -120)
        follow_up("Soon Reminder", "visit_reminder", 180)
        follow_up("Far Nurture", "nurture", 60 * 30)  # beyond 24 h: not listed
        dropped_phone = f"+9196{os.urandom(4).hex()[:8]}"
        self.sql(
            f"INSERT INTO calls (account_id, room_name, started_at, ended_at, call_type, direction, lead_phone, duration_seconds, transcript_json) "
            f"VALUES (?, ?, {self.ago(3600)}, {self.ago(3597)}, 'phone', 'outbound', ?, 3, '[]') RETURNING id",
            (self.a, f"r-{os.urandom(3).hex()}", dropped_phone),
        )
        queue = self.db.missed_money_queue(self.a)
        by_title = {i["title"]: i for i in queue["items"]}
        self.assertEqual(by_title["Late Callback"]["kind"], "overdue_follow_up")
        self.assertIn("Callback they asked for", by_title["Late Callback"]["detail"])
        self.assertEqual(by_title["Soon Reminder"]["kind"], "upcoming_follow_up")
        self.assertNotIn("Far Nurture", by_title)
        self.assertEqual(by_title[dropped_phone]["kind"], "dropped_call")
        # Urgent first: uncalled leads, then overdue follow-ups, then drops, then upcoming.
        order = [i["kind"] for i in queue["items"]]
        ranks = {"uncalled_lead": 1, "overdue_follow_up": 2, "dropped_call": 3, "upcoming_follow_up": 4}
        self.assertEqual(order, sorted(order, key=ranks.get))
        self.assertEqual(queue["toCall"], queue["counts"]["uncalled_lead"] + queue["counts"]["overdue_follow_up"] + queue["counts"]["dropped_call"])

    def test_any_lead_source_is_counted_and_listed_without_a_contact_row(self):
        """Not ArthaLeads-only: a Facebook webhook lead with no lead id and no
        auto-call campaign is still recorded, timed and listed."""
        account = self.db.create_account_with_owner("F", "F", f"stl-f-{os.urandom(4).hex()}@example.com", "h", email_verified=True)["account_id"]
        result = self.db.ingest_inbound_lead(account, "Meera Joshi", "+91 98765 11122", source="facebook_lead_ads", external_id="")
        self.assertFalse(result["ok"])  # nothing to call it with yet
        result = self.db.ingest_inbound_lead(account, "Ravi Kumar", "+91 98765 11133", source="facebook_lead_ads_native", external_id="fb-123")
        self.assertFalse(result["ok"])
        stats = self.db.speed_to_lead(account)
        self.assertEqual((stats["received"], stats["called"], stats["notCalled"]), (2, 0, 2))
        # Never queued, so listed at once, with name and number for "Add contact".
        items = {i["title"]: i for i in self.db.missed_money_queue(account)["items"]}
        self.assertEqual(set(items), {"Meera Joshi", "Ravi Kumar"})
        meera = items["Meera Joshi"]
        self.assertEqual((meera["kind"], meera["contactId"], meera["name"]), ("uncalled_lead", None, "Meera Joshi"))
        self.assertTrue(meera["phone"].endswith("9876511122"))
        self.assertTrue(meera["detail"].startswith("Facebook lead"))

    def test_queue_never_shows_another_accounts_rows(self):
        self.lead(f"q-other-{os.urandom(3).hex()}", 5, account=self.other, name="Other Tenant Lead")
        titles = [i["title"] for i in self.db.missed_money_queue(self.a)["items"]]
        self.assertNotIn("Other Tenant Lead", titles)

    def test_dialer_stamps_first_attempt_once(self):
        cc = self.sql(
            "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, status, attempts, custom_fields) "
            "VALUES (?, ?, 'Dial', '+919000000001', '919000000001', 'pending', 0, '{}') RETURNING id",
            (self.campaign, self.a),
        )["id"]
        claimed = None
        while True:
            claimed = self.db.claim_next_campaign_contact(self.campaign)
            if claimed is None or claimed["id"] == cc:
                break
        first = self.sql("SELECT first_attempt_at FROM campaign_contacts WHERE id = ?", (cc,))["first_attempt_at"]
        self.assertIsNotNone(first)
        self.sql("UPDATE campaign_contacts SET status = 'no_answer', next_attempt_at = '2000-01-01 00:00:00' WHERE id = ? RETURNING id", (cc,))
        while True:
            claimed = self.db.claim_next_campaign_contact(self.campaign)
            if claimed is None or claimed["id"] == cc:
                break
        again = self.sql("SELECT first_attempt_at, attempts FROM campaign_contacts WHERE id = ?", (cc,))
        self.assertEqual((again["first_attempt_at"], again["attempts"]), (first, 2))


if __name__ == "__main__":
    unittest.main()
