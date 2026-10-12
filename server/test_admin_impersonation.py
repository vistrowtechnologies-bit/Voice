"""Super-admin "View as": the support cookie carries the owner's real
session_version and a revocable 2-hour user_sessions row, customer-owned
writes are refused, every other write is audited as the admin, exit is
audited, and a normal tenant session is untouched. The real middleware and
routes from token_api.py run on a small FastAPI app against a throwaway
Postgres (TEST_DATABASE_URL); importing token_api itself would start every
background worker."""
import ast
import asyncio
import json
import logging
import os
import re
import secrets
import time
import unittest
from pathlib import Path
from unittest import mock

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TOKEN_API = Path(__file__).resolve().parent / "token_api.py"

_FUNCTIONS = (
    "support_session_blocks", "guard_support_session", "require_session", "current_user", "require_platform_owner",
    "_set_session_cookie", "_me_payload", "auth_me", "_iso_utc", "admin_impersonate", "admin_impersonate_exit",
    "auth_logout", "sign_out_other_sessions", "_admin_reason",
    "_origin_allowed", "_dashboard_origins", "_support_admin_still_signed_in", "_session_mfa", "_api_key_allows",
)
_ASSIGNS = ("_SUPPORT_BLOCKED_PATHS", "_PUBLIC_PATHS", "_PUBLIC_PREFIXES", "_DEVICE_COOKIE_NAME",
            "_API_KEY_BLOCKED_PATHS", "_API_KEY_SCOPE_WRITES", "_STATIC_DASHBOARD_ORIGINS", "ADMIN_MFA_SETUP_REQUIRED", "ADMIN_MFA_SIGNIN_REQUIRED")


def load_token_api(namespace: dict) -> dict:
    tree = ast.parse(TOKEN_API.read_text())
    nodes = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in _FUNCTIONS:
            node.decorator_list = []
            nodes.append(node)
        elif isinstance(node, ast.Assign) and any(getattr(t, "id", None) in _ASSIGNS for t in node.targets):
            nodes.append(node)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(TOKEN_API), "exec"), namespace)
    return namespace


