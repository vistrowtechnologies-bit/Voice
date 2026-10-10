"""Contact and test calls respect the outbound channel budget too; only the
campaign dialer held to it before."""
import asyncio
import json
import types
import unittest
from unittest import mock

import livekit_sip


def room(meta):
    return types.SimpleNamespace(name="r", metadata=json.dumps(meta) if isinstance(meta, dict) else meta)


class FakeLiveKit:
    def __init__(self, rooms):
        self.room = types.SimpleNamespace(list_rooms=mock.AsyncMock(return_value=types.SimpleNamespace(rooms=rooms)))

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class CountsOutboundRooms(unittest.TestCase):
    def test_only_outbound_rooms_are_counted(self):
        rooms = [room({"direction": "outbound"}), room({"direction": "outbound"}),
                 room({"agent_id": 3}), room(""), room("not json")]
        with mock.patch.object(livekit_sip.api, "LiveKitAPI", return_value=FakeLiveKit(rooms)):
            self.assertEqual(asyncio.run(livekit_sip.outbound_rooms_in_use()), 2)

    def test_livekit_unreachable_is_unknown(self):
        with mock.patch.object(livekit_sip.api, "LiveKitAPI", side_effect=RuntimeError("down")):
            self.assertIsNone(asyncio.run(livekit_sip.outbound_rooms_in_use()))


class RefusesWhenFull(unittest.TestCase):
    def dial(self, in_use, **kwargs):
        with mock.patch.object(livekit_sip.env_guard, "dial_block_reason", return_value=None), \
                mock.patch.object(livekit_sip.calls_db, "check_call_allowed", return_value=(True, "")), \
                mock.patch.object(livekit_sip, "outbound_rooms_in_use", mock.AsyncMock(return_value=in_use)), \
                mock.patch.object(livekit_sip, "_OUTBOUND_CHANNELS", 2), \
                mock.patch.object(livekit_sip.calls_db, "get_setting", return_value=None):
            return asyncio.run(livekit_sip.place_outbound_call("+919876543210", "+911", 7, 3, **kwargs))

    def test_contact_or_test_call_is_refused_when_lines_are_full(self):
        result = self.dial(2)
        self.assertTrue(result.get("busy"))

    def test_free_line_proceeds_to_the_dial(self):
        # get_setting returning no trunk stops it just after the channel check.
        self.assertIn("trunk is not configured", self.dial(1)["error"])

    def test_campaign_dials_are_left_to_the_dialer(self):
        self.assertIn("trunk is not configured", self.dial(5, campaign_contact_id=11)["error"])

    def test_unknown_count_does_not_block(self):
        self.assertIn("trunk is not configured", self.dial(None)["error"])


if __name__ == "__main__":
    unittest.main()
