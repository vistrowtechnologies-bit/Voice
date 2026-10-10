"""A new signup's free allowance is a one-time trial; accounts that predate it
(and accounts the platform owner put on a plan) keep the monthly window."""
import ast
import os
import unittest
from unittest import mock

import calls_db

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


class FakeConn:
    def __init__(self, trial=None):
        self.trial = trial

    def execute(self, sql, params=()):
        self.sql = sql
        return self

    def fetchone(self):
        return {"s": "2026-10-01 00:00:00+00"}


def window(sub, trial):
    with mock.patch.object(calls_db, "_get_setting", return_value=trial):
        return calls_db.usage_period_start(FakeConn(), 7, sub)


class UsageWindow(unittest.TestCase):
    def test_subscription_period_wins(self):
        self.assertEqual(window({"current_period_start": "2026-09-20"}, "2026-01-01"), "2026-09-20")

    def test_trial_counts_from_its_start_and_never_resets(self):
        self.assertEqual(window(None, "2026-08-01 10:00:00"), "2026-08-01 10:00:00")

    def test_account_without_marker_keeps_the_calendar_month(self):
        self.assertEqual(window(None, None), "2026-10-01 00:00:00+00")


class Wiring(unittest.TestCase):
    def test_new_accounts_get_the_trial_marker(self):
        with open(os.path.join(HERE, "calls_db.py"), encoding="utf-8") as handle:
            src = handle.read()
        tree = ast.parse(src)
        fn = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "provision_account_defaults")
        self.assertIn("TRIAL_STARTED_SETTING", ast.get_source_segment(src, fn))

    def test_billing_summary_uses_the_shared_window(self):
        with open(os.path.join(HERE, "calls_db.py"), encoding="utf-8") as handle:
            src = handle.read()
        tree = ast.parse(src)
        fn = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "billing_summary")
        body = ast.get_source_segment(src, fn)
        self.assertIn("usage_period_start(conn, account_id, sub)", body)
        self.assertNotIn("date_trunc('month'", body)

    def test_admin_setting_a_plan_ends_the_trial(self):
        with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
            src = handle.read()
        tree = ast.parse(src)
        fn = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "admin_set_plan")
        self.assertIn("calls_db.end_trial(account_id)", ast.get_source_segment(src, fn))

    def test_agent_admission_reads_the_same_marker(self):
        with open(os.path.join(ROOT, "agent", "db.py"), encoding="utf-8") as handle:
            src = handle.read()
        self.assertIn(calls_db.TRIAL_STARTED_SETTING, src)


if __name__ == "__main__":
    unittest.main()
