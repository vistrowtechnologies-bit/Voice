"""Gemini library voices are ids, not personas: they must reach the API
unchanged, back up to a same-gender stock persona, and stay owner-only."""
import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice_catalog as vc


class GeminiLibraryVoices(unittest.TestCase):
    def test_library_ids_are_not_capitalised(self):
        self.assertEqual(vc.gemini_voice_name("google38:en-in-csagent-3"), "en-in-csagent-3")

    def test_personas_still_capitalised(self):
        self.assertEqual(vc.gemini_voice_name("google38:kore"), "Kore")
        self.assertEqual(vc.gemini_voice_name("google38flash:puck"), "Puck")
        self.assertEqual(vc.gemini_voice_name("google:charon"), "Charon")

    def test_backup_is_a_same_gender_stock_persona(self):
        self.assertEqual(vc.gemini_backup_persona("google38:hi-in-csagent-7"), "Charon")
        self.assertEqual(vc.gemini_backup_persona("google38:en-in-csagent-3"), "Kore")
        self.assertEqual(vc.gemini_backup_persona("google38:leda"), "Leda")

    def test_every_library_voice_is_owner_only_premium(self):
        for vid, *_ in vc.GEMINI_LIBRARY_VOICES:
            entry = vc.get_voice(f"google38:{vid}")
            self.assertIsNotNone(entry, vid)
            self.assertTrue(entry["preview"], vid)
            self.assertEqual(entry["tier"], "premium", vid)

    def test_agent_copy_matches(self):
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "voice_catalog.py")) as a, open(os.path.join(here, "..", "agent", "voice_catalog.py")) as b:
            self.assertEqual(a.read(), b.read())


if __name__ == "__main__":
    unittest.main()
