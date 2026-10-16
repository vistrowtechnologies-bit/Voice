"""Per-agent "call a new lead after" setting (16 Oct 2026).

Owner's request: choose when a new lead gets its first automatic call:
immediately, 30 s, 1 min, 2 min, 5 min or 10 min. A "Call now" request from
the CRM is never delayed. The delay is a next_attempt_at on the queued contact,
which the dialer already honours for pending rows.

DB tests run against a throwaway Postgres (TEST_DATABASE_URL), never the repo
.env."""
import asyncio
import datetime
import json
import os
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import retry_rules
from test_instant_lead_calls import FACEBOOK_LEAD, TEST_DB, _request, _token_api_namespace


class Policy(unittest.TestCase):
    def test_default_is_immediately(self):
        self.assertEqual(retry_rules.follow_up_policy(None)["firstCallDelaySeconds"], 0)
        self.assertEqual(retry_rules.follow_up_policy("")["firstCallDelaySeconds"], 0)

    def test_allowed_choices_are_kept(self):
        for seconds in (0, 30, 60, 120, 300, 600):
            raw = json.dumps({"firstCallDelaySeconds": seconds})
            self.assertEqual(retry_rules.follow_up_policy(raw)["firstCallDelaySeconds"], seconds)

    def test_anything_else_falls_back_to_immediately(self):
        for bad in (45, -30, 3600, "60", 60.0, True, None, [60]):
            raw = json.dumps({"firstCallDelaySeconds": bad})
            self.assertEqual(retry_rules.follow_up_policy(raw)["firstCallDelaySeconds"], 0, bad)

    def test_other_settings_are_untouched(self):
        raw = json.dumps({"firstCallDelaySeconds": 300, "maxAttempts": 5, "busyMinutes": 15})
        policy = retry_rules.follow_up_policy(raw)
        self.assertEqual((policy["maxAttempts"], policy["busyMinutes"]), (5, 15))


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class QueuedLead(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db

        cls.db = calls_db
        calls_db.init_tables()

    def sql(self, query, params=()):
        conn = self.db._connect()
        with conn:
            cur = conn.execute(query, params)
            row = cur.fetchone() if ("RETURNING" in query.upper() or query.lstrip().upper().startswith("SELECT")) else None
        conn.close()
        return row

    def setUp(self):
        stamp = os.urandom(4).hex()
        self.aid = self.db.create_account_with_owner("A", "A", f"d-{stamp}@example.com", "h", email_verified=True)["account_id"]
        kb = self.sql("INSERT INTO knowledge_bases (account_id, name) VALUES (?, 'Khopoli') RETURNING id", (self.aid,))["id"]
        self.agent = self.sql(
            "INSERT INTO agents (account_id, name, status, kb_id) VALUES (?, 'Siya', 'live', ?) RETURNING id",
            (self.aid, kb),
        )["id"]
        self.sql("INSERT INTO phone_numbers (account_id, number, agent_id, status) VALUES (?, ?, ?, 'active')",
                 (self.aid, f"+9180{int.from_bytes(os.urandom(4), 'big') % 10**8:08d}", self.agent))
        # Calling hours off, so only the delay decides when the call happens.
        self.db.save_compliance(self.aid, {"enforce_window": False})

    def set_delay(self, seconds):
        self.sql("UPDATE agents SET follow_up_policy = ? WHERE id = ?",
                 (json.dumps({"firstCallDelaySeconds": seconds}), self.agent))

    def deliver(self, **extra):
        dialer = Mock()
        ns = _token_api_namespace(self.db, dialer)
        body = {**FACEBOOK_LEAD, "lead_id": os.urandom(6).hex(), "agent_id": str(self.agent), **extra}
        result = asyncio.run(ns["leads_inbound"](self.aid, _request(body, self.db.get_or_create_lead_webhook_token(self.aid))))
        self.assertTrue(result.get("queued"), result)
        row = self.sql("SELECT campaign_id, next_attempt_at FROM campaign_contacts WHERE id = ?", (result["contact_id"],))
        return result, row, dialer

    def utc(self, text):
        return datetime.datetime.strptime(text, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)

    def test_immediately_by_default(self):
        result, row, dialer = self.deliver()
        self.assertIsNone(row["next_attempt_at"])
        self.assertNotIn("delay_seconds", result)
        self.assertNotIn("queued_until", result)
        dialer.notify.assert_called_once_with()
        dialer.notify_after.assert_not_called()

    def test_one_minute_delay_holds_the_first_call(self):
        self.set_delay(60)
        before = datetime.datetime.now(datetime.timezone.utc)
        result, row, dialer = self.deliver()
        due = self.utc(row["next_attempt_at"])
        self.assertAlmostEqual((due - before).total_seconds(), 60, delta=5)
        self.assertEqual(result["delay_seconds"], 60)
        queued_until = datetime.datetime.fromisoformat(result["queued_until"])
        self.assertAlmostEqual((queued_until - before).total_seconds(), 60, delta=5)
        dialer.notify_after.assert_called_once_with(60)
        dialer.notify.assert_not_called()
        # The real dialer query does not pick it up yet ...
        self.assertIsNone(self.db.claim_next_campaign_contact(row["campaign_id"]))
        # ... and does once the delay is over.
        self.sql("UPDATE campaign_contacts SET next_attempt_at = ? WHERE id = ?",
                 ((before - datetime.timedelta(seconds=1)).strftime("%Y-%m-%d %H:%M:%S"), result["contact_id"]))
        claimed = self.db.claim_next_campaign_contact(row["campaign_id"])
        self.assertIsNotNone(claimed)
        self.assertEqual(claimed["id"], result["contact_id"])

    def test_call_now_from_the_crm_is_never_delayed(self):
        self.set_delay(300)
        result, row, dialer = self.deliver(custom_fields={**FACEBOOK_LEAD["custom_fields"], "call_request": True})
        self.assertIsNone(row["next_attempt_at"])
        self.assertNotIn("delay_seconds", result)
        dialer.notify.assert_called_once_with()

    def test_calling_hours_win_when_they_open_later(self):
        self.set_delay(30)
        # Calling hours closed every day except a far-away window: the window
        # opening is later than the 30 s delay, so it is what the CRM is told.
        self.db.save_compliance(self.aid, {
            "timezone": "Asia/Kolkata", "window_start": "09:00", "window_end": "09:01",
            "active_days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "enforce_window": True,
        })
        opens = self.db.next_calling_window_open(self.aid)
        if opens is None:  # the test happens to run inside 09:00-09:01 IST
            self.skipTest("inside the one-minute window")
        result, _row, _dialer = self.deliver()
        self.assertEqual(result["queued_until"], opens.isoformat())


if __name__ == "__main__":
    unittest.main()