class Client:
    """Minimal ASGI client (the server venv has no httpx) that keeps cookies."""

    def __init__(self, app):
        self.app, self.cookies = app, {}

    def request(self, method: str, path: str, body: dict | None = None):
        raw = json.dumps(body).encode() if body is not None else b""
        headers = [(b"content-type", b"application/json"), (b"user-agent", b"test-agent")]
        if self.cookies:
            headers.append((b"cookie", "; ".join(f"{k}={v}" for k, v in self.cookies.items()).encode()))
        scope = {"type": "http", "method": method, "path": path, "raw_path": path.encode(), "query_string": b"",
                 "headers": headers, "root_path": "", "scheme": "http", "server": ("test", 80), "client": ("127.0.0.1", 1),
                 "http_version": "1.1", "app": self.app}
        sent = []

        async def receive():
            return {"type": "http.request", "body": raw, "more_body": False}

        async def send(message):
            sent.append(message)

        asyncio.run(self.app(scope, receive, send))
        start = next(m for m in sent if m["type"] == "http.response.start")
        for name, value in start["headers"]:
            if name == b"set-cookie":
                cookie = value.decode().split(";")[0]
                key, _, val = cookie.partition("=")
                val = val.strip('"')
                if val and "Max-Age=0" not in value.decode() and 'expires=Thu, 01 Jan 1970' not in value.decode():
                    self.cookies[key] = val
                else:
                    self.cookies.pop(key, None)
        payload = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
        return start["status"], (json.loads(payload) if payload else None)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class SupportSessionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import admin_db
        import auth
        import calls_db
        import plan_policy
        from fastapi import Depends, FastAPI, HTTPException, Request, Response
        from fastapi.responses import JSONResponse

        cls.db, cls.admin_db, cls.auth = calls_db, admin_db, auth
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        admin = calls_db.create_account_with_owner("Ops", "Admin", f"admin-{stamp}@example.com", "h", email_verified=True)
        tenant = calls_db.create_account_with_owner("T", "Owner", f"owner-{stamp}@example.com", "h", email_verified=True)
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET is_platform_owner = 1 WHERE id = ?", (admin["account_id"],))
            # The admin panel needs two-step login (security audit 2026-10-12).
            conn.execute("UPDATE users SET mfa_enabled_at = '2026-10-12 00:00:00' WHERE id = ?", (admin["user_id"],))
        conn.close()
        cls.admin_aid = admin["account_id"]
        cls.admin_uid, cls.admin_email = admin["user_id"], f"admin-{stamp}@example.com"
        cls.tenant_aid, cls.owner_uid = tenant["account_id"], tenant["user_id"]

        ns = load_token_api({
            "re": re, "time": time, "secrets": secrets, "hashlib": __import__("hashlib"), "auth": auth,
            "calls_db": calls_db, "admin_db": admin_db, "plan_policy": plan_policy, "JSONResponse": JSONResponse,
            "HTTPException": HTTPException, "Request": Request, "Response": Response, "Depends": Depends,
            "logger": logging.getLogger("test"), "_COOKIE_SECURE": False,
        })
        app = FastAPI()
        app.middleware("http")(ns["guard_support_session"])
        app.middleware("http")(ns["require_session"])
        app.get("/auth/me")(ns["auth_me"])
        app.post("/auth/logout")(ns["auth_logout"])
        app.post("/admin/impersonate/{account_id:int}")(ns["admin_impersonate"])
        app.post("/admin/impersonate/exit")(ns["admin_impersonate_exit"])
        app.post("/profile/sign-out-others")(ns["sign_out_other_sessions"])
        current_user = ns["current_user"]

        def ok(user: dict = Depends(current_user)) -> dict:
            return {"ok": True, "account": user["account_id"]}

        for method, path in (("get", "/contacts"), ("post", "/contacts"), ("delete", "/contacts/{x}"),
                             ("post", "/api-keys"), ("patch", "/profile"), ("post", "/billing/topup"),
                             ("patch", "/team/members/{x}"), ("post", "/telephony/numbers"),
                             ("post", "/integrations/google_sheets/disconnect"), ("post", "/profile/request-account-deletion"),
                             ("post", "/help/chat/confirm")):
            getattr(app, method)(path)(ok)
        cls.app, cls.ns = app, ns

    def login(self, uid: int, aid: int, mfa_at: int | None = None) -> Client:
        client = Client(self.app)
        from fastapi import Response
        response = Response()
        self.ns["_set_session_cookie"](response, uid, aid, None, "password", mfa_at=mfa_at)
        client.cookies[self.auth.COOKIE_NAME] = response.headers["set-cookie"].split(";")[0].split("=", 1)[1]
        return client

    def view_as(self) -> Client:
        client = self.login(self.admin_uid, self.admin_aid, mfa_at=int(time.time()))
        status, _ = client.request("POST", f"/admin/impersonate/{self.tenant_aid}")
        self.assertEqual(status, 200)
        return client

    def test_admin_needs_a_session_that_passed_two_step_login(self):
        client = self.login(self.admin_uid, self.admin_aid)
        status, body = client.request("POST", f"/admin/impersonate/{self.tenant_aid}")
        self.assertEqual((status, body["detail"]), (403, self.ns["ADMIN_MFA_SIGNIN_REQUIRED"]))

    def test_a_teammate_in_the_owner_workspace_is_not_an_admin(self):
        stamp = os.urandom(3).hex()
        conn = self.db._connect()
        with conn:
            mate = conn.execute(
                "INSERT INTO users (account_id, email, name, password_hash, role, email_verified_at) "
                "VALUES (?, ?, 'Mate', 'h', 'admin', '2026-10-12') RETURNING id",
                (self.admin_aid, f"mate-{stamp}@example.com"),
            ).fetchone()["id"]
        conn.close()
        client = self.login(mate, self.admin_aid, mfa_at=int(time.time()))
        self.assertEqual(client.request("POST", f"/admin/impersonate/{self.tenant_aid}")[0], 404)

    def test_support_session_ends_when_the_admin_signs_out_everywhere(self):
        client = self.view_as()
        self.assertEqual(client.request("GET", "/contacts")[0], 200)
        self.db.invalidate_other_sessions(self.admin_uid)
        self.assertEqual(client.request("GET", "/contacts")[0], 401)
        status, _ = client.request("POST", "/admin/impersonate/exit")
        self.assertEqual(status, 401, "a dead support cookie can't be swapped for an admin session")

    def audit_rows(self, action: str) -> list[dict]:
        conn = self.db._connect()
        rows = conn.execute(
            "SELECT * FROM admin_audit_log WHERE action = ? AND target_account_id = ? ORDER BY id", (action, self.tenant_aid)
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def test_blocked_routes_are_refused(self):
        client = self.view_as()
        for method, path in (("DELETE", "/contacts/1"), ("POST", "/api-keys"), ("PATCH", "/profile"),
                             ("POST", "/billing/topup"), ("PATCH", "/team/members/3"), ("POST", "/telephony/numbers"),
                             ("POST", "/integrations/google_sheets/disconnect"), ("POST", "/profile/request-account-deletion"),
                             ("POST", "/profile/sign-out-others"), ("POST", "/help/chat/confirm")):
            status, body = client.request(method, path)
            self.assertEqual((status, body), (403, {"detail": "Not allowed while viewing as a customer."}), path)

    def test_allowed_write_is_audited_as_the_admin_and_gets_are_free(self):
        client = self.view_as()
        before = len(self.audit_rows("impersonate_write"))
        self.assertEqual(client.request("GET", "/contacts"), (200, {"ok": True, "account": self.tenant_aid}))
        self.assertEqual(len(self.audit_rows("impersonate_write")), before, "GETs are not audited")
        self.assertEqual(client.request("POST", "/contacts")[0], 200)
        row = self.audit_rows("impersonate_write")[-1]
        self.assertEqual((row["actor_user_id"], row["actor_email"], row["target_user_id"]),
                         (self.admin_uid, self.admin_email, self.owner_uid))
        self.assertEqual(row["detail"], "POST /contacts -> 200")

    def test_me_shows_the_admin_and_expiry_and_exit_is_audited(self):
        client = self.view_as()
        status, body = client.request("GET", "/auth/me")
        self.assertEqual(status, 200)
        imp = body["user"]["impersonating"]
        self.assertEqual(imp["adminEmail"], self.admin_email)
        started = time.mktime(time.strptime(imp["startedAt"], "%Y-%m-%dT%H:%M:%SZ"))
        expires = time.mktime(time.strptime(imp["expiresAt"], "%Y-%m-%dT%H:%M:%SZ"))
        self.assertEqual(expires - started, 2 * 3600)
        session = self.auth.read_session_token(client.cookies[self.auth.COOKIE_NAME])
        support = [s for s in self.db.list_user_sessions(self.owner_uid) if s["id"] == session["sid"]]
        self.assertEqual(support[0]["provider"], "support", "visible and revocable in the owner's devices")

        self.assertEqual(client.request("POST", "/admin/impersonate/exit")[0], 200)
        self.assertEqual(self.audit_rows("impersonate_exit")[-1]["actor_user_id"], self.admin_uid)
        self.assertFalse(self.db.validate_user_session(session["sid"], self.owner_uid), "support row revoked on exit")
        status, body = client.request("GET", "/auth/me")
        self.assertEqual((status, body["user"]["impersonating"], body["user"]["id"]), (200, False, self.admin_uid))

    def test_works_after_owner_signed_out_other_devices_and_honours_later_sign_out(self):
        self.db.invalidate_other_sessions(self.owner_uid)  # session_version moves past 1
        client = self.view_as()
        self.assertEqual(client.request("GET", "/contacts")[0], 200)
        self.db.invalidate_other_sessions(self.owner_uid)
        self.assertEqual(client.request("GET", "/contacts")[0], 401)

    def test_expires_after_two_hours(self):
        client = self.view_as()
        with mock.patch("time.time", return_value=time.time() + 2 * 3600 + 5):
            self.assertIsNone(self.auth.read_session_token(client.cookies[self.auth.COOKIE_NAME]))
        conn = self.db._connect()
        row = conn.execute(
            "SELECT expires_at, created_at FROM user_sessions WHERE id = ?",
            (self.auth.read_session_token(client.cookies[self.auth.COOKIE_NAME])["sid"],),
        ).fetchone()
        conn.close()
        to_epoch = lambda s: time.mktime(time.strptime(s, "%Y-%m-%d %H:%M:%S"))  # noqa: E731
        self.assertAlmostEqual(to_epoch(row["expires_at"]) - to_epoch(row["created_at"]), 7200, delta=5)

    def test_legacy_support_cookie_without_a_session_row_is_refused(self):
        token = self.auth.make_session_token(self.owner_uid, self.tenant_aid, impersonator_id=self.admin_uid,
                                             session_version=int(self.db.get_user_by_id(self.owner_uid)["session_version"]))
        client = Client(self.app)
        client.cookies[self.auth.COOKIE_NAME] = token
        self.assertEqual(client.request("GET", "/contacts")[0], 401)
        self.assertEqual(client.request("GET", "/auth/me")[0], 401)

    def test_normal_tenant_session_is_unchanged(self):
        client = self.login(self.owner_uid, self.tenant_aid)
        before = len(self.audit_rows("impersonate_write"))
        for method, path in (("POST", "/contacts"), ("DELETE", "/contacts/1"), ("POST", "/api-keys"), ("PATCH", "/profile")):
            self.assertEqual(client.request(method, path)[0], 200, path)
        self.assertEqual(len(self.audit_rows("impersonate_write")), before)
        status, body = client.request("GET", "/auth/me")
        self.assertEqual((status, body["user"]["impersonating"]), (200, False))
        self.assertEqual(client.request("POST", "/profile/sign-out-others")[0], 200)
        self.assertEqual(client.request("GET", "/contacts")[0], 200, "the fresh cookie still works")
        self.assertEqual(client.request("POST", "/auth/logout")[0], 200)
        self.assertEqual(client.request("GET", "/contacts")[0], 401)

    def test_reason_is_required(self):
        from fastapi import HTTPException
        for bad in ("", "    ", " abc ", None):
            with self.assertRaises(HTTPException) as caught:
                self.ns["_admin_reason"](bad)
            self.assertEqual((caught.exception.status_code, caught.exception.detail),
                             (400, "A reason is required (at least 5 characters)."))
        self.assertEqual(self.ns["_admin_reason"]("  goodwill credit "), "goodwill credit")


class BlockListTests(unittest.TestCase):
    def test_paths(self):
        from fastapi import Depends, Request, Response
        ns = load_token_api({"re": re, "Request": Request, "Response": Response, "Depends": Depends})
        blocks = ns["support_session_blocks"]
        for method, path in (("DELETE", "/agents/4"), ("POST", "/api-keys"), ("PUT", "/billing/profile"),
                             ("POST", "/team/invite"), ("PATCH", "/profile"), ("POST", "/profile/avatar"),
                             ("POST", "/auth/login"), ("POST", "/calls/9/recording/delete"),
                             ("PATCH", "/telephony/numbers/2"), ("POST", "/integrations/zoho_crm/disconnect"),
                             ("POST", "/storage/recordings/delete")):
            self.assertTrue(blocks(method, path), path)
        for method, path in (("GET", "/api-keys"), ("POST", "/auth/logout"), ("POST", "/agents"), ("PATCH", "/agents/4"),
                             ("POST", "/integrations/zoho_crm/test"), ("POST", "/calls/9/analyze"), ("HEAD", "/billing")):
            self.assertFalse(blocks(method, path), path)


if __name__ == "__main__":
    unittest.main()
