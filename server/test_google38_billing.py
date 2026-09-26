"""The Gemini 3.8 testing voices must bill at the 2x premium tier the
catalog (and their "(2x credits)" names) promise - the same display-vs-billing
split calls_db's voice_tier comments describe for Mira and Chirp 3."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import calls_db
import voice_catalog


class Google38Billing(unittest.TestCase):
    def test_every_google38_voice_bills_premium(self):
        voices = [v for v in voice_catalog.CATALOG if v["value"].startswith(("google38:", "google38flash:"))]
        self.assertEqual(len(voices), 60)
        for v in voices:
            with self.subTest(voice=v["value"]):
                self.assertEqual(v["tier"], "premium")
                self.assertEqual(calls_db.voice_tier(v["value"]), "premium")
                self.assertEqual(calls_db._VOICE_TIER_MULTIPLIERS["premium"], 2.0)

    def test_existing_gemini_tiers_unchanged(self):
        self.assertEqual(calls_db.voice_tier("google:kore"), "premium")
        self.assertEqual(calls_db.voice_tier("google31:kore"), "standard")
        self.assertEqual(calls_db.voice_tier("google:hi-IN-Standard-A"), "economy")


if __name__ == "__main__":
    unittest.main(verbosity=2)
