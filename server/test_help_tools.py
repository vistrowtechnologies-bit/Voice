import datetime
import unittest
from unittest.mock import ANY, patch

import help_tools
import help_chat


class HelpToolsTests(unittest.TestCase):
    def test_settings_subpage_context_is_specific(self):
        self.assertEqual(
            help_chat._page_label("/dashboard/settings?tab=privacy"),
            "Settings > Data & privacy",
        )

    @patch("help_chat.calls_db.get_call")
    def test_open_call_context_is_account_scoped_and_includes_page_delivery(self, get_call):
        get_call.return_value = {
            "id": "880",
            "name": "Swati",
            "phone": "+919004497128",
            "callStatus": "Completed",
            "status": "Qualified",
            "channel": "Website Widget",
            "agent": "Siya KHOPOLI",
            "website": "shaporjipallonji.com",
            "pagePath": "/shapoorji-pallonji-plot-khopoli/",
            "arthaleadsStatus": "sent",
        }

        context = help_chat._open_record_context("/dashboard/calls/880", 7)

        get_call.assert_called_once_with(880, 7)
        self.assertIn("CURRENTLY OPEN CALL", context)
        self.assertIn("/shapoorji-pallonji-plot-khopoli/", context)
        self.assertIn("ArthaLeads delivery: sent", context)

    def test_structured_reply_flags_are_normalized(self):
        result = help_chat._structured_reply(
            {"content": '{"reply":"Please try the retry button.","suggestTicket":true,"comingSoon":false}'}
        )
        self.assertEqual(result["reply"], "Please try the retry button.")
        self.assertTrue(result["suggestTicket"])
        self.assertFalse(result["comingSoon"])

    @patch("help_chat.calls_db.calls_for_local_date")
    def test_today_calls_question_bypasses_model_and_all_time_summary(self, calls_for_local_date):
        calls_for_local_date.return_value = {"count": 3}

        result = help_chat._deterministic_live_reply("How many calls came in today?", 7)

        self.assertEqual(result["reply"].split()[2], "3")
        self.assertFalse(result["suggestTicket"])
        calls_for_local_date.assert_called_once_with(7, ANY, "Asia/Kolkata")

    @patch("help_tools.calls_db.calls_for_local_date")
    def test_calls_on_date_uses_exact_unpaginated_query(self, calls_for_local_date):
        calls_for_local_date.return_value = {"date": "2026-09-09", "count": 2, "callers": []}

        result = help_tools.calls_on_date(7, date="2026-09-09")

        calls_for_local_date.assert_called_once_with(7, "2026-09-09", "Asia/Kolkata")
        self.assertEqual(result["count"], 2)

    @patch.dict("help_chat.os.environ", {"OPENAI_API_KEY": "test-key"})
    @patch("help_chat._post_chat")
    def test_help_chat_uses_lowest_model_without_unsupported_temperature(self, post_chat):
        post_chat.return_value = {
            "choices": [{"message": {"content": '{"reply":"Open Agents.","suggestTicket":false,"comingSoon":false}'}}]
        }

        result = help_chat.answer_help_question("Where do I edit an agent?", [], 7)

        payload = post_chat.call_args.args[1]
        self.assertEqual(payload["model"], "gpt-5-nano")
        self.assertNotIn("temperature", payload)
        self.assertEqual(result["reply"], "Open Agents.")

    @patch("help_tools.calls_db.list_calls")
    def test_find_recent_calls_returns_source_and_crm_state(self, list_calls):
        list_calls.return_value = [
            {
                "id": "880",
                "name": "Swati",
                "phone": "+919004497128",
                "callDate": "2026-09-07T17:39:00",
                "callStatus": "completed",
                "status": "Qualified",
                "channel": "Website Widget",
                "direction": None,
                "agent": "Siya KHOPOLI",
                "website": "shaporjipallonji.com",
                "pagePath": "/shapoorji-pallonji-plot-khopoli/",
                "arthaleadsStatus": "sent",
                "arthaleadsSyncedAt": "2026-09-09T09:56:51",
            }
        ]

        result = help_tools.find_recent_calls(7, query="Swati")

        list_calls.assert_called_once_with(7, limit=5, search="Swati")
        self.assertEqual(result["matches"][0]["pagePath"], "/shapoorji-pallonji-plot-khopoli/")
        self.assertEqual(result["matches"][0]["arthaleadsStatus"], "sent")

    @patch("help_tools.calls_db.list_integrations")
    def test_integration_status_excludes_configuration_secrets(self, list_integrations):
        list_integrations.return_value = [
            {
                "key": "arthaleads",
                "name": "ArthaLeads CRM",
                "category": "CRM",
                "status": "connected",
                "config": {"token": "must-not-leak"},
                "lastSync": "2026-09-09",
                "lastError": None,
            }
        ]

        result = help_tools.integration_status(7)

        self.assertNotIn("config", result["integrations"][0])
        self.assertNotIn("must-not-leak", str(result))


