"""Offline tests for cancelling a subscription, GST invoices and billing details. No database, no network."""
import datetime
import unittest
from unittest.mock import MagicMock, patch

import billing_documents as bd
import calls_db


def _conn(row=None, rows=None):
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = row
    conn.execute.return_value.fetchall.return_value = rows or []
    return conn


class InvoiceNumberTests(unittest.TestCase):
    def test_a_paid_invoice_gets_the_next_number_of_its_financial_year(self):
        conn = MagicMock()
        conn.execute.return_value.fetchone.side_effect = [
            {"status": "paid", "paid_at": "2026-10-01T05:00:00+00:00", "created_at": "x", "invoice_number": None},
            {"last_number": 7},
        ]
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertEqual(calls_db.ensure_invoice_number(11), "VV/2026-27/00007")
        sql = [c.args[0] for c in conn.execute.call_args_list]
        self.assertIn("FOR UPDATE", sql[0])
        self.assertIn("UPDATE invoices SET invoice_number", sql[2])

    def test_an_invoice_keeps_its_number(self):
        conn = _conn({"status": "paid", "paid_at": "2026-10-01", "created_at": "x", "invoice_number": "VV/2026-27/00003"})
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertEqual(calls_db.ensure_invoice_number(1), "VV/2026-27/00003")
        self.assertEqual(conn.execute.call_count, 1)  # no counter touched

    def test_unpaid_or_missing_invoices_get_no_number(self):
        for row in ({"status": "created", "paid_at": None, "created_at": "x", "invoice_number": None}, None):
            with patch.object(calls_db, "_connect", return_value=_conn(row)):
                self.assertIsNone(calls_db.ensure_invoice_number(1))

    def test_financial_year_rolls_over_in_april(self):
        self.assertEqual(bd.financial_year(datetime.datetime(2027, 3, 31)), "2026-27")
        self.assertEqual(bd.financial_year(datetime.datetime(2027, 4, 1)), "2027-28")

    def test_marking_paid_never_fails_because_numbering_failed(self):
        conn = _conn({"id": 5, "status": "paid"})
        with patch.object(calls_db, "_connect", return_value=conn), \
                patch.object(calls_db, "ensure_invoice_number", side_effect=RuntimeError("db hiccup")):
            result = calls_db.mark_invoice_paid(razorpay_order_id="order_1", razorpay_payment_id="pay_1")
        self.assertEqual(result["id"], 5)


class InvoiceDocumentTests(unittest.TestCase):
    INVOICE = {"id": 1, "kind": "subscription", "amount_inr": 3538.82, "gst_inr": 539.82, "paid_at": "2026-10-01T05:01:00+00:00",
               "invoice_number": "VV/2026-27/00001", "razorpay_payment_id": "pay_9"}

    def test_same_state_is_split_into_cgst_and_sgst_and_otherwise_igst(self):
        same = bd.tax_split(3538.82, 539.82, "Maharashtra", " maharashtra ")
        self.assertEqual([n for n, _ in same["lines"]], ["CGST (9%)", "SGST (9%)"])
        self.assertAlmostEqual(sum(a for _, a in same["lines"]), 539.82, places=2)
        self.assertEqual(same["base"], 2999.0)
        self.assertEqual([n for n, _ in bd.tax_split(3538.82, 539.82, "Maharashtra", "Karnataka")["lines"]], ["IGST (18%)"])
        self.assertEqual([n for n, _ in bd.tax_split(3538.82, 539.82, "", "")["lines"]], ["IGST (18%)"])

    def test_the_page_shows_number_amounts_and_buyer_and_escapes_what_users_typed(self):
        page = bd.render_invoice_html(self.INVOICE, {"legal_name": "Acme <script>x</script>", "gstin": "27ABCDE1234F1Z5", "state": "Goa"},
                                      bd.supplier_from_env({}), "VISTROW")
        self.assertIn("VV/2026-27/00001", page)
        self.assertIn("₹2,999.00", page)
        self.assertIn("₹3,538.82", page)
        self.assertIn("27ABCDE1234F1Z5", page)
        self.assertNotIn("<script>x</script>", page)
        self.assertIn("&lt;script&gt;", page)

    def test_unconfigured_supplier_details_are_left_off_not_invented(self):
        page = bd.render_invoice_html(self.INVOICE, {}, bd.supplier_from_env({}), "VISTROW")
        self.assertNotIn("SAC:", page)
        self.assertEqual(page.count("GSTIN:"), 0)
        configured = bd.render_invoice_html(self.INVOICE, {}, bd.supplier_from_env({"INVOICE_SUPPLIER_GSTIN": "27AAAAA0000A1Z5", "INVOICE_SAC": "998314"}), "VISTROW")
        self.assertIn("GSTIN: 27AAAAA0000A1Z5", configured)
        self.assertIn("SAC: 998314", configured)

    def test_auto_print_is_opt_in(self):
        self.assertNotIn("window.print()},300", bd.render_invoice_html(self.INVOICE, {}, bd.supplier_from_env({}), "V"))
        self.assertIn("window.print()},300", bd.render_invoice_html(self.INVOICE, {}, bd.supplier_from_env({}), "V", auto_print=True))


