"""Recording share links (expiry, revoke, workspace deletion, headers, rate
limit) and the retention purge of call-derived data. The SQL half runs against
a throwaway Postgres (TEST_DATABASE_URL); see
docs/RECORDING-LINKS-AND-RETENTION-FINDINGS-2026-10-13.md for why."""
import datetime
import os
import re
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from test_plan_policy import function_from_file  # noqa: E402

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TOKEN_API = Path(__file__).resolve().parent / "token_api.py"
UTC = datetime.timezone.utc


class PublicRouteTests(unittest.TestCase):
    def test_public_recording_routes_get_private_noindex_noreferrer_headers(self):
        headers = function_from_file(TOKEN_API, "_public_recording_headers", {})
        h = headers("/public/calls/5/recording")
        self.assertEqual(h["Cache-Control"], "private, no-store")
        self.assertEqual(h["Referrer-Policy"], "no-referrer")
        self.assertIn("noindex", h["X-Robots-Tag"])
        self.assertEqual(headers("/public/calls/5/play"), h)
        self.assertEqual(headers("/calls/5/recording"), {})
        # Applied last, in the outermost middleware, so nothing overwrites it.
        source = TOKEN_API.read_text()
        middleware = source[source.index("async def _security_headers("):]
        middleware = middleware[:middleware.index("\n    return response")]
        self.assertIn("_public_recording_headers(request.url.path)", middleware)

    def test_both_public_routes_are_rate_limited(self):
        source = TOKEN_API.read_text()
        for name in ("get_shared_call_recording", "play_shared_call_recording"):
            body = source[source.index(f"def {name}("):]
            body = body[:body.index("\n@app.")]
            self.assertIn("_refuse_if_recording_link_flood(request)", body)

    def test_flood_guard_answers_429(self):
        class HTTPException(Exception):
            def __init__(self, status, detail):
                self.status = status
        ns = {"_limited": MagicMock(return_value=True), "_client_ip": lambda r: "1.2.3.4",
              "HTTPException": HTTPException, "_RECORDING_LINK_MAX_PER_MINUTE": 120, "Request": object}
        guard = function_from_file(TOKEN_API, "_refuse_if_recording_link_flood", ns)
        with self.assertRaises(HTTPException) as ctx:
            guard(object())
        self.assertEqual(ctx.exception.status, 429)
        ns["_limited"].assert_called_once_with("recording-link", "1.2.3.4", 120, 60)
        ns["_limited"].return_value = False
        guard(object())  # under the cap: no exception

    def test_revoke_is_admin_only_audited_and_blocked_in_view_as(self):
        source = TOKEN_API.read_text()
        route = source[source.index('@app.post("/storage/recordings/revoke-links")'):]
        route = route[:route.index("\n\n\n")]
        self.assertIn('require_role("admin")', route)
        self.assertIn("write_audit(", route)
        start = source.index("_SUPPORT_BLOCKED_PATHS = re.compile(")
        ns = {"re": re}
        exec(source[start:source.index("\n)\n", start) + 3], ns)
        self.assertTrue(ns["_SUPPORT_BLOCKED_PATHS"].match("/storage/recordings/revoke-links"))

    def test_revoke_route_calls_db_and_writes_audit(self):
        db, audit = MagicMock(), MagicMock()
        db.revoke_recording_links.return_value = 3
        ns = {"calls_db": db, "admin_db": audit, "logger": MagicMock(), "Depends": lambda x: x,
              "require_role": lambda r: r}
        route = function_from_file(TOKEN_API, "revoke_recording_links", ns)
        self.assertEqual(route({"user_id": 7, "account_id": 4}), {"revoked": 3})
        db.revoke_recording_links.assert_called_once_with(4)
        self.assertEqual(audit.write_audit.call_args.args[2:4], ("revoke_recording_links", 4))
        db.record_security_event.assert_called_once_with(7, "recording_links_revoked")


