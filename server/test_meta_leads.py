"""Meta Lead Ads Phase 1 (server/meta_leads.py), against a real Postgres
(TEST_DATABASE_URL). No network: Graph is a fake fetcher.

Covers the plan's Phase 1 done-check list: signature, a 1,000-lead batch
answered fast and written once, duplicates as no-ops, unknown Page skipped,
tenant isolation, a Page owned elsewhere refused, every form answer kept,
test leads never dialled, stale leads recorded not called, token errors flip
'needs reconnect' and retry with backoff, reconciliation inserts a missed
lead once, deletion callback erases only that user's connection, worker
resumes pending rows, token storage refused without encryption."""
import base64
import datetime
import hashlib
import hmac
import json
import os
import time
import unittest
import urllib.parse
from unittest import mock

TEST_DB = os.environ.get("TEST_DATABASE_URL")


def _sign(body: bytes, secret: str = "test-app-secret") -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _payload(page_id: str, leadgen_ids: list[str], form_id: str = "F1", ad_id: str = "AD1") -> bytes:
    return json.dumps({"object": "page", "entry": [{"id": page_id, "changes": [
        {"field": "leadgen", "value": {"leadgen_id": lid, "page_id": page_id, "form_id": form_id, "ad_id": ad_id,
                                       "created_time": 1761000000}} for lid in leadgen_ids]}]}).encode()


def _lead(leadgen_id: str, phone: str = "+919876501234", created: datetime.datetime | None = None, **over) -> dict:
    created = created or datetime.datetime.now(datetime.timezone.utc)
    lead = {
        "id": leadgen_id, "created_time": created.strftime("%Y-%m-%dT%H:%M:%S+0000"),
        "ad_id": "AD1", "ad_name": "2 BHK Khopoli launch", "adset_id": "AS1", "adset_name": "Mumbai 25-45",
        "campaign_id": "C1", "campaign_name": "Khopoli Oct", "form_id": "F1", "platform": "ig", "is_organic": False,
        "field_data": [
            {"name": "full_name", "values": ["Priya Nair"]},
            {"name": "phone_number", "values": [phone]},
            {"name": "email", "values": ["priya@example.com"]},
            {"name": "budget", "values": ["60-80 lakh"]},
            {"name": "which_city_are_you_looking_in?", "values": ["Khopoli"]},
            {"name": "preferred_bhk", "values": ["2 BHK"]},
            {"name": "when_do_you_plan_to_buy", "values": ["Within 3 months"]},
        ],
    }
    lead.update(over)
    return lead


