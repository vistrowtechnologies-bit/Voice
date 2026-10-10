"""Google Sheets "Sign in with Google": start URL, callback checks, sheet
creation/reuse, token redaction, the Test button, disconnect, and the
server-side append (refresh, retries, owner-facing errors). No network: every
Google call goes through a fake urlopen."""
import ast
import base64
import io
import json
import os
import sys
import time
import unittest
import urllib.error
import urllib.parse
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import google_sheets
import integrations_dispatch

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)

REDIRECT = "https://app.vistrowvoice.com/api/auth/oauth/google-sheets/callback"
ENV = {
    "GOOGLE_SHEETS_OAUTH_CLIENT_ID": "cid",
    "GOOGLE_SHEETS_OAUTH_CLIENT_SECRET": "secret",
    "GOOGLE_SHEETS_OAUTH_REDIRECT_URI": REDIRECT,
}


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


class FakeResp:
    def __init__(self, body: dict | None, status: int = 200):
        self.status = status
        self._raw = json.dumps(body).encode() if body is not None else b""

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def http_error(url: str, code: int, body: str = "") -> urllib.error.HTTPError:
    return urllib.error.HTTPError(url, code, "err", {}, io.BytesIO(body.encode()))


class FakeGoogle:
    """Scripted urlopen: `routes` maps (method, url-prefix) to a list of
    responses consumed in order (dict = 200 JSON, (code, body) = HTTPError)."""

    def __init__(self, routes):
        self.routes = {k: list(v) for k, v in routes.items()}
        self.calls = []

    def __call__(self, req, timeout=None):
        method, url = req.get_method(), req.full_url
        self.calls.append((method, url, req.data, dict(req.header_items())))
        for (m, prefix), queue in self.routes.items():
            if m == method and url.startswith(prefix) and queue:
                item = queue.pop(0)
                if isinstance(item, tuple):
                    raise http_error(url, item[0], item[1])
                return FakeResp(item)
        raise AssertionError(f"unexpected Google call {method} {url}")


def id_token(email: str) -> str:
    payload = base64.urlsafe_b64encode(json.dumps({"email": email}).encode()).decode().rstrip("=")
    return f"h.{payload}.sig"


CREATED = {"spreadsheetId": "SHEET1", "spreadsheetUrl": "https://docs.google.com/spreadsheets/d/SHEET1/edit",
           "sheets": [{"properties": {"sheetId": 777, "title": "Leads"}}]}
OAUTH_CONFIG = {"mode": "oauth", "spreadsheet_id": "SHEET1", "sheet_id": 777, "sheet_title": "Leads",
                "access_token": "at", "refresh_token": "rt", "expires_at": time.time() + 3000}
LEAD = {"type": "call_completed", "name": "=HYPERLINK(\"x\")", "phone": "+91 98765 43210", "email": "a@x.in",
        "channel": "widget", "agent_name": "Artha", "duration_seconds": 93.4, "call_id": 12,
        "extracted_data": {"budget": "50k", "company": "Acme"}, "recording_url": "https://r"}


class StartRoute(unittest.TestCase):
    def _start(self):
        from fastapi import HTTPException
        from fastapi.responses import RedirectResponse
        ns = {"Depends": lambda x: None, "require_role": lambda r: None, "os": os, "secrets": __import__("secrets"),
              "HTTPException": HTTPException, "RedirectResponse": RedirectResponse, "google_sheets": google_sheets,
              "_GOOGLE_SHEETS_INTEGRATION_STATE_COOKIE": "vv_gs", "_COOKIE_SECURE": True}
        exec(function_source("integration_google_sheets_start"), ns)
        return ns["integration_google_sheets_start"]

    def test_auth_url_has_offline_consent_and_drive_file_scope(self):
        with mock.patch.dict(os.environ, ENV):
            resp = self._start()(user={})
        url = resp.headers["location"]
        self.assertTrue(url.startswith("https://accounts.google.com/o/oauth2/v2/auth?"))
        q = dict(urllib.parse.parse_qsl(url.split("?", 1)[1]))
        self.assertEqual(q["scope"], "openid email https://www.googleapis.com/auth/drive.file")
        self.assertEqual((q["access_type"], q["prompt"], q["response_type"]), ("offline", "consent", "code"))
        # Earlier grants on the project (Google Calendar, sensitive) must not be
        # folded in: that is what showed "Google hasn't verified this app".
        self.assertNotIn("include_granted_scopes", q)
        self.assertEqual(q["redirect_uri"], REDIRECT)
        self.assertIn(f"vv_gs={q['state']}", resp.headers["set-cookie"])

    def test_not_configured_is_404(self):
        from fastapi import HTTPException
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as ctx:
                self._start()(user={})
        self.assertEqual(ctx.exception.status_code, 404)

    def test_callback_is_under_the_public_auth_prefix_and_start_requires_admin(self):
        self.assertIn('@app.get("/auth/oauth/google-sheets/callback")', SOURCE)
        self.assertIn('"/auth/", "/invite/"', SOURCE)
        self.assertIn('require_role("admin")', function_source("integration_google_sheets_start"))
        self.assertIn('require_role("admin")', function_source("integration_google_sheets_disconnect"))


