"""A caller correcting a captured fact must beat the captured fact.

Widget call 954. The caller gave a business, then corrected it twice:

    Customer: एक्चुअली मेरे कंपनी का नाम Vistro Technologies है।
    Agent:    अच्छा, Vistro Technologies — noted. तो dental clinic के लिए...
    Customer: मैंने कहा मेरी कंपनी का नाम Vistro Technologies है। यह IT कंपनी है।
    Agent:    ठीक है, Vistro Technologies — समझ गई। तो आपके dental clinic में...
    Customer: ये क्या है बोल बड़बड़ कर रही है क्या?

Four replies built on "dental clinic" after it had been corrected. The facts
reminder asserts captured facts with "NEVER ask for any of this again" and had
no path for a correction — it only ever accumulated, and it is the LAST system
message before generation, so it carried the highest attention in the context.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main


class TheReminderAllowsCorrection(unittest.TestCase):
    def setUp(self):
        self.block = main._facts_reminder({"use_case": "dental clinic", "name": "Pranav"})

    def test_the_captured_fact_is_still_there(self):
        self.assertIn("dental clinic", self.block)

    def test_a_contradiction_is_explicitly_the_callers_to_win(self):
        self.assertIn("THE CALLER IS RIGHT AND THIS LIST IS WRONG", self.block)

    def test_it_says_to_record_the_new_value_in_the_same_turn(self):
        self.assertIn("NEW value in the same turn", self.block)

    def test_it_forbids_reusing_the_old_value(self):
        """The exact failure: four questions built on the corrected fact."""
        self.assertIn("never ask a question built on it", self.block.lower())

    def test_the_never_ask_again_rule_survives(self):
        """It exists for the repeated-question bug; correction must not undo it."""
        self.assertIn("NEVER ask for any of this again", self.block)

    def test_nothing_is_added_when_there_are_no_facts(self):
        self.assertEqual(main._facts_reminder({}), "")

    def test_unconfirmed_facts_are_still_kept_separate(self):
        block = main._facts_reminder({"use_case": "dental clinic"},
                                     {"use_case": "unconfirmed"})
        self.assertIn("NOT confirmed", block)
        self.assertNotIn("NEVER ask for any of this again", block)


if __name__ == "__main__":
    unittest.main()
