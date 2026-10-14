"""Credit top-up: quote, order, verify callback, webhook, refund. The route
functions run with Razorpay replaced and the real calls_db against a throwaway
Postgres (TEST_DATABASE_URL), because the point is that paying and crediting
happen exactly once, inside one transaction, for one tenant."""
import os
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TOKEN_API = Path(__file__).resolve().parent / "token_api.py"


class HTTPException(Exception):
    def __init__(self, status, detail):
        self.status, self.detail = status, detail


class TopupQuoteTests(unittest.TestCase):
    def test_pack_prices_the_base_and_grants_the_bonus(self):
        import calls_db
        q = calls_db.topup_quote("starter", pack_key="500")
        self.assertEqual((q["credits"], q["bonusCredits"], q["perCreditInr"]), (500, 50, 10.0))
        self.assertEqual((q["baseInr"], q["gstInr"], q["totalInr"]), (5000.0, 900.0, 5900.0))
        self.assertEqual(calls_db.topup_quote("growth", pack_key="1000")["bonusCredits"], 150)
        self.assertEqual(calls_db.topup_quote("scale", 50)["baseInr"], 260.0)

    def test_unknown_plan_uses_the_starter_rate(self):
        import calls_db
        self.assertEqual(calls_db.topup_quote("trial", 100)["perCreditInr"], 10.0)

    def test_outside_the_range_or_unknown_pack_is_rejected(self):
        import calls_db
        for bad in ({"credits": 49}, {"credits": 10001}, {"pack_key": "999"}, {"credits": None}):
            with self.assertRaises(ValueError):
                calls_db.topup_quote("starter", **bad)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class TopupFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        from test_plan_policy import function_from_file
        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("A", "A", f"a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.b = calls_db.create_account_with_owner("B", "B", f"b-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.razorpay = MagicMock()
        cls.razorpay.checkout_ready.return_value = True
        cls.razorpay.RazorpayError = RuntimeError
        cls.receipts = MagicMock()
        ns = {
            "calls_db": calls_db, "razorpay_client": cls.razorpay, "HTTPException": HTTPException, "logger": MagicMock(),
            "Depends": lambda x: x, "require_role": lambda r: r, "current_user": None, "admin_db": MagicMock(),
            "os": os, "time": __import__("time"), "_send_topup_receipt": cls.receipts, "_report_unmatched_razorpay_event": MagicMock(),
            "TopupRequest": object, "VerifyPaymentRequest": object,
        }
        for name in ("_topup_account_id", "billing_topup", "billing_verify_payment", "_process_razorpay_event", "_handle_razorpay_webhook"):
            function_from_file(TOKEN_API, name, ns)
        cls.ns = ns

    def setUp(self):
        self.razorpay.reset_mock()
        self.razorpay.checkout_ready.return_value = True
        self.razorpay.create_order.return_value = {"id": f"order_{os.urandom(3).hex()}"}
        self.razorpay.verify_payment_signature.return_value = True
        self.receipts.reset_mock()
        self.pay = f"pay_{os.urandom(3).hex()}"
        self.set_credits(self.a, 100)

    def set_credits(self, account, total):
        conn = self.db._connect()
        with conn:
            conn.execute(
                "INSERT INTO settings (account_id, key, value) VALUES (?, 'credits_total', ?) "
                "ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value", (account, str(total)))
        conn.close()

    def credits(self, account):
        return self.db.billing_summary(account)["creditsTotal"]

    def invoice_for(self, order_id):
        conn = self.db._connect()
        row = conn.execute("SELECT * FROM invoices WHERE razorpay_order_id = ?", (order_id,)).fetchone()
        conn.close()
        return dict(row)

    def order(self, account=None, **req):
        user = {"user_id": 0, "account_id": account or self.a}
        return self.ns["billing_topup"](types.SimpleNamespace(**{"pack": None, "credits": None, **req}), user)

    def verify(self, order_id, account=None):
        req = types.SimpleNamespace(razorpayOrderId=order_id, razorpayPaymentId=self.pay, razorpaySignature="sig")
        return self.ns["billing_verify_payment"](req, {"user_id": 0, "account_id": account or self.a})

    def captured(self, order_id, account=None):
        payment_id = self.pay
        notes = {"account_id": str(account)} if account else {}
        return self.ns["_process_razorpay_event"](
            {"event": "payment.captured", "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id, "notes": notes}}}}
        )

    def test_verify_then_webhook_credits_exactly_once(self):
        session = self.order(credits=100)
        self.assertEqual(self.verify(session["orderId"])["credits"], 100)
        self.assertEqual(self.credits(self.a), 200)
        self.captured(session["orderId"], account=self.a)
        self.assertEqual(self.credits(self.a), 200)
        self.assertEqual(self.invoice_for(session["orderId"])["status"], "paid")
        self.receipts.assert_called_once()  # the verify path is the common one; it must email too

    def test_webhook_then_verify_credits_exactly_once(self):
        session = self.order(credits=100)
        self.captured(session["orderId"])  # no notes: falls back to the invoice row
        self.assertEqual(self.credits(self.a), 200)
        self.receipts.assert_called_once()
        result = self.verify(session["orderId"])
        self.assertTrue(result["alreadyApplied"])
        self.assertEqual(result["invoiceId"], self.invoice_for(session["orderId"])["id"])
        self.assertEqual(self.credits(self.a), 200)

    def test_replayed_event_id_is_ignored(self):
        processed = MagicMock(return_value={"ok": True})
        handler = dict(self.ns, _process_razorpay_event=processed)
        from test_plan_policy import function_from_file
        fn = function_from_file(TOKEN_API, "_handle_razorpay_webhook", handler)
        event_id = f"evt_{os.urandom(3).hex()}"
        fn({"event": "payment.captured"}, event_id)
        fn({"event": "payment.captured"}, event_id)
        self.assertEqual(processed.call_count, 1)

    def test_bad_signature_changes_nothing(self):
        session = self.order(credits=100)
        self.razorpay.verify_payment_signature.return_value = False
        with self.assertRaises(HTTPException) as ctx:
            self.verify(session["orderId"])
        self.assertEqual(ctx.exception.status, 400)
        self.assertEqual(self.invoice_for(session["orderId"])["status"], "created")
        self.assertEqual(self.credits(self.a), 100)

    def test_another_tenants_order_is_not_found_and_untouched(self):
        self.set_credits(self.b, 10)
        session = self.order(credits=100)
        with self.assertRaises(HTTPException) as ctx:
            self.verify(session["orderId"], account=self.b)
        self.assertEqual(ctx.exception.status, 404)
        self.assertEqual(self.invoice_for(session["orderId"])["status"], "created")
        self.assertEqual((self.credits(self.a), self.credits(self.b)), (100, 10))

    def test_credits_outside_the_range_are_rejected_before_any_order(self):
        for bad in (49, 10001):
            with self.assertRaises(HTTPException) as ctx:
                self.order(credits=bad)
            self.assertEqual(ctx.exception.status, 400)
        self.razorpay.create_order.assert_not_called()

    def test_pack_bonus_is_credited_but_only_the_base_is_invoiced(self):
        session = self.order(pack="500")
        self.assertEqual((session["credits"], session["bonusCredits"], session["amountInr"]), (500, 50, 5900.0))
        inv = self.invoice_for(session["orderId"])
        self.assertEqual((inv["credits"], inv["bonus_credits"], float(inv["amount_inr"])), (500, 50, 5900.0))
        self.assertEqual(self.razorpay.create_order.call_args.kwargs["notes"]["bonus"], "50")
        self.assertEqual(self.verify(session["orderId"])["credits"], 550)
        self.assertEqual(self.credits(self.a), 650)

    def test_refund_takes_the_credits_back_and_floors_at_zero(self):
        session = self.order(pack="500")
        self.verify(session["orderId"])
        self.set_credits(self.a, 20)  # most of the top-up already used
        refund = self.ns["_process_razorpay_event"](
            {"event": "refund.processed", "payload": {"refund": {"entity": {"payment_id": self.pay}}}}
        )
        self.assertEqual(refund, {"ok": True})
        inv = self.invoice_for(session["orderId"])
        self.assertEqual(inv["status"], "refunded")
        self.assertIsNotNone(inv["refunded_at"])
        self.assertEqual(self.credits(self.a), 0)
        self.assertIsNone(self.db.refund_topup(self.pay), "a second refund event finds nothing")

    def test_failed_attempt_then_successful_retry_still_credits(self):
        """Razorpay sends payment.failed for a declined card while the order
        stays payable; the retry in the same Checkout pays that order."""
        session = self.order(credits=100)
        self.ns["_process_razorpay_event"](
            {"event": "payment.failed", "payload": {"payment": {"entity": {"id": "pay_declined", "order_id": session["orderId"]}}}}
        )
        self.assertEqual(self.invoice_for(session["orderId"])["status"], "failed")
        self.assertEqual(self.verify(session["orderId"])["credits"], 100)
        self.assertEqual(self.credits(self.a), 200)
        self.assertEqual(self.invoice_for(session["orderId"])["status"], "paid")

    def test_partial_refund_takes_back_the_same_share_of_credits(self):
        session = self.order(pack="500")  # 500 + 50 bonus credits
        self.verify(session["orderId"])
        before = self.credits(self.a)
        half = round(float(self.invoice_for(session["orderId"])["amount_inr"]) * 100 / 2)  # paise
        self.ns["_process_razorpay_event"](
            {"event": "refund.processed", "payload": {"refund": {"entity": {"payment_id": self.pay, "amount": half}}}}
        )
        self.assertEqual(self.credits(self.a), before - 275, "half the money back = half of the 550 credits back")
        self.assertEqual(self.invoice_for(session["orderId"])["status"], "paid", "a partial refund leaves the invoice paid")

    def test_refund_of_an_unknown_payment_is_a_no_op(self):
        self.ns["_process_razorpay_event"](
            {"event": "refund.processed", "payload": {"refund": {"entity": {"payment_id": "pay_nope"}}}}
        )
        self.assertEqual(self.credits(self.a), 100)

    def test_topups_are_listed_newest_first_with_bonus(self):
        session = self.order(pack="250")
        self.verify(session["orderId"])
        top = self.db.list_topups(self.a)[0]
        self.assertEqual((top["credits"], top["bonusCredits"], top["status"]), (250, 12, "paid"))
        self.assertTrue(top["invoiceNumber"])


class WebhookIsReachableWithoutASession(unittest.TestCase):
    """Razorpay calls the webhook with no dashboard cookie. It used to be
    caught by the session middleware (401) before the handler ever ran, so
    no payment.captured or refund event could land."""

    def test_public_path(self):
        # Read from source: importing token_api runs calls_db.init_tables()
        # on whatever DATABASE_URL is set (see conftest.py).
        import ast
        tree = ast.parse(TOKEN_API.read_text(encoding="utf-8"))
        node = next(n for n in tree.body if isinstance(n, ast.Assign)
                    and any(getattr(t, "id", None) == "_PUBLIC_PATHS" for t in n.targets))
        self.assertIn("/billing/razorpay/webhook", ast.literal_eval(node.value))


if __name__ == "__main__":
    unittest.main()
