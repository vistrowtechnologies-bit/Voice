"""Each phone number dials out through its own outbound trunk (16 Oct 2026).

Before: one platform trunk whose numbers list held only +917713128715
(account 2), so account 1's test call from its own +917935466148 rang the
callee as account 2's number. These tests pin the tenant boundary."""
import asyncio
import types
import unittest
from unittest import mock

import livekit_sip

PLATFORM_TRUNK = "ST_platform"
SBC = "35.234.209.8"


class FakeSip:
    """Just enough of LiveKit's SIP service: outbound trunks with numbers."""

    def __init__(self, trunks):
        self.trunks = {t["id"]: dict(t) for t in trunks}
        self.created, self.deleted, self.dialled = [], [], []

    async def list_outbound_trunk(self, req):
        items = []
        for t in self.trunks.values():
            if req.trunk_ids and t["id"] not in req.trunk_ids:
                continue
            if req.numbers and not set(req.numbers) & set(t["numbers"]):
                continue
            items.append(types.SimpleNamespace(sip_trunk_id=t["id"], address=t["address"], numbers=t["numbers"]))
        return types.SimpleNamespace(items=items)

    async def create_outbound_trunk(self, req):
        new_id = f"ST_new{len(self.created) + 1}"
        self.trunks[new_id] = {"id": new_id, "address": req.trunk.address, "numbers": list(req.trunk.numbers)}
        self.created.append(new_id)
        return types.SimpleNamespace(sip_trunk_id=new_id)

    async def delete_trunk(self, req):
        self.deleted.append(req.sip_trunk_id)
        self.trunks.pop(req.sip_trunk_id, None)

    async def create_sip_participant(self, req):
        self.dialled.append(req.sip_trunk_id)
        return types.SimpleNamespace()


class FakeLiveKit:
    def __init__(self, sip):
        self.sip = sip
        self.room = types.SimpleNamespace(create_room=mock.AsyncMock(), delete_room=mock.AsyncMock())

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def settings(key, account_id):
    return {livekit_sip.OUTBOUND_TRUNK_ID_SETTING: PLATFORM_TRUNK}.get(key)


NUMBERS = {
    "+917935466148": {"accountId": 1, "number": "+917935466148"},
    "+917713128715": {"accountId": 2, "number": "+917713128715"},
}


class PerNumberTrunk(unittest.TestCase):
    def setUp(self):
        # Production on 16 Oct: the platform trunk serves account 2's number only.
        self.sip = FakeSip([{"id": PLATFORM_TRUNK, "address": SBC, "numbers": ["917713128715"]}])
        patches = [
            mock.patch.object(livekit_sip.api, "LiveKitAPI", side_effect=lambda: FakeLiveKit(self.sip)),
            mock.patch.object(livekit_sip.env_guard, "dial_block_reason", return_value=None),
            mock.patch.object(livekit_sip.calls_db, "check_call_allowed", return_value=(True, "")),
            mock.patch.object(livekit_sip, "outbound_rooms_in_use", mock.AsyncMock(return_value=0)),
            mock.patch.object(livekit_sip.calls_db, "get_setting", side_effect=settings),
            mock.patch.object(livekit_sip.calls_db, "get_phone_number_by_number", side_effect=NUMBERS.get),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def dial(self, from_number, account_id):
        return asyncio.run(livekit_sip.place_outbound_call(
            "+918080197945", from_number, account_id, 17, wait_for_answer=False, is_test=True))

    def test_account_1_dials_from_its_own_number_not_the_platform_trunk(self):
        self.dial("+917935466148", 1)
        self.assertEqual(len(self.sip.dialled), 1)
        trunk = self.sip.trunks[self.sip.dialled[0]]
        self.assertEqual(trunk["numbers"], ["917935466148"])
        self.assertEqual(trunk["address"], SBC)
        self.assertNotEqual(self.sip.dialled[0], PLATFORM_TRUNK)

    def test_account_2_keeps_its_existing_trunk(self):
        self.dial("+917713128715", 2)
        self.assertEqual(self.sip.dialled, [PLATFORM_TRUNK])
        self.assertEqual(self.sip.created, [])

    def test_a_number_of_another_workspace_is_refused(self):
        result = self.dial("+917713128715", 1)
        self.assertTrue(result.get("blocked"))
        self.assertEqual(self.sip.dialled, [])

    def test_an_unregistered_number_is_refused(self):
        result = self.dial("+911111111111", 1)
        self.assertTrue(result.get("blocked"))
        self.assertEqual(self.sip.dialled, [])

    def test_trunk_is_created_once_then_reused(self):
        self.dial("+917935466148", 1)
        self.dial("+917935466148", 1)
        self.assertEqual(len(self.sip.created), 1)
        self.assertEqual(self.sip.dialled[0], self.sip.dialled[1])

    def test_a_shared_trunk_listing_the_number_is_not_used(self):
        # A trunk carrying several numbers is not this number's own line.
        self.sip.trunks["ST_shared"] = {"id": "ST_shared", "address": SBC, "numbers": ["917935466148", "911"]}
        self.dial("+917935466148", 1)
        self.assertNotIn("ST_shared", self.sip.dialled)
        self.assertEqual(self.sip.trunks[self.sip.dialled[0]]["numbers"], ["917935466148"])

    def test_no_sbc_address_fails_instead_of_borrowing_a_trunk(self):
        self.sip.trunks[PLATFORM_TRUNK]["address"] = ""
        result = self.dial("+917935466148", 1)
        self.assertFalse(result["ok"])
        self.assertEqual(self.sip.dialled, [])

    def test_deleting_a_number_removes_only_its_own_trunk(self):
        trunk_id = asyncio.run(livekit_sip.ensure_number_outbound_trunk("+917935466148"))
        asyncio.run(livekit_sip.delete_number_outbound_trunk("+917935466148"))
        self.assertEqual(self.sip.deleted, [trunk_id])
        asyncio.run(livekit_sip.delete_number_outbound_trunk("+917713128715"))
        self.assertIn(PLATFORM_TRUNK, self.sip.trunks, "the original platform trunk is never deleted")


if __name__ == "__main__":
    unittest.main()
