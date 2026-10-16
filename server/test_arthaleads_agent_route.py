"""ArthaLeads -> Vistrow lead.created with ArthaLeads' own call decision.

ArthaLeads' contract (docs/vistrow-outbound-lead-created.md in that repo):
Vistrow may queue a call only when auto_call is true, and only with the
agent_id ArthaLeads chose. Before 2026-10-15 Voice ignored agent_id and
required a separate Voice-side route, so an approved lead landed as
"no_matching_enabled_route". Against a throwaway Postgres (TEST_DATABASE_URL)."""
import json
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class ArthaLeadsAgentRouteTests(unittest.TestCase):
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
        kb = self.sql("INSERT INTO knowledge_bases (account_id, name) VALUES (?, 'Khopoli') RETURNING id", (self.aid,))["id"]
        self.agent = self.sql(
            "INSERT INTO agents (account_id, name, status, kb_id) VALUES (?, 'Siya', 'live', ?) RETURNING id",
            (self.aid, kb),
        )["id"]
        self.number = f"+9180{int.from_bytes(os.urandom(4), 'big') % 10**8:08d}"
        self.sql("INSERT INTO phone_numbers (account_id, number, agent_id, status) VALUES (?, ?, ?, 'active')",
                 (self.aid, self.number, self.agent))

    def lead(self, agent_ref, auto_call=True, lead_id=None, source="Facebook Ad"):
        lead_id = lead_id or os.urandom(4).hex()
        # Same fields token_api.leads_inbound adds before ingesting.
        return self.db.ingest_inbound_lead(
            self.aid, "Ravi", "+919812345678", source="arthaleads",
            external_id=f"org1:{lead_id}",
            custom_fields={"lead_source": source, "project": "Khopoli",
                           "arthaleads_org_id": "org1", "arthaleads_lead_id": lead_id},
            allow_call=auto_call, requested_agent_id=str(agent_ref) if auto_call else "",
        )

    def test_auto_call_with_agent_queues_with_that_agent_and_its_number(self):
        result = self.lead(self.agent)
        self.assertTrue(result["ok"])
        self.assertTrue(result["queued"], result)
        campaign = self.sql("SELECT agent_id, from_number, status FROM campaigns WHERE id = ?", (result["campaign_id"],))
        self.assertEqual((campaign["agent_id"], campaign["from_number"], campaign["status"]),
                         (self.agent, self.number, "running"))

    def test_public_agent_id_is_accepted_too(self):
        self.sql("UPDATE agents SET public_id = ? WHERE id = ?", (f"9{self.agent:09d}", self.agent))
        self.assertTrue(self.lead(f"9{self.agent:09d}")["queued"])

    def test_retry_of_the_same_lead_does_not_queue_twice(self):
        first = self.lead(self.agent, lead_id="L1")
        again = self.lead(self.agent, lead_id="L1")
        self.assertTrue(again["deduped"])
        self.assertEqual(first["contact_id"], again["contact_id"])

    def test_auto_call_false_imports_the_contact_without_a_call(self):
        result = self.lead(self.agent, auto_call=False)
        self.assertEqual((result["ok"], result["queued"], result["reason"]), (True, False, "auto_call_off"))
        self.assertTrue(result["contactId"])

    def test_agent_not_live_or_from_another_account_is_not_called(self):
        other = self.db.create_account_with_owner("B", "B", f"b-{os.urandom(4).hex()}@example.com", "h",
                                                  email_verified=True)["account_id"]
        stranger = self.sql("INSERT INTO agents (account_id, name, status, kb_id) VALUES (?, 'X', 'live', 1) RETURNING id",
                            (other,))["id"]
        self.assertEqual(self.lead(stranger)["reason"], "agent_not_live")
        self.sql("UPDATE agents SET status = 'paused' WHERE id = ?", (self.agent,))
        result = self.lead(self.agent)
        self.assertEqual((result["queued"], result["reason"]), (False, "agent_not_live"))

    def test_agent_without_a_caller_number_is_not_called(self):
        self.sql("UPDATE phone_numbers SET agent_id = NULL WHERE number = ?", (self.number,))
        result = self.lead(self.agent)
        self.assertEqual((result["queued"], result["reason"]), (False, "agent_has_no_caller_number"))

    def test_voice_route_number_is_used_when_the_agent_has_none_assigned(self):
        self.sql("UPDATE phone_numbers SET agent_id = NULL WHERE number = ?", (self.number,))
        self.sql("INSERT INTO settings (account_id, key, value) VALUES (?, 'arthaleads_inbound_routing_v2', ?)",
                 (self.aid, json.dumps({"sources": {"facebook": True}, "routes": [
                     {"source": "facebook", "match": "Other project", "agentId": self.agent, "fromNumber": self.number}]})))
        result = self.lead(self.agent)
        self.assertTrue(result["queued"], result)
        self.assertEqual(self.sql("SELECT from_number FROM campaigns WHERE id = ?", (result["campaign_id"],))["from_number"],
                         self.number)

    def test_a_human_pause_wins(self):
        first = self.lead(self.agent)
        self.sql("UPDATE campaigns SET status = 'paused', pause_reason = 'paused by owner' WHERE id = ?",
                 (first["campaign_id"],))
        result = self.lead(self.agent)
        self.assertEqual((result["queued"], result["reason"]), (False, "auto_call_campaign_paused"))

    def test_without_agent_id_the_voice_side_routing_still_decides(self):
        # Older ArthaLeads builds sent no agent_id: unchanged behaviour.
        result = self.db.ingest_inbound_lead(
            self.aid, "Ravi", "+919812345679", source="arthaleads", external_id=f"org1:{os.urandom(4).hex()}",
            custom_fields={"lead_source": "Facebook Ad", "project": "Khopoli"}, allow_call=True,
        )
        self.assertEqual((result["queued"], result["reason"]), (False, "no_matching_enabled_route"))


    def test_lead_id_for_a_campaign_call(self):
        result = self.lead(self.agent, lead_id="65f0c0ffee0000000000abcd")
        self.sql("UPDATE campaign_contacts SET call_id = 777001 WHERE id = ?", (result["contact_id"],))
        self.assertEqual(self.db.arthaleads_lead_id_for_call(777001, self.aid), "65f0c0ffee0000000000abcd")
        self.assertEqual(self.db.arthaleads_lead_id_for_call(777002, self.aid), "")


class SavedCallOutcome(unittest.TestCase):
    def test_outcomes(self):
        import integrations_dispatch as d

        spoke = [{"speaker": "agent", "text": "Hi"}, {"speaker": "visitor", "text": "Haan"}]
        self.assertEqual(d._saved_call_outcome({"transcript": spoke, "siteVisit": {"date": "2026-10-17", "time": "11:00"}}),
                         {"booking": "Site Visit Booked", "status": "Site Visit", "site_visit_at": "2026-10-17T11:00:00+05:30"})
        self.assertEqual(d._saved_call_outcome({"transcript": [{"speaker": "agent", "text": "Hello?"}], "direction": "outbound"}),
                         {"booking": "Not Reachable"})
        self.assertEqual(d._saved_call_outcome({"transcript": [], "direction": "inbound"}), {})
        self.assertEqual(d._saved_call_outcome({"transcript": spoke}), {"status": "Contacted"})


if __name__ == "__main__":
    unittest.main()