class ExpiryRuleTests(unittest.TestCase):
    def setUp(self):
        import calls_db
        self.db = calls_db
        self.now = datetime.datetime(2026, 10, 13, 12, 0, tzinfo=UTC)

    def expired(self, days, started_at):
        with patch.object(self.db, "get_compliance", return_value={"recording_link_expiry_days": days}):
            return self.db.recording_link_expired(1, started_at, now=self.now)

    def test_expiry_days_after_call_start(self):
        self.assertFalse(self.expired(90, "2026-08-01T10:00:00+00:00"))   # 73 days
        self.assertTrue(self.expired(30, "2026-08-01T10:00:00+00:00"))
        self.assertTrue(self.expired(7, "2026-10-06 11:59:00"))            # naive = UTC, just over 7 days
        self.assertFalse(self.expired(7, "2026-10-06 12:01:00"))
        self.assertFalse(self.expired(0, "2020-01-01T00:00:00+00:00"))     # never

    def test_unreadable_start_refuses(self):
        self.assertTrue(self.expired(90, "not a date"))

    def test_default_is_90_and_only_listed_choices_save(self):
        self.assertEqual(self.db._COMPLIANCE_DEFAULTS["recording_link_expiry_days"], 90)
        base = dict(self.db._COMPLIANCE_DEFAULTS)
        for ok in (0, 7, 30, 90, "30"):
            self.assertIsNone(self.db._compliance_error({**base, "recording_link_expiry_days": ok}))
        for bad in (1, 45, -7, None, "abc"):
            self.assertIn("Recording link expiry", self.db._compliance_error({**base, "recording_link_expiry_days": bad}))


def _ts(days_ago: float) -> str:
    return (datetime.datetime.now(UTC) - datetime.timedelta(days=days_ago)).isoformat()


