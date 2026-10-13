"""Slow or known-bad voices are withheld from pickers but still resolve for agents already using them."""
import unittest
from pathlib import Path

import voice_catalog as vc


class HiddenVoices(unittest.TestCase):
    def test_agent_and_server_catalogs_are_identical(self):
        root = Path(__file__).resolve().parent.parent
        self.assertEqual((root / "agent/voice_catalog.py").read_bytes(),
                         (root / "server/voice_catalog.py").read_bytes())

    def test_slow_and_bad_voices_are_hidden(self):
        for value in ("google31:kore", "google:hi-IN-Standard-A", "elevenlabs:zT03pEAEi0VHKciJODfn"):
            self.assertTrue(vc.is_hidden(value), value)

    def test_good_voices_stay_visible(self):
        chirp = next(e["value"] for e in vc._BY_VALUE.values() if "chirp3" in e["value"])
        sarvam = next(e["value"] for e in vc._BY_VALUE.values() if ":" not in e["value"])
        self.assertFalse(vc.is_hidden(chirp))
        self.assertFalse(vc.is_hidden(sarvam))

    def test_expressive_voices_are_offered(self):
        # Mira/Arin were hidden for speed on 2026-10-08 and return, labelled
        # slower, as part of the opt-in Expressive tier (2026-10-13).
        self.assertEqual(len(vc.EXPRESSIVE_VOICES), 30)
        for value in vc.EXPRESSIVE_VOICES:
            self.assertFalse(vc.is_hidden(value), value)
            entry = vc.get_voice(value)
            self.assertEqual(entry["tier"], "premium", value)
            self.assertTrue(entry["multilingual"], value)
            # Owner-only until the Vertex gemini-2.5-flash-tts quota (5 RPM)
            # is raised; flip to assertFalse when they open to tenants.
            self.assertTrue(entry.get("preview"), value)

    def test_sarvam_v4_voices_are_premium_and_switch_language(self):
        v4 = [e for e in vc.CATALOG if e["value"].startswith(vc.SARVAM_V4_PREFIX)]
        self.assertEqual(len(v4), len(vc.SARVAM_V4_VOICES))
        for e in v4:
            self.assertEqual(e["tier"], "premium", e["value"])
            self.assertIn(e["gender"], ("male", "female"), e["value"])
            self.assertFalse(vc.is_hidden(e["value"]), e["value"])
        langs, can_switch = vc.languages_for(vc.get_voice("sarvam4:ritu_hi_customer"))
        self.assertTrue(can_switch)
        self.assertIn("ta-IN", langs)

    def test_every_offered_v3_voice_has_a_same_gender_v4_replacement(self):
        v4_gender = {vid: ("male" if g == "m" else "female") for vid, g in vc.SARVAM_V4_VOICES}
        offered = [e for e in vc.CATALOG if ":" not in e["value"] and not vc.is_hidden(e["value"]) and not e.get("preview")]
        self.assertTrue(offered)
        for e in offered:
            self.assertIn(e["value"], vc.SARVAM_V3_TO_V4, e["value"])
            self.assertEqual(v4_gender[vc.sarvam_v4_speaker(e["value"])], e["gender"], e["value"])

    def test_unknown_sarvam_names_fall_back_by_gender(self):
        self.assertEqual(vc.sarvam_v4_speaker("anushka", "female"), "ritu_hi_customer")
        self.assertEqual(vc.sarvam_v4_speaker("karun", "male"), "shubh_hi_customer")

    def test_existing_agents_still_resolve_a_hidden_voice(self):
        self.assertIsNotNone(vc.get_voice("google:hi-IN-Standard-A"))
        self.assertIsNotNone(vc.get_voice("google:kore"))

    def test_empty_value_is_not_hidden(self):
        self.assertFalse(vc.is_hidden(""))


if __name__ == "__main__":
    unittest.main()
