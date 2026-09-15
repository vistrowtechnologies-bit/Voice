"""A backchannel while the agent speaks must not interrupt it; anything else must.

Call 978: "ठीक है" and "हाँ बोल लो" each cut the agent mid-sentence.
"""
import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import backchannel_patch as bp
from livekit.agents.voice.agent_activity import AgentActivity


def _activity(transcript, speaking=True):
    speech = types.SimpleNamespace(allow_interruptions=True, interrupted=False) if speaking else None
    return types.SimpleNamespace(
        _current_speech=speech,
        _audio_recognition=types.SimpleNamespace(_current_transcript=transcript),
        _cancel_preemptive_generation=lambda: None,
    )


class WhatCountsAsABackchannel(unittest.TestCase):
    def test_call_978_utterances_and_common_acks(self):
        for text in ("ठीक है", "हाँ बोल लो।", "हाँ", "जी", "हम्म", "जी हाँ", "हाँ जी", "ok", "अच्छा।"):
            with self.subTest(text=text):
                self.assertTrue(bp.is_backchannel(text))

    def test_real_interruptions_still_count(self):
        for text in ("नहीं", "रुकिए", "एक मिनट रुको", "ठीक है पर price क्या है?",
                     "मुझे website नहीं चाहिए", "no", "wait", "हाँ पर पहले price बताओ", ""):
            with self.subTest(text=text):
                self.assertFalse(bp.is_backchannel(text))


class WhileTheAgentIsSpeaking(unittest.TestCase):
    def test_a_backchannel_does_not_pause_the_agent(self):
        with mock.patch.object(bp, "_orig_interrupt") as orig:
            bp._interrupt_by_audio_activity(_activity("ठीक है"))
        orig.assert_not_called()

    def test_a_real_interruption_still_pauses_it(self):
        with mock.patch.object(bp, "_orig_interrupt") as orig:
            bp._interrupt_by_audio_activity(_activity("नहीं, रुकिए"))
        orig.assert_called_once()

    def test_a_backchannel_does_not_commit_a_turn(self):
        info = types.SimpleNamespace(new_transcript="हाँ बोल लो।")
        with mock.patch.object(bp, "_orig_end_of_turn") as orig:
            self.assertFalse(bp.on_end_of_turn(_activity("हाँ बोल लो।"), info))
        orig.assert_not_called()


class WhenTheAgentIsSilent(unittest.TestCase):
    def test_an_acknowledgement_is_a_real_answer(self):
        info = types.SimpleNamespace(new_transcript="ठीक है")
        with mock.patch.object(bp, "_orig_end_of_turn", return_value=True) as orig:
            self.assertTrue(bp.on_end_of_turn(_activity("ठीक है", speaking=False), info))
        orig.assert_called_once()

    def test_apply_installs_both_hooks(self):
        bp.apply()
        self.assertIs(AgentActivity._interrupt_by_audio_activity, bp._interrupt_by_audio_activity)
        self.assertIs(AgentActivity.on_end_of_turn, bp.on_end_of_turn)


if __name__ == "__main__":
    unittest.main()
