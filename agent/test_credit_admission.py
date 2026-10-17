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
    def __init__(self, *, subscription_status: str, used_minutes: float, model: str = "model"):
        self.subscription_status = subscription_status
        self.used_minutes = used_minutes
        self.model = model

    def execute(self, sql, params=()):
        if "FROM subscriptions" in sql:
            return _Result({"status": self.subscription_status, "current_period_start": "2026-09-01"})
        if "key = 'credits_total'" in sql:
            return _Result({"value": "10"})
        if "key = ?" in sql and "settings" in sql:
            return _Result({"value": "1"})
        if "SUM(duration_seconds)" in sql:
            return _Result(many=[{"call_type": "phone", "voice": "voice", "model": self.model, "m": self.used_minutes}])
        raise AssertionError(sql)


class CreditAdmissionTests(unittest.TestCase):
    def test_active_paid_subscription_can_use_billed_overage(self) -> None:
        conn = _CreditConnection(subscription_status="active", used_minutes=100)
        self.assertFalse(db._trial_credits_exhausted(conn, 7))

    def test_unpaid_workspace_stops_at_allowance(self) -> None:
        with patch.object(db.voice_catalog, "get_voice", return_value={"tier": "standard"}):
            self.assertFalse(db._trial_credits_exhausted(_CreditConnection(subscription_status="inactive", used_minutes=9), 7))
            self.assertTrue(db._trial_credits_exhausted(_CreditConnection(subscription_status="inactive", used_minutes=10), 7))

    def test_minutes_use_the_dashboard_multipliers(self) -> None:
        # Minute pricing (2026-10-17), 10 credits = 10 standard minutes: 10
        # Bharat minutes (1x) or 3.4 Vistrow Live minutes (3x, any version)
        # use them up, exactly as server/calls_db bills them.
        with patch.object(db.voice_catalog, "get_voice", return_value={"tier": "standard"}):
            for model, minutes, exhausted in (
                ("sarvam/sarvam-105b-conversations", 9.9, False),
                ("sarvam/sarvam-105b-conversations", 10, True),
                ("gemini-live:gemini-3.1-flash-live-preview", 3.3, False),
                ("gemini-live:gemini-3.1-flash-live-preview", 3.4, True),
                ("gemini-live", 3.3, False),
                ("gemini-live", 3.4, True),
                ("groq/llama-3.3-70b", 9, False),
            ):
                conn = _CreditConnection(subscription_status="inactive", used_minutes=minutes, model=model)
                self.assertEqual(db._trial_credits_exhausted(conn, 7), exhausted, (model, minutes))

    def test_native_and_live_voices_bill_like_the_server(self) -> None:
        # Native (catalog tier "lite") is 1 minute per minute; a Live call
        # ignores its voice's tier (the model speaks), so a premium persona on
        # Live is still 3, not 6.
        for tier, model, minutes, exhausted in (
            ("lite", "sarvam/sarvam-105b-conversations", 9.9, False),
            ("premium", "gemini-live", 3.3, False),
            ("premium", "sarvam/sarvam-105b-conversations", 5, True),
        ):
            with patch.object(db.voice_catalog, "get_voice", return_value={"tier": tier}):
                conn = _CreditConnection(subscription_status="inactive", used_minutes=minutes, model=model)
                self.assertEqual(db._trial_credits_exhausted(conn, 7), exhausted, (tier, model, minutes))

    def test_model_tier_matches_server_calls_db(self) -> None:
        # Same answers as server/calls_db.model_tier for the models we ship.
        for model, tier in (
            ("", "standard"), ("gpt-4.1-nano", "standard"), ("groq/llama-3.3-70b", "standard"),
            ("sarvam/sarvam-105b-conversations", "standard"), ("gpt-4.1-mini", "premium"),
            ("gemini-live", "realtime"), ("gemini-live:gemini-3.8-live", "realtime_plus"),
            ("gemini-live:gemini-3.1-flash-live-preview", "realtime_plus"), ("gpt-4o", "premium_plus"),
        ):
            self.assertEqual(db._model_tier(model), tier, model)

if __name__ == "__main__":
    unittest.main()
