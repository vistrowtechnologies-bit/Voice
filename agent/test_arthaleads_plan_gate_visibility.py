"""Call 1001's automatic ArthaLeads delivery never fired — the operator had
to click Re-send manually — and the dashboard just showed "Not sent" with no
reason. Root cause: get_delivery_integrations silently returns [] when the
account's plan doesn't include the "crm" feature (Growth+), and
_deliver_to_integrations's early return for an empty list wrote nothing to
the call's own arthaleads_status. A plan-blocked skip was therefore
indistinguishable from "ArthaLeads isn't even connected" or "no lead data" —
both from the database and from the dashboard. This covers the fix: a
plan-blocked skip now stamps the call with a visible reason, while every
other empty-list cause (not connected, account_id missing) stays untouched."""
import asyncio
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import tools


def run(coro):
    return asyncio.run(coro)


class PlanBlockedDeliveryIsVisibleOnTheCall(unittest.TestCase):
    def test_plan_blocked_skip_stamps_a_visible_reason(self):
        with patch.object(tools.db, "get_delivery_integrations", return_value=[]), \
             patch.object(
                 tools.db, "get_arthaleads_plan_status",
                 return_value={"connected": True, "plan_allows_crm": False},
             ), \
             patch.object(tools.db, "set_call_arthaleads_status") as mock_set:
            run(tools._deliver_to_integrations(1, {"name": "raj", "phone": "+91..."}, call_id=1001))

        mock_set.assert_called_once()
        call_id, status, reason = mock_set.call_args[0]
        self.assertEqual(call_id, 1001)
        self.assertEqual(status, "skipped")
        self.assertIn("Growth plan", reason)

    def test_not_connected_leaves_the_call_untouched(self):
        # ArthaLeads was never connected at all — a plan upgrade wouldn't
        # help, so this must not claim it's a plan restriction.
        with patch.object(tools.db, "get_delivery_integrations", return_value=[]), \
             patch.object(
                 tools.db, "get_arthaleads_plan_status",
                 return_value={"connected": False, "plan_allows_crm": False},
             ), \
             patch.object(tools.db, "set_call_arthaleads_status") as mock_set:
            run(tools._deliver_to_integrations(1, {"name": "raj", "phone": "+91..."}, call_id=1001))

        mock_set.assert_not_called()

    def test_mid_call_fan_out_has_no_call_id_and_is_never_stamped(self):
        # _fan_out_integrations (mid-call tool use) never has a call row yet
        # to stamp — call_id is None there by construction, so this must not
        # blow up or attempt a write.
        with patch.object(tools.db, "get_delivery_integrations", return_value=[]), \
             patch.object(tools.db, "get_arthaleads_plan_status") as mock_status, \
             patch.object(tools.db, "set_call_arthaleads_status") as mock_set:
            run(tools._deliver_to_integrations(1, {"name": "raj"}, call_id=None))

        mock_status.assert_not_called()
        mock_set.assert_not_called()

    def test_no_account_id_is_never_stamped(self):
        with patch.object(tools.db, "get_delivery_integrations", return_value=[]), \
             patch.object(tools.db, "get_arthaleads_plan_status") as mock_status, \
             patch.object(tools.db, "set_call_arthaleads_status") as mock_set:
            run(tools._deliver_to_integrations(None, {"name": "raj"}, call_id=1001))

        mock_status.assert_not_called()
        mock_set.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
