"""Live-call half of the Google Sheets "Sign in with Google" integration: one
row per reachable caller, appended by sheetId with neutralised cells, token
refresh/401 retry, 429/5xx retry, owner-facing errors, and the Apps Script
URL path left unchanged."""
import asyncio
import json
import os
import sys
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tools

APPEND = "https://sheets.googleapis.com/v4/spreadsheets/SHEET1:batchUpdate"
CONFIG = {"mode": "oauth", "spreadsheet_id": "SHEET1", "sheet_id": 777, "access_token": "at",
          "refresh_token": "rt", "expires_at": time.time() + 3000}
END = {"type": "call_completed", "name": "@evil", "phone": "+919876543210", "channel": "phone",
       "extracted_data": {"budget": "50k"}, "agent_name": "Artha", "duration_seconds": 61.2, "call_id": 9}
ENV = {"GOOGLE_SHEETS_OAUTH_CLIENT_ID": "cid", "GOOGLE_SHEETS_OAUTH_CLIENT_SECRET": "secret"}


class FakeResp:
    def __init__(self, status, body=""):
        self.status, self._body = status, body if isinstance(body, str) else json.dumps(body)

    async def text(self):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class FakeHttp:
    def __init__(self, script):
        self.script = {k: list(v) for k, v in script.items()}
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        status, body = self.script[url].pop(0)
        return FakeResp(status, body)


def run(http, config=None, lead=END):
    saved = []
    with mock.patch.dict(os.environ, ENV), \
            mock.patch.object(tools.db, "update_integration_config", lambda a, k, c: saved.append(c)), \
            mock.patch.object(tools.asyncio, "sleep", mock.AsyncMock()) as sleep:
        result = asyncio.run(tools._deliver_google_sheet_row(http, 5, dict(config or CONFIG), lead))
    return result, saved, sleep


class Append(unittest.TestCase):
    def test_row_is_appended_by_sheet_id_with_safe_cells(self):
        http = FakeHttp({APPEND: [(200, {})]})
        (ok, _), _, _ = run(http)
        self.assertTrue(ok)
        url, kwargs = http.calls[0]
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer at")
        req = kwargs["json"]["requests"][0]["appendCells"]
        self.assertEqual(req["sheetId"], 777)
        cells = [c["userEnteredValue"] for c in req["rows"][0]["values"]]
        self.assertEqual(len(cells), 13)
        self.assertIn("numberValue", cells[0])
        self.assertEqual(cells[1]["stringValue"], "'@evil")
        self.assertEqual(cells[2]["stringValue"], "+919876543210", "a real phone keeps its +")
        self.assertEqual(cells[5]["stringValue"], "Phone")
        self.assertEqual(cells[8], {"numberValue": 61})
        self.assertEqual(cells[9]["stringValue"], "Budget: 50k")
        self.assertEqual(cells[12], {"numberValue": 9})

    def test_neutralising(self):
        for raw in ("=A1", "+x", "-1", "@a"):
            self.assertEqual(tools._sheets_safe_text(raw), "'" + raw)
        self.assertEqual(tools._sheets_safe_phone("+91 98765-43210"), "+91 98765-43210")
        self.assertEqual(tools._sheets_safe_phone("=1+1"), "'=1+1")

    def test_expired_token_refreshed_before_append_and_saved(self):
        http = FakeHttp({tools._GOOGLE_TOKEN_URL: [(200, {"access_token": "new", "expires_in": 3599})],
                         APPEND: [(200, {})]})
        (ok, _), saved, _ = run(http, {**CONFIG, "expires_at": 0})
        self.assertTrue(ok)
        self.assertEqual(http.calls[0][1]["data"]["grant_type"], "refresh_token")
        self.assertEqual(saved[0]["access_token"], "new")
        self.assertEqual(http.calls[1][1]["headers"]["Authorization"], "Bearer new")

    def test_401_refreshes_and_retries_once(self):
        http = FakeHttp({APPEND: [(401, "expired"), (200, {})],
                         tools._GOOGLE_TOKEN_URL: [(200, {"access_token": "new"})]})
        (ok, _), _, _ = run(http)
        self.assertTrue(ok)
        self.assertEqual([c[1]["headers"]["Authorization"] for c in http.calls if c[0] == APPEND], ["Bearer at", "Bearer new"])

    def test_invalid_grant_marks_reconnect_then_stops_calling_google(self):
        http = FakeHttp({tools._GOOGLE_TOKEN_URL: [(400, '{"error": "invalid_grant"}')]})
        (ok, detail), saved, _ = run(http, {**CONFIG, "expires_at": 0})
        self.assertEqual((ok, detail), (False, "Google access was removed. Sign in with Google again."))
        self.assertTrue(saved[0]["needs_reconnect"])
        quiet = FakeHttp({})
        (ok, detail), _, _ = run(quiet, saved[0])
        self.assertEqual((ok, quiet.calls), (False, []))

    def test_owner_facing_errors(self):
        for status, body, message in (
            (404, "not found", "The leads sheet was deleted. Reconnect to create a new one."),
            (403, "PERMISSION_DENIED", tools._SHEETS_ERR_NO_PERMISSION),
            (403, "SERVICE_DISABLED", tools._SHEETS_ERR_API_DISABLED),
        ):
            (ok, detail), _, _ = run(FakeHttp({APPEND: [(status, body)]}))
            self.assertEqual((ok, detail), (False, message), status)

    def test_429_and_5xx_retry_once_with_backoff(self):
        (ok, _), _, sleep = run(FakeHttp({APPEND: [(429, "slow"), (200, {})]}))
        self.assertTrue(ok)
        sleep.assert_awaited_once_with(1.0)
        http = FakeHttp({APPEND: [(500, "x"), (502, "x"), (200, {})]})
        (ok, detail), _, _ = run(http)
        self.assertEqual((ok, detail, len(http.calls)), (False, tools._SHEETS_ERR_BUSY, 2))


