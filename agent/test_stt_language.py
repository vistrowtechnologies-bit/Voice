"""STT language pinning (_sarvam_stt_language).

Auto-detect ("unknown") let a single mispronounced Hindi word come back in a
different Indian script. Every example below is taken verbatim from a live
call transcript where the caller was speaking Hindi throughout:

    ನಮಸ್ತೆ        (Kannada)  = namaste
    હા બોલો       (Gujarati) = haan bolo
    পস / তবে      (Bengali)
    பஸ்           (Tamil)    = bas
    ഫോക്കസ്        (Malayalam)= focus
    ਠੀਕ ਹੈ        (Punjabi)  = theek hai
    నెక్స్ట్        (Telugu)   = next

The agent could not read its own transcript, apologised, and the call
degraded. Pinning recognition to the configured language is the fix.
"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main


class SarvamSttLanguage(unittest.TestCase):
    def test_hindi_agent_pins_to_hindi(self):
        # The whole point: a Hindi agent must never be in auto-detect.
        self.assertEqual(main._sarvam_stt_language("hi-IN"), "hi-IN")

    def test_every_language_the_dashboard_offers_is_pinnable(self):
        # A language we sell but Sarvam does not accept would silently fall
        # back to auto-detect and reintroduce the bug for that tenant.
        for code in ("hi-IN", "en-IN", "mr-IN", "gu-IN", "ta-IN",
                     "te-IN", "kn-IN", "ml-IN", "bn-IN", "pa-IN"):
            with self.subTest(code=code):
                self.assertNotEqual(main._sarvam_stt_language(code), "unknown")

    def test_odia_is_translated_to_sarvams_spelling(self):
        # Sarvam says "od-IN"; our catalog and the rest of the world say
        # "or-IN". Without the alias, Odia agents fall back to auto-detect.
        self.assertEqual(main._sarvam_stt_language("or-IN"), "od-IN")

    def test_unset_or_unknown_language_keeps_auto_detect(self):
        # Never regress an agent that has no language configured - auto
        # detect is worse than pinning, but far better than pinning wrongly.
        for value in ("", None, "  ", "fr-FR", "xx-YY"):
            with self.subTest(value=value):
                self.assertEqual(main._sarvam_stt_language(value), "unknown")

    def test_whitespace_is_tolerated(self):
        self.assertEqual(main._sarvam_stt_language("  hi-IN  "), "hi-IN")


if __name__ == "__main__":
    unittest.main(verbosity=2)