class FakeCallsDb:
    ROLE_RANK = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}

    def __init__(self, role="admin", existing=None):
        self.role, self.existing = role, existing or {}
        self.saved, self.cleared = [], []

    def get_user_by_id(self, uid):
        return {"role": self.role, "account_id": 5}

    def list_integrations(self, account_id):
        return [{"key": "sheets", "config": self.existing}]

    def update_integration(self, key, status, config, account_id, name=None):
        self.saved.append((key, status, config, account_id))

    def clear_integration_error(self, account_id, key):
        self.cleared.append((account_id, key))


class FakeRequest:
    def __init__(self, cookies):
        self.cookies, self.headers = cookies, {}


class Callback(unittest.TestCase):
    def _callback(self, db, session=True):
        from fastapi.responses import RedirectResponse
        ns = {"Request": object, "os": os, "secrets": __import__("secrets"), "time": time, "RedirectResponse": RedirectResponse,
              "google_sheets": google_sheets, "calls_db": db, "logger": mock.Mock(),
              "_app_base_url": lambda r: "https://app.vistrowvoice.com",
              "_GOOGLE_SHEETS_INTEGRATION_STATE_COOKIE": "vv_gs",
              "auth": mock.Mock(COOKIE_NAME="vv_session", read_session_token=lambda t: {"uid": 1, "aid": 5} if session else None),
              "plan_policy": mock.Mock(EntitlementError=type("EntitlementError", (Exception,), {}))}
        exec(function_source("auth_oauth_google_sheets_callback"), ns)
        return ns["auth_oauth_google_sheets_callback"]

    def _run(self, db, google, state="s1", cookie="s1", session=True):
        req = FakeRequest({"vv_gs": cookie, "vv_session": "tok"})
        with mock.patch.dict(os.environ, ENV), mock.patch("urllib.request.urlopen", google):
            return self._callback(db, session)(req, code="c", state=state)

    def test_bad_state_no_session_or_non_admin_fail_without_calling_google(self):
        for kwargs, db in (({"state": "other"}, FakeCallsDb()), ({"session": False}, FakeCallsDb()),
                           ({}, FakeCallsDb(role="member"))):
            google = FakeGoogle({})
            resp = self._run(db, google, **kwargs)
            self.assertTrue(resp.headers["location"].endswith("/dashboard/integrations?sheets=failed"), kwargs)
            self.assertEqual(google.calls, [])
            self.assertEqual(db.saved, [])

    def test_exchange_creates_and_formats_the_sheet_and_saves_oauth_config(self):
        db = FakeCallsDb()
        google = FakeGoogle({
            ("POST", google_sheets.TOKEN_URL): [{"access_token": "at", "refresh_token": "rt", "expires_in": 3599,
                                                 "id_token": id_token("owner@gmail.com")}],
            ("POST", google_sheets.SHEETS_API + "/SHEET1:batchUpdate"): [{}],
            ("POST", google_sheets.SHEETS_API): [CREATED],
        })
        resp = self._run(db, google)
        self.assertTrue(resp.headers["location"].endswith("?sheets=connected"))
        token_call = google.calls[0]
        self.assertIn(b"grant_type=authorization_code", token_call[2])
        self.assertIn(urllib.parse.quote(REDIRECT, safe="").encode(), token_call[2])
        create_body = json.loads(google.calls[1][2])
        self.assertEqual(create_body["properties"]["title"], "Vistrow Voice — Leads")
        self.assertEqual(create_body["sheets"][0]["properties"]["title"], "Leads")
        self.assertEqual(google.calls[1][3]["Authorization"], "Bearer at")
        fmt = json.loads(google.calls[2][2])["requests"]
        self.assertEqual(fmt, google_sheets.format_requests(777))
        key, status, config, account_id = db.saved[0]
        self.assertEqual((key, status, account_id), ("sheets", "connected", 5))
        self.assertEqual(config["mode"], "oauth")
        self.assertEqual((config["spreadsheet_id"], config["sheet_id"], config["sheet_title"]), ("SHEET1", 777, "Leads"))
        self.assertEqual(config["google_email"], "owner@gmail.com")
        self.assertEqual((config["access_token"], config["refresh_token"]), ("at", "rt"))
        self.assertGreater(config["expires_at"], time.time() + 3000)
        self.assertEqual(db.cleared, [(5, "sheets")])

    def test_reconnect_reuses_a_sheet_google_still_opens(self):
        db = FakeCallsDb(existing={**OAUTH_CONFIG, "spreadsheet_url": "u", "needs_reconnect": True})
        google = FakeGoogle({
            ("POST", google_sheets.TOKEN_URL): [{"access_token": "at2", "refresh_token": "rt2", "expires_in": 3599}],
            ("GET", google_sheets.SHEETS_API + "/SHEET1"): [
                {"spreadsheetId": "SHEET1", "spreadsheetUrl": "u2", "sheets": [{"properties": {"sheetId": 777, "title": "My leads"}}]}],
        })
        self._run(db, google)
        config = db.saved[0][2]
        self.assertEqual((config["spreadsheet_id"], config["sheet_title"], config["spreadsheet_url"]), ("SHEET1", "My leads", "u2"))
        self.assertNotIn("needs_reconnect", config)
        self.assertFalse(any(m == "POST" and u == google_sheets.SHEETS_API for m, u, *_ in google.calls))

    def test_reconnect_creates_a_new_sheet_when_the_old_one_is_gone(self):
        db = FakeCallsDb(existing=dict(OAUTH_CONFIG))
        google = FakeGoogle({
            ("POST", google_sheets.TOKEN_URL): [{"access_token": "at2", "refresh_token": "rt2"}],
            ("GET", google_sheets.SHEETS_API + "/SHEET1"): [(404, "not found")],
            ("POST", google_sheets.SHEETS_API + "/NEW:batchUpdate"): [{}],
            ("POST", google_sheets.SHEETS_API): [{**CREATED, "spreadsheetId": "NEW"}],
        })
        self._run(db, google)
        self.assertEqual(db.saved[0][2]["spreadsheet_id"], "NEW")

    def test_token_exchange_failure_redirects_failed(self):
        db = FakeCallsDb()
        resp = self._run(db, FakeGoogle({("POST", google_sheets.TOKEN_URL): [(400, '{"error":"invalid_grant"}')]}))
        self.assertTrue(resp.headers["location"].endswith("?sheets=failed"))
        self.assertEqual(db.saved, [])


