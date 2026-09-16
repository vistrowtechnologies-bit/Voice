"""preemptive_diag_patch must never change behavior — logging only.

Call 988: session.history saved turn 16's exact text a second time in place
of what tts_node's logs prove was actually spoken for that turn — the real
reply is missing from the saved transcript. Traced into livekit-agents'
preemptive-generation reuse logic (agent_activity.py's
_user_turn_completed_task), but that method is too large and version-fragile
to safely reimplement just to add visibility. This patch instead wraps three
small, already-isolated methods (on_preemptive_generation,
_cancel_preemptive_generation, _schedule_speech) to log through our own
logger, so the next real occurrence can be diagnosed with certainty instead
of reconstructed from generic logs.

These tests prove the wrapper is inert: same return value, same arguments
forwarded to the original, no extra mutation — with the ORIGINAL functions
replaced by fakes so this never touches real AgentActivity internals.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import preemptive_diag_patch as p


class FakeSpeechHandle:
    def __init__(self, id_):
        self.id = id_


class FakePreemptive:
    def __init__(self, speech_handle):
        self.speech_handle = speech_handle


class FakeSelf:
    def __init__(self):
        self._preemptive_generation = None


class FakeInfo:
    new_transcript = "test transcript"


class PatchIsInert(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self._real_opg = p._orig_on_preemptive_generation
        self._real_cancel = p._orig_cancel_preemptive_generation
        self._real_sched = p._orig_schedule_speech

        def fake_opg(fake_self, info):
            fake_self._preemptive_generation = FakePreemptive(FakeSpeechHandle("sh-1"))
            self.calls.append(("opg", info))
            return "OPG_RETURN"

        def fake_cancel(fake_self):
            self.calls.append(("cancel",))
            fake_self._preemptive_generation = None
            return "CANCEL_RETURN"

        def fake_sched(fake_self, speech, priority, force=False):
            self.calls.append(("sched", speech.id, priority, force))
            return "SCHED_RETURN"

        p._orig_on_preemptive_generation = fake_opg
        p._orig_cancel_preemptive_generation = fake_cancel
        p._orig_schedule_speech = fake_sched

    def tearDown(self):
        p._orig_on_preemptive_generation = self._real_opg
        p._orig_cancel_preemptive_generation = self._real_cancel
        p._orig_schedule_speech = self._real_sched

    def test_on_preemptive_generation_returns_original_value_and_calls_through(self):
        fs = FakeSelf()
        info = FakeInfo()
        result = p._on_preemptive_generation(fs, info)
        self.assertEqual(result, "OPG_RETURN")
        self.assertEqual(self.calls, [("opg", info)])
        self.assertIsNotNone(fs._preemptive_generation)

    def test_schedule_speech_forwards_args_and_returns_original_value(self):
        fs = FakeSelf()
        speech = FakeSpeechHandle("sh-2")
        result = p._schedule_speech(fs, speech, 5)
        self.assertEqual(result, "SCHED_RETURN")
        self.assertEqual(self.calls, [("sched", "sh-2", 5, False)])

    def test_schedule_speech_forwards_force_flag(self):
        fs = FakeSelf()
        speech = FakeSpeechHandle("sh-3")
        p._schedule_speech(fs, speech, 1, force=True)
        self.assertEqual(self.calls, [("sched", "sh-3", 1, True)])

    def test_cancel_preemptive_generation_returns_original_value_and_calls_through(self):
        fs = FakeSelf()
        fs._preemptive_generation = FakePreemptive(FakeSpeechHandle("sh-4"))
        result = p._cancel_preemptive_generation(fs)
        self.assertEqual(result, "CANCEL_RETURN")
        self.assertEqual(self.calls, [("cancel",)])
        self.assertIsNone(fs._preemptive_generation)

    def test_no_crash_when_nothing_to_log(self):
        # _preemptive_generation is None both before and after — the logging
        # branches must not assume it was set.
        fs = FakeSelf()
        p._cancel_preemptive_generation(fs)
        self.assertEqual(self.calls, [("cancel",)])


class PatchAppliesCleanly(unittest.TestCase):
    def test_apply_sets_methods_on_the_real_class(self):
        from livekit.agents.voice.agent_activity import AgentActivity

        original = AgentActivity.on_preemptive_generation
        try:
            p.apply()
            self.assertIs(AgentActivity.on_preemptive_generation, p._on_preemptive_generation)
            self.assertIs(
                AgentActivity._cancel_preemptive_generation, p._cancel_preemptive_generation
            )
            self.assertIs(AgentActivity._schedule_speech, p._schedule_speech)
        finally:
            AgentActivity.on_preemptive_generation = original


if __name__ == "__main__":
    unittest.main()
