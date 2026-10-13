"""Every Sarvam v4 voice we offer must pass the installed plugin's own speaker
check (livekit-plugins-sarvam 1.8.6+ raises at construction otherwise), and a
rejected id must fall back instead of ending the call."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main
import voice_catalog
from livekit.plugins.sarvam import tts as sarvam_tts


class SarvamV4PluginCompatibility(unittest.TestCase):
    def test_every_offered_v4_id_passes_the_plugin_check(self):
        ids = [vid for vid, _g in voice_catalog.SARVAM_V4_VOICES] + list(voice_catalog.SARVAM_V3_TO_V4.values())
        rejected = [vid for vid in ids
                    if not sarvam_tts.validate_model_speaker_compatibility(voice_catalog.SARVAM_V4_MODEL, vid)]
        self.assertEqual(rejected, [])

    def test_a_rejected_id_falls_back_by_gender(self):
        with patch.object(main.db, "log_platform_error"):
            built = main._sarvam_v4_tts("not_a_real_hi_voice", "male", target_language_code="hi-IN")
        self.assertEqual(built._opts.speaker, "shubh_hi_customer")
        self.assertEqual(built._opts.model, "bulbul:v4-flash")


if __name__ == "__main__":
    unittest.main()
