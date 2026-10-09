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
        for value in ("google31:kore", "google:kore", "google:charon", "google:hi-IN-Standard-A", "elevenlabs:zT03pEAEi0VHKciJODfn"):
            self.assertTrue(vc.is_hidden(value), value)

    def test_good_voices_stay_visible(self):
        chirp = next(e["value"] for e in vc._BY_VALUE.values() if "chirp3" in e["value"])
        sarvam = next(e["value"] for e in vc._BY_VALUE.values() if ":" not in e["value"])
        self.assertFalse(vc.is_hidden(chirp))
        self.assertFalse(vc.is_hidden(sarvam))

    def test_existing_agents_still_resolve_a_hidden_voice(self):
        self.assertIsNotNone(vc.get_voice("google:hi-IN-Standard-A"))
        self.assertIsNotNone(vc.get_voice("google:kore"))

    def test_empty_value_is_not_hidden(self):
        self.assertFalse(vc.is_hidden(""))


if __name__ == "__main__":
    unittest.main()
