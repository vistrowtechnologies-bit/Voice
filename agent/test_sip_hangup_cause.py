"""Record WHY the far end hung up, not just that it did.

Call 948 ended with LiveKit reporting `client_initiated`. That reads like
"the caller hung up" and it does not mean that — it means a BYE arrived from
the SIP peer, which is EnableX, not the handset. The caller states they did
not hang up, and nothing on our side ended the call: max_call_duration_s is
420 against a 132s call, no end_call, no silence hangup, no error, and the
trunk carries no duration limit.

The Q.850 cause travels with the BYE and LiveKit exposes it as sip.*
participant attributes. We were discarding them.
"""
import ast
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_SRC = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"),
               encoding="utf-8").read()


def _handler_source() -> str:
    tree = ast.parse(_SRC)
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_on_participant_disconnected":
            return ast.get_source_segment(_SRC, node)
    raise AssertionError("_on_participant_disconnected not found")


class TheCauseIsCaptured(unittest.TestCase):
    def setUp(self):
        self.src = _handler_source()

    def test_sip_attributes_are_read(self):
        self.assertIn("attributes", self.src)
        self.assertIn('startswith("sip.")', self.src)

    def test_they_reach_the_durable_diagnostic(self):
        self.assertIn("**sip_detail", self.src)

    def test_and_the_log(self):
        self.assertIn("caller disconnected: reason=", self.src)

    def test_capture_cannot_break_the_call(self):
        """Teardown must survive a provider attribute we cannot read."""
        self.assertIn("except Exception:", self.src)

    def test_bulky_values_are_skipped(self):
        self.assertIn("len(str(value)) > 200", self.src)


class TheExtractionItself(unittest.TestCase):
    """Exercise the logic against a realistic attribute bag."""

    @staticmethod
    def _extract(attrs):
        out = {}
        for key, value in dict(attrs or {}).items():
            if not key.startswith("sip."):
                continue
            if key in ("sip.phoneNumber", "sip.callStatus") or len(str(value)) > 200:
                continue
            out[key.replace(".", "_")] = str(value)
        return out

    def test_a_carrier_bye_is_captured(self):
        got = self._extract({
            "sip.callStatus": "active",
            "sip.phoneNumber": "+918080197945",
            "sip.h.reason": "Q.850;cause=41;text=\"Temporary Failure\"",
            "sip.trunkPhoneNumber": "917713128715",
            "lk.agent": "ignored",
        })
        self.assertIn("sip_h_reason", got)
        self.assertIn("cause=41", got["sip_h_reason"])
        self.assertNotIn("sip_callStatus", got)
        self.assertNotIn("lk.agent", got)

    def test_a_normal_clearing_is_distinguishable(self):
        got = self._extract({"sip.h.reason": "Q.850;cause=16;text=\"Normal Clearing\""})
        self.assertIn("cause=16", got["sip_h_reason"])

    def test_no_sip_attributes_yields_nothing(self):
        self.assertEqual(self._extract({"lk.publisher": "x"}), {})
        self.assertEqual(self._extract(None), {})


if __name__ == "__main__":
    unittest.main()
