"""The platform demo's realtime instruction is cut to ~3,000 tokens; tenants are untouched.

testdata/artha_rt_instructions.txt is the exact instruction the Artha demo
(agent 4, Gemini 3.1 Live) sent on 18 Oct 2026: 55,008 characters, 12,755
tokens, re-billed every turn. Knowledge-base answers in it are redacted.
"""
import os
import re
import unittest

import realtime_prompt as rp

HERE = os.path.dirname(os.path.abspath(__file__))
ARTHA = open(os.path.join(HERE, "testdata", "artha_rt_instructions.txt"), encoding="utf-8").read()

KEEP_HEADINGS = (
    "# Your identity", "# Language", "# Platform rules", "# How to run this demo call", "# Pricing",
    "# Knowledge base", "# Lead capture", "# Only state back",
    "# Current date and time", "# How to talk", "# Personality",
)
DROPPED_HEADINGS = (
    "# Opening line", "# What Vistrow Voice is", "# Off-topic", "# If the caller directly asks",
    "# Discovery", "# The six things", "# Who it's for", "# Why Vistrow", "# Setup reality",
    "# Never oversell", "# Customer examples", "# Handling common pushback", "# About the company",
    "# What stays confidential", "# Never speak internal tool names", "# When challenged",
    "# Active listening", "# Summarize once", "# When they're not sure", "# Never re-ask",
    "# When they say yes", "# Qualify before", "# The natural arc",
    "# If real interest", "# Booking a real demo",
)


