"""Exact billable units per call (owner, 21 Oct 2026: real cost per voice combo)."""
import unittest
from types import SimpleNamespace

import main


class UsageUnits(unittest.TestCase):
    def test_tts_and_stt_units_add_up_including_cancelled_synthesis(self):
        t = {}
        main._add_usage_units(t, "tts_metrics", SimpleNamespace(characters_count=120, audio_duration=8.4,
                                                               input_tokens=0, output_tokens=0, cancelled=False))
        main._add_usage_units(t, "tts_metrics", SimpleNamespace(characters_count=40, audio_duration=1.1,
                                                               input_tokens=12, output_tokens=210, cancelled=True))
        main._add_usage_units(t, "stt_metrics", SimpleNamespace(audio_duration=30.5))
        main._add_usage_units(t, "stt_metrics", SimpleNamespace(audio_duration=29.5))
        main._add_usage_units(t, "llm_metrics", SimpleNamespace())  # ignored here
        self.assertEqual(t["usage"], {"ttsChars": 160, "ttsAudioS": 9.5, "ttsInputTokens": 12,
                                      "ttsOutputTokens": 210, "ttsRequests": 2, "sttAudioS": 60.0})

    def test_missing_fields_count_as_zero(self):
        t = {}
        main._add_usage_units(t, "tts_metrics", SimpleNamespace())
        self.assertEqual(t["usage"]["ttsChars"], 0)
        self.assertEqual(t["usage"]["ttsRequests"], 1)


if __name__ == "__main__":
    unittest.main()


class TtsNodeCountsFirst(unittest.TestCase):
    """Call 1449: tts_node may create "usage" (ttsCharsSent/ttsAudioSOut)
    before any provider metric arrives; the metric totals must still work."""

    def test_metric_after_tts_node_entry(self):
        import main
        from types import SimpleNamespace
        timings = {"usage": {"ttsCharsSent": 120, "ttsAudioSOut": 7.5}}
        main._add_usage_units(timings, "tts_metrics", SimpleNamespace(characters_count=40, audio_duration=2.0))
        u = timings["usage"]
        self.assertEqual((u["ttsChars"], u["ttsRequests"], u["ttsCharsSent"]), (40, 1, 120))
