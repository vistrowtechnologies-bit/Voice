"""Every lead says where it came from (owner, 24 Oct): the lead email's source
line, exact IST time, one line per person, no dashboard test calls; Vistrow's
own workspace also sees IP, location and browser. Plus the Contact form's
phone rule and its lead being saved before the email."""
import ast
import os
import re
import unittest

import visitor_info

HERE = os.path.dirname(os.path.abspath(__file__))
TEST_DB = os.environ.get("TEST_DATABASE_URL")


class VisitorInfo(unittest.TestCase):
    def test_browser_family(self):
        android = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"
        iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit Version/17.5 Mobile Safari/604.1"
        self.assertEqual(visitor_info.browser_family(android), "Chrome on Android")
        self.assertEqual(visitor_info.browser_family(iphone), "Safari on iPhone")
        self.assertEqual(visitor_info.browser_family(""), "")

    def test_stored_utc_time_reads_in_ist(self):
        self.assertEqual(visitor_info.ist("2026-10-24 10:23:07"), "24 Oct 2026, 03:53:07 PM IST")

    def test_call_sources(self):
        cs = visitor_info.call_source
        self.assertEqual(cs("voice-agent-demo-ab12", "browser", "", page="/"), "Website live demo (Talk to Artha) · /")
        self.assertEqual(cs("widget-7-ff", "widget", "", website="shop.in", page="/pricing"),
                         "Website voice widget · shop.in/pricing")
        self.assertEqual(cs("widget-chat-s1", "widget", "", website="shop.in"), "Chat widget · shop.in")
        self.assertEqual(cs("phone-x", "phone", "inbound"), "Phone call · inbound")
        self.assertEqual(cs("test-agent-4-auto9f", "browser", ""), "Dashboard test call")


class ContactPhoneRule(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = open(os.path.join(HERE, "token_api.py"), encoding="utf-8").read()
        tree = ast.parse(source)
        ns = {"re": re}
        for name in ("_looks_like_real_phone", "_lead_phone", "_one_line"):
            node = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == name)
            exec(ast.get_source_segment(source, node), ns)
        cls.phone, cls.one_line = staticmethod(ns["_lead_phone"]), staticmethod(ns["_one_line"])

    def test_indian_numbers_normalise(self):
        for typed in ("9820134567", "09820134567", "+91 98201 34567", "+91-98201-34567"):
            self.assertEqual(self.phone(typed), "+919820134567", typed)

    def test_junk_and_non_mobile_are_refused(self):
        for typed in ("", "1234567899", "5820134567", "9999999999", "98201", "+9198201345678"):
            self.assertEqual(self.phone(typed), "", typed)

    def test_subject_text_cannot_carry_a_header(self):
        self.assertEqual(self.one_line("Asha\r\nBcc: x@y.z", 80), "Asha Bcc: x@y.z")


