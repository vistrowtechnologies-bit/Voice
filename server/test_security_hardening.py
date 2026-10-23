"""Security audit fixes (2026-10-12): two-step login, sign-in lockout, API
keys kept out of account control, cross-tenant writes refused (widget sites,
inbound routes), Zoho hosts allowlisted, webhook SSRF, Origin check,
single-use reset links and the Google/GitHub pre-registration takeover.
Unit tests run anywhere; DB tests need TEST_DATABASE_URL."""

import ast
import os
import time
import types
import unittest
from pathlib import Path
from unittest import mock

import auth
import calls_db
import integrations_dispatch
import mfa

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TOKEN_API = Path(__file__).resolve().parent / "token_api.py"
TREE = ast.parse(TOKEN_API.read_text())


def load(*names, **globs):
    """Exec the named top-level functions/assignments of token_api.py."""
    nodes = []
    for node in TREE.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names:
            node.decorator_list = []
            nodes.append(node)
        elif isinstance(node, ast.Assign) and any(getattr(t, "id", None) in names for t in node.targets):
            nodes.append(node)
    namespace = dict(globs)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(TOKEN_API), "exec"), namespace)
    return namespace


class HTTPError(Exception):
    def __init__(self, status_code, detail=None):
        super().__init__(detail)
        self.status_code, self.detail = status_code, detail


