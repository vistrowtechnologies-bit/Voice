"""The dashboard Analytics tab is Growth and Scale only (owner, 17 Oct 2026).
Offline: the two routes run with calls_db replaced, never a database."""
import unittest
from pathlib import Path
from unittest.mock import MagicMock

import plan_policy
from test_plan_policy import function_from_file

TOKEN_API = Path(__file__).resolve().parent / "token_api.py"

FULL = {
    "languages": [{"language": "en", "count": 3}],
    "peakHours": [{"hour": 9, "count": 2}],
    "durationTrend": [{"day": "2026-10-16", "avgSeconds": 30}],
    "byAgent": [{"agent": "Artha", "calls": 3, "qualified": 1}],
    "sentiment": {"positive": 1, "neutral": 1, "negative": 1},
    "byChannel": [{"channel": "Web", "calls": 3, "qualified": 1, "minutes": 2}],
    "funnel": {"answered": 3, "engaged": 2, "qualified": 1, "visitBooked": 1},
}


def route(name, db):
    namespace = {"calls_db": db, "Depends": lambda dependency=None: None, "current_user": None}
    if name == "dashboard_analytics":
        exec(next(line for line in TOKEN_API.read_text().splitlines() if line.startswith("ANALYTICS_TAB_ONLY = ")), namespace)
    return function_from_file(TOKEN_API, name, namespace)


class AnalyticsGateTests(unittest.TestCase):
    def test_analytics_is_growth_and_scale(self):
        self.assertFalse(plan_policy.allowed("starter", "analytics"))
        self.assertTrue(plan_policy.allowed("growth", "analytics"))
        self.assertTrue(plan_policy.allowed("scale", "analytics"))
        self.assertTrue(plan_policy.allowed("starter", "analytics", owner=True))

    def test_starter_keeps_overview_numbers_but_not_tab_breakdowns(self):
        db = MagicMock()
        db.analytics.return_value = dict(FULL)
        db.account_features.return_value = {"analytics": False}
        result = route("dashboard_analytics", db)(user={"account_id": 7})
        self.assertEqual((result["funnel"], result["byChannel"]), (FULL["funnel"], FULL["byChannel"]))
        self.assertEqual((result["languages"], result["peakHours"], result["durationTrend"], result["byAgent"]), ([], [], [], []))
        self.assertEqual(sum(result["sentiment"].values()), 0)

    def test_growth_gets_everything(self):
        db = MagicMock()
        db.analytics.return_value = dict(FULL)
        db.account_features.return_value = {"analytics": True}
        self.assertEqual(route("dashboard_analytics", db)(user={"account_id": 7}), FULL)

    def test_intelligence_is_refused_without_the_feature(self):
        db = MagicMock()
        db.require_feature.side_effect = plan_policy.EntitlementError("This feature requires the Growth plan.")
        with self.assertRaises(plan_policy.EntitlementError):
            route("dashboard_intelligence", db)(days=30, user={"account_id": 7})
        db.intelligence_summary.assert_not_called()


if __name__ == "__main__":
    unittest.main()
