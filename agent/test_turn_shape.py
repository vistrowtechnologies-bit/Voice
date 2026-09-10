"""One thing per turn, enforced as state instead of as a prompt rule.

Call 948's last turn, verbatim from the transcript, bundled three things and
the caller dropped mid-sentence:

  "ठीक है, इसी number पे details भेज देती हूँ। हमारी team आपको call करके exact
   pricing और बाकी चीज़ें बता देगी। एक और बात — अभी offer चल रहा है, एक साल
   का domain और hosting बिल्कुल free मिल रहा है, बस enquiry के पंद्रह दिन"

Agent 26's prompt forbids exactly this, in capitals, with a worked example,
three times over. Prompt text alone did not hold it — the same finding that
turned "use fillers sparingly" into _turns_since_filler.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main

CALL_948_LAST_TURN = (
    "ठीक है, इसी number पे details भेज देती हूँ। हमारी team आपको call करके exact "
    "pricing और बाकी चीज़ें बता देगी। एक और बात — अभी offer चल रहा है, एक साल का "
    "domain और hosting बिल्कुल free मिल रहा है, बस enquiry के पंद्रह दिन"
)


class OfferIsDetectedOnTheAgentsOwnReply(unittest.TestCase):
    def test_the_real_turn_counts_as_having_made_the_offer(self):
        self.assertTrue(main._reply_made_offer(CALL_948_LAST_TURN))

    def test_latin_script_phrasing_counts(self):
        self.assertTrue(main._reply_made_offer(
            "Ek achhi baat — ek saal ka domain aur hosting bilkul free."))

    def test_devanagari_phrasing_counts(self):
        self.assertTrue(main._reply_made_offer(
            "एक साल की होस्टिंग और डोमेन फ्री है।"))

    def test_an_ordinary_turn_does_not(self):
        for line in ("ठीक है, तो बताइए website से mainly क्या चाहिए?",
                     "Got it. Aapka business kya hai?",
                     "हमारी team आपको call कर लेगी।"):
            self.assertFalse(main._reply_made_offer(line), line)

    def test_domain_alone_is_not_the_offer(self):
        self.assertFalse(main._reply_made_offer("Aapka domain kya hai abhi?"))


class TheGateSaysTheRightThing(unittest.TestCase):
    def test_one_thing_per_turn_is_always_stated(self):
        out = main._turn_shape_instruction("", False)
        self.assertIn("EXACTLY ONE OF", out)

    def test_offer_is_suppressed_once_made(self):
        out = main._turn_shape_instruction("", True)
        self.assertIn("ALREADY made", out)
        self.assertNotIn("ALREADY made", main._turn_shape_instruction("", False))

    def test_a_long_previous_reply_forces_one_sentence(self):
        out = main._turn_shape_instruction(CALL_948_LAST_TURN, True)
        self.assertIn("ONE sentence", out)
        self.assertIn(str(len(CALL_948_LAST_TURN)), out)

    def test_a_short_previous_reply_does_not(self):
        out = main._turn_shape_instruction("ठीक है, तो बताइए।", False)
        self.assertNotIn("ONE sentence", out)


class ItReachesTheModel(unittest.TestCase):
    def test_the_gate_leads_the_per_turn_directive(self):
        """It must be in the directive llm_node attaches, and lead it —
        the block is read top-down and turn shape gates everything else."""
        import ast
        import io

        src = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"),
                      encoding="utf-8").read()
        tree = ast.parse(src)
        assign = None
        for node in ast.walk(tree):
            if (isinstance(node, ast.Assign)
                    and any(getattr(t, "attr", "") == "_pending_turn_directive" for t in node.targets)
                    and isinstance(node.value, ast.BinOp)):
                assign = node
        self.assertIsNotNone(assign)
        first = ast.unparse(assign.value).split("+")[0].strip()
        self.assertEqual(first, "_turn_shape")

    def test_state_survives_across_turns(self):
        """_offer_already_made is an instance flag, not a per-turn local."""
        BASE = {"id": 1, "account_id": 1, "name": "T", "model": "gpt-4.1-mini",
                "voice": "shubh", "language": "hi-IN", "tone": "balanced",
                "system_prompt": "test", "enabled_functions": "end_call"}
        a = main.RealEstateAgent(dict(BASE), direction="outbound", call_type="phone")
        self.assertFalse(a._offer_already_made)


if __name__ == "__main__":
    unittest.main()
