"""Cancel at period end / resume: the flag and reason are stored, the plan
stays active until the period ends, resume clears it, and only admins may do
either. DB-backed parts run against a throwaway Postgres (TEST_DATABASE_URL)."""
import os
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock

from test_plan_policy import function_from_file

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TOKEN_API = Path(__file__).resolve().parent / "token_api.py"


class HTTPException(Exception):
    def __init__(self, status, detail):
        self.status, self.detail = status, detail


def _route(name, calls, razorpay=None):
    ns = {"calls_db": calls, "razorpay_client": razorpay or MagicMock(), "email_sender": MagicMock(), "html": __import__("html"),
          "HTTPException": HTTPException, "Depends": lambda x: x, "require_role": lambda r: r, "logger": MagicMock(),
          "CancelSubscriptionRequest": object}
    return function_from_file(TOKEN_API, name, ns)


class RoleGateTests(unittest.TestCase):
    def test_a_member_is_refused(self):
        calls = MagicMock()
        calls.ROLE_RANK = {"viewer": 0, "member": 1, "admin": 2, "owner": 3}
        calls.get_user_by_id.return_value = {"role": "member"}
        ns = {"calls_db": calls, "HTTPException": HTTPException, "Depends": lambda x: x, "current_user": None, "Request": object}
        dep = function_from_file(TOKEN_API, "require_role", ns)("admin")
        request = types.SimpleNamespace(state=types.SimpleNamespace())
        with self.assertRaises(HTTPException) as ctx:
            dep(request, {"user_id": 1, "account_id": 1})
        self.assertEqual(ctx.exception.status, 403)
        calls.get_user_by_id.return_value = {"role": "admin"}
        self.assertEqual(dep(request, {"user_id": 1, "account_id": 1})["user_id"], 1)


class ResumeRouteTests(unittest.TestCase):
    USER = {"user_id": 3, "account_id": 9}

    def test_no_subscription_is_not_found(self):
        for sub in (None, {"status": "cancelled", "razorpay_subscription_id": "sub_1"}):
            calls = MagicMock()
            calls.get_subscription.return_value = sub
            with self.assertRaises(HTTPException) as ctx:
                _route("resume_subscription", calls)(self.USER)
            self.assertEqual(ctx.exception.status, 404)
            calls.resume_subscription.assert_not_called()

    def test_provider_refusal_leaves_the_cancellation_in_place(self):
        calls = MagicMock()
        calls.get_subscription.return_value = {"status": "active", "razorpay_subscription_id": "sub_1", "cancel_at_period_end": 1}
        razorpay = MagicMock()
        razorpay.resume_subscription.side_effect = RuntimeError("BAD_REQUEST_ERROR")
        with self.assertRaises(HTTPException) as ctx:
            _route("resume_subscription", calls, razorpay)(self.USER)
        self.assertEqual(ctx.exception.status, 502)
        calls.resume_subscription.assert_not_called()

    def test_resume_clears_our_flag_once_razorpay_agrees(self):
        calls = MagicMock()
        calls.get_subscription.return_value = {"status": "active", "razorpay_subscription_id": "sub_1", "cancel_at_period_end": 1}
        razorpay = MagicMock()
        self.assertEqual(_route("resume_subscription", calls, razorpay)(self.USER), {"ok": True, "alreadyActive": False})
        razorpay.resume_subscription.assert_called_once_with("sub_1")
        calls.resume_subscription.assert_called_once_with(9)

    def test_nothing_pending_is_a_quiet_yes(self):
        calls = MagicMock()
        calls.get_subscription.return_value = {"status": "active", "razorpay_subscription_id": "sub_1", "cancel_at_period_end": 0}
        razorpay = MagicMock()
        self.assertTrue(_route("resume_subscription", calls, razorpay)(self.USER)["alreadyActive"])
        razorpay.resume_subscription.assert_not_called()


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class CancelStateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("A", "A", f"a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        calls_db.upsert_subscription(cls.a, "growth", "monthly", "cust_1", f"sub_{stamp}", status="active",
                                     current_period_start="2026-10-01T00:00:00Z", current_period_end="2026-11-01T00:00:00Z")

    def test_cancel_keeps_the_plan_active_and_records_why_then_resume_clears_it(self):
        db = self.db
        db.mark_subscription_cancel_requested(self.a, "Too expensive")
        sub = db.get_subscription(self.a)
        self.assertEqual((sub["status"], sub["cancel_at_period_end"], sub["cancel_reason"]), ("active", 1, "Too expensive"))
        self.assertIsNotNone(sub["cancel_requested_at"])
        summary = db.billing_summary(self.a)
        self.assertEqual(summary["plan"], "growth", "the paid plan runs until the period ends")
        self.assertEqual((summary["subscriptionStatus"], summary["cancelAtPeriodEnd"], summary["cancelReason"]),
                         ("active", True, "Too expensive"))
        self.assertEqual(summary["currentPeriodEnd"], "2026-11-01T00:00:00Z")
        bell = [n for n in db.notifications(self.a) if n["id"].startswith("subscription-ends:")]
        self.assertEqual(bell[0]["title"], "Subscription ends on 2026-11-01")

        self.assertTrue(db.resume_subscription(self.a))
        self.assertFalse(db.resume_subscription(self.a), "nothing left to clear")
        sub = db.get_subscription(self.a)
        self.assertEqual((sub["cancel_at_period_end"], sub["cancel_reason"], sub["cancel_requested_at"]), (0, "", None))
        summary = db.billing_summary(self.a)
        self.assertEqual((summary["cancelAtPeriodEnd"], summary["cancelReason"]), (False, ""))
        self.assertFalse([n for n in db.notifications(self.a) if n["id"].startswith("subscription-ends:")])


if __name__ == "__main__":
    unittest.main()
