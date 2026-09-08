"""Cost-admission regression tests; no database or vendor calls."""

import unittest
from unittest.mock import patch

import db


class _Result:
    def __init__(self, one=None, many=None):
        self._one = one
        self._many = many or []

    def fetchone(self):
        return self._one

    def fetchall(self):
        return self._many


class _CreditConnection:
    def __init__(self, *, subscription_status: str, used_minutes: float):
        self.subscription_status = subscription_status
        self.used_minutes = used_minutes

    def execute(self, sql, params=()):
        if "FROM subscriptions" in sql:
            return _Result({"status": self.subscription_status, "current_period_start": "2026-09-01"})
        if "key = 'credits_total'" in sql:
            return _Result({"value": "10"})
        if "key = ?" in sql and "settings" in sql:
            return _Result({"value": "1"})
        if "SUM(duration_seconds)" in sql:
            return _Result(many=[{"call_type": "phone", "voice": "voice", "model": "model", "m": self.used_minutes}])
        raise AssertionError(sql)


class CreditAdmissionTests(unittest.TestCase):
    def test_active_paid_subscription_can_use_billed_overage(self) -> None:
        conn = _CreditConnection(subscription_status="active", used_minutes=100)
        self.assertFalse(db._trial_credits_exhausted(conn, 7))

    def test_unpaid_workspace_stops_at_allowance(self) -> None:
        with patch.object(db.voice_catalog, "get_voice", return_value={"tier": "standard"}):
            self.assertFalse(db._trial_credits_exhausted(_CreditConnection(subscription_status="inactive", used_minutes=9), 7))
            self.assertTrue(db._trial_credits_exhausted(_CreditConnection(subscription_status="inactive", used_minutes=10), 7))


if __name__ == "__main__":
    unittest.main()
