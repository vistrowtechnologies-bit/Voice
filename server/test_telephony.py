"""Telephony capacity model (server/telephony/) against a real Postgres
(TEST_DATABASE_URL). Proves: the migration leaves the dialer's ceiling
unchanged; a pool cannot be oversold, even by two sales racing each other;
released lines return; in-flight counts per trunk match the dialer's
definition; the snapshot adds up; secrets are never stored plaintext without
the opt-in; the provider interface classifies rejections."""
import os
import threading
import time
import unittest
from unittest import mock

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class TelephonyCapacity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        os.environ["TELEPHONY_ALLOW_PLAINTEXT_SECRETS"] = "1"
        os.environ.setdefault("OUTBOUND_CHANNEL_LIMIT", "2")
        import calls_db
        import telephony

        cls.db, cls.tel = calls_db, telephony
        calls_db.init_tables()
        telephony.init_tables()
        stamp = os.urandom(3).hex()
        cls.stamp = stamp
        a = calls_db.create_account_with_owner("TA", "Asha", f"ta-{stamp}@example.com", "h", email_verified=True)
        b = calls_db.create_account_with_owner("TB", "Bala", f"tb-{stamp}@example.com", "h", email_verified=True)
        cls.a, cls.b = a["account_id"], b["account_id"]
        tail = str(int(time.time() * 1000))[-6:]
        cls.num_a1, cls.num_a2, cls.num_b = f"+91226{tail}1", f"+91226{tail}2", f"+91227{tail}1"
        calls_db.add_phone_number(cls.num_a1, cls.a)
        calls_db.add_phone_number(cls.num_a2, cls.a)
        calls_db.add_phone_number(cls.num_b, cls.b)
        cls.platform = telephony.ensure_platform_pool()

    def pool(self, lines_bought: int, reserve: int = 1) -> int:
        return self.tel.create_pool("enablex", lines_bought, 0, reserve, notes=f"test {self.stamp}")["id"]

    # ------------------------------------------------------------------ tests

    def test_migration_leaves_the_dialer_ceiling_unchanged(self):
        limit = self.tel.outbound_line_limit()
        snap = self.tel.capacity_snapshot()
        platform = next(p for p in snap["pools"] if p["poolId"] == self.platform["pool_id"])
        self.assertEqual((platform["linesBought"], platform["inboundReserved"], platform["allocatable"]),
                         (limit + 1, 1, limit))
        trunk = next(t for t in platform["trunks"] if t["trunkId"] == self.platform["trunk_id"])
        self.assertEqual(trunk["lines"], limit, "the shared trunk carries exactly OUTBOUND_CHANNEL_LIMIT")
        self.assertEqual(sum(t["lines"] for t in platform["trunks"]), limit)
        self.assertEqual(snap["unattachedNumbers"], [])
        # A number added after the migration dials on the platform trunk by
        # fallback, and the next (idempotent) migration run attaches exactly it.
        fresh = f"+91230{str(int(time.time() * 1000))[-6:]}7"
        self.db.add_phone_number(fresh, self.a)
        self.assertEqual(self.tel.trunk_for_number(fresh)["id"], self.platform["trunk_id"])
        again = self.tel.ensure_platform_pool()
        self.assertEqual((again["pool_id"], again["trunk_id"], again["attached_numbers"]),
                         (self.platform["pool_id"], self.platform["trunk_id"], 1))
        self.assertEqual(self.tel.ensure_platform_pool()["attached_numbers"], 0)

    def test_allocation_is_refused_past_the_pool(self):
        pool = self.pool(4, reserve=1)  # 3 allocatable
        t1 = self.tel.allocate_lines(self.a, pool, 2, [self.num_a1])
        self.assertEqual((t1["lines"], t1["account_id"], t1["status"]), (2, self.a, "active"))
        self.assertEqual(self.tel.trunk_for_number(self.num_a1)["id"], t1["id"])
        with self.assertRaises(self.tel.OverSell):
            self.tel.allocate_lines(self.b, pool, 2, [self.num_b])
        t2 = self.tel.allocate_lines(self.b, pool, 1, [self.num_b])
        with self.assertRaises(self.tel.OverSell):
            self.tel.set_trunk_lines(t2["id"], 2)
        with self.assertRaises(self.tel.OverSell):
            self.tel.set_pool_capacity(pool, lines_bought=3)  # 3 allocated, would leave 2
        self.assertEqual(self.tel.set_pool_capacity(pool, lines_bought=8)["lines_bought"], 8)
        self.assertEqual(self.tel.set_trunk_lines(t2["id"], 4)["lines"], 4)
        # One line spare, so the refusal below is about ownership, not room.
        with self.assertRaises(ValueError):
            self.tel.allocate_lines(self.a, pool, 1, [self.num_b])  # not A's number

    def test_the_database_itself_refuses_an_oversell(self):
        pool = self.pool(3, reserve=1)  # 2 allocatable
        conn = self.db._connect()
        try:
            with conn:
                conn.execute("INSERT INTO trunks (account_id, pool_id, lines, status) VALUES (?, ?, 2, 'active')", (self.a, pool))
            with self.assertRaises(Exception) as ctx:
                with conn:
                    conn.execute("INSERT INTO trunks (account_id, pool_id, lines, status) VALUES (?, ?, 1, 'active')", (self.b, pool))
            self.assertIn("telephony_oversell", str(ctx.exception))
        finally:
            conn.close()

    def test_two_concurrent_sales_cannot_oversell(self):
        pool = self.pool(3, reserve=1)  # exactly 2 allocatable; each thread wants 2
        barrier = threading.Barrier(2)
        results: list = []

        def sell(account_id: int) -> None:
            barrier.wait()
            try:
                results.append(("ok", self.tel.allocate_lines(account_id, pool, 2)["id"]))
            except self.tel.OverSell as exc:
                results.append(("oversell", str(exc)))

        threads = [threading.Thread(target=sell, args=(acc,)) for acc in (self.a, self.b)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        self.assertEqual(sorted(r[0] for r in results), ["ok", "oversell"], results)
        snap = next(p for p in self.tel.capacity_snapshot()["pools"] if p["poolId"] == pool)
        self.assertEqual((snap["allocated"], snap["spare"]), (2, 0))

    def test_release_returns_the_lines_and_numbers_fall_back_to_the_platform_trunk(self):
        pool = self.pool(3, reserve=1)
        trunk = self.tel.allocate_lines(self.a, pool, 2, [self.num_a1, self.num_a2])
        out = self.tel.release_trunk(trunk["id"])
        self.assertEqual((out["released_lines"], out["numbers_moved"], out["fallback_trunk_id"]),
                         (2, 2, self.platform["trunk_id"]))
        self.assertEqual(self.tel.get_trunk(trunk["id"])["status"], "released")
        self.assertEqual(self.tel.trunk_for_number(self.num_a1)["id"], self.platform["trunk_id"])
        fresh = self.tel.allocate_lines(self.b, pool, 2, [self.num_b])
        self.assertEqual(fresh["lines"], 2, "the released lines are available again")
        with self.assertRaises(ValueError):
            self.tel.release_trunk(self.platform["trunk_id"])

    def test_inflight_by_trunk_matches_the_dialers_definition(self):
        pool = self.pool(4, reserve=1)
        trunk = self.tel.allocate_lines(self.a, pool, 2, [self.num_a1])
        conn = self.db._connect()
        try:
            with conn:
                cid = conn.execute(
                    "INSERT INTO campaigns (account_id, name, from_number, status, max_attempts, retry_minutes) "
                    "VALUES (?, 'Inflight test', ?, 'running', 1, 30) RETURNING id", (self.a, self.num_a1)).fetchone()["id"]
                shared = conn.execute(
                    "INSERT INTO campaigns (account_id, name, from_number, status, max_attempts, retry_minutes) "
                    "VALUES (?, 'Shared test', ?, 'running', 1, 30) RETURNING id", (self.b, self.num_b)).fetchone()["id"]
                for camp, phone, status in ((cid, "+919876000001", "calling"), (cid, "+919876000002", "calling"),
                                            (cid, "+919876000003", "pending"), (shared, "+919876000004", "calling")):
                    conn.execute(
                        "INSERT INTO campaign_contacts (campaign_id, account_id, name, phone, phone_norm, status) "
                        "VALUES (?, ?, 'x', ?, ?, ?)", (camp, self.a if camp == cid else self.b, phone, phone.lstrip("+"), status))
            inflight = self.tel.inflight_by_trunk()
            self.assertEqual(inflight.get(trunk["id"]), 2, "two 'calling' rows on A's trunk, the pending one not counted")
            # B's number dials on whichever trunk it sits on (another test may have moved it).
            b_trunk = self.tel.trunk_for_number(self.num_b)["id"]
            self.assertGreaterEqual(inflight.get(b_trunk, 0), 1, "B's live call counts against B's number's trunk")
            self.assertEqual(sum(inflight.values()), self.db.campaign_inflight_all())
            room = self.tel.trunk_room(trunk["id"])
            self.assertEqual((room["trunk_free"], room["pool_free"], room["free"]), (0, 1, 0))
        finally:
            with conn:
                conn.execute("DELETE FROM campaign_contacts WHERE campaign_id IN (?, ?)", (cid, shared))
                conn.execute("DELETE FROM campaigns WHERE id IN (?, ?)", (cid, shared))
            conn.close()

    def test_snapshot_numbers_add_up(self):
        pool = self.pool(5, reserve=2)  # 3 allocatable
        self.tel.allocate_lines(self.a, pool, 1)
        self.tel.allocate_lines(self.b, pool, 2)
        snap = next(p for p in self.tel.capacity_snapshot()["pools"] if p["poolId"] == pool)
        self.assertEqual((snap["linesBought"], snap["inboundReserved"], snap["allocatable"], snap["allocated"], snap["spare"]),
                         (5, 2, 3, 3, 0))
        self.assertEqual(sum(t["lines"] for t in snap["trunks"]), snap["allocated"])
        self.assertTrue(all(t["free"] == t["lines"] - t["inflight"] for t in snap["trunks"]))

    def test_secrets_are_never_stored_plaintext_without_the_opt_in(self):
        with mock.patch.dict(os.environ, {"TELEPHONY_ALLOW_PLAINTEXT_SECRETS": "", "META_ALLOW_PLAINTEXT_TOKENS": "",
                                          "INTEGRATION_ENCRYPTION_WRITE": ""}):
            self.assertFalse(self.tel.secret_storage_ok())
            with self.assertRaises(self.tel.SecretStorageUnavailable):
                self.tel.create_pool("byo_sip", 2, credentials="sip:user:pass@carrier")
            roomy = self.pool(5, reserve=1)
            with self.assertRaises(self.tel.SecretStorageUnavailable):
                self.tel.allocate_lines(self.a, roomy, 1, sip_address="sip.example")
            # Rows without a secret are still fine.
            self.assertEqual(self.tel.create_pool("byo_sip", 2)["has_credentials"], False)
        pool = self.tel.create_pool("byo_sip", 2, credentials="sip:user:pass@carrier", owner_account_id=self.a)
        self.assertTrue(pool["has_credentials"])
        self.assertNotIn("credentials", pool)

    def test_provider_interface_classifies_rejections_and_reports_costs(self):
        enablex = self.tel.get_provider("enablex")
        self.assertEqual(enablex.classify_rejection(503), "retry_later")
        self.assertEqual(enablex.classify_rejection("SIP 486 Busy Here"), "retry_later")
        self.assertEqual(enablex.classify_rejection("100 Trying then timed out"), "retry_later")
        self.assertEqual(enablex.classify_rejection(404), "failed")
        self.assertEqual(enablex.classify_rejection("Forbidden"), "failed")
        self.assertEqual(enablex.classify_rejection("something else"), "unknown")
        self.assertEqual(enablex.classify_rejection(None), "unknown")
        costs = enablex.costs()
        self.assertEqual((costs.per_line_month, costs.per_minute_out, costs.per_number_month), (500.0, 0.25, 300.0))
        self.assertEqual(enablex.provision_trunk(self.a, 3, [self.num_a1])["status"], "provisioning")
        self.assertEqual(self.tel.get_provider("byo_sip").provision_trunk(self.a, 3, [])["status"], "customer")
        with self.assertRaises(NotImplementedError):
            self.tel.get_provider("twilio").provision_trunk(self.a, 1, [])
        with self.assertRaises(ValueError):
            self.tel.get_provider("carrier-pigeon")


if __name__ == "__main__":
    unittest.main(verbosity=2)
