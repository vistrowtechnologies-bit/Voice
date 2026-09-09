import unittest
from unittest.mock import patch

import help_tools
import help_chat


class HelpToolsTests(unittest.TestCase):
    def test_settings_subpage_context_is_specific(self):
        self.assertEqual(
            help_chat._page_label("/dashboard/settings?tab=privacy"),
            "Settings > Data & privacy",
        )

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
