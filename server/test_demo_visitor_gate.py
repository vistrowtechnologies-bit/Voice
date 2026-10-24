"""The homepage live demo asks for a name, phone and consent before the call
(owner 24 Oct, no OTP). The gate (token_api._demo_visitor_gate) is lifted out
of the source like test_token_agent_ownership.py does; the contact save
(calls_db.save_demo_visitor) runs against a real Postgres (TEST_DATABASE_URL)."""
import ast
import os
import re
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)
TEST_DB = os.environ.get("TEST_DATABASE_URL")


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


class Refused(Exception):
    def __init__(self, status, detail):
        super().__init__(detail)
        self.status = status


class Gate(unittest.TestCase):
    def setUp(self):
        self.hits: dict = {}

        def limited(bucket, key, max_hits, window_s):
            self.hits[(bucket, key)] = self.hits.get((bucket, key), 0) + 1
            return self.hits[(bucket, key)] > max_hits

        ns = {"re": re, "HTTPException": Refused, "_limited": limited,
              "logger": type("L", (), {"warning": staticmethod(lambda *a: None)}),
              "_DEMO_CALLS_PER_PHONE_PER_DAY": 10, "_DEMO_CALLS_PER_IP_PER_DAY": 25}
        exec(function_source("_looks_like_real_phone"), ns)
        exec(function_source("_demo_visitor_gate"), ns)
        self.gate = ns["_demo_visitor_gate"]

    def refused(self, *args) -> int:
        with self.assertRaises(Refused) as caught:
            self.gate(*args)
        return caught.exception.status

    def test_a_filled_form_passes_and_is_cleaned(self):
        self.assertEqual(self.gate("  Priya   Nair ", "+91 98201 34567", True, "1.2.3.4"), ("Priya Nair", "+919820134567"))

    def test_name_phone_and_consent_are_each_required(self):
        self.assertEqual(self.refused("", "+919820134567", True, "ip"), 400)
        self.assertEqual(self.refused("Priya", "", True, "ip"), 400)
        self.assertEqual(self.refused("Priya", "+919820134567", False, "ip"), 400)

    def test_typed_junk_numbers_are_refused(self):
        for junk in ("+919999999999", "+911234567890", "9820134567", "+91abc"):
            self.assertEqual(self.refused("Priya", junk, True, "ip"), 400, junk)

    def test_one_number_gets_ten_calls_a_day(self):
        for _ in range(10):
            self.gate("Priya", "+919820134567", True, f"ip{_}")
        self.assertEqual(self.refused("Priya", "+919820134567", True, "fresh-ip"), 429)
        self.gate("Ravi", "+919820134568", True, "fresh-ip2")

    def test_one_ip_gets_twentyfive_calls_a_day_across_numbers(self):
        for i in range(25):
            self.gate("Priya", f"+9198201345{i:02d}", True, "office")
        self.assertEqual(self.refused("Priya", "+919820139999", True, "office"), 429)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class SaveDemoVisitor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db

        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(3).hex()
        owner = calls_db.create_account_with_owner("Vistrow", "Owner", f"o-{stamp}@example.com", "h", email_verified=True)
        cls.account = owner["account_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id = ?", (cls.account,))
        conn.close()
        cls.agent = calls_db.create_agent({"name": "Artha"}, cls.account)["id"]
        conn = calls_db._connect()
        with conn:
            # Only this test's agent is the platform demo.
            conn.execute("UPDATE agents SET is_platform_demo = 0 WHERE is_platform_demo = 1")
            conn.execute("UPDATE agents SET is_platform_demo = 1 WHERE id = ?", (cls.agent,))
        conn.close()
        cls.n = int(stamp, 16) % 10**6

    def contact(self, contact_id):
        conn = self.db._connect()
        try:
            return dict(conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone())
        finally:
            conn.close()

    def test_visitor_lands_in_the_platform_demo_account_tagged(self):
        cid = self.db.save_demo_visitor("Priya Nair", f"+9198{self.n:06d}11")
        row = self.contact(cid)
        self.assertEqual((row["account_id"], row["name"], row["source"], row["tags"]),
                         (self.account, "Priya Nair", "website_demo", "website-demo"))

    def test_a_known_contact_keeps_its_name_and_tags(self):
        phone = f"+9198{self.n:06d}22"
        self.db.create_contact({"name": "Ravi Kumar", "phone": phone, "tags": "meta-lead", "source": "manual"}, self.account)
        cid = self.db.save_demo_visitor("Somebody Else", phone)
        row = self.contact(cid)
        self.assertEqual((row["name"], row["tags"], row["source"]), ("Ravi Kumar", "meta-lead,website-demo", "manual"))

    def test_repeat_visits_make_one_contact(self):
        phone = f"+9198{self.n:06d}33"
        self.assertEqual(self.db.save_demo_visitor("Asha", phone), self.db.save_demo_visitor("Asha", phone))


if __name__ == "__main__":
    unittest.main(verbosity=2)
