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


class CallerIdRotation(unittest.TestCase):
    """A number that has rung the same person twice is easier for a carrier to
    flag, so retries can move to the next caller ID. Off unless configured."""

    POOL = {"from_number": "+917713128715", "from_numbers": "+917713128717,+917713128718"}

    def test_single_number_campaign_never_rotates(self):
        campaign = {"from_number": "+917713128715", "from_numbers": ""}
        for attempts in range(4):
            self.assertEqual(calls_db.campaign_caller_id(campaign, attempts), "+917713128715")

    def test_first_attempt_always_uses_the_primary_number(self):
        self.assertEqual(calls_db.campaign_caller_id(self.POOL, 0), "+917713128715")

    def test_each_retry_moves_to_the_next_number(self):
        self.assertEqual(calls_db.campaign_caller_id(self.POOL, 1), "+917713128717")
        self.assertEqual(calls_db.campaign_caller_id(self.POOL, 2), "+917713128718")

    def test_it_wraps_back_round(self):
        self.assertEqual(calls_db.campaign_caller_id(self.POOL, 3), "+917713128715")

    def test_primary_listed_twice_is_not_dialled_twice_in_a_row(self):
        campaign = {"from_number": "+917713128715", "from_numbers": "+917713128715,+917713128717"}
        self.assertEqual(calls_db.campaign_caller_id(campaign, 0), "+917713128715")
        self.assertEqual(calls_db.campaign_caller_id(campaign, 1), "+917713128717")

    def test_junk_values_fall_back_to_the_primary(self):
        for attempts in (None, "x", -2):
            self.assertEqual(calls_db.campaign_caller_id(self.POOL, attempts), "+917713128715")
        self.assertEqual(calls_db.campaign_caller_id({"from_number": "+91771", "from_numbers": " , ,"}, 5), "+91771")


class ConsentBasis(unittest.TestCase):
    """Why a tenant may call this audience. India's TCCCPR treats a call
    someone invited very differently from one they did not, so the answer has
    to be recorded when the campaign is built — not reconstructed later."""

    def test_missing_basis_is_flagged_but_does_not_block(self):
        r = run_preflight(campaign=dict(CAMPAIGN, consent_basis=""))
        self.assertTrue(r["canLaunch"])
        self.assertTrue(any("consent basis" in w for w in r["warnings"]), r["warnings"])
        self.assertEqual(r["consentBasisLabel"], "Not stated")

    def test_an_invited_audience_is_not_flagged(self):
        r = run_preflight(campaign=dict(CAMPAIGN, consent_basis="inquiry"))
        self.assertEqual(r["consentBasis"], "inquiry")
        self.assertEqual(r["consentBasisLabel"], "They enquired with us")
        self.assertFalse(any("consent" in w for w in r["warnings"]), r["warnings"])

    def test_a_bought_list_is_called_out_as_promotional(self):
        r = run_preflight(campaign=dict(CAMPAIGN, consent_basis="list"))
        warning = " ".join(r["warnings"])
        self.assertIn("140-series", warning)
        self.assertIn("scrubbing", warning)

    def test_every_basis_has_a_readable_label(self):
        for key in calls_db.CONSENT_BASES:
            self.assertTrue(calls_db.consent_basis_label(key))
        self.assertEqual(calls_db.consent_basis_label("something-else"), "something-else")
        self.assertEqual(calls_db.consent_basis_label(None), "Not stated")