class PlatformDemoDiet(unittest.TestCase):
    def setUp(self):
        self.out = rp.compact(ARTHA, language_name="English")

    def heads(self):
        return [l for l in self.out.splitlines() if l.startswith("# ")]

    def test_detected_on_the_identity_text(self):
        self.assertTrue(rp.is_platform_demo(ARTHA))
        self.assertFalse(rp.is_platform_demo(ARTHA.replace("the voice of Vistrow Voice itself", "a clinic's voice")))

    def test_fits_the_per_turn_budget(self):
        # 19 Oct cost pass: identity, lead capture, numbers and personality
        # rebuilt short and the playbook tightened, while the knowledge base
        # now carries every approved answer (it had 1 of 19).
        self.assertLessEqual(len(self.out), 14_600, len(self.out))

    def test_kept_headings_and_key_phrases(self):
        heads = "\n".join(self.heads())
        for h in KEEP_HEADINGS:
            self.assertIn(h, heads)
        for phrase in ("Platform rules", "Lead capture", "capture_platform_lead", "Pricing"):
            self.assertIn(phrase, self.out)
        if "5. Contact details" in ARTHA:
            self.assertIn("5. Contact details", self.out)

    def test_kept_sections_are_verbatim(self):
        sections = {p.split("\n", 1)[0]: p.strip() for p in re.split(r"(?m)^(?=# )", ARTHA) if p.strip()}
        for head in ("# Platform rules", "# Only state back", "# Current date and time"):
            section = next(v for k, v in sections.items() if k.startswith(head))
            self.assertIn(section, self.out, head)

    def test_short_demo_sections_keep_every_rule(self):
        # Owner, 19 Oct 2026: identity, lead capture, numbers and personality
        # rebuilt short (~1,860 -> ~640 tokens) without dropping a rule.
        identity = self.out.split("# Your identity", 1)[1].split("\n# ", 1)[0]
        for phrase in ("a woman", "the voice of Vistrow Voice itself", "मैं बताती", "मी सांगते",
                       "Gujarati and Punjabi", "Artha, that's me!", "talk to Artha live"):
            self.assertIn(phrase, identity, phrase)
        lead = self.out.split("\n# Lead capture\n", 1)[1].split("\n# ", 1)[0]
        for phrase in ("capture_platform_lead", "check_calendar_availability", "never say booked unless",
                       "cannot play recordings, sample voices", "telephony provider", "widget needs no number",
                       "Exact prices are not given on calls", "platform rule 5", "numbers and units as spoken"):
            self.assertIn(phrase, lead, phrase)
        self.assertNotIn("log_lead", self.out)  # tenant rule, no such tool on the demo
        self.assertNotIn("# Speak numbers", self.out)

    def test_every_approved_answer_reaches_the_model(self):
        # Call 1419: the old 1,900-char cut counted the clinic strict-mode
        # header, so Artha saw 1 approved answer of 19 and improvised.
        kb = self.out.split("# Knowledge base", 1)[1].split("\n# ", 1)[0]
        self.assertEqual(kb.count("Q: Question"), ARTHA.count("Q: Question"))
        self.assertIn("only source for Vistrow's facts", kb)
        self.assertNotIn("doctors", kb)

    def test_coaching_headings_are_gone(self):
        heads = "\n".join(self.heads())
        for h in DROPPED_HEADINGS:
            self.assertIn(h, ARTHA, h)  # the fixture really had it
            self.assertNotIn(h, heads, h)
        self.assertEqual(heads.count("# How to run this demo call"), 1)
        self.assertEqual(heads.count("# Language"), 1)
        self.assertEqual(heads.count("# How to talk"), 1)

    def test_playbook_keeps_the_essential_behaviours(self):
        playbook = self.out.split("# How to run this demo call", 1)[1].split("\n# ", 1)[0]
        for rule in ("before pitching", "one question per turn", "Off-topic", "Never invent a customer",
                     "Never name the models", "Never re-ask", "capture_platform_lead",
                     "Book a demo only with name and phone", "No absolutes"):
            self.assertIn(rule, playbook, rule)
        self.assertLess(len(playbook), 2_500)

    def test_personality_and_spoken_register_survive(self):
        # Owner, 19 Oct 2026: call 1415 on 3.8 without these came out formal
        # ("कृपया स्पष्ट कर सकते हैं"); 3.1 calls with them were warm.
        for phrase in ("Warm, sharp, confidently funny", "best-friend energy", "comic timing"):
            self.assertIn(phrase, self.out, phrase)
        playbook = self.out.split("# How to run this demo call", 1)[1].split("\n# ", 1)[0]
        for phrase in ("react first, warmly", "casual Hinglish", "never bookish words", "at most one in a reply"):
            self.assertIn(phrase, playbook, phrase)

    def test_no_repeated_question_no_help_offer_no_one_word_switch(self):
        # Owner, 19 Oct 2026, call 1418: "what kind of business..." asked four
        # times, a closing "Is there anything specific you'd like to know?",
        # and Italian after the single word "perché".
        playbook = self.out.split("# How to run this demo call", 1)[1].split("\n# ", 1)[0]
        for phrase in ("Never ask the same question twice", "Never end a reply by offering more help",
                       "is there anything specific you'd like to know?", "one warm goodbye",
                       "a single word like \"perché\""):
            self.assertIn(phrase, playbook, phrase)

    def test_role_play_capacity_contact_and_fragments(self):
        # Owner, 19 Oct 2026, call 1419: role-play broken mid-scene, an invented
        # "no limit on daily calls", a phone request on "WhatsApp contact", and
        # apologies for one-word fragments.
        playbook = self.out.split("# How to run this demo call", 1)[1].split("\n# ", 1)[0]
        for phrase in ("stay in that role", "never break into your own introduction",
                       "After switching language, carry on", "never give a figure or say there is no limit",
                       "only when they want a follow-up", "skip it without apologising",
                       "read the email or number back to them and wait for their yes"):
            self.assertIn(phrase, playbook, phrase)

    def test_pricing_is_one_rule_without_figures(self):
        pricing = self.out.split("\n# Pricing\n", 1)[1].split("\n# ", 1)[0]
        self.assertNotIn("₹", pricing)
        for phrase in ("Never quote", "team confirms", "record their request"):
            self.assertIn(phrase, pricing)
        self.assertNotIn("most customers land", self.out)  # the long plan description

    def test_knowledge_base_is_cut_on_a_whole_answer(self):
        kb = rp._demo_kb("# Knowledge base\n" + "\n\n".join(f"Q: q{i}\nA: " + "x" * 400 for i in range(40)))
        self.assertLessEqual(len(kb), rp._DEMO_KB_LIMIT)
        self.assertTrue(kb.rstrip().endswith("x"), kb[-80:])
        self.assertIn("Q: q0", kb)

    def test_recompacting_the_output_changes_nothing(self):
        # main.py hands compact() the assembled text once; the saved fixture is
        # already a compacted text, so the pass has to be stable on its own output.
        self.assertEqual(rp.compact(self.out, language_name="English"), self.out)