class TotpTests(unittest.TestCase):
    # RFC 6238 appendix B: SHA-1, secret "12345678901234567890", T=59 -> 94287082 (8 digits).
    def test_rfc_vector_last_six_digits(self):
        import base64
        secret = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
        self.assertEqual(mfa.code_at(secret, 59 // 30), "287082")

    def test_window_and_no_reuse(self):
        secret = mfa.new_secret()
        now = 1_800_000_000
        step = now // 30
        self.assertEqual(mfa.matching_step(secret, mfa.code_at(secret, step), now=now), step)
        self.assertEqual(mfa.matching_step(secret, mfa.code_at(secret, step - 1), now=now), step - 1)
        self.assertIsNone(mfa.matching_step(secret, mfa.code_at(secret, step - 2), now=now))
        self.assertIsNone(mfa.matching_step(secret, mfa.code_at(secret, step), last_step=step, now=now))
        self.assertIsNone(mfa.matching_step(secret, "12345", now=now))

    def test_secret_is_encrypted_and_round_trips(self):
        secret = mfa.new_secret()
        blob = mfa.encrypt_secret(secret)
        self.assertNotIn(secret, blob)
        self.assertEqual(mfa.decrypt_secret(blob), secret)

    def test_recovery_codes(self):
        codes = mfa.new_recovery_codes()
        self.assertEqual(len(set(codes)), 10)
        self.assertTrue(all(mfa.looks_like_recovery_code(c) for c in codes))
        self.assertEqual(mfa.hash_recovery_code(codes[0].upper()), mfa.hash_recovery_code(codes[0]))


class PendingCookieTests(unittest.TestCase):
    def setUp(self):
        import hashlib, hmac, json  # noqa: E401
        self.ns = load("_mfa_pending_sig", "_set_mfa_pending", "_read_mfa_pending", "_MFA_PENDING_TTL_S",
                       "_MFA_PENDING_COOKIE", auth=auth, hashlib=hashlib, hmac=hmac, json=json, time=time,
                       Response=object, _COOKIE_SECURE=False)

    def test_pending_cookie_is_signed_expiring_and_never_a_session(self):
        jar = {}
        response = types.SimpleNamespace(set_cookie=lambda name, value, **kw: jar.__setitem__(name, value))
        self.ns["_set_mfa_pending"](response, 7, 3, "google")
        token = jar[self.ns["_MFA_PENDING_COOKIE"]]
        self.assertEqual(self.ns["_read_mfa_pending"](token)["uid"], 7)
        self.assertIsNone(self.ns["_read_mfa_pending"](token[:-2] + "xx"))
        self.assertIsNone(auth.read_session_token(token), "a pending cookie must not pass as a session")
        with mock.patch("time.time", return_value=time.time() + 400):
            self.assertIsNone(self.ns["_read_mfa_pending"](token))


class MfaLoginReplyTests(unittest.TestCase):
    def test_reply_says_the_code_was_passed(self):
        """Owner, 23 Oct 2026: without mfaVerified in this reply the admin gate
        showed "Sign in again with your code" right after a correct code."""
        ns = load("auth_login_mfa",
                  _auth_rate_limited=lambda ip: False, _client_ip=lambda r: "1.2.3.4",
                  _read_mfa_pending=lambda c: {"uid": 7, "aid": 3, "prov": "password"},
                  _MFA_PENDING_COOKIE="p", _login_locked=lambda k: False,
                  _verify_mfa_code=lambda uid, code: 1, _clear_login_failures=lambda k: None,
                  _set_session_cookie=lambda *a, **k: "sid", _note_login_failure=lambda k: None,
                  calls_db=types.SimpleNamespace(record_login=lambda uid: None),
                  _me_payload=lambda uid: {"id": uid, "mfaEnabled": True},
                  time=time, HTTPException=Exception, MfaLoginRequest=object, Response=object, Request=object)
        response = types.SimpleNamespace(delete_cookie=lambda *a, **k: None)
        request = types.SimpleNamespace(cookies={"p": "x"}, headers={})
        out = ns["auth_login_mfa"](types.SimpleNamespace(code="123456"), response, request)
        self.assertTrue(out["user"]["mfaVerified"])
        self.assertTrue(out["user"]["mfaEnabled"])


class AdminSubdomainLoginTests(unittest.TestCase):
    """Owner, 23 Oct 2026: admin.vistrowvoice.com has its own sign-in."""

    def _login_ns(self, user, profile, pending):
        return load("auth_admin_login", "ADMIN_MFA_SETUP_REQUIRED",
                    _auth_rate_limited=lambda ip: False, _client_ip=lambda r: "1.2.3.4",
                    _login_locked=lambda k: False, _note_login_failure=lambda k: None,
                    _clear_login_failures=lambda k: None, _DUMMY_PASSWORD_HASH=auth.hash_password("x"),
                    _set_mfa_pending=lambda resp, uid, aid, prov: pending.append(prov),
                    calls_db=types.SimpleNamespace(get_user_by_email=lambda e: user,
                                                   get_user_by_id=lambda uid: profile,
                                                   record_security_event=lambda *a: None),
                    auth=auth, HTTPException=HTTPError, LoginRequest=object, Response=object, Request=object)

    def _call(self, ns, password="right"):
        req = types.SimpleNamespace(email="Owner@X.com", password=password)
        return ns["auth_admin_login"](req, None, types.SimpleNamespace(headers={}))

    def test_owner_with_two_step_gets_the_code_step(self):
        user = {"id": 1, "account_id": 2, "password_hash": auth.hash_password("right"), "mfa_enabled_at": "x"}
        pending = []
        out = self._call(self._login_ns(user, {"is_platform_owner": True, "role": "owner"}, pending))
        self.assertEqual(out, {"ok": True, "mfaRequired": True})
        self.assertEqual(pending, ["admin"])

    def test_anyone_else_looks_like_a_wrong_password(self):
        user = {"id": 1, "account_id": 2, "password_hash": auth.hash_password("right"), "mfa_enabled_at": "x"}
        for profile, password in (({"is_platform_owner": False, "role": "owner"}, "right"),
                                  ({"is_platform_owner": True, "role": "member"}, "right"),
                                  ({"is_platform_owner": True, "role": "owner"}, "wrong")):
            pending = []
            with self.assertRaises(HTTPError) as err:
                self._call(self._login_ns(user, profile, pending), password)
            self.assertEqual(err.exception.status_code, 401)
            self.assertEqual(pending, [])

    def test_admin_check_needs_the_admin_session_when_switched_on(self):
        ns = load("require_platform_owner", ADMIN_MFA_SETUP_REQUIRED="s", ADMIN_MFA_SIGNIN_REQUIRED="m",
                  ADMIN_SEPARATE_LOGIN_REQUIRED="a", _ADMIN_SEPARATE_LOGIN=True, HTTPException=HTTPError, Request=object,
                  calls_db=types.SimpleNamespace(get_user_by_id=lambda uid: {
                      "is_platform_owner": True, "role": "owner", "mfa_enabled_at": "x", "email": "o@x.com"}))
        state = types.SimpleNamespace(user_id=1, impersonator_id=None, mfa=123, admin_session=None, via_api_key=False)
        with self.assertRaises(HTTPError) as err:
            ns["require_platform_owner"](types.SimpleNamespace(state=state))
        self.assertEqual((err.exception.status_code, err.exception.detail), (403, "a"))
        state.admin_session = 1
        self.assertEqual(ns["require_platform_owner"](types.SimpleNamespace(state=state))["user_id"], 1)

    def test_admin_claim_round_trips_in_the_session_token(self):
        token = auth.make_session_token(1, 2, ttl_seconds=auth.ADMIN_SESSION_TTL_SECONDS, claims={"adm": 1, "mfa": 5})
        session = auth.read_session_token(token)
        self.assertEqual(session["adm"], 1)
        self.assertLessEqual(session["exp"] - session["iat"], 8 * 3600)
        self.assertIsNone(auth.read_session_token(auth.make_session_token(1, 2))["adm"])


class LockoutTests(unittest.TestCase):
    def test_ten_failures_lock_that_email(self):
        # Database down: the in-memory fallback still locks (fail open only
        # means "don't refuse everyone", not "no limit at all").
        def offline(*_args, **_kwargs):
            raise OSError("db offline")

        ns = load("_login_locked", "_note_login_failure", "_LOGIN_FAIL_WINDOW_S", "_LOGIN_FAIL_MAX", time=time,
                  _login_failures={}, logger=__import__("logging").getLogger("test"),
                  calls_db=types.SimpleNamespace(rate_limit_count=offline, rate_limit_record=offline))
        for _ in range(9):
            ns["_note_login_failure"]("a@x.test")
        self.assertFalse(ns["_login_locked"]("a@x.test"))
        ns["_note_login_failure"]("a@x.test")
        self.assertTrue(ns["_login_locked"]("a@x.test"))
        self.assertFalse(ns["_login_locked"]("b@x.test"))


class ApiKeyAndOriginTests(unittest.TestCase):
    def test_api_keys_cannot_reach_account_control(self):
        blocked = load("_API_KEY_BLOCKED_PATHS", re=__import__("re"))["_API_KEY_BLOCKED_PATHS"]
        for path in ("/admin/overview", "/api-keys", "/team/invite", "/billing/topup", "/profile/mfa/disable", "/auth/me"):
            self.assertTrue(blocked.match(path), path)
        for path in ("/agents", "/calls/12", "/contacts", "/campaigns/3/start"):
            self.assertFalse(blocked.match(path), path)

    def test_origin_check(self):
        import urllib.parse
        ns = load("_STATIC_DASHBOARD_ORIGINS", "_dashboard_origins", "_origin_allowed", os=os, urllib=urllib, Request=object)

        def req(method, origin):
            return types.SimpleNamespace(method=method, headers={"origin": origin} if origin else {})

        with mock.patch.dict(os.environ, {"APP_BASE_URL": "https://web-stg.example.app"}):
            allowed = ns["_origin_allowed"]
            self.assertTrue(allowed(req("POST", "https://app.vistrowvoice.com")))
            self.assertTrue(allowed(req("POST", "https://web-stg.example.app")))
            self.assertTrue(allowed(req("POST", "http://localhost:5173")))
            self.assertTrue(allowed(req("POST", None)))
            self.assertTrue(allowed(req("GET", "https://evil.test")))
            self.assertFalse(allowed(req("POST", "https://evil.test")))
            self.assertFalse(allowed(req("DELETE", "https://app.vistrowvoice.com.evil.test")))


class CrossTenantWriteTests(unittest.TestCase):
    def ns(self, db):
        return load("_require_own_agent", "_require_own_number", "create_site", "update_site",
                    calls_db=db, HTTPException=HTTPError, Body=lambda *a, **k: None, Depends=lambda *a, **k: None,
                    require_role=lambda r: None)

    def test_widget_site_cannot_use_another_workspaces_agent(self):
        db = mock.Mock()
        db.agent_belongs_to_account.return_value = False
        ns = self.ns(db)
        with self.assertRaises(HTTPError) as ctx:
            ns["create_site"]({"name": "Mine", "agentId": 99}, {"account_id": 1})
        self.assertEqual(ctx.exception.status_code, 404)
        db.create_site.assert_not_called()
        with self.assertRaises(HTTPError):
            ns["update_site"](5, {"agentId": 99}, {"account_id": 1})
        db.update_site.assert_not_called()
        db.agent_belongs_to_account.return_value = True
        ns["create_site"]({"name": "Mine", "agentId": 4}, {"account_id": 1})
        db.create_site.assert_called_once()

    def test_inbound_route_needs_a_number_this_workspace_owns(self):
        db = mock.Mock()
        db.get_phone_number_by_number.return_value = {"accountId": 2}
        ns = self.ns(db)
        with self.assertRaises(HTTPError) as ctx:
            ns["_require_own_number"]("+912000000100", 1)
        self.assertEqual(ctx.exception.status_code, 404)
        db.get_phone_number_by_number.return_value = None
        with self.assertRaises(HTTPError):
            ns["_require_own_number"]("+912000000100", 1)
        db.get_phone_number_by_number.return_value = {"accountId": 1}
        ns["_require_own_number"]("+912000000100", 1)


class ZohoAndWebhookTests(unittest.TestCase):
    def test_zoho_hosts_are_allowlisted(self):
        host = integrations_dispatch._zoho_host
        self.assertEqual(host("https://accounts.zoho.in", integrations_dispatch._ZOHO_ACCOUNTS_RE, "d"), "https://accounts.zoho.in")
        self.assertEqual(host("https://attacker.test", integrations_dispatch._ZOHO_ACCOUNTS_RE, "d"), "d")
        self.assertEqual(host("https://accounts.zoho.in.attacker.test", integrations_dispatch._ZOHO_ACCOUNTS_RE, "d"), "d")
        self.assertEqual(host("https://www.zohoapis.eu/", integrations_dispatch._ZOHO_API_RE, "d"), "https://www.zohoapis.eu")

    def test_zoho_refresh_never_sends_the_secret_elsewhere(self):
        seen = []

        class FakeOpen:
            def __call__(self, req, timeout=0):
                seen.append(req.full_url)
                raise OSError("stop")

        env = {"ZOHO_OAUTH_CLIENT_ID": "id", "ZOHO_OAUTH_CLIENT_SECRET": "secret"}
        with mock.patch.dict(os.environ, env), mock.patch("urllib.request.urlopen", FakeOpen()):
            integrations_dispatch._zoho_refresh_access_token({"refresh_token": "r", "accounts_base": "https://attacker.test"})
        self.assertEqual(seen, ["https://accounts.zoho.com/oauth/v2/token"])

    def test_webhook_refuses_internal_addresses(self):
        for url in ("http://169.254.169.254/latest/meta-data", "http://127.0.0.1:8000/admin", "http://10.0.0.5/hook"):
            ok, detail = integrations_dispatch._post_json(url, {"a": 1})
            self.assertFalse(ok)
            self.assertIn("private/internal", detail)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class SecurityDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()

    def new_user(self):
        stamp = os.urandom(4).hex()
        return calls_db.create_account_with_owner("S", "S", f"sec-{stamp}@example.com", "h", email_verified=True)["user_id"]

    def test_reset_link_works_once_and_kills_the_others(self):
        uid = self.new_user()
        first = calls_db.create_password_reset(uid)
        second = calls_db.create_password_reset(uid)
        self.assertEqual(calls_db.consume_password_reset(second), uid)
        self.assertIsNone(calls_db.consume_password_reset(second), "single use")
        self.assertIsNone(calls_db.consume_password_reset(first), "older links die with it")

    def test_mfa_lifecycle_and_code_reuse(self):
        uid = self.new_user()
        secret = mfa.new_secret()
        calls_db.set_mfa_pending(uid, mfa.encrypt_secret(secret))
        hashes = [mfa.hash_recovery_code(c) for c in ("abcd-efgh", "jkmn-pqrs")]
        self.assertTrue(calls_db.enable_mfa(uid, hashes, step=100))
        self.assertIsNotNone(calls_db.get_user_by_id(uid)["mfa_enabled_at"])
        self.assertFalse(calls_db.claim_mfa_step(uid, 100), "a used step can't be used again")
        self.assertTrue(calls_db.claim_mfa_step(uid, 101))
        self.assertEqual(calls_db.consume_recovery_code(uid, hashes[0]), 1)
        self.assertIsNone(calls_db.consume_recovery_code(uid, hashes[0]), "recovery codes work once")
        calls_db.disable_mfa(uid)
        self.assertIsNone(calls_db.get_user_by_id(uid)["mfa_enabled_at"])

    def test_known_device(self):
        uid = self.new_user()
        self.assertEqual(calls_db.user_knows_device(uid, "dev-a" * 5), (False, False))
        calls_db.create_user_session(uid, "dev-a" * 5)
        self.assertEqual(calls_db.user_knows_device(uid, "dev-a" * 5), (True, True))
        self.assertEqual(calls_db.user_knows_device(uid, "dev-b" * 5), (True, False))


if __name__ == "__main__":
    unittest.main()
