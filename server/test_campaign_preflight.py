"""Pre-flight and test dial (Phase 1).

Campaign 20 (2026-09-17) launched straight at 16 real leads with nothing
checked first, and there was no way to check: no report of what would happen,
and no way to rehearse against your own phone. These pin both, including the
rule that a test dial can never touch campaign progress.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import calls_db

CAMPAIGN = {"id": 20, "account_id": 2, "name": "Meta leads", "from_number": "+917713128715",
            "agent_id": 26, "concurrency": 3}


class FakeConn:
    def __init__(self, campaign, contacts):
        self.campaign, self.contacts = campaign, contacts

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def close(self):
        pass

    def execute(self, sql, params=()):
        cur = MagicMock()
        if "FROM campaigns" in sql:
            cur.fetchone.return_value = self.campaign
        elif "FROM campaign_contacts" in sql:
            cur.fetchone.return_value = self.contacts[0] if self.contacts else None
            cur.fetchall.return_value = self.contacts
        else:
            cur.fetchone.return_value = None
            cur.fetchall.return_value = []
        return cur


def contacts(n, status="pending", phone="+919900000000"):
    return [{"id": i, "name": f"lead{i}", "phone": phone, "status": status} for i in range(n)]


def run_preflight(campaign=None, rows=None, dnc=(), window=(True, ""), channel_limit=2, owned=True):
    conn = FakeConn(campaign if campaign is not None else dict(CAMPAIGN), rows if rows is not None else contacts(16))
    numbers = [{"number": "+917713128715"}] if owned else []
    with patch.object(calls_db, "_connect", return_value=conn), \
         patch.object(calls_db, "list_phone_numbers", return_value=numbers), \
         patch.object(calls_db, "get_phone_number_by_number", return_value={"agentId": 26}), \
         patch.object(calls_db, "within_calling_window", return_value=window), \
         patch.object(calls_db, "is_dnc", side_effect=lambda a, p: p in dnc):
        return calls_db.campaign_preflight(20, 2, channel_limit=channel_limit)


class Preflight(unittest.TestCase):
    def test_a_healthy_campaign_can_launch(self):
        r = run_preflight()
        self.assertTrue(r["canLaunch"])
        self.assertEqual(r["dialable"], 16)
        self.assertEqual(r["blockers"], [])

    def test_concurrency_is_clamped_to_available_channels(self):
        r = run_preflight(channel_limit=2)
        self.assertEqual(r["requestedConcurrency"], 3)
        self.assertEqual(r["effectiveConcurrency"], 2)
        self.assertTrue(any("channel" in w for w in r["warnings"]))

    def test_dnc_contacts_are_counted_out_before_launch(self):
        rows = contacts(3) + [{"id": 9, "name": "opted out", "phone": "+918888888888", "status": "pending"}]
        r = run_preflight(rows=rows, dnc={"+918888888888"})
        self.assertEqual(r["onDnc"], 1)
        self.assertEqual(r["dialable"], 3)
        self.assertTrue(r["canLaunch"])

    def test_contacts_without_a_usable_number_are_reported(self):
        rows = contacts(2) + [{"id": 9, "name": "bad", "phone": "not-a-number", "status": "pending"}]
        r = run_preflight(rows=rows)
        self.assertEqual(r["missingPhone"], 1)
        self.assertEqual(r["dialable"], 2)

    def test_closed_calling_window_warns_but_does_not_block(self):
        r = run_preflight(window=(False, "Outside the allowed calling window (09:00-21:00 Asia/Kolkata)."))
        self.assertFalse(r["windowOpen"])
        self.assertTrue(r["canLaunch"])
        self.assertTrue(any("window" in w for w in r["warnings"]))

    def test_already_dialled_contacts_are_not_counted_as_work(self):
        r = run_preflight(rows=contacts(16, status="done"))
        self.assertEqual(r["dialable"], 0)
        self.assertFalse(r["canLaunch"])

    def test_estimate_accounts_for_ring_time_not_just_talk_time(self):
        r = run_preflight(rows=contacts(16), channel_limit=2)
        # 16 attempts x (0.75x30s ring + 0.25x50s talk) / 2 channels = 280s
        self.assertAlmostEqual(r["estimatedMinutes"], 4.7, places=1)

    def test_missing_number_agent_or_contacts_block_the_launch(self):
        self.assertFalse(run_preflight(campaign=dict(CAMPAIGN, from_number=""))["canLaunch"])
        self.assertFalse(run_preflight(rows=[])["canLaunch"])
        foreign = run_preflight(owned=False)
        self.assertFalse(foreign["canLaunch"])
        self.assertIn("not one of your numbers", " ".join(foreign["blockers"]))

    def test_unknown_campaign_returns_none(self):
        conn = FakeConn(None, [])
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertIsNone(calls_db.campaign_preflight(999, 2))


class TestDial(unittest.TestCase):
    def _dial(self, numbers, allowed=(True, ""), campaign=None):
        conn = FakeConn(campaign if campaign is not None else dict(CAMPAIGN),
                        [{"name": "lead0", "phone": "+91990", "company": "Acme", "custom_fields": "{}"}])
        with patch.object(calls_db, "_connect", return_value=conn), \
             patch.object(calls_db, "get_phone_number_by_number", return_value={"agentId": 26}), \
             patch.object(calls_db, "check_call_allowed", return_value=allowed), \
             patch.object(calls_db, "place_outbound_call_direct", return_value={"ok": True, "room": "r"}) as place:
            return calls_db.campaign_test_dial(20, 2, numbers), place

    def test_test_dial_never_touches_campaign_progress(self):
        _, place = self._dial(["+919812345678"])
        kwargs = place.call_args.kwargs
        self.assertTrue(kwargs["is_test"], "must not be billed or logged as a real call")
        self.assertNotIn("campaign_contact_id", kwargs)
        self.assertNotIn("campaign_id", kwargs)

    def test_it_uses_the_campaigns_own_agent_number_and_variables(self):
        _, place = self._dial(["+919812345678"])
        self.assertEqual(place.call_args.args[1], "+917713128715")
        self.assertEqual(place.call_args.args[3], 26)
        self.assertEqual(place.call_args.kwargs["contact_company"], "Acme")

    def test_five_numbers_is_the_ceiling(self):
        result, place = self._dial([f"+91981234567{i}" for i in range(6)])
        self.assertFalse(result["ok"])
        self.assertIn("5", result["error"])
        place.assert_not_called()

    def test_dnc_and_calling_window_still_apply(self):
        result, place = self._dial(["+919812345678"], allowed=(False, "This number is on your Do-Not-Call list."))
        place.assert_not_called()
        self.assertTrue(result["results"][0]["blocked"])

    def test_no_numbers_is_rejected(self):
        result, place = self._dial(["", "  "])
        self.assertFalse(result["ok"])
        place.assert_not_called()

    def test_campaign_without_a_number_cannot_test_dial(self):
        result, place = self._dial(["+919812345678"], campaign=dict(CAMPAIGN, from_number=""))
        self.assertFalse(result["ok"])
        place.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
