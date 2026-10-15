"""An ArthaLeads lead is called within 30 seconds, with everything we know.

Owner's promise: "When a lead arrives from ArthaLeads (Facebook form, website,
Google, Click-to-WhatsApp ad), Vistrow calls them within 30 seconds, with all
the information we have." Before 2026-10-15 the dialer slept a full 15 s tick
after a lead was queued, form answers and tags (list values) were dropped on
the way in, and an after-hours lead got no hint of when it would be called.

DB tests run against a throwaway Postgres (TEST_DATABASE_URL), never the repo
.env."""
import ast
import asyncio
import datetime
import importlib.util
import json
import os
import re
import sys
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import campaign_dialer

ROOT = Path(__file__).resolve().parent.parent
TEST_DB = os.environ.get("TEST_DATABASE_URL")


def _token_api_namespace(calls_db, dialer):
    """leads_inbound and its helpers, lifted out of token_api.py (importing the
    module would boot the whole app against whatever DATABASE_URL is set)."""
    tree = ast.parse((ROOT / "server/token_api.py").read_text())
    wanted = {"_LEAD_CONTROL_CHARS", "_FORM_IDENTITY_KEYS", "_lead_text", "_lead_form_fields",
              "_queued_until", "leads_inbound", "_parse_facebook_field_data"}
    body = []
    for node in tree.body:
        name = getattr(node, "name", None) or next(
            (t.id for t in getattr(node, "targets", []) if isinstance(t, ast.Name)), None)
        if name in wanted:
            if hasattr(node, "decorator_list"):
                node.decorator_list = []
            body.append(node)
    ns = {"re": re, "asyncio": asyncio, "calls_db": calls_db, "campaign_dialer": dialer,
          "logger": Mock(), "HTTPException": Exception, "Request": object}
    exec(compile(ast.Module(body=body, type_ignores=[]), "token_api.py", "exec"), ns)
    return ns


def _request(body, token="key"):
    async def _json():
        return body
    return SimpleNamespace(headers={"x-vistrow-webhook-token": token}, json=_json)