class EdgeVisitorIp(unittest.TestCase):
    """Website requests reach the API from Vercel's servers, so X-Forwarded-For
    names Vercel (lead emails showed 3.108.223.212 / 13.235.27.61, and every
    per-IP limit was shared by all visitors). The site's middleware passes the
    real visitor; trusted only with the shared VV_EDGE_SECRET."""

    @classmethod
    def setUpClass(cls):
        import hmac
        import types
        import urllib.parse

        source = open(os.path.join(HERE, "token_api.py"), encoding="utf-8").read()
        tree = ast.parse(source)
        ns = {"os": os, "hmac": hmac, "urllib": urllib, "visitor_info": visitor_info, "Request": object}
        for name in ("_edge_visitor", "_client_ip", "_visitor_context"):
            node = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == name)
            exec(ast.get_source_segment(source, node), ns)
        cls.ns, cls.types = ns, types

    def request(self, **headers):
        return self.types.SimpleNamespace(headers={k.replace("_", "-"): v for k, v in headers.items()},
                                          client=self.types.SimpleNamespace(host="10.0.0.1"))

    def setUp(self):
        self._old = os.environ.get("VV_EDGE_SECRET")
        os.environ["VV_EDGE_SECRET"] = "s3cret"

    def tearDown(self):
        if self._old is None:
            os.environ.pop("VV_EDGE_SECRET", None)
        else:
            os.environ["VV_EDGE_SECRET"] = self._old

    def test_trusted_edge_gives_the_real_visitor(self):
        req = self.request(x_forwarded_for="3.108.223.212", x_vv_edge="s3cret", x_visitor_ip="49.36.10.7",
                           x_visitor_country="IN", x_visitor_region="MH", x_visitor_city="Pune")
        self.assertEqual(self.ns["_client_ip"](req), "49.36.10.7")
        ctx = self.ns["_visitor_context"](req)
        self.assertEqual((ctx["ip"], ctx["city"], ctx["region"], ctx["country"]), ("49.36.10.7", "Pune", "MH", "IN"))

    def test_wrong_or_missing_secret_is_ignored(self):
        for edge in ("nope", ""):
            req = self.request(x_forwarded_for="13.235.27.61", x_vv_edge=edge, x_visitor_ip="1.2.3.4",
                               x_visitor_country="US")
            self.assertEqual(self.ns["_client_ip"](req), "13.235.27.61", edge)
            self.assertEqual(self.ns["_visitor_context"](req)["country"], "", edge)

    def test_no_secret_configured_keeps_todays_behaviour(self):
        os.environ.pop("VV_EDGE_SECRET", None)
        req = self.request(x_forwarded_for="13.235.27.61", x_vv_edge="", x_visitor_ip="1.2.3.4")
        self.assertEqual(self.ns["_client_ip"](req), "13.235.27.61")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class LeadEmail(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        import notification_worker

        cls.db, cls.nw = calls_db, notification_worker
        calls_db.init_tables()
        stamp = os.urandom(3).hex()
        cls.n = int(stamp, 16) % 10**6
        acct = calls_db.create_account_with_owner("Lead Co", "Owner", f"lead-{stamp}@example.com", "h",
                                                  email_verified=True)
        cls.account = acct["account_id"]

    def call(self, room, phone, name="Priya", call_type="browser", page="", started="2026-10-24 10:23:07"):
        conn = self.db._connect()
        try:
            with conn:
                row = conn.execute(
                    "INSERT INTO calls (room_name, visitor_identity, started_at, ended_at, duration_seconds, "
                    "transcript_json, account_id, call_type, lead_name, lead_phone, page_path) "
                    "VALUES (?, 'v', ?, ?, 30, '[]', ?, ?, ?, ?, ?) RETURNING id",
                    (room, started, started, self.account, call_type, name, phone, page),
                ).fetchone()
                conn.execute("INSERT INTO visitor_ips (room_name, ip, user_agent, source) VALUES (?, ?, ?, 'x') "
                             "ON CONFLICT (room_name) DO NOTHING",
                             (room, "203.0.113.9", "Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile"))
                return row["id"]
        finally:
            conn.close()

    def email_for(self, after, owner):
        sent = {}
        orig_send, orig_recipients, orig_owner = self.nw._send, self.nw.recipients, self.db.is_platform_owner
        self.nw._send = lambda to, subject, heading, body, label, path: sent.update(subject=subject, body=body) or 1
        self.nw.recipients = lambda account_id, pref: ["sales@example.com"]
        self.db.is_platform_owner = lambda account_id: owner
        try:
            self.db.set_setting(self.nw._LEADS_MARK, str(after), self.account)
            self.nw.check_leads(self.account)
        finally:
            self.nw._send, self.nw.recipients, self.db.is_platform_owner = orig_send, orig_recipients, orig_owner
        return sent

    def test_one_line_per_person_with_source_time_and_link(self):
        phone = f"+9198{self.n:06d}11"
        first = self.call(f"voice-agent-demo-{self.n}a", phone, page="/")
        mark = first - 1
        second = self.call(f"voice-agent-demo-{self.n}b", phone, page="/")
        self.call(f"test-agent-4-auto{self.n}", f"+9198{self.n:06d}22", name="Combo bot")
        mail = self.email_for(mark, owner=False)
        self.assertEqual(mail["subject"], "New lead: Priya")
        body = mail["body"]
        self.assertEqual(body.count("Priya"), 1, "the same caller twice is one line")
        self.assertIn("2 calls", body)
        self.assertIn("Website live demo (Talk to Artha) · /", body)
        self.assertIn("24 Oct 2026, 03:53:07 PM IST", body)
        self.assertIn(f"/dashboard/calls/{second}", body)
        self.assertNotIn("Combo bot", body, "dashboard and automated test calls are never leads")
        self.assertNotIn("203.0.113.9", body, "a tenant's email has no visitor IP")

    def test_vistrows_leads_also_reach_both_sales_inboxes(self):
        import email_sender

        first = self.call(f"voice-agent-demo-{self.n}d", f"+9198{self.n:06d}66", name="Kiran")
        seen = {}
        orig_send, orig_recipients, orig_owner = self.nw._send, self.nw.recipients, self.db.is_platform_owner
        orig_env = os.environ.get("SALES_NOTIFY_EMAIL")
        os.environ["SALES_NOTIFY_EMAIL"] = "VistrowAI@gmail.com, vistrowtechnologies@gmail.com"
        self.nw._send = lambda to, *a: seen.update(to=to) or 1
        self.nw.recipients = lambda account_id, pref: ["vistrowai@gmail.com"]
        self.db.is_platform_owner = lambda account_id: True
        try:
            self.db.set_setting(self.nw._LEADS_MARK, str(first - 1), self.account)
            self.nw.check_leads(self.account)
        finally:
            self.nw._send, self.nw.recipients, self.db.is_platform_owner = orig_send, orig_recipients, orig_owner
            if orig_env is None:
                os.environ.pop("SALES_NOTIFY_EMAIL", None)
            else:
                os.environ["SALES_NOTIFY_EMAIL"] = orig_env
        self.assertEqual(seen["to"], ["vistrowai@gmail.com", "vistrowtechnologies@gmail.com"])
        self.assertEqual(email_sender.sales_inboxes(), ["vistrowai@gmail.com"], "default when unset")

    def test_vistrows_own_email_adds_ip_and_browser(self):
        first = self.call(f"widget-1-{self.n}c", f"+9198{self.n:06d}33", name="Ravi", call_type="widget",
                          page="/pricing")
        body = self.email_for(first - 1, owner=True)["body"]
        self.assertIn("Website voice widget · /pricing", body)
        self.assertIn("IP 203.0.113.9", body)
        self.assertIn("Chrome on Android", body)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class ContactFormLeadSaved(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db

        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(3).hex()
        cls.n = int(stamp, 16) % 10**6
        owner = calls_db.create_account_with_owner("Vistrow", "O", f"cf-{stamp}@example.com", "h", email_verified=True)
        cls.account = owner["account_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id = ?", (cls.account,))
        conn.close()
        agent = calls_db.create_agent({"name": "Artha"}, cls.account)["id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE agents SET is_platform_demo = 0 WHERE is_platform_demo = 1")
            conn.execute("UPDATE agents SET is_platform_demo = 1 WHERE id = ?", (agent,))
        conn.close()

    def test_form_answers_and_source_land_on_the_contact(self):
        phone = f"+9197{self.n:06d}44"
        cid = self.db.save_demo_visitor("Neha", phone, "neha@shop.in", "Shop", source="contact_form",
                                        tag="contact-form", fields={"call_volume": "10,000+", "page": "/contact",
                                                                    "visitor_country": "IN", "empty": ""})
        conn = self.db._connect()
        row = dict(conn.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone())
        conn.close()
        self.assertEqual((row["source"], row["tags"], row["email"], row["company"]),
                         ("contact_form", "contact-form", "neha@shop.in", "Shop"))
        fields = self.db._safe_json_loads(row["custom_fields"])
        self.assertEqual((fields["call_volume"], fields["visitor_country"]), ("10,000+", "IN"))
        self.assertNotIn("empty", fields)

    def test_a_later_visit_adds_without_erasing(self):
        phone = f"+9197{self.n:06d}55"
        cid = self.db.save_demo_visitor("Neha", phone, fields={"page": "/", "utm_source": "google"})
        self.db.save_demo_visitor("Someone", phone, "n@x.in", source="contact_form", tag="contact-form",
                                  fields={"page": "/contact"})
        conn = self.db._connect()
        row = dict(conn.execute("SELECT * FROM contacts WHERE id = ?", (cid,)).fetchone())
        conn.close()
        fields = self.db._safe_json_loads(row["custom_fields"])
        self.assertEqual((row["name"], row["email"], row["tags"]), ("Neha", "n@x.in", "website-demo,contact-form"))
        self.assertEqual((fields["page"], fields["utm_source"]), ("/contact", "google"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