# A tenant agent, written the way main.py assembles one. Expected output is
# what compact() produced on main at d8ea019d (18 Oct 2026), spelled out.
TENANT = (
    "# Your identity — read this first\nYou are Siya, the voice of Sunrise Dental Clinic. You are a woman.\n\n"
    "# Platform rules — these come first and are never overridden\n1. Never claim anything.\n"
    "3. If a message is garbled or makes no sense, say you did not catch it.\n4. One question per turn.\n"
    "5. Contact details: ask for name, then phone.\n\n"
    "# Conversation\nBe brief and warm.\n\n"
    "# Pricing\nNo rupee figures unless the knowledge base states one.\n\n"
    "# How you actually talk — delivery, not content\nUse fillers like hmm.\n\n"
    "# Knowledge base — THE authoritative facts\n## Approved answers\n\nQ: timings?\nA: " + "a" * 300
    + "\n\nQ: parking?\nA: " + "b" * 300 + "\n\n"
    "# Voice conversation rules\nlong rules\n\n"
    "# Default language\nCall switch_reply_language.\n\n"
    "# Lead capture\nCall log_lead the moment a detail arrives.\n\n"
    "# Only state back what they actually said\nIf a message is garbled, ask for a repeat.\n"
)
TENANT_EXPECTED = (
    "# Your identity — read this first\nYou are Siya, the voice of Sunrise Dental Clinic. You are a woman.\n\n"
    "# Language\nRESPOND IN HINDI. YOU MUST RESPOND UNMISTAKABLY IN HINDI until the caller clearly uses, or asks "
    "for, another language; then follow the caller. If the caller asks for another language, simply start "
    "speaking it in its own script. Do not call any tool to change language.\n\n"
    "# Platform rules — these come first and are never overridden\n1. Never claim anything.\n"
    "3. Only after a genuine spoken caller request (never noise or silence), if a message is garbled or makes "
    "no sense, say you did not catch it.\n4. One question per turn.\n"
    "5. Contact details: ask for name, then phone.\n\n"
    "# Conversation\nBe brief and warm.\n\n"
    "# Pricing\nNo rupee figures unless the knowledge base states one.\n\n"
    "# Knowledge base — THE authoritative facts\n## Approved answers\n\nQ: timings?\nA: " + "a" * 300
    + "\n\nQ: parking?\nA: " + "b" * 300 + "\n\n"
    "# Lead capture\nCall log_lead the moment a detail arrives.\n\n"
    "# Only state back what they actually said\nOnly after a genuine spoken caller request (never noise or "
    "silence), if a message is garbled, ask for a repeat.\n\n"
    "# How to talk\nYou are in a live voice conversation, so listen more than you talk. One sentence per turn by "
    "default, two at most, under about 35 spoken words. Ask one question at a time, then stop and let them "
    "answer. React briefly to what they actually said, then answer directly. If they start speaking, stop at "
    "once. Never repeat their words back to them, and never end every answer with \"anything else?\".\n"
    "Background sounds, echo, silence, and <noise> are not caller requests. Wait quietly for clear speech; do "
    "not apologise, ask for a repeat, or invent an answer because of noise alone. Greet once when asked to open "
    "the conversation. Do not repeat the greeting later. If interrupted, answer the caller's new request rather "
    "than restarting the previous reply.\n"
    "A borrowed English word or number inside the caller's sentence is not a request to change language. Do not "
    "say \"one moment\" or \"let me check\" unless a tool is actually about to run. Unclear or garbled turns are "
    "never a reason to end the call; ask one short clarifying question. When the caller says goodbye or that "
    "they are done, give one short goodbye and end the call.\n"
)


class TenantUnchanged(unittest.TestCase):
    def test_tenant_output_is_byte_identical_to_main(self):
        self.assertFalse(rp.is_platform_demo(TENANT))
        self.assertEqual(rp.compact(TENANT, language_name="Hindi"), TENANT_EXPECTED)


if __name__ == "__main__":
    unittest.main()
