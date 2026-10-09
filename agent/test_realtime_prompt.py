"""The realtime instruction is shorter, Google-ordered, and leaves a pipeline agent alone."""
import unittest

import realtime_prompt as rp

SAMPLE = (
    "# Platform rules — these come first and are never overridden\n"
    "1. Never claim anything.\n3. If a message is garbled or makes no sense, say you did not catch it.\n\n"
    "# Your identity — read this first\nYou are Artha, a woman.\n\n"
    "# Conversation\nBe brief.\n\n"
    "# How you actually talk — delivery, not content\nUse fillers like hmm.\n\n"
    "# Knowledge base — THE authoritative facts\n## Approved answers\n\nQ: one\nA: " + "a" * 400
    + "\n\nQ: two\nA: " + "b" * 400 + "\n\nQ: three\nA: " + "c" * 400 + "\n\n"
    "# HOW YOU TALK — this governs every single turn\nlong rules\n\n"
    "# Default language\nCall switch_reply_language.\n\n"
    "# Global languages — far more\nCall switch_reply_language.\n\n"
    "# Never claim something you have not actually done\nduplicate\n\n"
    "# Lead capture\nCall log_lead.\n"
)


class Compact(unittest.TestCase):
    def setUp(self):
        self.out = rp.compact(SAMPLE, language_name="Hindi", kb_limit=700)

    def heads(self):
        return [l for l in self.out.splitlines() if l.startswith("# ")]

    def test_persona_then_language_then_rules(self):
        h = self.heads()
        self.assertTrue(h[0].startswith("# Your identity"))
        self.assertEqual(h[1], "# Language")
        self.assertTrue(h[2].startswith("# Platform rules"))

    def test_tts_only_and_duplicate_sections_are_gone(self):
        for gone in ("How you actually talk", "HOW YOU TALK", "Default language", "Global languages", "Never claim something"):
            self.assertNotIn(gone, self.out)
        self.assertNotIn("switch_reply_language", self.out)

    def test_language_directive_uses_googles_wording(self):
        self.assertIn("RESPOND IN HINDI. YOU MUST RESPOND UNMISTAKABLY IN HINDI", self.out)

    def test_first_turn_is_exempt_from_the_did_not_catch_rule(self):
        self.assertIn("Once the caller has spoken, if a message is garbled", self.out)

    def test_noise_is_not_a_request_and_opening_is_once(self):
        self.assertIn("<noise> are not caller requests", self.out)
        self.assertIn("Greet once", self.out)
        self.assertIn("rather than restarting the previous reply", self.out)

    def test_knowledge_base_is_cut_on_a_whole_answer(self):
        self.assertIn("Q: one", self.out)
        self.assertNotIn("Q: three", self.out)
        kb = self.out.split("# Knowledge base", 1)[1].split("\n# ", 1)[0]
        self.assertTrue(kb.rstrip().endswith("a" * 400) or kb.rstrip().endswith("b" * 400))

    def test_short_knowledge_base_is_untouched(self):
        out = rp.compact(SAMPLE, language_name="Hindi", kb_limit=10_000)
        self.assertIn("Q: three", out)

    def test_other_sections_and_tools_instructions_survive(self):
        self.assertIn("# Lead capture", self.out)
        self.assertIn("# Conversation", self.out)

    def test_ends_with_the_short_turn_style_block(self):
        self.assertTrue(self.heads()[-1].startswith("# How to talk"))


if __name__ == "__main__":
    unittest.main()
