"""Privacy audit follow-ups (2026-10-14): recording/AI announcement defaults,
widget "recorded" flag, error_events retention and redaction, server-side
signup age gate and terms-acceptance evidence. The SQL half runs against a
throwaway Postgres (TEST_DATABASE_URL), never production (see conftest.py)."""
import datetime
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import phone_format  # noqa: E402
from test_plan_policy import function_from_file  # noqa: E402

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TOKEN_API = Path(__file__).resolve().parent / "token_api.py"
UTC = datetime.timezone.utc


class Redaction(unittest.TestCase):
    def test_phone_numbers_and_emails_are_masked(self):
        r = phone_format.redact_contact_details
        self.assertEqual(r("webhook 400: phone 9876543210 invalid"), "webhook 400: phone [phone] invalid")
        self.assertEqual(r("caller +91 98765 43210"), "caller [phone]")
        self.assertEqual(r("GET /x?phone=%2B919876543210"), "GET /x?phone=[phone]")
        self.assertEqual(r('{"lead_phone": "919876543210"}'), '{"lead_phone": "[phone]"}')
        self.assertEqual(r("mail to a.b+c@example.co.in failed"), "mail to [email] failed")

    def test_ordinary_diagnostics_survive(self):
        r = phone_format.redact_contact_details
        for text in ("call 1366 took 4500 ms", "at 2026-10-14 12:00:00 UTC", "HTTP 503 from api.sarvam.ai",
                     "Razorpay subscription sub_ABC123 matches no account", ""):
            self.assertEqual(r(text), text)

    def test_log_error_redacts_before_insert(self):
        import admin_db
        conn = MagicMock()
        with patch.object(admin_db, "_connect", return_value=conn):
            admin_db.log_error("lead for 9876543210 failed", source="t",
                               context=json.dumps({"email": "x@y.com", "notes": {"phone": "+919876543210"}}))
        params = conn.execute.call_args.args[1]
        self.assertNotIn("9876543210", params[3])
        self.assertNotIn("x@y.com", params[4])
        self.assertNotIn("919876543210", params[4])
        self.assertIn("[phone]", params[3])


class ComplianceDefaults(unittest.TestCase):
    def setUp(self):
        import calls_db
        self.db = calls_db

    def test_announcement_on_by_default_for_existing_blobs(self):
        stored = json.dumps({"record_calls": True, "require_consent": False, "retention_days": 0})
        with patch.object(self.db, "get_setting", return_value=stored):
            cfg = self.db.get_compliance(1)
        self.assertIs(cfg["announce_recording"], True)
        self.assertEqual(cfg["recording_notice"], "")

    def test_explicit_off_is_kept(self):
        stored = json.dumps({"record_calls": True, "announce_recording": False})
        with patch.object(self.db, "get_setting", return_value=stored):
            self.assertIs(self.db.get_compliance(1)["announce_recording"], False)

    def test_validation(self):
        base = dict(self.db._COMPLIANCE_DEFAULTS)
        self.assertIsNone(self.db._compliance_error(base))
        self.assertIsNotNone(self.db._compliance_error({**base, "announce_recording": "yes"}))
        self.assertIsNotNone(self.db._compliance_error({**base, "recording_notice": "x" * 161}))
        self.assertIsNotNone(self.db._compliance_error({**base, "recording_notice": None}))
        self.assertIsNone(self.db._compliance_error({**base, "recording_notice": "Yeh call record ho rahi hai."}))

    def test_save_collapses_whitespace(self):
        saved = {}
        with patch.object(self.db, "get_setting", return_value=None), \
             patch.object(self.db, "set_setting", side_effect=lambda k, v, a: saved.update(v=v)):
            out = self.db.save_compliance(1, {"recording_notice": "  This call\n is   recorded. "})
        self.assertEqual(out["recording_notice"], "This call is recorded.")
        self.assertEqual(json.loads(saved["v"])["recording_notice"], "This call is recorded.")


