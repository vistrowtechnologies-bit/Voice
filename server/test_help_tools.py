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


if __name__ == "__main__":
    unittest.main()
