"""Follow-up calling, server side (owner decisions 2026-10-15).

The agent's own follow-up rules (agents.follow_up_policy) are what the
instant and follow-up campaigns retry on; a scheduled follow-up is a pending
campaign contact the dialer leaves alone until its moment; a lead whose
attempts ran out is reported to ArthaLeads once as "Not Reachable".

DB tests run against a throwaway Postgres (TEST_DATABASE_URL), never the repo
.env."""
import datetime
import json
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import campaign_dialer
import integrations_dispatch
import retry_rules

TEST_DB = os.environ.get("TEST_DATABASE_URL")


def _utc(minutes_from_now: int) -> str:
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes_from_now)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


class DialerReportsExhaustedLeads(unittest.TestCase):
    def test_each_exhausted_lead_is_reported_and_stamped_even_when_the_post_fails(self):
        contacts = [{"id": 1, "account_id": 5}, {"id": 2, "account_id": 5}]
        with patch.object(campaign_dialer.calls_db, "exhausted_arthaleads_contacts", return_value=contacts), \
                patch.object(campaign_dialer.integrations_dispatch, "report_contact_not_reachable",
                             side_effect=[(True, "HTTP 200"), (False, "HTTP 500")]) as report, \
                patch.object(campaign_dialer.calls_db, "mark_contact_crm_notified") as stamp:
            campaign_dialer._report_exhausted_contacts()
        self.assertEqual([c.args for c in report.call_args_list], [(5, contacts[0]), (5, contacts[1])])
        self.assertEqual([c.args for c in stamp.call_args_list], [(1,), (2,)])


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class DatabaseBacked(unittest.TestCase):
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
            row = cur.fetchone() if ("RETURNING" in query.upper() or query.lstrip().upper().startswith("SELECT")) else None
        conn.close()
        return row

    def setUp(self):
        stamp = os.urandom(4).hex()
        self.aid = self.db.create_account_with_owner("A", "A", f"a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        self.agent = self.sql(
            "INSERT INTO agents (account_id, name, status) VALUES (?, 'Siya', 'live') RETURNING id", (self.aid,)
        )["id"]

    def campaign(self, name, **cols):
        values = {"max_attempts": 1, "retry_minutes": 60, "retry_policy": "", **cols}
        return self.sql(
            "INSERT INTO campaigns (account_id, name, agent_id, from_number, status, max_attempts, retry_minutes, retry_policy) "
            "VALUES (?, ?, ?, '+918000000001', 'running', ?, ?, ?) RETURNING id",
            (self.aid, name, self.agent, values["max_attempts"], values["retry_minutes"], values["retry_policy"]),
        )["id"]

    def contact(self, campaign_id, phone="+919812300011", status="calling", attempts=1, fields=None, next_at=None):
        return self.sql(
            "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, custom_fields, status, "
            f"attempts, last_attempt_at, next_attempt_at) VALUES (?, ?, 'Priya', ?, ?, ?, ?, ?, {self.db._NOW}, ?) RETURNING id",
            (campaign_id, self.aid, phone, self.db._normalize_phone(phone, self.aid),
             json.dumps(fields if fields is not None else {}), status, attempts, next_at),
        )["id"]

    def row(self, contact_id):
        return self.sql("SELECT status, outcome, next_attempt_at, attempts, crm_notified_at FROM campaign_contacts WHERE id = ?",
                        (contact_id,))

    # ---- settings: dashboard write -> runtime read

    def test_follow_up_policy_is_saved_validated_and_read_back_with_defaults(self):
        agent = self.db.update_agent(self.agent, {"followUpPolicy": {"maxAttempts": 50, "busyMinutes": 5,
                                                                      "callbackEnabled": False}}, self.aid)
        self.assertEqual(agent["followUpPolicy"]["maxAttempts"], 10)
        self.assertEqual(agent["followUpPolicy"]["busyMinutes"], 5)
        self.assertFalse(agent["followUpPolicy"]["callbackEnabled"])
        self.assertEqual(agent["followUpPolicy"]["switchedOffMinutes"], 120)
        stored = self.sql("SELECT follow_up_policy FROM agents WHERE id = ?", (self.agent,))["follow_up_policy"]
        self.assertEqual(json.loads(stored)["maxAttempts"], 10)

    def test_an_agent_without_the_setting_reads_the_defaults(self):
        agent = self.db._agent_dict(self.sql("SELECT * FROM agents WHERE id = ?", (self.agent,)))
        self.assertEqual(agent["followUpPolicy"], retry_rules.FOLLOW_UP_DEFAULTS)

    # ---- retries follow the agent's gaps on instant/follow-up campaigns

    def test_instant_campaign_retries_on_the_agents_gap_and_budget(self):
        self.db.update_agent(self.agent, {"followUpPolicy": {"maxAttempts": 2, "noAnswerMinutes": 45}}, self.aid)
        cid = self.campaign("ArthaLeads Instant Follow-up", max_attempts=3, retry_minutes=30)
        contact = self.contact(cid, attempts=1)
        self.db.record_campaign_dial_result(contact, cid, "failed")
        row = self.row(contact)
        self.assertEqual(row["status"], "failed")
        due = datetime.datetime.strptime(row["next_attempt_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
        gap = (due - datetime.datetime.now(datetime.timezone.utc)).total_seconds() / 60
        self.assertAlmostEqual(gap, 45, delta=1)
        # Second (last) dial: the agent's budget of 2 wins over the row's 3.
        self.sql("UPDATE campaign_contacts SET status = 'calling', attempts = 2 WHERE id = ?", (contact,))
        self.db.record_campaign_dial_result(contact, cid, "failed")
        self.assertIsNone(self.row(contact)["next_attempt_at"])

    def test_bulk_campaign_keeps_its_own_retry_settings(self):
        self.db.update_agent(self.agent, {"followUpPolicy": {"maxAttempts": 1}}, self.aid)
        cid = self.campaign("Diwali list", max_attempts=3, retry_minutes=30)
        contact = self.contact(cid, attempts=1)
        self.db.record_campaign_dial_result(contact, cid, "failed")
        row = self.row(contact)
        due = datetime.datetime.strptime(row["next_attempt_at"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
        self.assertAlmostEqual((due - datetime.datetime.now(datetime.timezone.utc)).total_seconds() / 60, 30, delta=1)

    # ---- a scheduled follow-up waits for its moment

    def test_pending_contact_with_a_future_time_is_not_claimed_until_due(self):
        cid = self.campaign(retry_rules.FOLLOW_UP_CAMPAIGN_NAME)
        later = self.contact(cid, status="pending", attempts=0, next_at=_utc(60))
        self.assertIsNone(self.db.claim_next_campaign_contact(cid))
        self.assertTrue(self.db.campaign_has_open_work(cid))
        due = self.contact(cid, phone="+919812300022", status="pending", attempts=0, next_at=_utc(-1))
        claimed = self.db.claim_next_campaign_contact(cid)
        self.assertEqual(claimed["id"], due)
        self.assertEqual(self.row(later)["status"], "pending")

    # ---- exhausted ArthaLeads leads -> Not Reachable, once

    def exhausted(self, name="ArthaLeads Instant Follow-up", fields=None, status="no_answer"):
        cid = self.campaign(name)
        fields = {"source": "arthaleads", "arthaleads_lead_id": "L1", **(fields or {})}
        return cid, self.contact(cid, status=status, attempts=3, fields=fields)

    def test_only_exhausted_arthaleads_leads_of_auto_campaigns_are_listed(self):
        _, spent = self.exhausted()
        _, still_retrying = self.exhausted()
        self.sql("UPDATE campaign_contacts SET next_attempt_at = ? WHERE id = ?", (_utc(10), still_retrying))
        _, bulk = self.exhausted(name="Diwali list")
        other_cid = self.campaign("ArthaLeads Instant Follow-up")
        other_source = self.contact(other_cid, status="no_answer", attempts=3, fields={"source": "facebook"})
        listed = {c["id"]: c for c in self.db.exhausted_arthaleads_contacts() if c["account_id"] == self.aid}
        self.assertEqual(set(listed), {spent})
        self.assertEqual(listed[spent]["custom_fields"]["arthaleads_lead_id"], "L1")
        self.assertIsNone(listed[spent]["last_call_id"])
        self.db.mark_contact_crm_notified(spent)
        self.assertEqual([c["id"] for c in self.db.exhausted_arthaleads_contacts() if c["account_id"] == self.aid], [])
        self.assertIsNotNone(self.row(spent)["crm_notified_at"])
        for untouched in (still_retrying, bulk, other_source):
            self.assertIsNone(self.row(untouched)["crm_notified_at"])

    def test_not_reachable_report_without_a_call_row_is_a_minimal_lead_entry(self):
        _, spent = self.exhausted(status="voicemail")
        contact = next(c for c in self.db.exhausted_arthaleads_contacts() if c["id"] == spent)
        with patch.object(integrations_dispatch, "_arthaleads_token", return_value=("tok", "")), \
                patch.object(integrations_dispatch, "_post_json", return_value=(True, "HTTP 200")) as post:
            self.assertEqual(integrations_dispatch.report_contact_not_reachable(self.aid, contact), (True, "HTTP 200"))
        url, body = post.call_args.args
        self.assertEqual(url, integrations_dispatch._ARTHALEADS_URL)
        self.assertEqual(body["crm_outcome"], {"booking": "Not Reachable", "attempts": 3})
        self.assertEqual(body["arthaleads_lead_id"], "L1")
        # A numeric call_id, or ArthaLeads files it as a new lead instead of
        # a call result; negative so it can never collide with a real call.
        self.assertEqual((body["token"], body["name"], body["phone"], body["direction"], body["call_id"]),
                         ("tok", "Priya", "+919812300011", "outbound", -spent))
        self.assertEqual(body["agent_name"], "Siya")
        self.assertIn("3 call attempt", body["message"])

    def test_not_reachable_report_rides_on_the_last_saved_call(self):
        cid, spent = self.exhausted()
        # The first dial's call is linked on the contact; the latest dial's
        # room is what record_campaign_dial_result stamped last.
        first, call_id = (self.sql(
            "INSERT INTO calls (account_id, room_name, visitor_identity, started_at, ended_at, duration_seconds, "
            "transcript_json, call_type, agent_id, direction, lead_name, lead_phone) "
            "VALUES (?, ?, 'v', '2026-10-15T10:00:00+00:00', '2026-10-15T10:00:20+00:00', 20, '[]', 'phone', ?, "
            "'outbound', 'Priya', '+919812300011') RETURNING id",
            (self.aid, room, self.agent),
        )["id"] for room in (f"room-{spent}-1", f"room-{spent}-2"))
        self.sql("UPDATE campaign_contacts SET call_id = ?, room_name = ? WHERE id = ?", (first, f"room-{spent}-2", spent))
        contact = next(c for c in self.db.exhausted_arthaleads_contacts() if c["id"] == spent)
        self.assertEqual(contact["last_call_id"], call_id)
        with patch.object(integrations_dispatch, "_arthaleads_token", return_value=("tok", "")), \
                patch.object(integrations_dispatch, "_post_json", return_value=(True, "HTTP 200")) as post:
            integrations_dispatch.report_contact_not_reachable(self.aid, contact)
        body = post.call_args.args[1]
        self.assertEqual(body["call_id"], call_id)
        self.assertEqual(body["crm_outcome"], {"booking": "Not Reachable", "attempts": 3})
        self.assertEqual(body["phone"], "+919812300011")
        self.assertEqual(body["direction"], "outbound")


if __name__ == "__main__":
    unittest.main(verbosity=2)
