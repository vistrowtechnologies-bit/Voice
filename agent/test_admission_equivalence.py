"""The fast admission path must decide exactly like the sequential one.

Integration test against a STAGING database only (DATABASE_URL must point at a
database carrying the vv_environment='staging' marker, see server/seed_staging.py).
Skipped otherwise. Builds throwaway accounts, runs both implementations on the
same situation, compares the answer and the active_calls side effect, cleans up.
"""
import os
import unittest

import psycopg

URL = os.environ.get("DATABASE_URL", "")


def _is_staging() -> bool:
    if not URL:
        return False
    try:
        with psycopg.connect(URL, connect_timeout=10) as c:
            if not c.execute("select to_regclass('public.vv_environment') is not null").fetchone()[0]:
                return False
            row = c.execute("select env from vv_environment limit 1").fetchone()
            return bool(row and row[0] == "staging")
    except Exception:
        return False


@unittest.skipUnless(_is_staging(), "needs a staging DATABASE_URL (marker table vv_environment = 'staging')")
class AdmissionEquivalence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import db  # imported late: reads DATABASE_URL

        cls.db = db
        cls.conn = psycopg.connect(URL, autocommit=True)
        cls.accounts: list[int] = []

    @classmethod
    def tearDownClass(cls):
        for aid in cls.accounts:
            cls.conn.execute("delete from active_calls where account_id=%s", (aid,))
            cls.conn.execute("delete from settings where account_id=%s", (aid,))
            cls.conn.execute("delete from subscriptions where account_id=%s", (aid,))
            cls.conn.execute("delete from accounts where id=%s", (aid,))
        cls.conn.close()

    def _account(self, plan="starter", status="active", owner=0, credits=300, sub="active"):
        aid = self.conn.execute(
            "insert into accounts (name, plan, status, is_platform_owner) values (%s,%s,%s,%s) returning id",
            (f"adm-test-{len(self.accounts)}", plan, status, owner),
        ).fetchone()[0]
        self.accounts.append(aid)
        if credits is not None:
            self.conn.execute("insert into settings (account_id,key,value) values (%s,'credits_total',%s)", (aid, str(credits)))
        if sub:
            self.conn.execute("insert into subscriptions (account_id, plan, status) values (%s,%s,%s)", (aid, plan, sub))
        return aid

    def _fill(self, aid, n, age_hours=0):
        for i in range(n):
            self.conn.execute(
                "insert into active_calls (room_name, account_id, started_at) values (%s,%s, to_char((now() at time zone 'UTC') - make_interval(hours => %s), 'YYYY-MM-DD HH24:MI:SS'))",
                (f"fill-{aid}-{age_hours}-{i}", aid, age_hours),
            )

    def _room_present(self, room):
        return self.conn.execute("select count(*) from active_calls where room_name=%s", (room,)).fetchone()[0]

    def _compare(self, name, aid, cfg, *, existing_room=None, existing_account=None, expect=None):
        results = {}
        for label, fn in (("sequential", self.db._try_start_call_sequential), ("fast", self.db._try_start_call_fast)):
            room = f"adm-{aid}-{label}"
            if existing_room:
                self.conn.execute("delete from active_calls where room_name=%s", (room,))
                self.conn.execute("insert into active_calls (room_name, account_id) values (%s,%s)", (room, existing_account or aid))
            got = fn(room, aid, cfg)
            results[label] = (got, self._room_present(room))
            self.conn.execute("delete from active_calls where room_name=%s", (room,))
        self.assertEqual(results["sequential"], results["fast"], f"{name}: {results}")
        if expect is not None:
            self.assertEqual(results["fast"][0], expect, f"{name}: expected {expect}, got {results}")

    CFG = {"id": None, "voice": "shubh", "kb_id": None, "live_catalog_enabled": 0}

    def test_platform_owner_is_admitted(self):
        self._compare("owner", self._account(plan="", owner=1, credits=None, sub=None), self.CFG, expect=True)

    def test_owner_ignores_a_bad_voice(self):
        self._compare("owner bad voice", self._account(plan="", owner=1, credits=None, sub=None), {**self.CFG, "voice": "nope"}, expect=True)

    def test_paid_active_subscription_is_admitted(self):
        self._compare("paid", self._account(), self.CFG, expect=True)

    def test_trial_without_credits_is_refused(self):
        self._compare("no credits", self._account(sub=None, credits=0), self.CFG, expect=False)

    def test_trial_with_credits_is_admitted(self):
        self._compare("trial credits", self._account(sub=None, credits=300), self.CFG, expect=True)

    def test_suspended_account_is_refused(self):
        self._compare("suspended", self._account(status="suspended"), self.CFG, expect=False)

    def test_unknown_plan_is_refused(self):
        self._compare("unknown plan", self._account(plan="mystery"), self.CFG, expect=False)

    def test_concurrency_limit(self):
        full = self._account(); self._fill(full, 5)
        self._compare("at limit", full, self.CFG, expect=False)
        room = self._account(); self._fill(room, 4)
        self._compare("one below limit", room, self.CFG, expect=True)

    def test_stale_rows_do_not_count(self):
        aid = self._account(); self._fill(aid, 5, age_hours=6)
        self._compare("stale rows", aid, self.CFG, expect=True)
        self.assertEqual(self.conn.execute("select count(*) from active_calls where account_id=%s", (aid,)).fetchone()[0], 0)

    def test_existing_room_same_account_is_admitted_other_account_refused(self):
        aid = self._account(); other = self._account()
        self._compare("existing same", aid, self.CFG, existing_room=True, existing_account=aid, expect=True)
        self._compare("existing other", aid, self.CFG, existing_room=True, existing_account=other, expect=False)

    def test_non_owner_with_unavailable_voice_is_refused(self):
        self._compare("bad voice", self._account(), {**self.CFG, "voice": "nope"}, expect=False)

    def test_missing_account_is_refused(self):
        self._compare("missing", 2147483000, self.CFG, expect=False)

    def test_no_config_skips_the_policy_check(self):
        self._compare("no config", self._account(), None, expect=True)


if __name__ == "__main__":
    unittest.main()
