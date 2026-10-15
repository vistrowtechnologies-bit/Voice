"""Language counts on the Voices page follow Google's per-model tables
(ai.google.dev speech-generation, checked 2026-10-15): Gemini 3.8 Flash TTS
supports all 132 rows, Flash-Lite TTS (google38: voices) only 103."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import voice_catalog


def _count(prefix: str) -> int:
    entry = next(e for e in voice_catalog.CATALOG if e["value"].startswith(prefix))
    tiers = {e.get("tier") for e in voice_catalog.CATALOG}
    return voice_catalog.public_entry(entry, tiers)["languageCount"]


class GeminiLanguageCounts(unittest.TestCase):
    def test_flash_tts_voices_show_132(self):
        self.assertEqual(_count(voice_catalog.GEMINI_38_FLASH_PREFIX), 132)

    def test_flash_lite_tts_voices_show_103(self):
        self.assertEqual(_count(voice_catalog.GEMINI_38_PREFIX), 103)


if __name__ == "__main__":
    unittest.main()
