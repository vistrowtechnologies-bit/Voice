"""Sarvam's own LiveKit production guide, pinned as configuration.

docs.sarvam.ai/api/integration/livekit-production-best-practices

Every value here is theirs, not ours. They exist as tests because the whole
set was drifted from at once — LiveKit's silero VAD stacked on top of Sarvam's
server VAD, a semantic turn detector on top of that, and min_delay at 0.4
above Sarvam's own 500ms silence. Their diagnosis of that stack is exact:
"500 ms of Sarvam silence plus a 0.5 s min_delay is a full second of dead
air." Ours was 900ms, which is why eouMs sat pinned at ~401ms on every call.
"""
import inspect
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main

SRC = inspect.getsource(main)


class TheirStreamingStt(unittest.TestCase):
    def test_uses_their_official_class_not_our_own_client(self):
        self.assertIn("sarvam.STTStreaming(", SRC)

    def test_stream_type_is_fast(self):
        # Their words: "the single biggest latency knob", and the default
        # ("balanced") chunks at 1000ms instead of 500ms.
        self.assertIn('stream_type="fast"', SRC)

    def test_codemix_for_indian_deployments(self):
        # Verified against the API before switching: transcribe and codemix
        # produce IDENTICAL exit intents on three real exit phrases, and
        # codemix keeps "WhatsApp"/"busy" in English rather than
        # transliterating them.
        self.assertIn('mode="codemix"', SRC)

    def test_vad_silence_is_per_channel(self):
        # 500ms telephony, 300ms browser — the wideband path needs less
        # confirmation than a phone line.
        self.assertIn("vad_min_silence_ms=500 if is_phone else 300", SRC)


class TheStackedWaitIsGone(unittest.TestCase):
    def test_livekit_vad_is_disabled(self):
        # Passing None, not omitting: agent_session.py treats an omitted vad
        # as "not given" and quietly loads inference.VAD(model="silero").
        self.assertIn("vad=None", SRC)

    def test_turn_detection_trusts_sarvams_speech_end(self):
        self.assertIn('turn_detection="stt"', SRC)

    def test_min_delay_is_lowered(self):
        self.assertIn("min_delay=0.25", SRC)
        self.assertNotIn("min_delay=0.4", SRC)


class Interruption(unittest.TestCase):
    def test_mode_is_explicitly_vad(self):
        # Their guide notes VAD-driven interruption never fires unless the
        # mode is set explicitly.
        self.assertIn('"mode": "vad"', SRC)

    def test_false_interruption_timeout_is_lowered(self):
        self.assertIn('"false_interruption_timeout": 1.3', SRC)


class TheAdapterIsGone(unittest.TestCase):
    def test_no_hand_rolled_protocol_client_remains(self):
        import sarvam_realtime_stt
        self.assertFalse(hasattr(sarvam_realtime_stt, "RealtimeSTT"),
                         "the hand-rolled client should be gone — 1.8.0 ships theirs")
        self.assertTrue(hasattr(sarvam_realtime_stt, "enabled"))

    def test_the_dependency_floor_reaches_the_version_that_has_it(self):
        req = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "requirements.txt"), encoding="utf-8").read()
        # STTStreaming does not exist before 1.8.0; a >=1.6 floor would
        # resolve to a plugin without it and fail at runtime, not at build.
        self.assertIn("livekit-agents[sarvam]>=1.8", req)


if __name__ == "__main__":
    unittest.main(verbosity=2)
