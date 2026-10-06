"""Dashboard test calls are free up to FREE_TEST_MINUTES, then billed pro rata."""
import unittest

import calls_db


class _Conn:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, *_a, **_k):
        return self

    def fetchall(self):
        return self.rows


def _row(m):
    return {"call_type": "browser", "voice": "", "model": "", "m": m}


class FreeTestAllowance(unittest.TestCase):
    def setUp(self):
        self._old = calls_db.FREE_TEST_MINUTES
        calls_db.FREE_TEST_MINUTES = 30.0
        self.rates = {"browser": 1.0}

    def tearDown(self):
        calls_db.FREE_TEST_MINUTES = self._old

    def test_inside_allowance_is_free(self):
        self.assertEqual(calls_db._test_overage_credits(_Conn([_row(29.9)]), 1, self.rates, None), 0.0)

    def test_overage_is_billed_pro_rata(self):
        conn = _Conn([_row(40.0)])
        _, full = calls_db._test_call_usage(conn, 1, self.rates, None)
        over = calls_db._test_overage_credits(conn, 1, self.rates, None)
        self.assertAlmostEqual(over, full * 10 / 40, places=6)
        self.assertGreater(over, 0)

    def test_no_tests_no_charge(self):
        self.assertEqual(calls_db._test_overage_credits(_Conn([]), 1, self.rates, None), 0.0)


if __name__ == "__main__":
    unittest.main()
