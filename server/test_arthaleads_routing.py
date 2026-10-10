"""Source normalization and widget-style page/project routing safeguards."""
import unittest
from unittest.mock import patch

import calls_db


class ArthaleadsRouteTests(unittest.TestCase):
    def test_source_labels_normalize_into_only_supported_channels(self):
        self.assertEqual(calls_db._arthaleads_source("Facebook Ad"), "facebook")
        self.assertEqual(calls_db._arthaleads_source("FB Lead Ads"), "facebook")
        self.assertEqual(calls_db._arthaleads_source("Website Form"), "website")
        self.assertEqual(calls_db._arthaleads_source("Web"), "website")
        self.assertEqual(calls_db._arthaleads_source("WhatsApp CTWA"), "whatsapp")
        self.assertEqual(calls_db._arthaleads_source("Manual Import"), "")

    def test_website_rules_match_page_url_by_contains(self):
        self.assertTrue(calls_db._arthaleads_route_match(
            {"source": "website", "match": "/projects/khopoli/"},
            {"page_url": "https://example.test/projects/khopoli/units"},
        ))
        self.assertFalse(calls_db._arthaleads_route_match(
            {"source": "website", "match": "/projects/pune/"},
            {"page_path": "/projects/khopoli/"},
        ))

    def test_facebook_and_whatsapp_rules_match_project_not_other_source_fields(self):
        fields = {"project": "Shapoorji Pallonji", "campaign_name": "Facebook Ad 42"}
        self.assertTrue(calls_db._arthaleads_route_match(
            {"source": "facebook", "match": "Shapoorji Pallonji"}, fields
        ))
        self.assertFalse(calls_db._arthaleads_route_match(
            {"source": "facebook", "match": "Other Project"}, fields
        ))
        self.assertTrue(calls_db._arthaleads_route_match(
            {"source": "whatsapp", "match": "shapoorji pallonji"}, fields
        ))

    def test_active_project_and_campaign_rules_match_stable_ids(self):
        self.assertTrue(calls_db._arthaleads_route_match(
            {"source": "facebook", "matchKind": "project", "matchId": "project-7", "match": "Khopoli"},
            {"project_id": "project-7", "project": "Khopoli"},
        ))
        self.assertFalse(calls_db._arthaleads_route_match(
            {"source": "facebook", "matchKind": "project", "matchId": "project-7", "match": "Khopoli"},
            {"project_id": "project-8", "project": "Khopoli"},
        ))
        self.assertTrue(calls_db._arthaleads_route_match(
            {"source": "facebook", "matchKind": "facebook_campaign", "matchId": "campaign-2"},
            {"campaign_id": "campaign-2"},
        ))
        self.assertTrue(calls_db._arthaleads_route_match(
            {"source": "whatsapp", "matchKind": "whatsapp_ad", "matchId": "ad-3"},
            {"ad_id": "ad-3"},
        ))
        self.assertFalse(calls_db._arthaleads_route_match(
            {"source": "facebook", "matchKind": "whatsapp_ad", "matchId": "ad-3"},
            {"ad_id": "ad-3"},
        ))

    def test_route_match_is_source_scoped_and_never_matches_blank_rules(self):
        self.assertFalse(calls_db._arthaleads_route_match(
            {"source": "facebook", "match": "Shapoorji"},
            {"page_url": "https://example.test/Shapoorji", "project": "Other"},
        ))
        self.assertFalse(calls_db._arthaleads_route_match(
            {"source": "website", "match": ""}, {"page_url": "https://example.test/"}
        ))

    def test_disabled_source_and_unmatched_page_never_resolve_a_route(self):
        config = {"sources": {"website": False}, "routes": [
            {"source": "website", "match": "/projects/", "agentId": 11},
        ]}
        self.assertIsNone(calls_db._resolve_arthaleads_route(
            config, "website", {"page_path": "/projects/khopoli/"}
        ))
        config["sources"]["website"] = True
        self.assertIsNone(calls_db._resolve_arthaleads_route(
            config, "website", {"page_path": "/contact/"}
        ))

    def test_most_specific_page_rule_wins(self):
        specific = {"source": "website", "match": "/projects/khopoli/", "agentId": 22}
        general = {"source": "website", "match": "/projects/", "agentId": 11}
        route = calls_db._resolve_arthaleads_route(
            {"sources": {"website": True}, "routes": [general, specific]},
            "website", {"page_path": "/projects/khopoli/units/"},
        )
        self.assertEqual(route["agentId"], 22)

    def test_project_picker_route_matches_id_or_name_but_never_overrides_a_different_id(self):
        route = {"source": "facebook", "matchKind": "project", "matchId": "p-1", "matchLabel": "Khopoli"}
        self.assertTrue(calls_db._arthaleads_route_match(route, {"project_id": "p-1", "project": "Khopoli"}))
        self.assertTrue(calls_db._arthaleads_route_match(route, {"project": "Khopoli"}))
        self.assertFalse(calls_db._arthaleads_route_match(route, {"project_id": "p-2", "project": "Khopoli"}))

    def test_equal_specificity_rules_for_different_agents_decline_as_ambiguous(self):
        config = {"sources": {"facebook": True}, "routes": [
            {"source": "facebook", "matchKind": "project", "matchId": "p-1", "match": "p-1", "agentId": 11},
            {"source": "facebook", "matchKind": "project", "matchId": "p-1", "match": "p-1", "agentId": 22},
        ]}
        self.assertEqual(calls_db._resolve_arthaleads_route_decision(config, "facebook", {"project_id": "p-1"}),
                         (None, "ambiguous_route"))

    def test_call_readiness_checks_explicit_agent_number_dnd_window_and_consent(self):
        class _Cursor:
            def fetchone(self):
                return {"id": 1}

        class _Connection:
            def execute(self, *_args):
                return _Cursor()

            def close(self):
                pass

        route = {"agentId": 12, "fromNumber": "+14155552671"}
        with patch.object(calls_db, "_connect", return_value=_Connection()), \
             patch.object(calls_db, "get_compliance", return_value={"require_consent": False, "honor_dnc": True}), \
             patch.object(calls_db, "is_dnc", return_value=False), \
             patch.object(calls_db, "within_calling_window", return_value=(True, "")):
            self.assertEqual(calls_db._arthaleads_call_readiness(1, route, "+14155552672", 12), "")
            self.assertEqual(calls_db._arthaleads_call_readiness(1, route, "+14155552672", 99), "agent_mismatch")

        with patch.object(calls_db, "_connect", return_value=_Connection()), \
             patch.object(calls_db, "get_compliance", return_value={"require_consent": False, "honor_dnc": True}), \
             patch.object(calls_db, "is_dnc", return_value=True):
            self.assertEqual(calls_db._arthaleads_call_readiness(1, route, "+14155552672", 12), "dnd_blocked")

        with patch.object(calls_db, "_connect", return_value=_Connection()), \
             patch.object(calls_db, "get_compliance", return_value={"require_consent": True, "honor_dnc": True}):
            self.assertEqual(calls_db._arthaleads_call_readiness(1, route, "+14155552672", 12), "call_consent_required")


if __name__ == "__main__":
    unittest.main()