_AGENT = {
    "id": 26,
    "name": "Siya KHOPOLI",
    "status": "live",
    "model": "gpt-4.1-mini",
    "voiceName": "Myra HD",
    "language": "hi-IN",
    "welcomeMessage": "Namaste!",
    "firstSpeaker": "agent",
    "kbId": 4,
    "crmIntegrationKeys": ["arthaleads"],
}
_NUMBER = {"id": 1, "number": "+912212345678", "label": "Main", "status": "active", "agentId": 26}


class CopilotReadToolsTests(unittest.TestCase):
    @patch("help_tools.calls_db.list_phone_numbers", return_value=[_NUMBER])
    @patch("help_tools.calls_db.list_agents", return_value=[_AGENT])
    def test_list_my_agents_forwards_account_and_uses_tenant_model_label(self, list_agents, list_phone_numbers):
        result = help_tools.list_my_agents(7)

        list_agents.assert_called_once_with(7)
        list_phone_numbers.assert_called_once_with(7)
        agent = result["agents"][0]
        self.assertEqual(agent["model"], "Vistrow Swift")
        self.assertEqual(agent["phoneNumbers"], ["+912212345678"])
        self.assertNotIn("gpt-4.1-mini", str(result))

    @patch("help_tools.calls_db.list_phone_numbers", return_value=[])
    @patch("help_tools.calls_db.list_agents", return_value=[_AGENT])
    def test_agent_detail_is_scoped_by_account_and_reports_kb(self, list_agents, _numbers):
        result = help_tools.agent_detail(7, agent_id="26")

        list_agents.assert_called_once_with(7)
        self.assertTrue(result["found"])
        self.assertTrue(result["hasKnowledgeBase"])
        self.assertEqual(result["crmIntegrationKeys"], ["arthaleads"])
        self.assertEqual(help_tools.agent_detail(7, agent_id=99), {"found": False, "agentId": 99})

    @patch("help_tools.calls_db.contact_detail")
    @patch("help_tools.calls_db.list_contacts", return_value=[])
    @patch("help_tools.calls_db.get_call")
    @patch("help_tools.calls_db.list_calls")
    def test_contact_requirements_trims_transcript_to_last_20_turns(self, list_calls, get_call, _contacts, _detail):
        list_calls.return_value = [{"id": "880"}]
        get_call.return_value = {
            "id": "880",
            "callDate": "2026-09-07T17:39:00",
            "agent": "Siya KHOPOLI",
            "durationSeconds": 120,
            "status": "Qualified",
            "name": "Swati",
            "phone": "+919004497128",
            "email": "",
            "budget": "80L",
            "location": "Khopoli",
            "timeline": "",
            "extractedData": {"plot_size": "2000 sqft"},
            "intelligence": {"summary": "Wants a plot.", "key_points": ["budget 80L"], "action_items": ["call back"]},
            "transcript": [{"speaker": "visitor", "text": f"turn {i} " + "x" * 400} for i in range(30)],
        }

        result = help_tools.contact_requirements(7, query="Swati")

        list_calls.assert_called_once_with(7, limit=3, search="Swati")
        get_call.assert_called_once_with(880, 7)
        call = result["calls"][0]
        self.assertEqual(call["transcriptTurnsTotal"], 30)
        self.assertLessEqual(len(call["transcript"]), 20)
        self.assertEqual(call["transcript"][-1]["text"][:7], "turn 29")
        self.assertLessEqual(sum(len(t["text"]) for t in call["transcript"]), help_tools.TRANSCRIPT_MAX_CHARS + 1)
        self.assertEqual(call["actionItems"], ["call back"])
        self.assertEqual(call["extractedData"], {"plot_size": "2000 sqft"})

    @patch("help_tools.calls_db.contact_detail")
    @patch("help_tools.calls_db.list_contacts")
    @patch("help_tools.calls_db.list_calls", return_value=[])
    def test_contact_with_notes_but_no_calls_still_answers(self, list_calls, list_contacts, contact_detail):
        list_contacts.return_value = [{"id": 5, "name": "Abhishek Rao", "phone": "+91 98765 43210"}]
        contact_detail.return_value = {
            "id": 5,
            "name": "Abhishek Rao",
            "phone": "+91 98765 43210",
            "email": "",
            "company": "",
            "status": "qualified",
            "tags": [],
            "lastCalledAt": None,
            "notes": [{"id": 1, "body": "Wants a 3BHK", "createdBy": 2, "createdAt": "2026-10-01"}],
        }

        result = help_tools.contact_requirements(7, query="9876543210")

        list_contacts.assert_called_once_with(7)
        contact_detail.assert_called_once_with(5, 7)
        self.assertTrue(result["found"])
        self.assertEqual(result["calls"], [])
        self.assertEqual(result["contact"]["notes"][0]["body"], "Wants a 3BHK")

    @patch("help_tools.calls_db.list_contacts", return_value=[])
    @patch("help_tools.calls_db.list_calls", return_value=[])
    def test_contact_requirements_reports_not_found(self, _calls, _contacts):
        self.assertEqual(help_tools.contact_requirements(7, query="nobody"), {"found": False, "query": "nobody"})

    @patch("help_tools.calls_db.list_integrations")
    def test_failing_integrations_never_leaks_tokens(self, list_integrations):
        list_integrations.return_value = [
            {
                "key": "sheets",
                "name": "Google Sheets",
                "category": "CRM",
                "status": "connected",
                "config": {"access_token": "must-not-leak", "refresh_token": "nor-this", "token": "x"},
                "lastSync": "2026-10-09",
                "lastError": "401 invalid_grant",
            },
            {"key": "slack", "name": "Slack", "category": "Chat", "status": "connected", "config": {"token": "t"}, "lastSync": None, "lastError": None},
        ]

        result = help_tools.failing_integrations(7)

        list_integrations.assert_called_once_with(7)
        self.assertEqual([i["key"] for i in result["failing"]], ["sheets"])
        self.assertEqual(result["connectedCount"], 2)
        for secret in ("config", "access_token", "refresh_token", "token", "must-not-leak"):
            self.assertNotIn(secret, str(result))

    @patch("help_tools.calls_db.list_integrations", return_value=[])
    def test_failing_integrations_empty(self, _list):
        self.assertEqual(help_tools.failing_integrations(7), {"found": False, "connectedCount": 0, "failing": []})

    @patch("help_tools.calls_db.list_appointments", return_value=[])
    def test_upcoming_appointments_forwards_account_and_window(self, list_appointments):
        result = help_tools.upcoming_appointments(7, days=3)

        kwargs = list_appointments.call_args.kwargs
        list_appointments.assert_called_once_with(7, start=ANY, end=ANY)
        self.assertEqual(kwargs["end"], (datetime.date.fromisoformat(kwargs["start"]) + datetime.timedelta(days=3)).isoformat())
        self.assertFalse(result["found"])
        self.assertEqual(result["appointments"], [])

    @patch("help_tools.calls_db.list_agents", return_value=[_AGENT])
    @patch("help_tools.calls_db.list_phone_numbers", return_value=[_NUMBER])
    def test_phone_numbers_names_the_agent_only(self, list_phone_numbers, list_agents):
        result = help_tools.phone_numbers(7)

        list_phone_numbers.assert_called_once_with(7)
        list_agents.assert_called_once_with(7)
        self.assertEqual(result["numbers"], [{"number": "+912212345678", "label": "Main", "status": "active", "agent": "Siya KHOPOLI"}])

    def test_every_tool_schema_has_a_function_and_never_takes_account_id(self):
        names = {s["function"]["name"] for s in help_tools.TOOL_SCHEMAS}
        self.assertEqual(names, set(help_tools.TOOL_FUNCTIONS))
        for schema in help_tools.TOOL_SCHEMAS:
            self.assertNotIn("account_id", schema["function"]["parameters"]["properties"])


if __name__ == "__main__":
    unittest.main()
