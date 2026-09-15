"""Regression tests for the shared per-turn voice delivery guidance."""

import unittest

from prompts.human_speech import build_human_speech_manner, build_turn_delivery


class HumanSpeechPromptTests(unittest.TestCase):
    def test_public_helpers_are_importable_and_non_empty(self) -> None:
        self.assertTrue(build_human_speech_manner())
        self.assertTrue(build_turn_delivery(0))

    def test_delivery_throttles_recent_fillers(self) -> None:
        just_used = build_turn_delivery(0)
        due = build_turn_delivery(1)

        self.assertIn("start this one directly", just_used)
        self.assertNotIn("natural to start with a short hesitation", just_used)
        self.assertIn("natural to start with a short hesitation", due)
        self.assertIn("never open with \"ठीक है\" or \"समझ गई\" two turns in a row", due)

    def test_the_hard_limits_survive_every_cadence(self) -> None:
        for turns in (0, 1, 4):
            with self.subTest(turns=turns):
                delivery = build_turn_delivery(turns)
                self.assertIn("never talk over them", delivery)
                self.assertIn("final confirmations", delivery)


if __name__ == "__main__":
    unittest.main()