def _signed_request(payload: dict, secret: str = "test-app-secret") -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return f"{sig}.{body}"


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class MetaLeadsPhase1(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        os.environ["META_ALLOW_PLAINTEXT_TOKENS"] = "1"
        os.environ["META_OAUTH_CLIENT_SECRET"] = "test-app-secret"
        os.environ["DISABLE_CAMPAIGN_DIALER"] = "1"
        import calls_db
        import meta_leads

        cls.db, cls.ml = calls_db, meta_leads
        calls_db.init_tables()
        meta_leads.init_tables()
        stamp = os.urandom(4).hex()
        cls.stamp = stamp
        a = calls_db.create_account_with_owner("MA", "Asha", f"ma-{stamp}@example.com", "h", email_verified=True)
        b = calls_db.create_account_with_owner("MB", "Bala", f"mb-{stamp}@example.com", "h", email_verified=True)
        cls.a, cls.a_user, cls.b, cls.b_user = a["account_id"], a["user_id"], b["account_id"], b["user_id"]
        conn = calls_db._connect()
        with conn:
            # A new account already holds its one starter agent; Growth allows the second.
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id IN (?, ?)", (cls.a, cls.b))
        conn.close()
        cls.agent_a = calls_db.create_agent({"name": "Siya"}, cls.a)["id"]
        cls.agent_b = calls_db.create_agent({"name": "Other"}, cls.b)["id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE agents SET status = 'live' WHERE id IN (?, ?)", (cls.agent_a, cls.agent_b))
        conn.close()
        tail = str(int(time.time() * 1000))[-7:]
        cls.number_a, cls.number_a2, cls.number_b = f"+91224{tail}", f"+91226{tail}", f"+91225{tail}"
        calls_db.add_phone_number(cls.number_a, cls.a, agent_id=cls.agent_a)
        calls_db.add_phone_number(cls.number_b, cls.b, agent_id=cls.agent_b)
        # A second live agent with its own number for account A: the routing
        # tests need two agents to tell apart.
        cls.agent_a2 = calls_db.create_agent({"name": "Riya"}, cls.a)["id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE agents SET status = 'live' WHERE id = ?", (cls.agent_a2,))
        conn.close()
        calls_db.add_phone_number(cls.number_a2, cls.a, agent_id=cls.agent_a2)
        cls.page_a, cls.page_b = f"PA{stamp}", f"PB{stamp}"
        cls.conn_a = meta_leads.save_connection(cls.a, "user-token-a", 5_184_000, f"fbu-a-{stamp}", "Asha FB", cls.a_user)
        cls.conn_b = meta_leads.save_connection(cls.b, "user-token-b", 5_184_000, f"fbu-b-{stamp}", "Bala FB", cls.b_user)
        meta_leads.add_page(cls.a, cls.conn_a, cls.page_a, "Khopoli Homes", "page-token-a")
        meta_leads.add_page(cls.b, cls.conn_b, cls.page_b, "Other Realty", "page-token-b")
        cls.n = 0

    # ---------------------------------------------------------------- helpers

    def lid(self) -> str:
        type(self).n += 1
        return f"L{self.stamp}{self.n:04d}"

    def phone(self) -> str:
        return f"+91987{int(self.stamp[:3], 16) % 100:02d}{self.n:05d}"

    def fetcher_for(self, leads: dict[str, dict], errors: dict[str, Exception] | None = None, reconcile: list | None = None):
        def fetch(url: str) -> dict:
            for lid, exc in (errors or {}).items():
                if f"/{lid}?" in url:
                    raise exc
            for lid, lead in leads.items():
                if f"/{lid}?" in url:
                    return lead
            if "/leads?" in url:
                return {"data": reconcile or []}
            # A shared test database keeps leads from earlier runs; the worker
            # pass may pick those up too. They just retry; this test's own rows
            # are what the assertions read.
            raise self.ml.GraphError(100, f"not this test's lead: {url}")
        return fetch

    def event(self, page_id: str, leadgen_id: str) -> dict:
        conn = self.db._connect()
        try:
            return dict(conn.execute("SELECT * FROM meta_lead_events WHERE page_id = ? AND leadgen_id = ?",
                                     (page_id, leadgen_id)).fetchone() or {})
        finally:
            conn.close()

    def queued_rows(self, account_id: int, phone: str) -> list[dict]:
        conn = self.db._connect()
        try:
            return [dict(r) for r in conn.execute(
                "SELECT cc.* FROM campaign_contacts cc WHERE cc.account_id = ? AND cc.phone = ?", (account_id, phone)).fetchall()]
        finally:
            conn.close()

    def contact(self, account_id: int, phone: str) -> dict | None:
        conn = self.db._connect()
        try:
            row = conn.execute("SELECT * FROM contacts WHERE account_id = ? AND phone = ?", (account_id, phone)).fetchone()
        finally:
            conn.close()
        if not row:
            return None
        out = dict(row)
        out["fields"] = json.loads(out["custom_fields"] or "{}")
        return out

    def receive(self, page_id: str, lids: list[str]) -> dict:
        body = _payload(page_id, lids)
        status, out = self.ml.handle_webhook_post(body, _sign(body))
        self.assertEqual(status, 200, out)
        return out

    # ------------------------------------------------------------------ tests

    def test_signature_rejected_and_accepted(self):
        body = _payload(self.page_a, [self.lid()])
        self.assertEqual(self.ml.handle_webhook_post(body, "sha256=deadbeef")[0], 403)
        self.assertEqual(self.ml.handle_webhook_post(body, "")[0], 403)
        self.assertEqual(self.ml.handle_webhook_post(body, _sign(body, "other-secret"))[0], 403)
        status, out = self.ml.handle_webhook_post(body, _sign(body))
        self.assertEqual((status, out["received"]), (200, 1))

    def test_a_1000_lead_batch_is_recorded_fast_and_only_once(self):
        lids = [self.lid() for _ in range(1000)]
        body = _payload(self.page_a, lids)
        started = time.monotonic()
        status, out = self.ml.handle_webhook_post(body, _sign(body))
        elapsed = time.monotonic() - started
        self.assertEqual((status, out["received"], out["duplicates"]), (200, 1000, 0))
        self.assertLess(elapsed, 1.5, f"webhook took {elapsed:.2f}s for 1000 leads")
        status, again = self.ml.handle_webhook_post(body, _sign(body))
        self.assertEqual((again["received"], again["duplicates"]), (0, 1000), "Meta redelivery is a no-op")
        # Not fetched yet: the webhook only records. Clean up so other tests' passes stay small.
        conn = self.db._connect()
        with conn:
            conn.execute("DELETE FROM meta_lead_events WHERE page_id = ? AND leadgen_id = ANY(?)", (self.page_a, lids))
        conn.close()

    def test_an_unknown_page_is_recorded_as_skipped_and_never_queued(self):
        lid = self.lid()
        out = self.receive("PX-unknown-" + self.stamp, [lid])
        self.assertEqual(out["received"], 1)
        row = self.event("PX-unknown-" + self.stamp, lid)
        self.assertEqual((row["status"], row["reason"], row["account_id"]), ("skipped", "unknown_page", None))
        stats = self.ml.process_pending(fetcher=self.fetcher_for({}))
        self.assertNotIn("queued", stats)

    def test_every_form_answer_and_the_ad_context_reach_the_contact_and_the_call(self):
        lid, phone = self.lid(), self.phone()
        self.receive(self.page_a, [lid])
        stats = self.ml.process_pending(fetcher=self.fetcher_for({lid: _lead(lid, phone)}))
        self.assertEqual(stats.get("queued"), 1, stats)
        row = self.event(self.page_a, lid)
        self.assertEqual(row["status"], "queued")
        self.assertIsNotNone(row["campaign_contact_id"])
        [queued] = self.queued_rows(self.a, phone)
        fields = json.loads(queued["custom_fields"])
        self.assertEqual(queued["name"], "Priya Nair")
        for part in ("Budget: 60-80 lakh", "Which city are you looking in: Khopoli", "Preferred bhk: 2 BHK",
                     "When do you plan to buy: Within 3 months"):
            self.assertIn(part, fields["form_answers"])
        self.assertEqual(fields["form_budget"], "60-80 lakh")
        self.assertEqual(fields["form_preferred_bhk"], "2 BHK")
        self.assertEqual((fields["lead_source"], fields["platform"], fields["is_organic"]), ("Instagram Ad", "instagram", "false"))
        self.assertEqual((fields["ad_name"], fields["campaign_name"], fields["adset_name"], fields["form_id"]),
                         ("2 BHK Khopoli launch", "Khopoli Oct", "Mumbai 25-45", "F1"))
        self.assertEqual((fields["page_name"], fields["meta_lead_id"], fields["email"]), ("Khopoli Homes", lid, "priya@example.com"))
        self.assertRegex(fields["form_filled_at"], r"\d{1,2} \w{3} \d{4}, \d{1,2}:\d{2} [ap]m")
        self.assertEqual(fields["source"], "meta_lead_ads")
        contact = self.contact(self.a, phone)
        self.assertEqual(contact["source"], "meta_lead_ads")
        self.assertIn("meta-lead-ads", contact["tags"])
        self.assertIn("ad:2 BHK Khopoli launch", contact["tags"])
        self.assertEqual(contact["fields"]["form_answers"], fields["form_answers"])
        conn = self.db._connect()
        try:
            self.assertIsNotNone(conn.execute("SELECT last_lead_at FROM meta_pages WHERE page_id = ?", (self.page_a,)).fetchone()["last_lead_at"])
            self.assertIsNotNone(conn.execute("SELECT 1 FROM meta_forms WHERE page_id = ? AND form_id = 'F1'", (self.page_a,)).fetchone())
            self.assertIsNotNone(conn.execute("SELECT 1 FROM inbound_lead_events WHERE account_id = ? AND source = 'meta_lead_ads' AND external_id = ?",
                                              (self.a, lid)).fetchone())
        finally:
            conn.close()
        # Processing the same lead again (a worker restart mid-way) queues nothing new.
        self.ml.process_event({"page_id": self.page_a, "leadgen_id": lid, "attempts": 0}, fetcher=self.fetcher_for({lid: _lead(lid, phone)}))
        self.assertEqual(len(self.queued_rows(self.a, phone)), 1)

    def test_tenant_a_event_never_touches_tenant_b(self):
        lid, phone = self.lid(), self.phone()
        self.receive(self.page_a, [lid])
        self.ml.process_pending(fetcher=self.fetcher_for({lid: _lead(lid, phone)}))
        self.assertEqual(self.queued_rows(self.b, phone), [])
        self.assertIsNone(self.contact(self.b, phone))
        self.assertEqual(self.event(self.page_a, lid)["account_id"], self.a)
        conn = self.db._connect()
        try:
            self.assertEqual(conn.execute("SELECT count(*) n FROM meta_lead_events WHERE account_id = ? AND leadgen_id = ?",
                                          (self.b, lid)).fetchone()["n"], 0)
        finally:
            conn.close()

    def test_a_page_owned_by_another_workspace_is_refused(self):
        with self.assertRaises(self.ml.PageOwnedElsewhere):
            self.ml.add_page(self.b, self.conn_b, self.page_a, "Khopoli Homes", "stolen-token")
        self.assertEqual(self.ml.page_owner(self.page_a)["account_id"], self.a)
        self.assertEqual(self.ml.page_owner(self.page_a)["page_token"], "page-token-a")

    def test_meta_test_leads_are_recorded_and_never_dialled(self):
        lid, phone = self.lid(), self.phone()
        self.receive(self.page_a, [lid])
        lead = _lead(lid, phone)
        lead["field_data"] = [{"name": "full_name", "values": ["Test User test lead: dummy data for full_name"]},
                              {"name": "phone_number", "values": [phone]}]
        self.ml.process_pending(fetcher=self.fetcher_for({lid: lead}))
        self.assertEqual(self.event(self.page_a, lid)["status"], "test")
        self.assertEqual(self.queued_rows(self.a, phone), [])

    def test_a_stale_lead_is_recorded_as_a_contact_but_not_called(self):
        lid, phone = self.lid(), self.phone()
        self.receive(self.page_a, [lid])
        old = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=30)
        self.ml.process_pending(fetcher=self.fetcher_for({lid: _lead(lid, phone, created=old)}))
        row = self.event(self.page_a, lid)
        self.assertEqual((row["status"], row["reason"]), ("stale", "older_than_24h"))
        self.assertIsNotNone(self.contact(self.a, phone))
        self.assertEqual(self.queued_rows(self.a, phone), [])

    def test_a_lead_without_a_phone_is_skipped(self):
        lid = self.lid()
        self.receive(self.page_a, [lid])
        lead = _lead(lid)
        lead["field_data"] = [{"name": "full_name", "values": ["No Phone"]}, {"name": "email", "values": ["x@example.com"]}]
        self.ml.process_pending(fetcher=self.fetcher_for({lid: lead}))
        self.assertEqual((self.event(self.page_a, lid)["status"], self.event(self.page_a, lid)["reason"]), ("skipped", "no_phone"))

    def test_a_dead_token_flips_needs_reconnect_retries_then_gives_up(self):
        lid = self.lid()
        self.receive(self.page_b, [lid])
        errors = {lid: self.ml.GraphError(190, "Error validating access token", 400)}
        stats = self.ml.process_pending(fetcher=self.fetcher_for({}, errors=errors))
        self.assertGreaterEqual(stats.get("received", 0), 1, stats)
        row = self.event(self.page_b, lid)
        self.assertEqual((row["status"], row["attempts"], row["reason"]), ("received", 1, "graph_190"))
        self.assertIsNotNone(row["next_attempt_at"])
        self.assertEqual(self.ml.connection(self.b)["status"], "needs_reconnect")
        self.assertEqual(self.ml.connection(self.a)["status"], "connected", "tenant A is untouched")
        # Not due yet: a pass right now leaves it alone.
        self.ml.process_pending(fetcher=self.fetcher_for({}, errors=errors))
        self.assertEqual(self.event(self.page_b, lid)["attempts"], 1)
        # Due again, on its last allowed attempt: it becomes failed, not an endless loop.
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE meta_lead_events SET attempts = ?, next_attempt_at = NULL WHERE page_id = ? AND leadgen_id = ?",
                         (self.ml.MAX_ATTEMPTS - 1, self.page_b, lid))
        conn.close()
        self.ml.process_pending(fetcher=self.fetcher_for({}, errors=errors))
        self.assertEqual(self.event(self.page_b, lid)["status"], "failed")
        # Repair for later tests.
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE meta_connections SET status = 'connected' WHERE account_id = ?", (self.b,))
        conn.close()

    def test_a_network_error_is_retried_and_the_pass_continues(self):
        bad, good, phone = self.lid(), self.lid(), self.phone()
        self.receive(self.page_a, [bad, good])
        errors = {bad: ConnectionError("boom")}
        stats = self.ml.process_pending(fetcher=self.fetcher_for({good: _lead(good, phone)}, errors=errors))
        self.assertEqual(stats.get("queued"), 1, stats)
        self.assertEqual((self.event(self.page_a, bad)["status"], self.event(self.page_a, bad)["attempts"]), ("received", 1))
        self.assertEqual(self.event(self.page_a, good)["status"], "queued")

    def test_reconciliation_inserts_a_missed_lead_once_and_the_worker_queues_it(self):
        missed, phone = self.lid(), self.phone()
        form_id = f"FR{self.stamp}"  # this class's own form: a shared test DB keeps forms from earlier runs
        conn = self.db._connect()
        with conn:
            conn.execute("INSERT INTO meta_forms (page_id, form_id, account_id, form_name) VALUES (?, ?, ?, 'Recon form') "
                         "ON CONFLICT (page_id, form_id) DO NOTHING", (self.page_a, form_id, self.a))
        conn.close()
        when = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+0000")
        lead = _lead(missed, phone, form_id=form_id)

        def fetch(url: str) -> dict:
            if f"/{missed}?" in url:
                return lead
            if f"/{form_id}/leads?" in url:
                return {"data": [{"id": missed, "created_time": when, "ad_id": "AD1"}]}
            if "/leads?" in url:
                return {"data": []}
            raise AssertionError(url)

        out = self.ml.reconcile(fetcher=fetch)
        self.assertGreaterEqual(out["forms"], 1)
        self.assertEqual(out["inserted"], 1, out)
        self.assertEqual(self.event(self.page_a, missed)["via"], "reconcile")
        self.assertEqual(self.ml.reconcile(fetcher=fetch)["inserted"], 0, "already known")
        self.ml.process_pending(fetcher=fetch)
        self.assertEqual(self.event(self.page_a, missed)["status"], "queued")

    def test_forms_are_learned_from_meta_so_a_lead_no_webhook_delivered_still_arrives(self):
        # 23 Oct, production: Meta pushes no real webhooks to an unpublished
        # app, and the Page's 4 forms were unknown, so no lead could arrive.
        live, missed, phone = f"FL{self.stamp}", self.lid(), self.phone()
        now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
        lead_urls: list[str] = []
        ad_urls: list[str] = []
        lead = _lead(missed, phone, form_id=live)

        def fetch(url: str) -> dict:
            if f"/{self.page_a}/leadgen_forms?" in url:
                self.assertIn("fields=id%2Cname&", url, "only fields Meta is known to return")
                return {"data": [{"id": live, "name": "Website offer"}, {"name": "no id"}]}
            if "/leadgen_forms?" in url:
                return {"data": []}
            if "/me/adaccounts?" in url:
                ad_urls.append(url)
                return {"data": []}
            if f"/{missed}?" in url:
                return lead
            if f"/{live}/leads?" in url:
                lead_urls.append(url)
                return {"data": [{"id": missed, "created_time": now.strftime("%Y-%m-%dT%H:%M:%S+0000")}]}
            if "/leads?" in url:
                return {"data": []}
            raise AssertionError(url)

        out = self.ml.reconcile(fetcher=fetch, now=now)
        self.assertEqual(out["inserted"], 1, out)
        self.assertTrue(ad_urls, "the catch-up also refreshes the lead ads")
        self.assertEqual(self.event(self.page_a, missed)["via"], "reconcile")
        forms = {f["formId"]: f["formName"] for f in self.ml.options(self.a)["forms"]}
        self.assertEqual(forms.get(live), "Website offer", "the rules picker lists it before any lead")
        since = json.loads(dict(urllib.parse.parse_qsl(lead_urls[0].split("?", 1)[1]))["filtering"])[0]["value"]
        self.assertEqual(since, int(now.timestamp()) - 60, "a newly found form is read from now on, not 48 h back")
        # A later sync keeps the form's place: nothing is read twice or skipped.
        self.ml.sync_forms(fetch, now + datetime.timedelta(hours=1))
        self.assertEqual(self.ml.reconcile(fetcher=fetch, now=now + datetime.timedelta(minutes=5))["inserted"], 0)
        self.ml.process_pending(fetcher=fetch)
        self.assertEqual(self.event(self.page_a, missed)["status"], "queued")

    def test_lead_ads_are_learned_from_the_ad_accounts_before_any_lead(self):
        # 23 Oct, production: the Vistrow ad account has 13 lead-form ads and
        # 1 messaging ad, but we knew 0 ads, so no ad could get its own agent.
        s = self.stamp
        urls: list[str] = []

        def ad(ad_id, page, objective="OUTCOME_LEADS", status="PAUSED"):
            return {"id": ad_id, "name": f"Ad {ad_id}", "effective_status": status, "adset": {"name": "Set 1"},
                    "campaign": {"id": f"C{s}", "name": "Clinic leads", "objective": objective}, "creative": {"actor_id": page}}

        def fetch(url: str) -> dict:
            urls.append(url)
            if "/me/adaccounts?" in url:
                return {"data": [{"account_id": "111"}, {"account_id": "222"}]}
            if "/act_111/ads?" in url and "after=2" in url:
                return {"data": [ad(f"AD2{s}", self.page_a, objective="LEAD_GENERATION")]}
            if "/act_111/ads?" in url:
                return {"data": [ad(f"AD1{s}", self.page_a),
                                 ad(f"MSG{s}", self.page_a, objective="OUTCOME_ENGAGEMENT"),
                                 ad(f"DEL{s}", self.page_a, status="DELETED"),
                                 ad(f"OTH{s}", self.page_b)],
                        "paging": {"next": f"{self.ml.GRAPH}/act_111/ads?after=2"}}
            if "/act_222/ads?" in url:
                raise self.ml.GraphError(200, "no permission on this ad account")
            raise AssertionError(url)

        self.assertEqual(self.ml.sync_ads(fetch, account_id=self.a), 2)
        ads = {a["adId"]: a for a in self.ml.options(self.a)["ads"]}
        mine = {f"AD1{s}", f"AD2{s}", f"MSG{s}", f"DEL{s}", f"OTH{s}"}
        self.assertEqual(mine & set(ads), {f"AD1{s}", f"AD2{s}"},
                         "only lead ads on this workspace's Pages; not messaging, deleted or another workspace's")
        self.assertEqual((ads[f"AD1{s}"]["adName"], ads[f"AD1{s}"]["campaignName"]), (f"Ad AD1{s}", "Clinic leads"))
        self.assertTrue(any("/act_222/ads?" in u for u in urls), "a refused ad account is skipped, not fatal")
        self.assertIn("fields=" + urllib.parse.quote(self.ml._AD_FIELDS, safe=""), next(u for u in urls if "/act_111/ads?" in u))
        # An ad on another workspace's Page never lands in this one.
        self.assertNotIn(f"OTH{s}", {a["adId"] for a in self.ml.options(self.a)["ads"]})
        self.assertNotIn(f"OTH{s}", {a["adId"] for a in self.ml.options(self.b)["ads"]}, "only synced for its own workspace's connection")
        # An ad found up front can carry its own rule straight away.
        rule = self.rule(self.page_a, "ad", f"AD1{s}", self.agent_a2, label="Clinic ad")
        try:
            route, _ = self.ml.resolve_route(self.a, self.page_a, "", f"AD1{s}")
            self.assertEqual((route["agentId"], route["matchKind"]), (self.agent_a2, "ad"))
        finally:
            self.ml.delete_rule(self.a, rule["id"])

    def test_the_access_log_never_prints_the_webhook_verify_token(self):
        import logging

        record = logging.LogRecord("uvicorn.access", logging.INFO, __file__, 1, '%s - "%s %s HTTP/%s" %d', (
            "1.2.3.4:5", "GET", "/webhooks/meta?hub.mode=subscribe&hub.verify_token=SECRET1&hub.challenge=9"
                               "&hub_verify_token=SECRET2", "1.1", 200), None)
        for log_filter in logging.getLogger("uvicorn.access").filters:
            log_filter.filter(record)
        line = record.getMessage()
        self.assertNotIn("SECRET", line)
        self.assertIn("hub.verify_token=REDACTED", line)
        self.assertIn("hub.challenge=9", line)

    def test_worker_picks_up_rows_left_pending_by_a_restart(self):
        lids = [self.lid(), self.lid()]
        phones = [self.phone(), self.phone()]
        self.receive(self.page_a, lids)
        self.assertEqual(self.ml.backlog() >= 2, True)
        stats = self.ml.process_pending(fetcher=self.fetcher_for({l: _lead(l, p) for l, p in zip(lids, phones)}))
        self.assertEqual(stats.get("queued"), 2, stats)

    def test_deauthorize_and_deletion_touch_only_that_facebook_user(self):
        secret = "test-app-secret"
        self.assertIsNone(self.ml.parse_signed_request(_signed_request({"user_id": "x"}, "wrong"), secret))
        payload = self.ml.parse_signed_request(_signed_request({"user_id": f"fbu-b-{self.stamp}"}), secret)
        self.assertEqual(payload["user_id"], f"fbu-b-{self.stamp}")
        self.assertEqual(self.ml.deauthorize(f"fbu-b-{self.stamp}"), 1)
        self.assertEqual(self.ml.connection(self.b)["status"], "needs_reconnect")
        self.assertEqual(self.ml.connection(self.a)["status"], "connected")
        code = self.ml.delete_user_data(f"fbu-b-{self.stamp}")
        self.assertEqual(self.ml.deletion_status(code)["status"], "done")
        conn_b = self.ml.connection(self.b)
        self.assertEqual((conn_b["status"], conn_b["user_token"], conn_b["fb_user_name"]), ("disconnected", "", ""))
        self.assertEqual(self.ml.connection(self.a)["user_token"], "user-token-a")
        self.assertIsNone(self.ml.deletion_status("nope"))

    def test_tokens_are_never_stored_in_plaintext_without_opting_in(self):
        with mock.patch.dict(os.environ, {"META_ALLOW_PLAINTEXT_TOKENS": "", "INTEGRATION_ENCRYPTION_WRITE": ""}):
            self.assertFalse(self.ml.token_storage_ok())
            with self.assertRaises(self.ml.TokenStorageUnavailable):
                self.ml.save_connection(self.a, "t", 1, "u", "n", None)
            with self.assertRaises(self.ml.TokenStorageUnavailable):
                self.ml.add_page(self.a, self.conn_a, "PZ" + self.stamp, "Z", "t")

    def test_oauth_helpers_exchange_list_and_subscribe_through_graph(self):
        calls: list[str] = []

        def fetch(url: str) -> dict:
            calls.append(url)
            if "oauth/access_token" in url and "fb_exchange_token" in url:
                return {"access_token": "LONG", "expires_in": 5184000}
            if "oauth/access_token" in url:
                return {"access_token": "SHORT", "expires_in": 3600}
            if url.startswith(self.ml.GRAPH + "/me?"):
                return {"id": "fbu-1", "name": "Asha"}
            if "/me/accounts" in url:
                return {"data": []}
            if "/debug_token" in url:
                return {"data": {"granular_scopes": [{"scope": "pages_show_list", "target_ids": ["P9"]}]}}
            if url.startswith(self.ml.GRAPH + "/P9?"):
                return {"id": "P9", "name": "New Pages Experience Page", "access_token": "PT9"}
            if "/P9/subscribed_apps" in url:
                return {"data": [{"id": "app", "subscribed_fields": ["leadgen"]}]}
            raise AssertionError(url)

        token = self.ml.exchange_code("CODE", "https://x/cb", "APP", "SECRET", fetcher=fetch)
        self.assertEqual((token["access_token"], token["long_lived"]), ("LONG", True))
        pages = self.ml.list_user_pages("LONG", "APP", "SECRET", fetcher=fetch)
        self.assertEqual([(p["id"], p["name"], p["fb_user_id"]) for p in pages], [("P9", "New Pages Experience Page", "fbu-1")])
        posted: list[tuple] = []
        self.ml.add_page(self.a, self.conn_a, "P9" + self.stamp, "NPE", "PT9")
        ok = self.ml.subscribe_page("P9", "PT9", poster=lambda url, data: posted.append((url, data)) or {"success": True}, fetcher=fetch)
        self.assertTrue(ok)
        self.assertEqual(posted[0][1]["subscribed_fields"], "leadgen")
        url = self.ml.oauth_start_url("STATE", "https://x/cb", "APP")
        self.assertIn("auth_type=rerequest", url)
        self.assertIn("leads_retrieval", url)

    def test_a_business_login_configuration_replaces_scope_and_its_token_never_expires(self):
        url = self.ml.oauth_start_url("STATE", "https://x/cb", "APP", "CFG1")
        query = dict(urllib.parse.parse_qsl(url.split("?", 1)[1]))
        self.assertEqual((query["config_id"], query["override_default_response_type"], query["response_type"]), ("CFG1", "true", "code"))
        self.assertNotIn("scope", query)
        calls: list[str] = []

        def fetch(url: str) -> dict:
            calls.append(url)
            if "oauth/access_token" in url:
                return {"access_token": "SYSTEM-USER", "token_type": "bearer"}
            raise AssertionError(url)

        token = self.ml.exchange_code("CODE", "https://x/cb", "APP", "SECRET", fetcher=fetch)
        self.assertEqual(token, {"access_token": "SYSTEM-USER", "expires_in": None, "long_lived": True})
        self.assertFalse(any("fb_exchange_token" in c for c in calls), "a never-expiring token is not re-exchanged")
        acct = self.db.create_account_with_owner("MS", "Sam", f"ms-{self.stamp}@example.com", "h", email_verified=True)
        self.ml.save_connection(acct["account_id"], token["access_token"], token["expires_in"], "sys-1", "Sys", acct["user_id"])
        self.assertIsNone(self.ml.status_for(acct["account_id"])["tokenExpiresAt"])

    def test_the_popup_result_page_reports_back_and_never_echoes_arbitrary_input(self):
        html = self.ml.popup_result_page("pick_pages", "https://app.example/dashboard/integrations/facebook?facebook=pick_pages").body.decode()
        self.assertIn('{"source": "vv-meta", "result": "pick_pages"}', html)
        self.assertIn("BroadcastChannel('vv-meta')", html)
        self.assertIn("window.close()", html)
        evil = self.ml.popup_result_page("<script>alert(1)</script>", "https://x/</script><script>alert(2)").body.decode()
        self.assertIn('"result": "failed"', evil)
        self.assertNotIn("alert(1)", evil)
        self.assertNotIn("</script><script>", evil)

    def test_the_connect_routes_use_the_popup_only_when_asked(self):
        from starlette.requests import Request

        def request(cookie: str = "") -> Request:
            return Request({"type": "http", "method": "GET", "path": "/", "query_string": b"",
                            "headers": [(b"cookie", cookie.encode())] if cookie else []})

        def set_cookies(response) -> dict:
            out = {}
            for name, value in response.raw_headers:
                if name == b"set-cookie":
                    key, _, rest = value.decode().partition("=")
                    out[key] = rest.split(";", 1)[0].strip('"')
            return out

        saved = dict(self.ml._deps)
        env = {"META_OAUTH_CLIENT_ID": "APP", "META_OAUTH_REDIRECT_URI": "https://app.example/api/auth/oauth/meta/callback",
               "META_LOGIN_CONFIG_ID": "CFG1"}
        self.ml.configure(require_admin=None, live_session=lambda request: {"uid": self.a_user},
                          app_base_url=lambda request: "https://app.example", cookie_secure=False)
        try:
            with mock.patch.dict(os.environ, env):
                start = self.ml.meta_start(request(), popup=1)
                self.assertEqual(start.status_code, 307)
                self.assertIn("config_id=CFG1", start.headers["location"])
                self.assertEqual(set_cookies(start).get("vv_meta_popup"), "1")
                # Facebook sends the pop-up back (here with a cancelled sign-in).
                back = self.ml.meta_callback(request("vv_meta_popup=1; vv_meta_state=s"), error="access_denied", state="s")
                self.assertEqual(back.status_code, 200)
                self.assertIn('"result": "failed"', back.body.decode())
                self.assertEqual(set_cookies(back).get("vv_meta_popup"), "", "the pop-up flag is cleared")
                # The full-page flow is unchanged.
                plain_start = self.ml.meta_start(request(), popup=0)
                self.assertEqual(set_cookies(plain_start).get("vv_meta_popup"), "", "a stale pop-up flag is cleared")
                plain = self.ml.meta_callback(request("vv_meta_state=s"), error="access_denied", state="s")
                self.assertEqual(plain.status_code, 307)
                self.assertEqual(plain.headers["location"], "https://app.example/dashboard/integrations/facebook?facebook=failed")
        finally:
            self.ml._deps.clear()
            self.ml._deps.update(saved)


    # ------------------------------------------------------ phase 2: routing

    def rule(self, page_id, kind, value, agent_id, from_number="", label="", account=None) -> dict:
        return self.ml.create_rule(account or self.a, {"pageId": page_id, "matchKind": kind, "matchValue": value,
                                                       "agentId": agent_id, "fromNumber": from_number, "label": label})

    def set_agent_status(self, agent_id: int, status: str) -> None:
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE agents SET status = ? WHERE id = ?", (status, agent_id))
        conn.close()

    def test_route_precedence_ad_beats_form_beats_page_default_exact_match_only(self):
        ad, form = f"ADP{self.stamp}", f"FMP{self.stamp}"
        self.rule(self.page_a, "ad", ad, self.agent_a2, label="Launch ad")
        self.rule(self.page_a, "form", form, self.agent_a, label="Brochure form")
        self.ml.set_page_default(self.a, self.page_a, self.agent_a2, self.number_a2)
        try:
            route, reason = self.ml.resolve_route(self.a, self.page_a, form, ad)
            self.assertEqual((route["agentId"], route["matchKind"], route["label"], route["fromNumber"], reason),
                             (self.agent_a2, "ad", "Launch ad", self.number_a2, ""))
            route, _ = self.ml.resolve_route(self.a, self.page_a, form, "AD-other")
            self.assertEqual((route["agentId"], route["matchKind"], route["fromNumber"]), (self.agent_a, "form", self.number_a),
                             "a rule without a number dials from the agent's own number")
            route, _ = self.ml.resolve_route(self.a, self.page_a, "FM-other", "AD-other")
            self.assertEqual((route["agentId"], route["matchKind"]), (self.agent_a2, "page"))
            route, _ = self.ml.resolve_route(self.a, self.page_a, form, ad + "0")
            self.assertEqual(route["matchKind"], "form", "a different ad id is not a match")
        finally:
            self.ml.set_page_default(self.a, self.page_a, None, "")
        self.assertEqual(self.ml.resolve_route(self.a, self.page_a, "FM-other", "AD-other"), (None, "no_rules"))

    def test_a_rule_may_only_name_this_workspaces_page_agent_and_number(self):
        ad = f"ADX{self.stamp}"
        with self.assertRaises(ValueError) as ctx:
            self.rule(self.page_a, "ad", ad, self.agent_b)
        self.assertIn("not found in this workspace", str(ctx.exception))
        with self.assertRaises(ValueError) as ctx:
            self.rule(self.page_a, "ad", ad, self.agent_a, from_number=self.number_b)
        self.assertIn("not one of this workspace", str(ctx.exception))
        with self.assertRaises(ValueError) as ctx:
            self.rule(self.page_b, "ad", ad, self.agent_a)
        self.assertIn("not connected to this workspace", str(ctx.exception))
        with self.assertRaises(ValueError):
            self.rule(self.page_a, "campaign", ad, self.agent_a)
        no_number = self.db.create_agent({"name": "No number"}, self.a)["id"]
        self.set_agent_status(no_number, "live")
        with self.assertRaises(ValueError) as ctx:
            self.rule(self.page_a, "ad", ad, no_number)
        self.assertIn("no phone number", str(ctx.exception))
        self.set_agent_status(self.agent_a2, "paused")
        try:
            with self.assertRaises(ValueError) as ctx:
                self.rule(self.page_a, "ad", ad, self.agent_a2)
            self.assertIn("paused", str(ctx.exception))
        finally:
            self.set_agent_status(self.agent_a2, "live")
        self.assertNotIn(ad, [r["matchValue"] for r in self.ml.list_rules(self.a)], "nothing was written")

    def test_another_workspaces_rule_never_matches(self):
        ad = f"ADB{self.stamp}"
        self.rule(self.page_b, "ad", ad, self.agent_b, account=self.b)
        self.assertEqual(self.ml.resolve_route(self.a, self.page_a, "", ad), (None, "no_rules"))
        self.assertEqual(self.ml.resolve_route(self.a, self.page_b, "", ad), (None, "no_rules"))
        route, _ = self.ml.resolve_route(self.b, self.page_b, "", ad)
        self.assertEqual(route["agentId"], self.agent_b)
        self.assertNotIn(ad, [r["matchValue"] for r in self.ml.list_rules(self.a)])

    def test_a_paused_agent_on_the_winning_rule_stops_the_call_with_the_reason(self):
        ad, lid, phone = f"ADQ{self.stamp}", self.lid(), self.phone()
        self.rule(self.page_a, "ad", ad, self.agent_a2)
        self.set_agent_status(self.agent_a2, "paused")
        try:
            self.assertEqual(self.ml.resolve_route(self.a, self.page_a, "", ad), (None, "agent_paused"))
            self.receive(self.page_a, [lid])
            self.ml.process_pending(fetcher=self.fetcher_for({lid: _lead(lid, phone, ad_id=ad)}))
            row = self.event(self.page_a, lid)
            self.assertEqual((row["status"], row["reason"]), ("skipped", "agent_paused"))
            self.assertEqual(self.queued_rows(self.a, phone), [], "never called from a different agent")
            self.assertIsNotNone(self.contact(self.a, phone), "but the lead is kept")
        finally:
            self.set_agent_status(self.agent_a2, "live")

    def test_a_duplicate_rule_is_refused_and_delete_is_scoped(self):
        ad = f"ADD{self.stamp}"
        self.rule(self.page_a, "ad", ad, self.agent_a)
        with self.assertRaises(self.ml.DuplicateRule):
            self.rule(self.page_a, "ad", ad, self.agent_a2)
        [item] = [r for r in self.ml.list_rules(self.a) if r["matchValue"] == ad]
        self.assertEqual((item["pageId"], item["matchKind"], item["agentId"], item["fromNumber"]), (self.page_a, "ad", self.agent_a, ""))
        self.assertFalse(self.ml.delete_rule(self.b, item["id"]), "another workspace cannot delete it")
        self.assertTrue(self.ml.delete_rule(self.a, item["id"]))
        self.assertNotIn(ad, [r["matchValue"] for r in self.ml.list_rules(self.a)])

    def test_options_list_only_this_workspaces_forms_ads_agents_and_numbers(self):
        lid, phone, ad, form = self.lid(), self.phone(), f"ADO{self.stamp}", f"FO{self.stamp}"
        self.receive(self.page_a, [lid])
        self.ml.process_pending(fetcher=self.fetcher_for({lid: _lead(lid, phone, ad_id=ad, ad_name="Options ad", form_id=form)}))
        out = self.ml.options(self.a)
        self.assertIn((self.page_a, ad, "Options ad", "Khopoli Oct"),
                      [(a["pageId"], a["adId"], a["adName"], a["campaignName"]) for a in out["ads"]])
        self.assertIn((self.page_a, form), [(f["pageId"], f["formId"]) for f in out["forms"]])
        self.assertTrue(all(f["pageId"] != self.page_b for f in out["forms"]))
        self.assertTrue(all(a["pageId"] != self.page_b for a in out["ads"]))
        agent_ids = {a["id"] for a in out["agents"]}
        self.assertTrue({self.agent_a, self.agent_a2} <= agent_ids)
        self.assertNotIn(self.agent_b, agent_ids)
        self.assertEqual({n["number"] for n in out["numbers"]}, {self.number_a, self.number_a2})
        self.assertNotIn(ad, [a["adId"] for a in self.ml.options(self.b)["ads"]])

    def test_a_processed_lead_stores_its_route_and_is_queued_for_the_rules_agent(self):
        ad, lid, phone = f"ADR{self.stamp}", self.lid(), self.phone()
        self.rule(self.page_a, "ad", ad, self.agent_a2, from_number=self.number_a2, label="Riya takes launch leads")
        self.receive(self.page_a, [lid])
        self.ml.process_pending(fetcher=self.fetcher_for({lid: _lead(lid, phone, ad_id=ad)}))
        row = self.event(self.page_a, lid)
        self.assertEqual((row["status"], row["route_agent_id"], row["route_from_number"], row["route_label"]),
                         ("queued", self.agent_a2, self.number_a2, "Riya takes launch leads"))
        [queued] = self.queued_rows(self.a, phone)
        self.assertEqual(json.loads(queued["custom_fields"])["route_label"], "Riya takes launch leads")
        conn = self.db._connect()
        try:
            campaign = dict(conn.execute("SELECT name, agent_id, from_number FROM campaigns WHERE id = ?", (queued["campaign_id"],)).fetchone())
        finally:
            conn.close()
        if self.ml._INGEST_ACCEPTS_ROUTE:
            self.assertEqual((campaign["name"], campaign["agent_id"], campaign["from_number"]),
                             ("Meta Instant Follow-up", self.agent_a2, self.number_a2))
            self.assertEqual(row["reason"], "")
        else:
            self.assertEqual(row["reason"], "route_not_wired_generic_agent")

    def test_leads_list_says_who_the_lead_is_and_links_the_call(self):
        lid, phone = self.lid(), self.phone()
        self.receive(self.page_a, [lid])
        self.ml.process_pending(fetcher=self.fetcher_for({lid: _lead(lid, phone)}))
        [item] = [i for i in self.ml.list_events(self.a) if i["leadgen_id"] == lid]
        self.assertEqual((item["name"], item["phone"], item["call_id"], item["status"]), ("Priya Nair", phone, None, "queued"))
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE campaign_contacts SET call_id = 424242 WHERE id = ?", (item["campaign_contact_id"],))
        conn.close()
        [item] = [i for i in self.ml.list_events(self.a) if i["leadgen_id"] == lid]
        self.assertEqual(item["call_id"], 424242)
        # A lead that was never queued is still named, from inbound_lead_events.
        lid2 = self.lid()
        self.receive(self.page_a, [lid2])
        lead = _lead(lid2)
        lead["field_data"] = [{"name": "full_name", "values": ["No Phone"]}]
        self.ml.process_pending(fetcher=self.fetcher_for({lid2: lead}))
        [item2] = [i for i in self.ml.list_events(self.a) if i["leadgen_id"] == lid2]
        self.assertEqual((item2["status"], item2["name"], item2["phone"], item2["call_id"]), ("skipped", "No Phone", "", None))
        self.assertEqual([i for i in self.ml.list_events(self.b) if i["leadgen_id"] in (lid, lid2)], [])

    def test_the_integrations_card_and_status_follow_connect_and_disconnect(self):
        stamp = os.urandom(3).hex()
        c = self.db.create_account_with_owner("MC", "Chitra", f"mc-{stamp}@example.com", "h", email_verified=True)
        acct, page_c = c["account_id"], f"PC{stamp}"
        self.assertFalse(self.ml.status_for(acct)["connected"])
        cid = self.ml.save_connection(acct, "tok-c", 5_184_000, f"fbu-c-{stamp}", "Chitra FB", c["user_id"])
        self.assertFalse(self.ml.status_for(acct)["connected"], "a connection without a Page cannot receive leads")
        with self.assertRaises(ValueError):
            self.ml.connect_pages(acct, {page_c})
        self.db.set_setting(self.ml._PENDING_PAGES_SETTING, self.ml._enc(json.dumps({"connection_id": cid, "pages": [
            {"id": page_c, "name": "Chitra Homes", "access_token": "pt-c"},
            {"id": self.page_a, "name": "Khopoli Homes", "access_token": "stolen"}]})), acct)
        asked: list[str] = []
        out = self.ml.connect_pages(acct, {page_c, self.page_a}, poster=lambda url, data: {"success": True},
                                    fetcher=lambda url: asked.append(url) or {"data": [{"subscribed_fields": ["leadgen"]}]})
        self.assertTrue(out["ok"])
        self.assertTrue(any(f"/{page_c}/leadgen_forms?" in u for u in asked), "the new Page's forms are fetched at connect")
        self.assertTrue(any("/me/adaccounts?" in u for u in asked), "and its lead ads")
        self.assertEqual({(r["pageId"], r.get("ok"), r.get("reason")) for r in out["results"]},
                         {(page_c, True, None), (self.page_a, False, "owned_elsewhere")})
        self.assertEqual(self.ml.page_owner(self.page_a)["account_id"], self.a, "the other workspace's Page stays theirs")
        self.assertTrue(self.ml.status_for(acct)["connected"])
        card = next(i for i in self.db.list_integrations(acct) if i["key"] == "facebook")
        self.assertEqual((card["status"], card["config"]), ("connected", {"pages": 1}))
        self.assertIsNone(self.db.get_setting(self.ml._PENDING_PAGES_SETTING, acct) or None, "candidates are cleared")
        self.ml.disconnect(acct, poster=lambda url, data: {})
        self.assertFalse(self.ml.status_for(acct)["connected"])
        card = next(i for i in self.db.list_integrations(acct) if i["key"] == "facebook")
        self.assertEqual((card["status"], card["config"]), ("not_connected", {}))

    def test_a_page_without_rules_uses_the_generic_agent_and_says_so(self):
        lid, phone = self.lid(), self.phone()
        self.receive(self.page_b, [lid])
        self.ml.process_pending(fetcher=self.fetcher_for({lid: _lead(lid, phone, ad_id=f"ADN{self.stamp}")}))
        row = self.event(self.page_b, lid)
        self.assertEqual((row["status"], row["reason"], row["route_agent_id"]), ("queued", "no_route_generic_agent", None))


if __name__ == "__main__":
    unittest.main(verbosity=2)