def _agent_contact_notes():
    spec = importlib.util.spec_from_file_location("agent_contact_notes", ROOT / "agent/contact_notes.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# What ArthaLeads' payload.js sends for a Facebook lead-form lead.
FACEBOOK_LEAD = {
    "event": "lead.created", "source": "arthaleads", "org_id": "org1",
    "lead_id": "fb1", "id": "evt_lc_fb1", "event_id": "evt_lc_fb1", "created_at": "2026-10-15T10:00:00.000Z",
    "name": "Priya Sharma", "phone": "+919812300011", "email": "priya@example.com",
    "lead_source": "Facebook Ad", "project": "SP Khopoli",
    "campaign_id": "120200", "campaign_name": "Khopoli Oct", "ad_id": "120201",
    "ad_name": "Khopoli 2BHK carousel", "form_id": "889", "form_name": "Khopoli enquiry",
    "budget": "INR 45,00,000 - 60,00,000", "auto_call": True,
    "custom_fields": {
        "arthaleads_source": "Facebook", "page_id": "1020", "adset_id": "55", "adset_name": "Pune 30-45",
        "meta_lead_id": "77001", "project_id": "p-9", "status": "New",
        "budget_min": 4500000, "budget_max": 6000000, "budget_currency": "INR",
        "tags": ["hot", "2bhk"],
        "form_responses": [
            {"key": "full_name", "label": "Full name", "value": "Priya Sharma"},
            {"key": "phone_number", "label": "Phone number", "value": "+919812300011"},
            {"key": "when_do_you_plan_to_buy?", "label": "When do you plan to buy?", "value": "Within 3 months"},
            {"key": "preferred_configuration", "label": "Preferred configuration", "value": "2 BHK\x07\nwith balcony"},
            {"key": "preferred_language", "label": "Preferred language", "value": "Telugu"},
        ],
        "whatsapp_consent": {"status": "granted", "scope": "whatsapp_marketing"},
    },
}

# A Click-to-WhatsApp ad lead: no form, the ad the person tapped, their first message.
CTWA_LEAD = {
    "event": "lead.created", "source": "arthaleads", "org_id": "org1",
    "lead_id": "wa1", "id": "evt_lc_wa1", "event_id": "evt_lc_wa1", "created_at": "2026-10-15T10:01:00.000Z",
    "name": "Rahul", "phone": "+919812300022", "whatsapp": "+919812300022",
    "lead_source": "WhatsApp", "project": "SP Khopoli", "ad_id": "120300", "auto_call": True,
    "custom_fields": {
        "arthaleads_source": "WhatsApp",
        "ad_headline": "2 & 3 BHK at Khopoli from 45 L",
        "ad_body": "Riverside homes near the expressway. Tap to chat for the price sheet.",
        "ad_source_url": "https://fb.me/abc",
        "whatsapp_first_message": "Hi, I want to know more about this project",
        "consent_basis": "whatsapp_marketing_opt_in",
    },
}


class DialOnArrival(unittest.TestCase):
    """notify() runs a dialer pass at once instead of after the 15 s tick."""

    def _run_loop(self, running):
        """Start the real _loop with a 60 s tick; stop it when the test ends.
        SystemExit escapes the loop's `except Exception` and ends the thread
        quietly, so no loop outlives its patches."""
        stop = threading.Event()

        def guarded():
            if stop.is_set():
                raise SystemExit
            return running()

        patches = [patch.object(campaign_dialer, "_TICK_SECONDS", 60),
                   patch.object(campaign_dialer.calls_db, "promote_due_scheduled_campaigns", return_value=0),
                   patch.object(campaign_dialer.calls_db, "running_campaigns", side_effect=guarded)]
        for p in patches:
            p.start()
        thread = threading.Thread(target=campaign_dialer._loop, daemon=True)
        thread.start()

        def finish():
            # The thread's SystemExit is the intended way out, not a failure.
            with patch.object(threading, "excepthook", lambda args: None):
                stop.set()
                campaign_dialer.notify()
                thread.join(5)
            for p in patches:
                p.stop()
            self.assertFalse(thread.is_alive())
        self.addCleanup(finish)

    def test_notify_wakes_the_loop_well_before_the_tick(self):
        passes = []
        first_pass = threading.Event()
        woken = threading.Event()

        def running():
            passes.append(time.monotonic())
            (woken if first_pass.is_set() else first_pass).set()
            return []

        self._run_loop(running)
        self.assertTrue(first_pass.wait(5))
        time.sleep(0.2)  # the loop is now parked in its 60 s wait
        notified_at = time.monotonic()
        campaign_dialer.notify()
        self.assertTrue(woken.wait(2), "notify() did not wake the dialer")
        self.assertLess(passes[1] - notified_at, 1.0)
        # Woken once, it goes back to waiting for the tick.
        time.sleep(0.3)
        self.assertEqual(len(passes), 2)

    def test_instant_lead_campaigns_are_dialled_first(self):
        campaigns = [{"id": 1, "name": "Diwali list"}, {"id": 2, "name": "ArthaLeads Instant Follow-up"},
                     {"id": 3, "name": "Old list"}, {"id": 4, "name": "Instant Lead Follow-up"}]
        order = []
        done = threading.Event()

        def dial(campaign):
            order.append(campaign["id"])
            if len(order) == 4:
                done.set()

        dial_patch = patch.object(campaign_dialer, "_dial_one", side_effect=dial)
        dial_patch.start()
        self.addCleanup(dial_patch.stop)
        self._run_loop(lambda: [dict(c) for c in campaigns])
        self.assertTrue(done.wait(5))
        self.assertEqual(order, [2, 4, 1, 3])


class FormAnswersAndTags(unittest.TestCase):
    def setUp(self):
        self.ns = _token_api_namespace(Mock(), Mock())

    def test_form_responses_and_tags_become_readable_strings(self):
        out = self.ns["_lead_form_fields"](FACEBOOK_LEAD["custom_fields"])
        self.assertEqual(out["form_answers"],
                         "When do you plan to buy?: Within 3 months · "
                         "Preferred configuration: 2 BHK with balcony · Preferred language: Telugu")
        self.assertEqual(out["form_when_do_you_plan_to_buy"], "Within 3 months")
        self.assertEqual(out["tags"], "hot, 2bhk")
        self.assertEqual(out["language"], "Telugu")
        # The contact's own name/phone are not "answers", and no control char survives.
        self.assertNotIn("Priya", out["form_answers"])
        self.assertFalse(any(re.search(r"[\x00-\x1f]", v) for v in out.values()))

    def test_untrusted_values_are_capped(self):
        out = self.ns["_lead_form_fields"]({
            "form_responses": [{"key": f"q{i}", "label": "Q" * 500, "value": "x" * 900} for i in range(40)],
            "tags": ["t" * 90] * 40,
        })
        self.assertLessEqual(len(out["form_answers"]), 1200)
        self.assertLessEqual(len(out["form_q0"]), 300)
        self.assertLessEqual(len(out["tags"]), 500)
        self.assertEqual(len([k for k in out if k.startswith("form_q")]), 30)

    def test_garbage_shapes_are_ignored(self):
        f = self.ns["_lead_form_fields"]
        self.assertEqual(f({"form_responses": "nope", "tags": "a,b"}), {})
        self.assertEqual(f({"form_responses": [None, 3, {"key": "x", "value": ""}]}), {})


class LeadsInboundRoute(unittest.TestCase):
    def _call(self, body, ingest_result, opens=None):
        threads = []

        def ingest(*args, **kwargs):
            threads.append(threading.current_thread())
            ingest.kwargs = kwargs
            return ingest_result

        db = SimpleNamespace(
            account_id_for_lead_webhook_token=Mock(return_value=42),
            ingest_inbound_lead=ingest,
            next_calling_window_open=Mock(return_value=opens),
        )
        dialer = Mock()
        ns = _token_api_namespace(db, dialer)
        result = asyncio.run(ns["leads_inbound"](42, _request(body)))
        return result, ingest.kwargs, dialer, threads

    def test_queued_lead_wakes_the_dialer_off_the_event_loop(self):
        result, kwargs, dialer, threads = self._call(
            FACEBOOK_LEAD, {"ok": True, "queued": True, "campaign_id": 1, "contact_id": 2})
        dialer.notify.assert_called_once_with()
        self.assertIsNot(threads[0], threading.main_thread())  # ran via asyncio.to_thread
        self.assertNotIn("queued_until", result)
        fields = kwargs["custom_fields"]
        self.assertIn("When do you plan to buy?: Within 3 months", fields["form_answers"])
        self.assertEqual(fields["tags"], "hot, 2bhk")
        self.assertEqual(fields["preferred_language"], "Telugu")
        self.assertEqual(fields["ad_name"], "Khopoli 2BHK carousel")

    def test_top_level_language_beats_a_form_answer(self):
        _r, kwargs, _d, _t = self._call({**FACEBOOK_LEAD, "language": "Hindi"}, {"ok": True, "queued": False})
        self.assertEqual(kwargs["custom_fields"]["preferred_language"], "Hindi")

    def test_lead_not_queued_does_not_wake_the_dialer(self):
        result, _k, dialer, _t = self._call(FACEBOOK_LEAD, {"ok": True, "queued": False, "reason": "auto_call_off"})
        dialer.notify.assert_not_called()
        self.assertNotIn("queued_until", result)

    def test_after_hours_lead_says_when_it_will_be_called(self):
        opens = datetime.datetime(2026, 10, 16, 9, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=5, minutes=30)))
        result, _k, dialer, _t = self._call(FACEBOOK_LEAD, {"ok": True, "queued": True}, opens=opens)
        self.assertEqual(result["queued_until"], "2026-10-16T09:00:00+05:30")
        dialer.notify.assert_called_once_with()  # harmless: the dialer's own window gate holds it

    def test_generic_lead_source_also_wakes_the_dialer(self):
        _r, _k, dialer, threads = self._call({"name": "A", "phone": "+919812300033"}, {"ok": True, "queued": True})
        dialer.notify.assert_called_once_with()
        self.assertIsNot(threads[0], threading.main_thread())


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
        kb = self.sql("INSERT INTO knowledge_bases (account_id, name) VALUES (?, 'Khopoli') RETURNING id", (self.aid,))["id"]
        self.agent = self.sql(
            "INSERT INTO agents (account_id, name, status, kb_id) VALUES (?, 'Siya', 'live', ?) RETURNING id",
            (self.aid, kb),
        )["id"]
        self.number = f"+9180{int.from_bytes(os.urandom(4), 'big') % 10**8:08d}"
        self.sql("INSERT INTO phone_numbers (account_id, number, agent_id, status) VALUES (?, ?, ?, 'active')",
                 (self.aid, self.number, self.agent))
        self.db.save_compliance(self.aid, {
            "timezone": "Asia/Kolkata", "window_start": "09:00", "window_end": "21:00",
            "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "enforce_window": True,
        })

    def ist(self, *args):
        return datetime.datetime(*args, tzinfo=datetime.timezone(datetime.timedelta(hours=5, minutes=30)))

    def test_next_window_open(self):
        nxt = self.db.next_calling_window_open
        self.assertIsNone(nxt(self.aid, self.ist(2026, 10, 14, 10, 0)))          # Wed, open
        self.assertEqual(nxt(self.aid, self.ist(2026, 10, 14, 7, 30)).isoformat(),  # Wed, before 9
                         "2026-10-14T09:00:00+05:30")
        self.assertEqual(nxt(self.aid, self.ist(2026, 10, 14, 22, 0)).isoformat(),  # Wed night
                         "2026-10-15T09:00:00+05:30")
        self.assertEqual(nxt(self.aid, self.ist(2026, 10, 16, 22, 0)).isoformat(),  # Fri night -> Mon
                         "2026-10-19T09:00:00+05:30")
        self.db.save_compliance(self.aid, {"enforce_window": False})
        self.assertIsNone(nxt(self.aid, self.ist(2026, 10, 16, 22, 0)))

    def _deliver(self, payload):
        dialer = Mock()
        ns = _token_api_namespace(self.db, dialer)
        body = {**payload, "lead_id": os.urandom(6).hex(), "agent_id": str(self.agent)}
        result = asyncio.run(ns["leads_inbound"](self.aid, _request(body, self.db.get_or_create_lead_webhook_token(self.aid))))
        self.assertTrue(result.get("queued"), result)
        dialer.notify.assert_called_once_with()
        row = self.sql("SELECT custom_fields FROM campaign_contacts WHERE id = ?", (result["contact_id"],))
        return result, json.loads(row["custom_fields"])

    def test_facebook_lead_reaches_the_agent_with_its_form_answers(self):
        _result, fields = self._deliver(FACEBOOK_LEAD)
        notes_module = _agent_contact_notes()
        notes = notes_module.build_contact_notes(fields)
        self.assertIn("- Project: SP Khopoli", notes)
        self.assertIn("- Came via: Facebook lead form", notes)
        self.assertIn("- Ad they responded to: Khopoli 2BHK carousel", notes)
        self.assertIn("- Form answers: When do you plan to buy?: Within 3 months", notes)
        self.assertIn("- Tags: hot, 2bhk", notes)
        self.assertIn("- Preferred language: Telugu", notes)
        for noise in ("arthaleads", "org1", "external", "1020", "77001", "p-9", "Adset", "Channel",
                      "4500000", "whatsapp_marketing", "Form when", "Came from", "Facebook Ad"):
            self.assertNotIn(noise, notes)
        opener = notes_module.lead_opening_instruction(fields, "Priya", "Telugu")
        self.assertIn('"SP Khopoli"', opener)
        self.assertIn("Facebook lead form", opener)
        self.assertIn("Priya", opener)
        self.assertIn("In Telugu", opener)

    def test_repeat_enquiry_is_called_again_and_its_redelivery_is_not(self):
        """ArthaLeads sends a known person's new enquiry with the existing
        lead_id plus enquiry_id (2026-10-15): keyed on lead_id alone it was
        swallowed as 'already received' and never called."""
        token = self.db.get_or_create_lead_webhook_token(self.aid)
        ns = _token_api_namespace(self.db, Mock())
        lead_id = os.urandom(6).hex()
        base = {**CTWA_LEAD, "lead_id": lead_id, "agent_id": str(self.agent)}
        first = asyncio.run(ns["leads_inbound"](self.aid, _request(base, token)))
        self.assertTrue(first["queued"], first)
        # That call happened and finished.
        self.sql("UPDATE campaign_contacts SET status = 'done' WHERE id = ?", (first["contact_id"],))

        enquiry = {**base, "enquiry_id": f"evt_re_{lead_id}_1792079265000",
                   "custom_fields": {**base.get("custom_fields", {}), "repeat_enquiry": True}}
        again = asyncio.run(ns["leads_inbound"](self.aid, _request(enquiry, token)))
        self.assertTrue(again["queued"], again)
        self.assertNotEqual(again["contact_id"], first["contact_id"])
        fields = json.loads(self.sql("SELECT custom_fields FROM campaign_contacts WHERE id = ?",
                                     (again["contact_id"],))["custom_fields"])
        self.assertIn("- Enquired before: yes, this is a repeat enquiry", _agent_contact_notes().build_contact_notes(fields))

        redelivered = asyncio.run(ns["leads_inbound"](self.aid, _request(enquiry, token)))
        self.assertTrue(redelivered.get("deduped"), redelivered)
        self.assertEqual(redelivered["contact_id"], again["contact_id"])
        # And without enquiry_id the same lead stays deduped, as before.
        plain = asyncio.run(ns["leads_inbound"](self.aid, _request(base, token)))
        self.assertTrue(plain.get("deduped"), plain)

    def test_click_to_whatsapp_lead_reaches_the_agent_with_the_ad(self):
        _result, fields = self._deliver(CTWA_LEAD)
        notes_module = _agent_contact_notes()
        notes = notes_module.build_contact_notes(fields)
        self.assertIn("- Project: SP Khopoli", notes)
        self.assertIn("- Came via: WhatsApp ad", notes)
        self.assertIn("- Ad they responded to: 2 & 3 BHK at Khopoli from 45 L", notes)
        self.assertIn("- Ad text: Riverside homes near the expressway.", notes)
        self.assertIn("- First WhatsApp message: Hi, I want to know more about this project", notes)
        for noise in ("fb.me", "arthaleads", "whatsapp_marketing_opt_in", "120300", "Channel", "Whatsapp:"):
            self.assertNotIn(noise, notes)
        opener = notes_module.lead_opening_instruction(fields, "Rahul", "Hindi")
        self.assertIn('"SP Khopoli"', opener)
        self.assertIn("WhatsApp ad", opener)


if __name__ == "__main__":
    unittest.main()
