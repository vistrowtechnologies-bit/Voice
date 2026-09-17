"""Campaign 20 (2026-09-17, 3 concurrent, 16 real Meta-lead contacts) placed
every dial in a batch back-to-back with zero delay: three real calls landed
at 11:48:56.387/.388/.481, under 100ms apart. Checking the actual transcripts
afterward, the FIRST call placed in each near-simultaneous trio generally got
real caller audio through; the ones fired milliseconds later frequently
didn't - `callerStopToFirstAudioMs` was empty for the whole 35-50s call even
though the agent's own greeting played fine. Three LiveKit rooms plus three
STT/TTS/LLM pipelines cold-starting at the same instant is a real resource
spike; the operator heard it as crackling audio and calls that never really
connected. This covers the fix: individual dials within one tick must be
staggered, not fired in the same instant."""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import campaign_dialer


def _base_campaign(**overrides):
    campaign = {
        "id": 20, "account_id": 2, "from_number": "+917713128715",
        "agent_id": 26, "concurrency": 3,
    }
    campaign.update(overrides)
    return campaign


class DialsAreStaggered(unittest.TestCase):
    def setUp(self):
        self.clock = [1000.0]
        campaign_dialer._last_dial_at = 0.0

    def _sleep(self, s):
        self.sleeps.append(round(s, 6))
        self.clock[0] += s

    def _run(self, campaigns_with_contacts):
        """campaigns_with_contacts: list of (campaign, n_contacts), dialed in one tick."""
        self.sleeps, dial_times = [], []
        with patch.object(campaign_dialer, "calls_db") as mock_db, \
             patch.object(campaign_dialer.time, "sleep", side_effect=self._sleep), \
             patch.object(campaign_dialer.time, "monotonic", side_effect=lambda: self.clock[0]), \
             patch.object(campaign_dialer, "_on_orchestrator_pipeline", return_value=False):
            mock_db.require_feature.return_value = None
            mock_db.within_calling_window.return_value = (True, "")
            mock_db.campaign_inflight.return_value = 0
            mock_db.reap_stale_campaign_calls.return_value = 0
            mock_db.concurrent_call_limit.return_value = 30
            mock_db.count_active_calls.return_value = 0
            mock_db.place_outbound_call_direct.side_effect = lambda *a, **k: dial_times.append(self.clock[0]) or {"ok": True}
            mock_db.campaign_has_open_work.return_value = False
            for campaign, n in campaigns_with_contacts:
                contacts = [{"id": i, "phone": f"+9190000{i}", "name": f"l{i}"} for i in range(n)]
                mock_db.claim_next_campaign_contact.side_effect = lambda _cid, c=contacts: c.pop(0) if c else None
                campaign_dialer._dial_one(campaign)
        return dial_times

    def test_three_concurrent_dials_are_staggered_not_simultaneous(self):
        times = self._run([(_base_campaign(), 3)])
        self.assertEqual(len(times), 3)
        self.assertEqual([b - a for a, b in zip(times, times[1:])], [campaign_dialer._DIAL_STAGGER_SECONDS] * 2)

    def test_a_single_dial_is_never_delayed(self):
        self.assertEqual(len(self._run([(_base_campaign(), 1)])), 1)
        self.assertEqual(self.sleeps, [])

    def test_running_out_of_contacts_early_stops_staggering_too(self):
        self._run([(_base_campaign(concurrency=3), 1)])
        self.assertEqual(self.sleeps, [])

    def test_stagger_is_global_across_campaigns(self):
        # EnableX: CPS is enforced on the whole trunk. Six campaigns with one
        # due contact each must not produce six INVITEs in the same instant.
        campaigns = [(_base_campaign(id=100 + i), 1) for i in range(6)]
        times = self._run(campaigns)
        self.assertEqual(len(times), 6)
        gaps = [b - a for a, b in zip(times, times[1:])]
        self.assertTrue(all(g >= campaign_dialer._DIAL_STAGGER_SECONDS for g in gaps), gaps)

    def test_no_wait_when_last_dial_was_long_ago(self):
        campaign_dialer._last_dial_at = self.clock[0] - 60
        self._run([(_base_campaign(), 1)])
        self.assertEqual(self.sleeps, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