class Redaction(unittest.TestCase):
    def test_list_route_strips_tokens_for_sheets_and_zoho(self):
        rows = [{"key": "sheets", "config": {**OAUTH_CONFIG, "google_email": "o@g.com", "spreadsheet_url": "u"}},
                {"key": "zoho_crm", "config": {"access_token": "z", "refresh_token": "zr", "api_domain": "d"}},
                {"key": "webhook", "config": {"url": "https://x"}}]
        ns = {"Depends": lambda x: None, "current_user": None,
              "calls_db": mock.Mock(list_integrations=lambda a: rows),
              "_SECRET_CONFIG_KEYS": {"access_token", "refresh_token", "id_token"}}
        exec(function_source("list_integrations"), ns)
        out = ns["list_integrations"]({"account_id": 5})
        dumped = json.dumps(out)
        for secret in ('"at"', '"rt"', '"z"', '"zr"'):
            self.assertNotIn(secret, dumped)
        self.assertEqual(out[0]["config"]["google_email"], "o@g.com")
        self.assertEqual(out[1]["config"]["api_domain"], "d")
        self.assertEqual(out[2]["config"], {"url": "https://x"})
        self.assertEqual(rows[0]["config"]["refresh_token"], "rt", "delivery still needs the stored tokens")


class Disconnect(unittest.TestCase):
    def test_revokes_the_refresh_token_and_clears_config(self):
        db = FakeCallsDb(existing=dict(OAUTH_CONFIG))
        ns = {"Depends": lambda x: None, "require_role": lambda r: None, "calls_db": db, "google_sheets": google_sheets}
        exec(function_source("integration_google_sheets_disconnect"), ns)
        google = FakeGoogle({("POST", google_sheets.REVOKE_URL): [(400, "already revoked")]})
        with mock.patch("urllib.request.urlopen", google):
            self.assertEqual(ns["integration_google_sheets_disconnect"]({"account_id": 5}), {"ok": True})
        self.assertEqual(google.calls[0][1], google_sheets.REVOKE_URL + "?token=rt")
        self.assertEqual(db.saved, [("sheets", "not_connected", {}, 5)])