class BillingProfileTests(unittest.TestCase):
    def test_a_valid_profile_is_cleaned(self):
        p = bd.normalize_profile({"legalName": "  Acme   Pvt Ltd ", "gstin": "27abcde1234f1z5", "pincode": "403001", "billingEmail": "Accounts@Acme.in"})
        self.assertEqual((p["legal_name"], p["gstin"], p["billing_email"]), ("Acme Pvt Ltd", "27ABCDE1234F1Z5", "accounts@acme.in"))

    def test_bad_values_are_rejected_with_a_readable_message(self):
        for bad in ({"gstin": "NOTAGSTIN"}, {"pincode": "40"}, {"billingEmail": "nope"}):
            with self.assertRaises(ValueError) as ctx:
                bd.normalize_profile(bad)
            self.assertTrue(str(ctx.exception))

    def test_a_blank_profile_is_allowed(self):
        self.assertEqual(bd.normalize_profile({})["gstin"], "")

    def test_saving_is_scoped_to_the_account(self):
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = None
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.set_billing_profile(7, {"legalName": "Acme"})
        sql, params = conn.execute.call_args_list[0].args
        self.assertIn("ON CONFLICT (account_id)", sql)
        self.assertEqual(params[0], 7)


if __name__ == "__main__":
    unittest.main()


class CancelEndpointTests(unittest.TestCase):
    """Runs the real endpoint function with its collaborators replaced (token_api itself cannot be
    imported without a database)."""

    def _endpoint(self, sub, razorpay_error=None):
        import html
        from pathlib import Path
        from test_plan_policy import function_from_file
        calls = MagicMock()
        calls.get_subscription.return_value = sub
        calls.get_user_by_id.return_value = {"email": "a@example.com", "name": "Abhi"}
        razorpay = MagicMock()
        if razorpay_error:
            razorpay.cancel_subscription.side_effect = razorpay_error

        class HTTPException(Exception):
            def __init__(self, status, detail):
                self.status, self.detail = status, detail

        ns = {"calls_db": calls, "razorpay_client": razorpay, "email_sender": MagicMock(), "html": html, "HTTPException": HTTPException,
              "Depends": lambda x: x, "require_role": lambda r: r, "CancelSubscriptionRequest": object, "logger": MagicMock()}
        fn = function_from_file(Path(__file__).resolve().parent / "token_api.py", "cancel_subscription", ns)
        return fn, calls, razorpay, ns, HTTPException

    USER = {"user_id": 3, "account_id": 9}
    REQ = MagicMock(reason="too expensive")
    ACTIVE = {"status": "active", "razorpay_subscription_id": "sub_1", "current_period_end": "2026-11-01T00:00:00Z", "cancel_at_period_end": 0}

    def test_cancels_at_the_end_of_the_period_and_records_it(self):
        fn, calls, razorpay, ns, _ = self._endpoint(dict(self.ACTIVE))
        result = fn(self.REQ, self.USER)
        razorpay.cancel_subscription.assert_called_once_with("sub_1", cancel_at_cycle_end=True)
        calls.mark_subscription_cancel_requested.assert_called_once_with(9, "too expensive")
        self.assertEqual(result["endsOn"], "2026-11-01T00:00:00Z")
        self.assertFalse(result["alreadyScheduled"])
        ns["email_sender"].send_email.assert_called_once()

    def test_no_active_subscription_is_a_clear_error_and_changes_nothing(self):
        for sub in (None, {"status": "cancelled", "razorpay_subscription_id": "sub_1"}, {"status": "active", "razorpay_subscription_id": None}):
            fn, calls, razorpay, _, HTTPException = self._endpoint(sub)
            with self.assertRaises(HTTPException) as ctx:
                fn(self.REQ, self.USER)
            self.assertEqual(ctx.exception.status, 400)
            razorpay.cancel_subscription.assert_not_called()
            calls.mark_subscription_cancel_requested.assert_not_called()

    def test_asking_twice_does_not_call_the_provider_twice(self):
        sub = dict(self.ACTIVE, cancel_at_period_end=1)
        fn, calls, razorpay, _, _ = self._endpoint(sub)
        self.assertTrue(fn(self.REQ, self.USER)["alreadyScheduled"])
        razorpay.cancel_subscription.assert_not_called()

    def test_if_the_provider_fails_nothing_is_marked_cancelled(self):
        fn, calls, razorpay, _, HTTPException = self._endpoint(dict(self.ACTIVE), razorpay_error=RuntimeError("timeout"))
        with self.assertRaises(HTTPException) as ctx:
            fn(self.REQ, self.USER)
        self.assertEqual(ctx.exception.status, 502)
        calls.mark_subscription_cancel_requested.assert_not_called()

    def test_a_failing_confirmation_email_does_not_undo_the_cancellation(self):
        fn, calls, razorpay, ns, _ = self._endpoint(dict(self.ACTIVE))
        ns["email_sender"].send_email.side_effect = RuntimeError("smtp down")
        self.assertTrue(fn(self.REQ, self.USER)["ok"])
        calls.mark_subscription_cancel_requested.assert_called_once()
