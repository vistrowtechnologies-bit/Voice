"""EnableX inbound answer/bridge lifecycle safety tests; no real calls."""

import unittest
from unittest.mock import Mock

from enablex_inbound import accept_if_ringing


class AcceptIfRingingTests(unittest.TestCase):
    def test_connected_fallback_skips_a_second_accept(self):
        accept_call = Mock()

        result = accept_if_ringing(
            "voice-connected",
            2,
            already_connected=True,
            accept_call=accept_call,
        )

        self.assertIsNone(result)
        accept_call.assert_not_called()

    def test_incoming_call_still_accepts_the_ringing_leg(self):
        accept_call = Mock(return_value={"ok": True, "response": {"state": "accepted"}})

        result = accept_if_ringing(
            "voice-ringing",
            2,
            already_connected=False,
            accept_call=accept_call,
        )

        self.assertEqual(result, {"ok": True, "response": {"state": "accepted"}})
        accept_call.assert_called_once_with("voice-ringing", 2)

    def test_ringing_accept_failure_is_preserved(self):
        failure = {"ok": False, "error": "EnableX rejected accept"}
        accept_call = Mock(return_value=failure)

        result = accept_if_ringing(
            "voice-ringing",
            2,
            already_connected=False,
            accept_call=accept_call,
        )

        self.assertIs(result, failure)


if __name__ == "__main__":
    unittest.main(verbosity=2)
