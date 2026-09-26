"""Guard the Gemini 3.1 preview voice behaviour.

The Next Preview voices are sold/tested for Gemini's prompt-driven emotion
and modulation. They should not receive the numeric base tone pace override
used by the stable Gemini 2.5 personas, because that makes the preview voices
feel speed-tuned instead of naturally expressive.
"""
import os
from pathlib import Path
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import voice_catalog

_ROOT = Path(__file__).resolve().parent
_MAIN_SOURCE = (_ROOT / "main.py").read_text(encoding="utf-8")


class Google31PreviewVoice(unittest.TestCase):
    def test_preview_catalog_mentions_prompt_modulation(self):
        for voice in ("google31:kore", "google31:charon"):
            entry = voice_catalog.get_voice(voice) or {}
            self.assertTrue(entry.get("preview"))
            self.assertIn("modulation", entry.get("note", "").lower())

    def test_google31_branch_does_not_force_numeric_pace(self):
        self.assertIn('google_prefix not in (_GOOGLE_31_VOICE_PREFIX, _GOOGLE_38_VOICE_PREFIX)', _MAIN_SOURCE)
        self.assertIn('google_tts_kwargs["speaking_rate"] = tone.get("pace", 1.0)', _MAIN_SOURCE)
        self.assertNotIn(
            "if google_prefix == _GOOGLE_31_VOICE_PREFIX:\n"
            "                google_tts_kwargs[\"speaking_rate\"]",
            _MAIN_SOURCE,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