class WidgetSiteConfig(unittest.TestCase):
    def _route(self, record_calls):
        db = MagicMock()
        db.get_site_by_key.return_value = {
            "id": 3, "accountId": 9, "widgetMode": "voice", "widgetPosition": "bottom-right",
            "widgetAskName": True, "widgetRequireName": True, "widgetAskPhone": True,
            "widgetRequirePhone": True, "widgetAskEmail": True, "widgetRequireEmail": False,
        }
        db.resolve_site_page.return_value = {"avatar": "default", "greeting": ""}
        db.get_compliance.return_value = {"record_calls": record_calls}
        ns = {"calls_db": db, "HTTPException": Exception, "_platform_conversation_count_cached": lambda days: 0}
        route = function_from_file(TOKEN_API, "widget_site_config", ns)
        out = route("key", "/")
        db.get_compliance.assert_called_once_with(9)
        return out

    def test_recorded_follows_the_accounts_record_calls(self):
        self.assertIs(self._route(True)["recorded"], True)
        self.assertIs(self._route(False)["recorded"], False)


class SignupAgeGate(unittest.TestCase):
    """auth_signup refuses a request without both confirmations and records
    the acceptance with IP and user agent."""

    class Refused(Exception):
        def __init__(self, status, detail=""):
            super().__init__(detail)
            self.status, self.detail = status, detail

    def _route(self):
        db = MagicMock()
        db.email_exists.return_value = False
        db.create_account_with_owner.return_value = {"account_id": 5, "user_id": 8}
        db.create_email_verification.return_value = ("123456", 60)
        db.get_user_by_email.return_value = {"name": "Asha"}
        sender = MagicMock()
        sender.is_configured.return_value = True
        sender.send_email.return_value = True
        ns = {
            "calls_db": db, "email_sender": sender, "HTTPException": self.Refused,
            "_auth_rate_limited": lambda ip: False, "_client_ip": lambda request: "203.0.113.7",
            "disposable_email": SimpleNamespace(is_disposable=lambda e: False),
            "auth": SimpleNamespace(hash_password=lambda p: "hash"), "html": __import__("html"),
            "logger": MagicMock(), "SignupRequest": object, "Request": object,
        }
        return function_from_file(TOKEN_API, "auth_signup", ns), db

    def _req(self, **over):
        fields = dict(name="Asha", company="Acme", email="asha@acme.in", password="longpassword",
                      referral_source="", phone="", accepted_terms=True, confirmed_age=True)
        fields.update(over)
        return SimpleNamespace(**fields)

    def _request(self):
        return SimpleNamespace(headers={"user-agent": "Mozilla/5.0 test"})

    def test_missing_age_confirmation_is_refused(self):
        route, db = self._route()
        with self.assertRaises(self.Refused) as ctx:
            route(self._req(confirmed_age=False), self._request())
        self.assertEqual(ctx.exception.status, 400)
        db.create_account_with_owner.assert_not_called()

    def test_missing_terms_is_refused(self):
        route, db = self._route()
        with self.assertRaises(self.Refused):
            route(self._req(accepted_terms=False), self._request())
        db.create_account_with_owner.assert_not_called()

    def test_acceptance_recorded_with_ip_and_user_agent(self):
        route, db = self._route()
        out = route(self._req(), self._request())
        self.assertTrue(out["ok"])
        db.record_consent.assert_called_once_with(
            5, 8, ip="203.0.113.7", user_agent="Mozilla/5.0 test", source="signup", age_confirmed=True,
        )

    def test_model_defaults_are_false(self):
        # An old client that sends neither field is refused, not let through.
        source = TOKEN_API.read_text()
        model = source[source.index("class SignupRequest(BaseModel):"):]
        model = model[:model.index("\n\n\n")]
        self.assertIn("accepted_terms: bool = False", model)
        self.assertIn("confirmed_age: bool = False", model)

    def test_onboarding_consent_requires_age_and_records_evidence(self):
        db = MagicMock()
        db.CONSENT_VERSION = "v1"
        ns = {"calls_db": db, "HTTPException": self.Refused, "_client_ip": lambda r: "198.51.100.2",
              "_me_payload": lambda uid: {"id": uid}, "Body": lambda *a, **k: None,
              "Depends": lambda x: x, "current_user": None, "Request": object}
        route = function_from_file(TOKEN_API, "accept_consent", ns)
        user = {"account_id": 5, "user_id": 8}
        with self.assertRaises(self.Refused):
            route(self._request(), {"version": "v1"}, user)
        db.record_consent.assert_not_called()
        route(self._request(), {"version": "v1", "ageConfirmed": True}, user)
        db.record_consent.assert_called_once_with(
            5, 8, ip="198.51.100.2", user_agent="Mozilla/5.0 test", source="onboarding", age_confirmed=True,
        )