class Append(unittest.TestCase):
    def _append(self, google, config=None):
        saved = []
        with mock.patch("urllib.request.urlopen", google), mock.patch("time.sleep") as sleep:
            ok, detail = google_sheets.append_lead(dict(config or OAUTH_CONFIG), LEAD, "cid", "secret", saved.append)
        return ok, detail, saved, sleep

    APPEND = google_sheets.SHEETS_API + "/SHEET1:batchUpdate"

    def test_appends_by_sheet_id_with_neutralised_cells(self):
        google = FakeGoogle({("POST", self.APPEND): [{}]})
        ok, _, _, _ = self._append(google)
        self.assertTrue(ok)
        body = json.loads(google.calls[0][2])["requests"][0]["appendCells"]
        self.assertEqual(body["sheetId"], 777)
        cells = [c["userEnteredValue"] for c in body["rows"][0]["values"]]
        self.assertEqual(len(cells), len(google_sheets.HEADERS))
        self.assertIn("numberValue", cells[0])
        self.assertEqual(cells[1]["stringValue"], "'=HYPERLINK(\"x\")")
        self.assertEqual(cells[2]["stringValue"], "+91 98765 43210")
        self.assertEqual(cells[4]["stringValue"], "Acme")
        self.assertEqual(cells[8], {"numberValue": 93})
        self.assertIn("Budget: 50k", cells[9]["stringValue"])
        self.assertNotIn("Agent:", cells[9]["stringValue"])

    def test_formula_neutralising(self):
        for raw in ("=1+1", "+cmd", "-2", "@SUM(A1)"):
            self.assertEqual(google_sheets._safe_text(raw), "'" + raw)
        self.assertEqual(google_sheets._safe_text("Asha"), "Asha")
        self.assertEqual(google_sheets._safe_phone("+919876543210"), "+919876543210")
        self.assertEqual(google_sheets._safe_phone("+=cmd"), "'+=cmd")

    def test_expired_token_is_refreshed_first_and_saved(self):
        google = FakeGoogle({("POST", google_sheets.TOKEN_URL): [{"access_token": "new", "expires_in": 3599}],
                             ("POST", self.APPEND): [{}]})
        ok, _, saved, _ = self._append(google, {**OAUTH_CONFIG, "expires_at": 0})
        self.assertTrue(ok)
        self.assertEqual(saved[0]["access_token"], "new")
        self.assertEqual(google.calls[1][3]["Authorization"], "Bearer new")

    def test_401_refreshes_and_retries_once(self):
        google = FakeGoogle({("POST", self.APPEND): [(401, "expired"), {}],
                             ("POST", google_sheets.TOKEN_URL): [{"access_token": "new"}]})
        ok, _, saved, _ = self._append(google)
        self.assertTrue(ok)
        self.assertEqual([c[3]["Authorization"] for c in google.calls if c[1] == self.APPEND], ["Bearer at", "Bearer new"])

    def test_invalid_grant_flags_reconnect_and_stops_calling_google(self):
        google = FakeGoogle({("POST", google_sheets.TOKEN_URL): [(400, '{"error": "invalid_grant"}')]})
        ok, detail, saved, _ = self._append(google, {**OAUTH_CONFIG, "expires_at": 0})
        self.assertFalse(ok)
        self.assertEqual(detail, google_sheets.ERR_ACCESS_REMOVED)
        self.assertTrue(saved[-1]["needs_reconnect"])
        quiet = FakeGoogle({})
        ok, detail, _, _ = self._append(quiet, saved[-1])
        self.assertEqual((ok, detail, quiet.calls), (False, google_sheets.ERR_ACCESS_REMOVED, []))

    def test_owner_facing_errors(self):
        cases = [((404, "not found"), google_sheets.ERR_SHEET_DELETED),
                 ((403, '{"error":{"status":"PERMISSION_DENIED"}}'), google_sheets.ERR_NO_PERMISSION),
                 ((403, "Google Sheets API has not been used in project 1 before or it is disabled"), google_sheets.ERR_API_DISABLED),
                 ((400, "No grid with id: 777"), google_sheets.ERR_SHEET_DELETED)]
        for error, message in cases:
            ok, detail, _, _ = self._append(FakeGoogle({("POST", self.APPEND): [error]}))
            self.assertEqual((ok, detail), (False, message), error)

    def test_429_and_5xx_retry_once_after_a_short_backoff(self):
        ok, _, _, sleep = self._append(FakeGoogle({("POST", self.APPEND): [(429, "slow"), {}]}))
        self.assertTrue(ok)
        sleep.assert_called_once_with(1.0)
        google = FakeGoogle({("POST", self.APPEND): [(503, "down"), (503, "down"), {}]})
        ok, detail, _, _ = self._append(google)
        self.assertEqual((ok, detail, len(google.calls)), (False, google_sheets.ERR_BUSY, 2))

    def test_format_request_sets_header_freeze_date_text_and_widths(self):
        reqs = google_sheets.format_requests(9)
        kinds = [next(iter(r)) for r in reqs]
        self.assertEqual(kinds[:4], ["updateCells", "updateSheetProperties", "repeatCell", "repeatCell"])
        self.assertEqual(kinds.count("updateDimensionProperties"), len(google_sheets.HEADERS))
        header = reqs[0]["updateCells"]["rows"][0]["values"]
        self.assertEqual([c["userEnteredValue"]["stringValue"] for c in header], google_sheets.HEADERS)
        self.assertTrue(all(c["userEnteredFormat"]["textFormat"]["bold"] for c in header))
        self.assertEqual(reqs[1]["updateSheetProperties"]["properties"]["gridProperties"]["frozenRowCount"], 1)
        self.assertEqual(reqs[2]["repeatCell"]["cell"]["userEnteredFormat"]["numberFormat"]["type"], "DATE_TIME")
        self.assertEqual(reqs[3]["repeatCell"]["range"]["startColumnIndex"], google_sheets.HEADERS.index("Phone"))
        self.assertEqual(reqs[3]["repeatCell"]["cell"]["userEnteredFormat"]["numberFormat"]["type"], "TEXT")


