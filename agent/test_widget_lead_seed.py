"""The widget's pre-call form seeds the call's lead. /widget/token sends
"Website visitor" when the visitor left the name blank; that placeholder
must not become the lead's name (it made calls 1373-1375 show "Qualified"
with no name, phone or email)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main
import tools
import lead_placeholders


def _ctx(name=None, phone=None, email=None):
    return {"visitor_name": name, "visitor_phone": phone, "visitor_email": email}


class WidgetLeadSeed(unittest.TestCase):
    def test_placeholder_name_is_not_seeded(self):
        for name in ("Website visitor", " website VISITOR ", "Visitor", "Unknown", "Caller", "", "  "):
            self.assertNotIn("name", main._seed_lead_from_visitor(_ctx(name)), name)

    def test_placeholder_name_keeps_the_contact(self):
        lead = main._seed_lead_from_visitor(_ctx("Website visitor", "+919812345678", "a@example.com"))
        self.assertEqual(lead, {"phone": "+919812345678", "email": "a@example.com"})

    def test_real_name_is_seeded(self):
        lead = main._seed_lead_from_visitor(_ctx("Asha Rao", "+919812345678"))
        self.assertEqual(lead, {"name": "Asha Rao", "phone": "+919812345678"})

    def test_empty_context_seeds_nothing(self):
        self.assertEqual(main._seed_lead_from_visitor(_ctx()), {})

    def test_log_lead_shares_the_list(self):
        self.assertIs(tools._PLACEHOLDER_VALUES, lead_placeholders.PLACEHOLDER_VALUES)
        self.assertIn("visitor", tools._PLACEHOLDER_VALUES)


if __name__ == "__main__":
    unittest.main()
