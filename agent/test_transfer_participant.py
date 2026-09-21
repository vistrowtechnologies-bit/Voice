"""Finding the phone participant to transfer.

Transfer never worked on an outbound call. Two reasons, both verified
against real calls on 2026-09-21:

  * identities come in two shapes — LiveKit names an inbound caller
    "sip_vistrow-4xfxv26j", while our own dial code names an outbound callee
    "sip-918080197945" (server/livekit_sip.py) — and only the underscore
    form was matched;
  * the kind check read `"SIP" in str(participant.kind)`, but the enum
    stringifies to "3", so it was never true.

Call 1034: the caller asked twice to be put through to a person, the tool
ran in 4ms and the agent said "we cannot transfer calls directly".
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import tools


class FakeParticipant:
    def __init__(self, identity, kind=None):
        self.identity, self.kind = identity, kind


class FakeRoom:
    def __init__(self, *participants):
        self.remote_participants = {p.identity: p for p in participants}


class FindSipParticipant(unittest.TestCase):
    def test_outbound_callee_is_found(self):
        # Exactly what call 1034 carried.
        room = FakeRoom(FakeParticipant("sip-918080197945", kind=3))
        self.assertEqual(tools._find_sip_participant(room), "sip-918080197945")

    def test_inbound_caller_is_still_found(self):
        room = FakeRoom(FakeParticipant("sip_vistrow-4xfxv26j", kind=3))
        self.assertEqual(tools._find_sip_participant(room), "sip_vistrow-4xfxv26j")

    def test_a_web_visitor_is_not_transferable(self):
        room = FakeRoom(FakeParticipant("visitor-abc123", kind=1))
        self.assertIsNone(tools._find_sip_participant(room))

    def test_no_room_is_not_transferable(self):
        self.assertIsNone(tools._find_sip_participant(None))

    def test_the_sip_kind_alone_is_enough(self):
        from livekit import rtc
        room = FakeRoom(FakeParticipant("weird-identity", kind=rtc.ParticipantKind.PARTICIPANT_KIND_SIP))
        self.assertEqual(tools._find_sip_participant(room), "weird-identity")

    def test_the_kind_string_is_not_what_it_looks_like(self):
        # Why the old check could never fire.
        from livekit import rtc
        self.assertNotIn("SIP", str(rtc.ParticipantKind.PARTICIPANT_KIND_SIP).upper())

    def test_a_phone_participant_is_picked_out_of_a_mixed_room(self):
        room = FakeRoom(
            FakeParticipant("visitor-abc", kind=1),
            FakeParticipant("sip-919876543210", kind=3),
        )
        self.assertEqual(tools._find_sip_participant(room), "sip-919876543210")


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TransferTargets(unittest.IsolatedAsyncioTestCase):
    """EnableX declined a bare tel: URI on call 1036 with
    '603 Declined (Non sip: uri)', so the SIP form on our own outbound trunk
    is tried first and tel: is kept as a fallback for providers that want it.
    """

    class FakeApi:
        def __init__(self, address="35.234.209.8", fail=False):
            outer = self

            class _Sip:
                @staticmethod
                async def list_sip_outbound_trunk(req):
                    if outer.fail:
                        raise RuntimeError("livekit unreachable")

                    class Trunk:
                        address = outer.address

                    class Result:
                        items = [Trunk()] if outer.address else []

                    return Result()

            self.address, self.fail, self.sip = address, fail, _Sip()

    def setUp(self):
        tools._TRUNK_ADDRESS_CACHE.clear()

    async def test_sip_on_our_trunk_is_tried_first(self):
        uris = await tools._transfer_uris(self.FakeApi(), "+917020950304")
        self.assertEqual(uris, ["sip:917020950304@35.234.209.8", "tel:+917020950304"])

    async def test_tel_remains_as_a_fallback(self):
        uris = await tools._transfer_uris(self.FakeApi(), "+917020950304")
        self.assertIn("tel:+917020950304", uris)

    async def test_an_operator_supplied_uri_is_left_alone(self):
        self.assertEqual(await tools._transfer_uris(self.FakeApi(), "sip:desk@pbx.local"),
                         ["sip:desk@pbx.local"])
        self.assertEqual(await tools._transfer_uris(self.FakeApi(), "tel:+15551234567"),
                         ["tel:+15551234567"])

    async def test_no_trunk_address_still_produces_a_target(self):
        uris = await tools._transfer_uris(self.FakeApi(address=""), "+917020950304")
        self.assertEqual(uris, ["tel:+917020950304"])

    async def test_a_livekit_failure_does_not_stop_the_transfer(self):
        uris = await tools._transfer_uris(self.FakeApi(fail=True), "+917020950304")
        self.assertEqual(uris, ["tel:+917020950304"])

    async def test_a_number_with_spacing_and_punctuation_still_works(self):
        uris = await tools._transfer_uris(self.FakeApi(), "+91 70209-50304")
        self.assertEqual(uris[0], "sip:917020950304@35.234.209.8")

    async def test_junk_yields_no_target(self):
        self.assertEqual(await tools._transfer_uris(self.FakeApi(), "not-a-number"), [])

    async def test_the_trunk_is_looked_up_once_per_worker(self):
        api = self.FakeApi()
        await tools._transfer_uris(api, "+917020950304")
        api.address = "changed-but-cached"
        uris = await tools._transfer_uris(api, "+917020950304")
        self.assertEqual(uris[0], "sip:917020950304@35.234.209.8")