def _sql_ts(days_ago: float) -> str:
    return (datetime.datetime.now(UTC) - datetime.timedelta(days=days_ago)).strftime("%Y-%m-%d %H:%M:%S")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class DatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()

    def setUp(self):
        stamp = os.urandom(4).hex()
        self.a = self.db.create_account_with_owner("A", "A", f"a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        self.b = self.db.create_account_with_owner("B", "B", f"b-{stamp}@example.com", "h", email_verified=True)["account_id"]

    def sql(self, query, params=()):
        conn = self.db._connect()
        try:
            with conn:
                cur = conn.execute(query, params)
                try:
                    return cur.fetchall()
                except Exception:
                    return None
        finally:
            conn.close()

    def call(self, account, days_ago=1, token=None, key="auto", legacy=0, phone=""):
        token = token or os.urandom(8).hex()
        cid = self.sql(
            "INSERT INTO calls (account_id, room_name, started_at, ended_at, transcript_json, "
            "recording_share_token, recording_key, recording_link_no_expiry, lead_phone) "
            "VALUES (?, 'r', ?, ?, '[]', ?, ?, ?, ?) RETURNING id",
            (account, _ts(days_ago), _ts(days_ago), token, None, legacy, phone),
        )[0]["id"]
        if key:
            key = f"recordings/{account}/{cid}.wav" if key == "auto" else key
            self.sql("UPDATE calls SET recording_key = ? WHERE id = ?", (key, cid))
        return cid, token

    def set_compliance(self, account, **values):
        self.db.save_compliance(account, values)

    # ---- links

    def test_new_link_follows_expiry_and_legacy_link_keeps_working(self):
        old_new, t1 = self.call(self.a, days_ago=100)
        old_legacy, t2 = self.call(self.a, days_ago=400, legacy=1)
        fresh, t3 = self.call(self.a, days_ago=5)
        get = self.db.get_shared_call_recording_key
        self.assertIsNone(get(old_new, t1), "default 90 days: a 100-day-old link is dead")
        self.assertIsNotNone(get(old_legacy, t2), "grandfathered link still plays")
        self.assertIsNotNone(get(fresh, t3))
        self.set_compliance(self.a, recording_link_expiry_days=0)
        self.assertIsNotNone(get(old_new, t1), "never = no expiry")
        self.set_compliance(self.a, recording_link_expiry_days=7)
        self.assertIsNotNone(get(fresh, t3))
        self.assertIsNone(get(fresh, "wrong-token"))

    def test_link_dies_with_recording_or_call_or_workspace(self):
        cid, token = self.call(self.a, legacy=1)
        self.sql("UPDATE calls SET recording_key = NULL WHERE id = ?", (cid,))
        self.assertIsNone(self.db.get_shared_call_recording_key(cid, token))
        cid2, token2 = self.call(self.a, legacy=1)
        self.sql("DELETE FROM calls WHERE id = ?", (cid2,))
        self.assertIsNone(self.db.get_shared_call_recording_key(cid2, token2))
        orphan, token3 = self.call(10_000_000 + int(os.urandom(2).hex(), 16), legacy=1)
        self.assertIsNone(self.db.get_shared_call_recording_key(orphan, token3), "no account row, no playback")

    def test_revoke_all_stops_every_link_of_one_account_only(self):
        a1, ta1 = self.call(self.a, legacy=1)
        a2, ta2 = self.call(self.a)
        b1, tb1 = self.call(self.b, legacy=1)
        self.assertEqual(self.db.revoke_recording_links(self.a), 2)
        self.assertIsNone(self.db.get_shared_call_recording_key(a1, ta1))
        self.assertIsNone(self.db.get_shared_call_recording_key(a2, ta2))
        self.assertIsNotNone(self.db.get_shared_call_recording_key(b1, tb1))
        self.assertEqual(self.db.revoke_recording_links(self.a), 0, "idempotent")
        # A manual re-send mints a new link that follows the expiry setting.
        new_token = self.db.ensure_call_recording_share_token(a1, self.a)
        self.assertNotEqual(new_token, ta1)
        self.assertIsNotNone(self.db.get_shared_call_recording_key(a1, new_token))
        self.assertEqual(self.sql("SELECT recording_link_no_expiry FROM calls WHERE id = ?", (a1,))[0]["recording_link_no_expiry"], 0)

    def test_migration_grandfathers_only_existing_links(self):
        self.sql("ALTER TABLE calls DROP COLUMN recording_link_no_expiry")
        try:
            before = self.sql(
                "INSERT INTO calls (account_id, room_name, started_at, ended_at, transcript_json, recording_share_token) "
                "VALUES (?, 'r', ?, ?, '[]', 'tok-before') RETURNING id", (self.a, _ts(1), _ts(1)))[0]["id"]
            untokened = self.sql(
                "INSERT INTO calls (account_id, room_name, started_at, ended_at, transcript_json) "
                "VALUES (?, 'r', ?, ?, '[]') RETURNING id", (self.a, _ts(1), _ts(1)))[0]["id"]
        finally:
            self.db.init_tables()
        self.db.init_tables()  # a second start must not grandfather anything new
        after, _ = self.call(self.a)
        flags = {r["id"]: r["recording_link_no_expiry"] for r in self.sql(
            "SELECT id, recording_link_no_expiry FROM calls WHERE id IN (?, ?, ?)", (before, untokened, after))}
        self.assertEqual(flags, {before: 1, untokened: 0, after: 0})

    # ---- retention

    def test_purge_removes_calls_audio_memory_and_delivery_logs_but_not_business_records(self):
        self.set_compliance(self.a, retention_days=30)
        old, _ = self.call(self.a, days_ago=40, phone="+919000000001")
        old_no_audio, _ = self.call(self.a, days_ago=45, key=None)
        recent, _ = self.call(self.a, days_ago=5)
        other_tenant_old, _ = self.call(self.b, days_ago=400)
        agent = int(os.urandom(3).hex(), 16)  # caller_memory is unique per (agent, phone) across tenants
        self.sql("INSERT INTO caller_memory (account_id, agent_id, caller_phone, summary, updated_at) VALUES (?, ?, '+919000000001', 'old', ?)",
                 (self.a, agent, _sql_ts(40)))
        self.sql("INSERT INTO caller_memory (account_id, agent_id, caller_phone, summary, updated_at) VALUES (?, ?, '+919000000002', 'new', ?)",
                 (self.a, agent, _sql_ts(2) + ".123456"))
        self.sql("INSERT INTO integration_deliveries (account_id, key, status, lead_name, call_id, created_at) VALUES (?, 'sheets', 'sent', 'X', ?, ?)",
                 (self.a, old, _sql_ts(1)))
        self.sql("INSERT INTO integration_deliveries (account_id, key, status, lead_name, created_at) VALUES (?, 'webhook', 'sent', 'Y', ?)",
                 (self.a, _sql_ts(35)))
        self.sql("INSERT INTO integration_deliveries (account_id, key, status, lead_name, call_id, created_at) VALUES (?, 'sheets', 'sent', 'Z', ?, ?)",
                 (self.a, recent, _sql_ts(1)))
        self.sql("INSERT INTO contacts (account_id, name, phone, source) VALUES (?, 'Kept', '+919000000001', 'call')", (self.a,))
        removed = []

        def remove(keys):
            removed.extend(keys)
            return set(keys)
        with patch.object(self.db, "_remove_recording_objects", side_effect=remove):
            self.assertEqual(self.db.purge_expired_calls(self.a), 2)
            self.assertEqual(self.db.purge_expired_calls(self.a), 0, "idempotent")
        self.assertEqual(removed, [f"recordings/{self.a}/{old}.wav"])
        ids = {r["id"] for r in self.sql("SELECT id FROM calls WHERE id IN (?, ?, ?, ?)", (old, old_no_audio, recent, other_tenant_old))}
        self.assertEqual(ids, {recent, other_tenant_old})
        self.assertEqual([r["summary"] for r in self.sql("SELECT summary FROM caller_memory WHERE account_id = ?", (self.a,))], ["new"])
        self.assertEqual([r["lead_name"] for r in self.sql("SELECT lead_name FROM integration_deliveries WHERE account_id = ?", (self.a,))], ["Z"])
        self.assertEqual(len(self.sql("SELECT 1 FROM contacts WHERE account_id = ?", (self.a,))), 1, "business records stay")

    def test_audio_that_cannot_be_deleted_keeps_its_row_for_the_next_run(self):
        self.set_compliance(self.a, retention_days=30)
        stuck, _ = self.call(self.a, days_ago=40)
        fine, _ = self.call(self.a, days_ago=41)
        stuck_key = f"recordings/{self.a}/{stuck}.wav"
        with patch.object(self.db, "_remove_recording_objects", side_effect=lambda keys: set(keys) - {stuck_key}):
            self.assertEqual(self.db.purge_expired_calls(self.a), 1)
        self.assertEqual([r["id"] for r in self.sql("SELECT id FROM calls WHERE id IN (?, ?)", (stuck, fine))], [stuck])
        with patch.object(self.db, "_remove_recording_objects", side_effect=lambda keys: set(keys)):
            self.assertEqual(self.db.purge_expired_calls(self.a), 1, "retried and removed next run")

    def test_storage_down_entirely_does_not_loop_or_delete(self):
        self.set_compliance(self.a, retention_days=30)
        stuck, _ = self.call(self.a, days_ago=40)
        with patch.object(self.db, "_remove_recording_objects", return_value=set()) as remove:
            self.assertEqual(self.db.purge_expired_calls(self.a), 0)
        self.assertEqual(remove.call_count, 1)
        self.assertEqual(len(self.sql("SELECT 1 FROM calls WHERE id = ?", (stuck,))), 1)

    def test_purge_works_in_batches(self):
        self.set_compliance(self.a, retention_days=30)
        made = [self.call(self.a, days_ago=40 + i)[0] for i in range(5)]
        calls_seen = []
        with patch.object(self.db, "_PURGE_BATCH", 2), \
             patch.object(self.db, "_remove_recording_objects", side_effect=lambda keys: calls_seen.append(len(keys)) or set(keys)):
            self.assertEqual(self.db.purge_expired_calls(self.a), 5)
        self.assertEqual(calls_seen, [2, 2, 1])
        self.assertEqual(self.sql("SELECT COUNT(*) AS n FROM calls WHERE id IN (?, ?, ?, ?, ?)", tuple(made))[0]["n"], 0)

    def test_retention_off_touches_nothing(self):
        old, _ = self.call(self.a, days_ago=4000)
        with patch.object(self.db, "_remove_recording_objects") as remove:
            self.assertEqual(self.db.purge_expired_calls(self.a), 0)
        remove.assert_not_called()
        self.assertEqual(len(self.sql("SELECT 1 FROM calls WHERE id = ?", (old,))), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
