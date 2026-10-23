"""Click-to-WhatsApp leads (server/whatsapp_leads.py) against a real Postgres
(TEST_DATABASE_URL). The payload is the WhatsApp Cloud API `messages` webhook,
with the `referral` block ArthaLeads parses in production
(routes/whatsappRoutes.js campaignRefFromReferral: source_id, headline, body,
source_url, ctwa_clid)."""
import datetime
import hashlib
import hmac
import json
import os
import time
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")
SECRET = "test-app-secret"


def _sign(body: bytes) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def _message(message_id: str, sender: str, text: str = "Hi, tell me more", ad_id: str | None = "AD-CTWA",
             sent: datetime.datetime | None = None) -> dict:
    sent = sent or datetime.datetime.now(datetime.timezone.utc)
    message = {"from": sender, "id": message_id, "timestamp": str(int(sent.timestamp())), "type": "text",
               "text": {"body": text}}
    if ad_id:
        message["referral"] = {"source_url": "https://fb.me/abc", "source_id": ad_id, "source_type": "ad",
                               "headline": "900+ Acre Launch", "body": "Hi, tell me more", "ctwa_clid": "CLID-" + message_id}
    return message


def _payload(phone_number_id: str, messages: list[dict], names: dict | None = None) -> bytes:
    contacts = [{"profile": {"name": (names or {}).get(m["from"], "Priya Nair")}, "wa_id": m["from"]} for m in messages]
    return json.dumps({"object": "whatsapp_business_account", "entry": [{"id": "WABA1", "changes": [{
        "field": "messages", "value": {"messaging_product": "whatsapp",
                                       "metadata": {"display_phone_number": "917713128715", "phone_number_id": phone_number_id},
                                       "contacts": contacts, "messages": messages}}]}]}).encode()


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class ClickToWhatsAppLeads(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        os.environ["META_ALLOW_PLAINTEXT_TOKENS"] = "1"
        os.environ["META_OAUTH_CLIENT_SECRET"] = SECRET
        os.environ["DISABLE_CAMPAIGN_DIALER"] = "1"
        import calls_db
        import meta_leads
        import whatsapp_leads

        cls.db, cls.ml, cls.wa = calls_db, meta_leads, whatsapp_leads
        calls_db.init_tables()
        meta_leads.init_tables()
        whatsapp_leads.init_tables()
        cls.stamp = stamp = os.urandom(4).hex()
        a = calls_db.create_account_with_owner("WA", "Asha", f"wa-{stamp}@example.com", "h", email_verified=True)
        b = calls_db.create_account_with_owner("WB", "Bala", f"wb-{stamp}@example.com", "h", email_verified=True)
        cls.a, cls.b = a["account_id"], b["account_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id IN (?, ?)", (cls.a, cls.b))
        conn.close()
        cls.agent_a = calls_db.create_agent({"name": "Siya"}, cls.a)["id"]
        cls.agent_a2 = calls_db.create_agent({"name": "Riya"}, cls.a)["id"]
        cls.agent_b = calls_db.create_agent({"name": "Other"}, cls.b)["id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE agents SET status = 'live' WHERE id IN (?, ?, ?)", (cls.agent_a, cls.agent_a2, cls.agent_b))
        conn.close()
        tail = str(int(time.time() * 1000))[-7:]
        cls.num_a, cls.num_a2, cls.num_b = f"+91334{tail}", f"+91335{tail}", f"+91336{tail}"
        calls_db.add_phone_number(cls.num_a, cls.a, agent_id=cls.agent_a)
        calls_db.add_phone_number(cls.num_a2, cls.a, agent_id=cls.agent_a2)
        calls_db.add_phone_number(cls.num_b, cls.b, agent_id=cls.agent_b)
        cls.pid_a, cls.pid_b = f"7{tail}01", f"7{tail}02"
        whatsapp_leads.link_number(cls.a, cls.pid_a, "+91 77131 28715", "WABA1")
        whatsapp_leads.link_number(cls.b, cls.pid_b, "+91 90000 00000", "WABA2")
        # A Page with an ad rule: the CTWA ad goes to Riya on her own number.
        cls.page_a = f"PWA{stamp}"
        conn_id = meta_leads.save_connection(cls.a, "user-token", None, f"fbu-wa-{stamp}", "Asha FB", a["user_id"])
        meta_leads.add_page(cls.a, conn_id, cls.page_a, "Khopoli Homes", "page-token")
        cls.ad_routed = f"ADR{stamp}"
        meta_leads.create_rule(cls.a, {"pageId": cls.page_a, "matchKind": "ad", "matchValue": cls.ad_routed,
                                       "agentId": cls.agent_a2, "fromNumber": cls.num_a2, "label": "Khopoli chat ad"})
        cls.n = 0

    def mid(self) -> str:
        type(self).n += 1
        return f"wamid.{self.stamp}{self.n:04d}"

    def sender(self) -> str:
        return f"9198{int(self.stamp[:3], 16) % 100:02d}{self.n:06d}"

    def post(self, body: bytes) -> dict:
        status, out = self.ml.handle_webhook_post(body, _sign(body))
        self.assertEqual(status, 200, out)
        return out

    def event(self, pid: str, mid: str) -> dict:
        conn = self.db._connect()
        try:
            return dict(conn.execute("SELECT * FROM wa_inbound_events WHERE phone_number_id = ? AND message_id = ?",
                                     (pid, mid)).fetchone() or {})
        finally:
            conn.close()

    def queued(self, account_id: int, sender: str) -> list[dict]:
        conn = self.db._connect()
        try:
            return [dict(r) for r in conn.execute(
                "SELECT cc.*, c.agent_id, c.from_number FROM campaign_contacts cc JOIN campaigns c ON c.id = cc.campaign_id "
                "WHERE cc.account_id = ? AND cc.phone_norm LIKE ?", (account_id, "%" + sender[-10:])).fetchall()]
        finally:
            conn.close()

    # ------------------------------------------------------------------ tests

    def test_a_chat_from_an_ad_becomes_a_contact_and_the_ads_agent_calls(self):
        mid, sender = self.mid(), self.sender()
        out = self.post(_payload(self.pid_a, [_message(mid, sender, ad_id=self.ad_routed)]))
        self.assertEqual((out["received"], out["queued"]), (1, 1), out)
        event = self.event(self.pid_a, mid)
        self.assertEqual((event["status"], event["route_agent_id"], event["ad_headline"]), ("queued", self.agent_a2, "900+ Acre Launch"))
        [row] = self.queued(self.a, sender)
        self.assertEqual((row["agent_id"], row["from_number"]), (self.agent_a2, self.num_a2), "the ad rule's agent and number")
        conn = self.db._connect()
        contact = dict(conn.execute("SELECT * FROM contacts WHERE account_id = ? AND phone LIKE ?",
                                    (self.a, "%" + sender[-10:])).fetchone())
        conn.close()
        fields = json.loads(contact["custom_fields"])
        self.assertEqual((contact["name"], contact["source"]), ("Priya Nair", "whatsapp_ctwa"))
        self.assertIn("whatsapp-ctwa", contact["tags"])
        self.assertEqual((fields["ad_id"], fields["ctwa_clid"], fields["first_message"]),
                         (self.ad_routed, "CLID-" + mid, "Hi, tell me more"))

    def test_meta_redelivering_the_same_message_queues_one_call(self):
        mid, sender = self.mid(), self.sender()
        body = _payload(self.pid_a, [_message(mid, sender, ad_id=self.ad_routed)])
        self.post(body)
        again = self.post(body)
        self.assertEqual((again["received"], again["duplicates"]), (0, 1))
        self.assertEqual(len(self.queued(self.a, sender)), 1)

    def test_an_ordinary_chat_is_recorded_and_never_called(self):
        mid, sender = self.mid(), self.sender()
        self.post(_payload(self.pid_a, [_message(mid, sender, ad_id=None)]))
        self.assertEqual((self.event(self.pid_a, mid)["status"], self.event(self.pid_a, mid)["reason"]), ("skipped", "not_from_ad"))
        self.assertEqual(self.queued(self.a, sender), [])

    def test_stop_puts_the_number_on_do_not_call(self):
        mid, sender = self.mid(), self.sender()
        self.post(_payload(self.pid_a, [_message(mid, sender, text="STOP", ad_id=None)]))
        self.assertEqual(self.event(self.pid_a, mid)["status"], "opted_out")
        self.assertTrue(self.db.is_dnc(self.a, "+" + sender))

    def test_an_unlinked_number_is_recorded_as_skipped(self):
        mid, sender = self.mid(), self.sender()
        self.post(_payload("999000111", [_message(mid, sender)]))
        event = self.event("999000111", mid)
        self.assertEqual((event["status"], event["reason"], event["account_id"]), ("skipped", "unknown_number", None))

    def test_an_old_message_is_kept_but_not_called(self):
        mid, sender = self.mid(), self.sender()
        old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=30)
        self.post(_payload(self.pid_a, [_message(mid, sender, ad_id=self.ad_routed, sent=old)]))
        self.assertEqual(self.event(self.pid_a, mid)["status"], "stale")
        self.assertEqual(self.queued(self.a, sender), [])

    def test_delivery_receipts_are_ignored(self):
        body = json.dumps({"object": "whatsapp_business_account", "entry": [{"id": "WABA1", "changes": [{
            "field": "messages", "value": {"metadata": {"phone_number_id": self.pid_a},
                                           "statuses": [{"id": "wamid.x", "status": "delivered"}]}}]}]}).encode()
        out = self.post(body)
        self.assertEqual((out["received"], out["ignored"]), (0, 1))

    def test_each_workspace_only_gets_its_own_numbers_leads(self):
        mid, sender = self.mid(), self.sender()
        self.post(_payload(self.pid_b, [_message(mid, sender, ad_id="AD-B")]))
        self.assertEqual(self.event(self.pid_b, mid)["account_id"], self.b)
        self.assertEqual(self.queued(self.a, sender), [])
        self.assertEqual([e["message_id"] for e in self.wa.list_events(self.a) if e["message_id"] == mid], [])
        self.assertEqual(len(self.queued(self.b, sender)), 1, "no rule: the workspace's generic agent calls")

    def test_an_unsigned_post_is_refused(self):
        body = _payload(self.pid_a, [_message(self.mid(), self.sender())])
        status, _ = self.ml.handle_webhook_post(body, "sha256=bad")
        self.assertEqual(status, 403)

    def test_a_number_id_must_be_metas_numeric_id(self):
        with self.assertRaises(ValueError):
            self.wa.link_number(self.a, "not-a-number")


if __name__ == "__main__":
    unittest.main(verbosity=2)
