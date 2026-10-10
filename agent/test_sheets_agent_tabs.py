"""Google Sheets sign-in sheet: each agent's leads go to its own tab, named
after the agent, created and styled on its first lead; a tab is never worth
losing a lead over."""
import asyncio
import json
import os
import sys
import time
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tools

BATCH = "https://sheets.googleapis.com/v4/spreadsheets/SHEET1:batchUpdate"
META = "https://sheets.googleapis.com/v4/spreadsheets/SHEET1?fields=sheets.properties(sheetId,title)"
CONFIG = {"mode": "oauth", "spreadsheet_id": "SHEET1", "sheet_id": 0, "sheet_title": "Leads",
          "access_token": "at", "refresh_token": "rt", "expires_at": time.time() + 3000}
LEAD = {"type": "call_completed", "name": "Asha", "phone": "+919876543210", "agent_name": "Artha Sales",
        "recording_url": "https://api.vistrowvoice.com/public/calls/9/recording?token=abc"}


class Resp:
    def __init__(self, status, body):
        self.status, self._body = status, body if isinstance(body, str) else json.dumps(body)

    async def text(self):
        return self._body

    async def json(self, content_type=None):
        return json.loads(self._body)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class Http:
    def __init__(self, posts, gets=None):
        self.posts, self.gets, self.calls = list(posts), dict(gets or {}), []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs["json"]["requests"][0]))
        return Resp(*self.posts.pop(0))

    def get(self, url, **kwargs):
        return Resp(*self.gets[url])


def run(http, config=None, lead=LEAD):
    saved = []
    with mock.patch.object(tools.db, "update_integration_config", lambda a, k, c: saved.append(json.loads(json.dumps(c)))):
        result = asyncio.run(tools._deliver_google_sheet_row(http, 5, json.loads(json.dumps(config or CONFIG)), lead))
    return result, saved


def kind(request):
    return next(iter(request))


class AgentTabs(unittest.TestCase):
    def test_first_lead_creates_a_styled_tab_named_after_the_agent(self):
        http = Http([(200, {"replies": [{"addSheet": {"properties": {"sheetId": 42}}}]}), (200, {}), (200, {})])
        (ok, _), saved = run(http)
        self.assertTrue(ok)
        add, style, append = (c[1] for c in http.calls)
        self.assertEqual(add["addSheet"]["properties"]["title"], "Artha Sales")
        self.assertEqual(kind(style), "updateCells")  # header row of the styling batch
        self.assertEqual(append["appendCells"]["sheetId"], 42)
        self.assertEqual(saved[-1]["agent_tabs"], {"Artha Sales": 42})

    def test_known_tab_is_reused_without_asking_google(self):
        http = Http([(200, {})])
        (ok, _), saved = run(http, {**CONFIG, "agent_tabs": {"Artha Sales": 42}})
        self.assertTrue(ok)
        self.assertEqual([kind(c[1]) for c in http.calls], ["appendCells"])
        self.assertEqual(http.calls[0][1]["appendCells"]["sheetId"], 42)

    def test_tab_that_already_exists_is_found_by_title(self):
        http = Http(
            [(400, '{"error": {"message": "A sheet with the name \\"Artha Sales\\" already exists."}}'), (200, {})],
            {META: (200, {"sheets": [{"properties": {"sheetId": 0, "title": "Leads"}},
                                     {"properties": {"sheetId": 77, "title": "Artha Sales"}}]})},
        )
        (ok, _), saved = run(http)
        self.assertTrue(ok)
        self.assertEqual(http.calls[-1][1]["appendCells"]["sheetId"], 77)
        self.assertEqual(saved[-1]["agent_tabs"], {"Artha Sales": 77})

    def test_no_agent_name_or_google_refusal_falls_back_to_main_tab(self):
        http = Http([(200, {})])
        (ok, _), _ = run(http, lead={**LEAD, "agent_name": ""})
        self.assertTrue(ok)
        self.assertEqual(http.calls[0][1]["appendCells"]["sheetId"], 0)
        http = Http([(403, "PERMISSION_DENIED"), (200, {})])
        (ok, _), _ = run(http)
        self.assertTrue(ok, "a tab problem must not lose the lead")
        self.assertEqual(http.calls[-1][1]["appendCells"]["sheetId"], 0)

    def test_deleted_agent_tab_is_recreated(self):
        http = Http([
            (400, "Invalid requests[0].appendCells: No grid with id: 42"),
            (200, {"replies": [{"addSheet": {"properties": {"sheetId": 43}}}]}),
            (200, {}),
            (200, {}),
        ])
        (ok, _), saved = run(http, {**CONFIG, "agent_tabs": {"Artha Sales": 42}})
        self.assertTrue(ok)
        self.assertEqual(http.calls[-1][1]["appendCells"]["sheetId"], 43)
        self.assertEqual(saved[-1]["agent_tabs"], {"Artha Sales": 43})

    def test_tab_title_is_cleaned(self):
        self.assertEqual(tools._sheets_tab_title("  Meera's [Support]: Pune/West  "), "Meeras Support PuneWest")
        self.assertEqual(len(tools._sheets_tab_title("x" * 300)), 90)


