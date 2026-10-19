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
        self.assertIn("Only after a genuine spoken caller request (never noise or silence), if a message is garbled", self.out)

    def test_duplicate_garbled_rule_is_also_qualified(self):
        instructions = SAMPLE + "\n# Only state back what they actually said\nIf a message is garbled, ask for a repeat.\n"
        out = rp.compact(instructions, language_name="Hindi")
        self.assertEqual(out.count("Only after a genuine spoken caller request"), 2)
        self.assertNotIn("If a message is garbled", out)

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


class StyleCoachingIsDroppedForRealtime(unittest.TestCase):
    """Delivery coaching for a TTS voice is re-billed every turn and native
    audio does not need it; the four rules that matter survive as one block."""
    def test_style_sections_are_dropped_but_their_essential_rules_remain(self):
        src = (
            "# Your identity\nYou are Artha.\n"
            "# Voice conversation rules\nlong rules\n"
            "# Sounding like a person — fillers, humor, warmth\nfillers\n"
            "# Natural speech imperfections — don't be TOO clean\nhmm\n"
            "# A few jokes to have in your back pocket — use sparingly\njoke\n"
            "# Pricing\nNo rupee figures.\n"
        )
        out = rp.compact(src, language_name="Hindi")
        for gone in ("# Voice conversation rules", "# Sounding like a person", "# Natural speech imperfections", "# A few jokes"):
            self.assertNotIn(gone, out)
        self.assertIn("# Pricing", out)
        for rule in ("borrowed English word", "one moment", "never a reason to end the call", "one short goodbye"):
            self.assertIn(rule, out)


class TenantRealtimeBudget(unittest.TestCase):
    """Owner, 19 Oct 2026: keep a tenant realtime call near Rs 3.5-4/min. The
    strict-mode KB header and the TTS number guide are shortened; every rule
    and every approved answer that fit before still fit."""

    STRICT = (
        "# Knowledge base — THE authoritative facts for this call\n"
        "The knowledge base below is your ONLY source for this business's concrete facts: prices.\n"
        "- Asked which doctors, staff, services or departments exist, name ALL of them listed.\n"
        "- check_calendar_availability returns the BUSINESS's open slots, not who works when. If the knowledge "
        "base gives a person's days or hours, a slot outside them is NOT bookable with that person — say which "
        "days they work and offer one of those.\n\n## Approved answers\n\nQ: timings?\nA: 9 to 5\n\n"
    )

    def test_strict_header_is_short_and_keeps_every_rule(self):
        out = rp.compact("# Your identity\nYou are Siya.\n\n" + self.STRICT, language_name="Hindi")
        kb = out.split("# Knowledge base", 1)[1].split("\n# ", 1)[0]
        self.assertNotIn("ONLY source", kb)
        for rule in ("Use only these facts", "same answer if asked again", "Never guess",
                     "name all listed", "not bookable with them"):
            self.assertIn(rule, kb, rule)
        self.assertIn("Q: timings?\nA: 9 to 5", kb)

    def test_tts_number_guide_becomes_one_line(self):
        out = rp.compact("# Your identity\nYou are Siya.\n\n# Speak numbers and units naturally (do this "
                         "regardless of the persona/rules above)\nYour text goes straight to a TTS engine.\n",
                         language_name="Hindi")
        self.assertIn("Say numbers and units as spoken words", out)
        self.assertNotIn("TTS engine", out)

    def test_knowledge_base_cap_is_about_1500_tokens(self):
        self.assertEqual(rp.compact.__kwdefaults__["kb_limit"], 5500)
