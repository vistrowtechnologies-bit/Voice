"""Guard the Gemini 3.8 Flash-Lite testing voices ("google38:<persona>").

All 30 of Google's prebuilt Gemini personas, owner-only (preview) while they
are tested, billed at the 2x premium tier with that rate in the name, and
routed to gemini-3.8-flash-lite-tts with a same-persona 3.1 fallback.
"""
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import voice_catalog

_ROOT = Path(__file__).resolve().parent
_MAIN_SOURCE = (_ROOT / "main.py").read_text(encoding="utf-8")


class Google38Voices(unittest.TestCase):
    def entries(self):
        return [v for v in voice_catalog.CATALOG if v["value"].startswith("google38:")]

    def test_all_thirty_prebuilt_personas_are_listed(self):
        values = {v["value"] for v in self.entries()}
        self.assertEqual(len(values), 30)
        for persona, _gender, _style in voice_catalog.GEMINI_PREBUILT_VOICES:
            self.assertIn(f"google38:{persona.lower()}", values)

    def test_testing_only_premium_with_credits_in_name(self):
        for v in self.entries():
            self.assertTrue(v["preview"], v["value"])
            self.assertTrue(v["multilingual"], v["value"])
            self.assertEqual(v["tier"], "premium", v["value"])
            self.assertIn("(2x credits)", v["name"])
            self.assertIn(v["gender"], ("male", "female"))

    def test_model_mapping(self):
        self.assertEqual(
            voice_catalog.gemini_prefix_and_model("google38:kore"),
            ("google38:", "gemini-3.8-flash-lite-tts"),
        )
        self.assertEqual(voice_catalog.gemini_prefix_and_model("google31:kore")[1], "gemini-3.1-flash-tts-preview")
        self.assertEqual(voice_catalog.gemini_prefix_and_model("google:kore")[1], "gemini-2.5-flash-tts")
        self.assertIsNone(voice_catalog.gemini_prefix_and_model("shubh"))

    def test_speaks_the_gemini_language_range(self):
        langs, can_switch = voice_catalog.languages_for(voice_catalog.get_voice("google38:puck"))
        self.assertTrue(can_switch)
        self.assertIn("hi-IN", langs)
        self.assertGreater(len(langs), 11)

    def test_falls_back_to_the_same_persona_on_3_1(self):
        self.assertIn("_GOOGLE_38_MODEL: _GOOGLE_31_MODEL,", _MAIN_SOURCE)
        self.assertIn('_GOOGLE_38_MODEL: "google-multilingual-38",', _MAIN_SOURCE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