class FanOut(unittest.TestCase):
    def _fan_out(self, config, lead):
        marks, syncs, delivered, posted = [], [], [], []

        async def fake_row(http, account_id, cfg, lead_):
            delivered.append(lead_)
            return False, "The leads sheet was deleted. Reconnect to create a new one."

        class Session:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            def post(self, url, json=None, **k):
                posted.append((url, json))
                return FakeResp(200, "")

        with mock.patch.object(tools.db, "get_delivery_integrations", lambda a, k: [{"key": "sheets", "config": config}]), \
                mock.patch.object(tools.db, "mark_integration_error", lambda a, k, m: marks.append((k, m))), \
                mock.patch.object(tools.db, "touch_integration_sync", lambda a, k: syncs.append(k)), \
                mock.patch.object(tools, "_deliver_google_sheet_row", fake_row), \
                mock.patch.object(tools.aiohttp, "ClientSession", Session):
            asyncio.run(tools._deliver_to_integrations(5, lead))
        return marks, syncs, delivered, posted

    def test_only_call_completed_with_a_way_to_reach_them(self):
        for lead in ({**END, "type": "lead_update"}, {**END, "phone": "", "email": ""}):
            _, _, delivered, _ = self._fan_out(CONFIG, lead)
            self.assertEqual(delivered, [], lead)
        marks, _, delivered, _ = self._fan_out(CONFIG, {**END, "phone": "", "email": "a@x.in"})
        self.assertEqual(len(delivered), 1)
        self.assertEqual(marks, [("sheets", "The leads sheet was deleted. Reconnect to create a new one.")])

    def test_apps_script_url_config_unchanged(self):
        url = "https://script.google.com/macros/s/x/exec"
        _, syncs, delivered, posted = self._fan_out({"url": url}, {**END, "type": "lead_update"})
        self.assertEqual(delivered, [])
        self.assertEqual(posted[0][0], url)
        self.assertEqual(posted[0][1]["name"], "@evil", "Apps Script still gets the raw lead JSON")
        self.assertEqual(syncs, ["sheets"])


if __name__ == "__main__":
    unittest.main()
