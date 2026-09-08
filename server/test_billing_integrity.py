import unittest
from unittest.mock import patch

import calls_db


class _Result:
    def __init__(self, *, one=None, many=None):
        self._one = one
        self._many = many or []

    def fetchone(self):
        return self._one

    def fetchall(self):
        return self._many


class _Connection:
    def __init__(self, paid_row=None):
        self.paid_row = paid_row
        self.queries = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def close(self):
        pass

    def execute(self, query, params=()):
        self.queries.append((query, params))
        if "UPDATE invoices" in query:
            return _Result(one=self.paid_row)
        if "GROUP BY call_type, voice, model" in query:
            return _Result(many=[{"call_type": "phone", "voice": None, "model": None, "m": 1300.0}])
        if "key = 'credits_total'" in query:
            return _Result(one={"value": "1200"})
        if "key = ?" in query:
            return _Result(one={"value": "1"})
        return _Result()


class BillingIntegrityTests(unittest.TestCase):
    def test_closed_period_overage_uses_topups_and_excludes_test_calls(self):
        conn = _Connection()
        with patch.object(calls_db, "_connect", return_value=conn):
            result = calls_db.overage_for_account_period(
                7, "starter", "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z"
            )

        self.assertEqual(result["creditsUsed"], 1300.0)
        self.assertEqual(result["overageCredits"], 100.0)
        grouped_query = next(query for query, _params in conn.queries if "GROUP BY" in query)
        self.assertIn("room_name NOT LIKE", grouped_query)

    def test_paid_invoice_returns_only_on_first_state_transition(self):
        paid = {"id": 9, "status": "paid", "kind": "topup", "credits": 100}
        first = _Connection(paid_row=paid)
        retry = _Connection(paid_row=None)

        with patch.object(calls_db, "_connect", return_value=first):
            self.assertEqual(calls_db.mark_invoice_paid("order_1", "pay_1"), paid)
        with patch.object(calls_db, "_connect", return_value=retry):
            self.assertIsNone(calls_db.mark_invoice_paid("order_1", "pay_1"))


if __name__ == "__main__":
    unittest.main()