class RecordingLink(unittest.TestCase):
    def test_recording_is_a_play_link_not_a_formula(self):
        cell = tools._sheets_recording_cell(LEAD["recording_url"])
        self.assertEqual(cell["userEnteredValue"], {"stringValue": "▶ Play recording"})
        self.assertEqual(cell["userEnteredFormat"]["textFormat"]["link"]["uri"],
                         "https://api.vistrowvoice.com/public/calls/9/play?token=abc")
        self.assertEqual(tools._sheets_recording_cell(""), {"userEnteredValue": {"stringValue": ""}})
        self.assertEqual(tools._sheets_recording_cell("javascript:alert(1)"), {"userEnteredValue": {"stringValue": ""}})

    def test_append_mask_includes_text_format_for_the_link(self):
        body = tools._sheets_append_body(0, LEAD)
        self.assertEqual(body["requests"][0]["appendCells"]["fields"], "userEnteredValue,userEnteredFormat.textFormat")


class MatchesServer(unittest.TestCase):
    def test_styling_and_cells_match_the_server_copy(self):
        sys.path.insert(0, os.path.join(HERE, "..", "server"))
        try:
            import google_sheets
        finally:
            sys.path.pop(0)
        self.assertEqual(tools._sheets_format_requests(7), google_sheets.format_requests(7))
        self.assertEqual(tools._SHEETS_HEADERS, google_sheets.HEADERS)
        self.assertEqual(tools._sheets_recording_cell(LEAD["recording_url"]), google_sheets.recording_cell(LEAD["recording_url"]))