class HtmlModuleNotShadowed(unittest.TestCase):
    """8209cb4e (2026-10-12) added html.escape() to seven routes that also
    assign a local `html = email_sender.render_email(...)`. Python then treats
    `html` as local for the whole function, so html.escape raised
    UnboundLocalError: signup, resend code, password reset, email change,
    team invite, admin reset and the contact form all failed with 500. Found
    by SignupAgeGate above, which runs auth_signup's real body."""

    def test_no_route_shadows_the_html_module(self):
        import ast
        bad = []
        for path in Path(__file__).resolve().parent.glob("*.py"):
            for fn in ast.walk(ast.parse(path.read_text())):
                if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue
                nodes = list(ast.walk(fn))
                stores = any(isinstance(n, ast.Name) and n.id == "html" and isinstance(n.ctx, ast.Store) for n in nodes)
                uses = any(isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name) and n.value.id == "html"
                           for n in nodes)
                if stores and uses:
                    bad.append(f"{path.name}:{fn.name}")
        self.assertEqual(bad, [])


def _ts(days_ago: float) -> str:
    return (datetime.datetime.now(UTC) - datetime.timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()

    def sql(self, query, params=()):
        conn = self.db._connect()
        try:
            with conn:
                cur = conn.execute(query, params)
                try:
                    return cur.fetchall()
                except Exception:
                    return None
        finally:
            conn.close()

    def event(self, days_ago, account_id=None, tag=""):
        return self.sql(
            "INSERT INTO error_events (account_id, source, message, created_at) VALUES (?, 'test', ?, ?) RETURNING id",
            (account_id, tag, _ts(days_ago)),
        )[0]["id"]

    def remaining(self, ids):
        marks = ",".join("?" for _ in ids)
        return {r["id"] for r in self.sql(f"SELECT id FROM error_events WHERE id IN ({marks})", tuple(ids))}

    def test_error_events_older_than_90_days_go_in_batches_and_rerun_is_a_noop(self):
        old = [self.event(91 + i) for i in range(5)] + [self.event(200, account_id=1)]
        fresh = [self.event(1), self.event(89)]
        with patch.object(self.db, "_ERROR_EVENT_PURGE_BATCH", 2):
            deleted = self.db.purge_old_error_events()
        self.assertGreaterEqual(deleted, len(old))
        self.assertEqual(self.remaining(old), set())
        self.assertEqual(self.remaining(fresh), set(fresh))
        self.assertEqual(self.db.purge_old_error_events(), 0, "idempotent")

    def test_account_retention_shorter_than_90_days_applies_to_its_errors(self):
        stamp = os.urandom(4).hex()
        a = self.db.create_account_with_owner("A", "A", f"a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        b = self.db.create_account_with_owner("B", "B", f"b-{stamp}@example.com", "h", email_verified=True)["account_id"]
        self.db.save_compliance(a, {"retention_days": 30})
        mine_old, mine_new = self.event(40, a), self.event(5, a)
        other_old = self.event(40, b)
        platform_old = self.event(40, None)
        self.db.purge_expired_calls(a)
        self.assertEqual(self.remaining([mine_old, mine_new, other_old, platform_old]),
                         {mine_new, other_old, platform_old})

    def test_signup_consent_evidence_is_stored_once(self):
        stamp = os.urandom(4).hex()
        created = self.db.create_account_with_owner("C", "C", f"c-{stamp}@example.com", "h")
        self.db.record_consent(created["account_id"], created["user_id"], ip="203.0.113.7",
                               user_agent="UA/1", source="signup", age_confirmed=True)
        self.db.record_consent(created["account_id"], created["user_id"], ip="198.51.100.9",
                               user_agent="UA/2", source="onboarding", age_confirmed=True)
        row = self.sql("SELECT consent_accepted_at, consent_version, consent_ip, consent_user_agent, "
                       "consent_source, age_confirmed_at FROM accounts WHERE id = ?", (created["account_id"],))[0]
        self.assertTrue(row["consent_accepted_at"])
        self.assertEqual(row["consent_version"], self.db.CONSENT_VERSION)
        self.assertEqual((row["consent_ip"], row["consent_user_agent"], row["consent_source"]),
                         ("203.0.113.7", "UA/1", "signup"), "first acceptance is kept")
        self.assertTrue(row["age_confirmed_at"])
        self.assertTrue(self.db.get_consent(created["account_id"])["accepted"])


if __name__ == "__main__":
    unittest.main()
