"""The dialer's line ceiling per trunk and per carrier pool
(campaign_dialer._line_room / _pace_dial, plan section 2a), against a real
Postgres (TEST_DATABASE_URL).

Proves: with only the shared platform pool (today), the ceiling is exactly
the old OUTBOUND_CHANNEL_LIMIT - all live dials; a customer's own lines are
not used up by calls on the shared trunk and vice versa; two trunks on one
pool share the pool's cap; a failed lookup falls back to the old ceiling; the
CPS stagger is per pool; and the shared pool follows OUTBOUND_CHANNEL_LIMIT
while no customer lines are sold from it."""
import os
import time
import unittest
from unittest import mock

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class DialerLines(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        os.environ["TELEPHONY_ALLOW_PLAINTEXT_SECRETS"] = "1"
        import calls_db
        import campaign_dialer
        import telephony

        cls.db, cls.dialer, cls.tel = calls_db, campaign_dialer, telephony
        calls_db.init_tables()
        telephony.init_tables()
        stamp = os.urandom(3).hex()
        a = calls_db.create_account_with_owner("DA", "Asha", f"da-{stamp}@example.com", "h", email_verified=True)
        b = calls_db.create_account_with_owner("DB", "Bala", f"db-{stamp}@example.com", "h", email_verified=True)
        cls.a, cls.b = a["account_id"], b["account_id"]
        tail = str(int(time.time() * 1000))[-6:]
        cls.shared_num, cls.a_num, cls.b_num = f"+91231{tail}1", f"+91231{tail}2", f"+91231{tail}3"
        for number, account in ((cls.shared_num, cls.a), (cls.a_num, cls.a), (cls.b_num, cls.b)):
            calls_db.add_phone_number(number, account)
        cls.platform = telephony.ensure_platform_pool()
        cls.campaigns: list[int] = []

    def setUp(self):
        self.dialer._last_dial_at = {}

    def tearDown(self):
        conn = self.db._connect()
        with conn:
            if self.campaigns:
                conn.execute("DELETE FROM campaign_contacts WHERE campaign_id = ANY(?)", (self.campaigns,))
        conn.close()

    def calling(self, from_number: str, account_id: int, n: int) -> None:
        """n live dials from a campaign on this number (status 'calling' is
        what the dialer counts as in flight)."""
        conn = self.db._connect()
        with conn:
            cid = conn.execute(
                "INSERT INTO campaigns (account_id, name, from_number, status, max_attempts, retry_minutes) "
                "VALUES (?, 'Lines test', ?, 'running', 1, 30) RETURNING id", (account_id, from_number)).fetchone()["id"]
            for i in range(n):
                phone = f"+9198{cid % 100000:05d}{i:03d}"
                conn.execute("INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, status) "
                             "VALUES (?, ?, 'x', ?, ?, 'calling')", (cid, account_id, phone, phone.lstrip("+")))
        conn.close()
        self.campaigns.append(cid)

    # ------------------------------------------------------------------ tests

    def test_shared_pool_ceiling_is_exactly_the_old_one(self):
        limit = self.tel.outbound_line_limit()
        for live in range(0, limit + 1):
            if live:
                self.calling(self.shared_num, self.a, 1)
            free, pool_id, _ = self.dialer._line_room(self.shared_num)
            old = self.dialer._OUTBOUND_CHANNELS - self.db.campaign_inflight_all()
            self.assertEqual(free, max(0, old), f"{live} live dial(s)")
            self.assertEqual(pool_id, self.platform["pool_id"])

    def test_a_customers_own_lines_are_theirs(self):
        pool = self.tel.create_pool("enablex", 3, 0, 1, notes="lines test")["id"]  # 2 allocatable
        trunk = self.tel.allocate_lines(self.a, pool, 2, [self.a_num])
        # The shared trunk filling up does not touch A's lines.
        self.calling(self.shared_num, self.a, self.tel.outbound_line_limit())
        self.assertEqual(self.dialer._line_room(self.shared_num)[0], 0)
        free, pool_id, label = self.dialer._line_room(self.a_num)
        self.assertEqual((free, pool_id), (2, pool))
        self.assertIn(f"trunk {trunk['id']}", label)
        # A's own live calls use A's lines and nobody else's.
        self.calling(self.a_num, self.a, 2)
        self.assertEqual(self.dialer._line_room(self.a_num)[0], 0)

    def test_two_trunks_on_one_pool_share_its_cap(self):
        pool = self.tel.create_pool("enablex", 3, 0, 1, notes="shared pool test")["id"]  # 2 allocatable
        self.tel.allocate_lines(self.a, pool, 1, [self.a_num])
        self.tel.allocate_lines(self.b, pool, 1, [self.b_num])
        self.calling(self.a_num, self.a, 1)
        self.assertEqual(self.dialer._line_room(self.a_num)[0], 0, "A's one line is busy")
        self.assertEqual(self.dialer._line_room(self.b_num)[0], 1, "B's line is free and the pool has room")
        self.calling(self.b_num, self.b, 1)
        self.assertEqual(self.dialer._line_room(self.b_num)[0], 0)

    def test_the_pool_cap_binds_when_a_trunk_runs_over_its_lines(self):
        # A's lines were cut from 2 to 1 while both calls were live: A's trunk
        # is over by one, so the carrier account is full and B must wait even
        # though B's own line is idle.
        pool = self.tel.create_pool("enablex", 3, 0, 1, notes="pool cap test")["id"]  # 2 allocatable
        a_trunk = self.tel.allocate_lines(self.a, pool, 1, [self.a_num])
        self.tel.allocate_lines(self.b, pool, 1, [self.b_num])
        self.calling(self.a_num, self.a, 2)
        self.assertEqual(self.tel.trunk_room(a_trunk["id"])["trunk_inflight"], 2)
        self.assertEqual(self.dialer._line_room(self.b_num)[0], 0, "the pool, not B's trunk, is the limit")

    def test_a_failed_lookup_falls_back_to_the_old_ceiling(self):
        with mock.patch.object(self.dialer.telephony, "trunk_for_number", side_effect=RuntimeError("db down")):
            free, pool_id, _ = self.dialer._line_room(self.a_num)
        self.assertIsNone(pool_id)
        self.assertEqual(free, self.dialer._OUTBOUND_CHANNELS - self.db.campaign_inflight_all())

    def test_the_stagger_is_per_pool(self):
        clock = [1000.0]
        slept: list[float] = []
        with mock.patch.object(self.dialer.time, "monotonic", side_effect=lambda: clock[0]), \
             mock.patch.object(self.dialer.time, "sleep", side_effect=lambda s: (slept.append(s), clock.__setitem__(0, clock[0] + s))):
            self.dialer._pace_dial(0, pool_id=1)
            self.dialer._pace_dial(0, pool_id=2)  # another carrier account: no wait
            self.assertEqual(slept, [])
            self.dialer._pace_dial(0, pool_id=1)  # same account: waits the CPS gap
        self.assertEqual(slept, [self.dialer._DIAL_STAGGER_SECONDS])

    def test_the_shared_pool_follows_outbound_channel_limit_until_lines_are_sold(self):
        try:
            with mock.patch.dict(os.environ, {"OUTBOUND_CHANNEL_LIMIT": "4"}):
                self.tel.ensure_platform_pool()
                self.assertEqual(self.tel.get_trunk(self.platform["trunk_id"])["lines"], 4)
            with mock.patch.dict(os.environ, {"OUTBOUND_CHANNEL_LIMIT": "1"}):
                self.tel.ensure_platform_pool()
                self.assertEqual(self.tel.get_trunk(self.platform["trunk_id"])["lines"], 1)
        finally:
            self.tel.ensure_platform_pool()  # back to the test run's own setting
        self.assertEqual(self.tel.get_trunk(self.platform["trunk_id"])["lines"], self.tel.outbound_line_limit())


if __name__ == "__main__":
    unittest.main(verbosity=2)