class Dispatch(unittest.TestCase):
    def _patched(self, config, deliver=None):
        integ = {"key": "sheets", "status": "connected", "config": config}
        return [
            mock.patch.object(integrations_dispatch.calls_db, "list_integrations", lambda a: [integ]),
            mock.patch.object(integrations_dispatch.calls_db, "account_entitlements", lambda a: {"features": {"crm": True}}),
            mock.patch.object(integrations_dispatch.calls_db, "touch_integration_sync", mock.Mock()),
            mock.patch.object(integrations_dispatch.calls_db, "mark_integration_error", mock.Mock()),
        ]

    def test_test_button_appends_a_labelled_row_and_reports_errors(self):
        patches = self._patched(dict(OAUTH_CONFIG))
        for p in patches:
            p.start()
        self.addCleanup(lambda: [p.stop() for p in patches])
        google = FakeGoogle({("POST", Append.APPEND): [{}, (404, "gone")]})
        with mock.patch("urllib.request.urlopen", google):
            self.assertEqual(integrations_dispatch.test_integration(5, "sheets"), (True, "Row added"))
            cells = json.loads(google.calls[0][2])["requests"][0]["appendCells"]["rows"][0]["values"]
            self.assertEqual(cells[1]["userEnteredValue"]["stringValue"], "TEST — safe to delete")
            self.assertEqual(integrations_dispatch.test_integration(5, "sheets"), (False, google_sheets.ERR_SHEET_DELETED))
        integrations_dispatch.calls_db.mark_integration_error.assert_called_with(5, "sheets", google_sheets.ERR_SHEET_DELETED)

    def test_apps_script_url_config_still_posts_the_lead_json(self):
        body = integrations_dispatch._body_for("sheets", {"url": "https://script.google.com/macros/s/x/exec"}, {"name": "A"})
        self.assertEqual(body, {"_url": "https://script.google.com/macros/s/x/exec", "name": "A"})


if __name__ == "__main__":
    unittest.main()
