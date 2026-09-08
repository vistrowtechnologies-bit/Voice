"""Regression tests for the shared per-turn voice delivery guidance."""

import unittest

from prompts.human_speech import build_human_speech_manner, build_turn_delivery


class HumanSpeechPromptTests(unittest.TestCase):
    def test_public_helpers_are_importable_and_non_empty(self) -> None:
        self.assertTrue(build_human_speech_manner())
        self.assertTrue(build_turn_delivery(0))

    def test_delivery_throttles_recent_fillers(self) -> None:
        recent = build_turn_delivery(1)
        due = build_turn_delivery(4)

        self.assertIn("avoid another decorative opener", recent)
        self.assertIn("It is optional; never force it", due)
        self.assertIn("never talk over them", due)


if __name__ == "__main__":
    unittest.main()
