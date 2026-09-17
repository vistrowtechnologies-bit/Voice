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


class DialsWithinATickAreStaggered(unittest.TestCase):
    def _run_with_contacts(self, n_contacts):
        contacts = [
            {"id": i, "phone": f"+91900000000{i}", "name": f"lead{i}"}
            for i in range(n_contacts)
        ]

        def claim(_cid):
            return contacts.pop(0) if contacts else None

        sleeps = []
        with patch.object(campaign_dialer, "calls_db") as mock_db, \
             patch.object(campaign_dialer.time, "sleep", side_effect=lambda s: sleeps.append(s)), \
             patch.object(campaign_dialer, "_on_orchestrator_pipeline", return_value=False):
            mock_db.require_feature.return_value = None
            mock_db.within_calling_window.return_value = (True, "")
            mock_db.campaign_inflight.return_value = 0
            mock_db.concurrent_call_limit.return_value = 30
            mock_db.count_active_calls.return_value = 0
            mock_db.claim_next_campaign_contact.side_effect = claim
            mock_db.place_outbound_call_direct.return_value = {"ok": True}
            mock_db.campaign_has_open_work.return_value = False
            campaign_dialer._dial_one(_base_campaign())
        return sleeps, mock_db

    def test_three_concurrent_dials_are_staggered_not_simultaneous(self):
        sleeps, mock_db = self._run_with_contacts(3)
        # 3 dials placed, but only 2 gaps between them - never a sleep before
        # the very first one (that would just slow down every tick for
        # nothing).
        self.assertEqual(mock_db.place_outbound_call_direct.call_count, 3)
        self.assertEqual(sleeps, [campaign_dialer._DIAL_STAGGER_SECONDS] * 2)

    def test_a_single_dial_is_never_delayed(self):
        sleeps, mock_db = self._run_with_contacts(1)
        self.assertEqual(mock_db.place_outbound_call_direct.call_count, 1)
        self.assertEqual(sleeps, [])

    def test_running_out_of_contacts_early_stops_staggering_too(self):
        # concurrency=3 but only 1 contact left - must not sleep waiting for
        # dials that are never going to happen.
        sleeps, mock_db = self._run_with_contacts(1)
        self.assertEqual(sleeps, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
