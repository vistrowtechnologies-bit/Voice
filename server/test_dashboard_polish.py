"""Dashboard QA fixes (2026-10-16): site-config returns the dashboard's button
label so installed widgets pick up a rename, and the dead "Product updates"
preference (no toggle, no email reads it) stays out of the preferences API."""
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from test_plan_policy import function_from_file  # noqa: E402

TOKEN_API = Path(__file__).resolve().parent / "token_api.py"


class SiteConfigLabel(unittest.TestCase):
    def test_returns_the_saved_button_label(self):
        db = MagicMock()
        db.get_site_by_key.return_value = {
            "id": 3, "accountId": 9, "widgetMode": "both", "widgetPosition": "bottom-left", "widgetLabel": "Ask Priya",
            "widgetAskName": True, "widgetRequireName": False, "widgetAskPhone": True,
            "widgetRequirePhone": False, "widgetAskEmail": False, "widgetRequireEmail": False,
        }
        db.resolve_site_page.return_value = {"avatar": "default", "greeting": ""}
        db.get_compliance.return_value = {"record_calls": False}
        ns = {"calls_db": db, "HTTPException": Exception, "_platform_conversation_count_cached": lambda days: 0}
        route = function_from_file(TOKEN_API, "widget_site_config", ns)
        self.assertEqual(route("key", "/")["label"], "Ask Priya")


class PreferencesHideProductUpdates(unittest.TestCase):
    def _ns(self, prefs):
        db = MagicMock()
        db.get_user_preferences.return_value = dict(prefs)
        db.update_user_preferences.return_value = dict(prefs)
        ns = {"calls_db": db, "_HIDDEN_PREFERENCES": ("notify_product",), "Depends": lambda dep: None, "current_user": None}
        function_from_file(TOKEN_API, "_public_preferences", ns)
        return ns

    def test_get_omits_notify_product(self):
        ns = self._ns({"notify_leads": True, "notify_product": False, "timezone": "Asia/Kolkata"})
        route = function_from_file(TOKEN_API, "get_profile_preferences", ns)
        out = route({"user_id": 5})
        self.assertNotIn("notify_product", out)
        self.assertEqual(out["notify_leads"], True)

    def test_request_model_no_longer_accepts_it(self):
        src = TOKEN_API.read_text()
        start = src.index("class PreferencesRequest(BaseModel):")
        body = src[start:src.index("\n\n\n", start)]
        self.assertNotIn("notify_product", body)


if __name__ == "__main__":
    unittest.main()