class FieldChoice(unittest.TestCase):
    FULL = {"type": "call_completed", "name": "Asha", "phone": "+91", "email": "a@x.in", "agent_name": "Artha",
            "recording_url": "https://r", "recording_mime_type": "audio/wav", "transcript": [{"role": "user", "text": "hi"}],
            "extracted_data": {"budget": "50k", "company": "Acme"}, "call_id": 9}

    def test_left_out_fields_are_never_sent(self):
        out = tools._apply_field_choice("webhook", {"fields": ["name", "phone", "details"]}, self.FULL)
        self.assertEqual(set(out), {"type", "name", "phone", "extracted_data"})
        self.assertEqual(out["extracted_data"], {"budget": "50k"}, "company inside details goes too")
        self.assertIs(tools._apply_field_choice("zoho_crm", {"fields": ["name"]}, self.FULL), self.FULL)
        self.assertIs(tools._apply_field_choice("slack", {}, self.FULL), self.FULL)

    def test_sheet_row_blanks_recording_and_keeps_column_positions(self):
        lead = tools._apply_field_choice("sheets", {"mode": "oauth", "fields": ["name", "phone", "agent"]}, self.FULL)
        cells = tools._sheets_row_cells(lead)
        self.assertEqual(len(cells), len(tools._SHEETS_HEADERS))
        self.assertEqual(cells[11], {"userEnteredValue": {"stringValue": ""}})

    def test_agent_tab_still_chosen_when_agent_column_is_left_out(self):
        http = Http([(200, {})])
        lead = tools._apply_field_choice("sheets", {"fields": ["name", "phone"]}, LEAD)
        saved = []
        with mock.patch.object(tools.db, "update_integration_config", lambda a, k, c: saved.append(c)):
            ok, _ = asyncio.run(tools._deliver_google_sheet_row(
                http, 5, {**CONFIG, "agent_tabs": {"Artha Sales": 42}}, lead, agent_name="Artha Sales"))
        self.assertTrue(ok)
        self.assertEqual(http.calls[0][1]["appendCells"]["sheetId"], 42)

    def test_leaving_phone_and_email_out_of_the_sheet_does_not_skip_callers(self):
        delivered = []

        async def fake_row(http, account_id, cfg, lead_, agent_name=None):
            delivered.append(lead_)
            return True, "Row added"

        class S:
            def __init__(self, *a, **k): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False

        integrations = [{"key": "sheets", "config": {"mode": "oauth", "fields": ["name", "details"]}}]
        with mock.patch.object(tools.db, "get_delivery_integrations", lambda a, k: integrations), \
                mock.patch.object(tools.db, "touch_integration_sync", lambda *a: None), \
                mock.patch.object(tools.db, "record_integration_delivery", lambda *a: None), \
                mock.patch.object(tools, "_deliver_google_sheet_row", fake_row), \
                mock.patch.object(tools.aiohttp, "ClientSession", S):
            asyncio.run(tools._deliver_to_integrations(5, dict(self.FULL)))
        self.assertEqual(len(delivered), 1, "the caller had a phone; the sheet just doesn't show it")
        self.assertNotIn("phone", delivered[0])

    def test_matches_server_copy(self):
        sys.path.insert(0, os.path.join(HERE, "..", "server"))
        try:
            import integrations_dispatch, google_sheets
        finally:
            sys.path.pop(0)
        for cfg in ({"fields": ["name", "recording"]}, {"fields": ["email", "details", "transcript"]}, {}):
            self.assertEqual(tools._apply_field_choice("slack", cfg, self.FULL),
                             integrations_dispatch.apply_field_choice("slack", cfg, self.FULL))
        self.assertEqual(tools._sheets_column_visibility_requests(3, ["name"]),
                         google_sheets.column_visibility_requests(3, ["name"]))


class EventChoice(unittest.TestCase):
    def test_owner_choice_and_defaults(self):
        want = tools._integration_wants_event
        self.assertTrue(want("webhook", {}, {"type": "lead_update"}), "unchanged default: everything")
        self.assertFalse(want("whatsapp", {}, {"type": "lead_update"}), "WhatsApp defaults to end of call only")
        self.assertTrue(want("whatsapp", {}, {"type": "call_completed"}))
        self.assertFalse(want("slack", {"events": ["call_completed"]}, {"type": "platform_lead_update"}))
        self.assertTrue(want("slack", {"events": ["appointment_booked"]}, {"type": "appointment_booked"}))
        self.assertTrue(want("zoho_crm", {"events": ["lead_update"]}, {"type": "call_completed"}), "fixed-rule keys ignore events")
        self.assertTrue(want("sheets", {"mode": "oauth", "events": []}, {"type": "call_completed"}))
        self.assertTrue(want("webhook", {"events": ["call_completed"]}, {}), "unknown/missing type is never filtered")

    def test_unwanted_event_is_not_sent_and_sent_one_is_logged(self):
        logged = []
        posted = []

        class H:
            def post(self, url, json=None, **k):
                posted.append(json)
                return Resp(200, "{}")

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

        integrations = [{"key": "webhook", "config": {"url": "https://x.test/h", "events": ["call_completed"]}}]
        with mock.patch.object(tools.db, "get_delivery_integrations", lambda a, k: integrations), \
                mock.patch.object(tools.db, "touch_integration_sync", lambda *a: None), \
                mock.patch.object(tools.db, "record_integration_delivery", lambda *a: logged.append(a)), \
                mock.patch.object(tools.aiohttp, "ClientSession", lambda **k: H()):
            asyncio.run(tools._deliver_to_integrations(5, {"type": "lead_update", "name": "Asha"}))
            self.assertEqual((posted, logged), ([], []))
            asyncio.run(tools._deliver_to_integrations(5, {"type": "call_completed", "name": "Asha", "call_id": 9}))
        self.assertEqual(len(posted), 1)
        self.assertEqual(logged, [(5, "webhook", "call_completed", "sent", "", "Asha", 9)])


if __name__ == "__main__":
    unittest.main()
