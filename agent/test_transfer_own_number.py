"""A warm transfer dials the colleague from THIS call's number (16 Oct 2026).

Before: _bridge_in_human used the first outbound trunk LiveKit listed, so
with one trunk per number a colleague could be rung from another tenant's
number."""
import asyncio
import json
import types
import unittest
from unittest import mock

import tools


def participant(identity, trunk_number=None):
    attrs = {"sip.trunkPhoneNumber": trunk_number} if trunk_number else {}
    return types.SimpleNamespace(identity=identity, attributes=attrs)


def room(meta=None, participants=()):
    return types.SimpleNamespace(
        name="r1",
        metadata=json.dumps(meta) if meta is not None else "",
        remote_participants={p.identity: p for p in participants},
    )


class FakeSip:
    def __init__(self, trunks):
        self.trunks = trunks
        self.dialled = []
        self.caller_ids = []

    async def list_sip_outbound_trunk(self, req):
        items = [types.SimpleNamespace(sip_trunk_id=t, numbers=n) for t, n in self.trunks.items()
                 if not req.numbers or set(req.numbers) & set(n)]
        return types.SimpleNamespace(items=items)

    async def create_sip_participant(self, req):
        self.dialled.append(req.sip_trunk_id)
        self.caller_ids.append(req.sip_number)


TRUNKS = {"ST_acct2": ["917713128715"], "ST_acct1": ["917935466148"]}


class OwnNumber(unittest.TestCase):
    def test_outbound_room_uses_the_number_it_was_dialled_from(self):
        r = room({"direction": "outbound", "phone_number": "+917935466148"}, [participant("sip-91808", "917713128715")])
        self.assertEqual(tools._own_number(r), "+917935466148")

    def test_inbound_room_trusts_the_dialled_number_not_the_shared_rule_metadata(self):
        # The shared dispatch rule stamps whichever number was saved last.
        r = room({"agent_id": 26, "phone_number": "+917713128715"}, [participant("sip-91808", "+917935466148")])
        self.assertEqual(tools._own_number(r), "+917935466148")

    def test_a_bridged_colleague_is_not_mistaken_for_the_caller(self):
        r = room({}, [participant("human-91999", "+917713128715")])
        self.assertEqual(tools._own_number(r), "")


class Bridge(unittest.TestCase):
    def bridge(self, r, trunks):
        sip = FakeSip(trunks)
        lkapi = types.SimpleNamespace(sip=sip)
        ok = asyncio.run(tools._bridge_in_human(lkapi, r, "+919000000001"))
        self.caller_ids = sip.caller_ids
        return ok, sip.dialled

    def test_colleague_is_dialled_through_this_numbers_trunk(self):
        r = room({}, [participant("sip-91808", "+917935466148")])
        ok, dialled = self.bridge(r, TRUNKS)
        self.assertTrue(ok)
        self.assertEqual(dialled, ["ST_acct1"])
        self.assertEqual(self.caller_ids, ["917935466148"])

    def test_no_trunk_for_this_number_means_no_bridge_rather_than_another_tenants(self):
        r = room({}, [participant("sip-91808", "+917935466148")])
        ok, dialled = self.bridge(r, {"ST_acct2": ["917713128715"]})
        self.assertFalse(ok)
        self.assertEqual(dialled, [])


if __name__ == "__main__":
    unittest.main()
