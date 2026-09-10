"""One thing per turn, enforced as state instead of as a prompt rule.

Call 950's last turn bundled a WhatsApp confirmation, a team-callback promise
and a promotion into 200 characters, and the caller dropped mid-sentence.
Agent 26's prompt forbade exactly that, in capitals, with a worked example,
three times over. Prompt text alone did not hold it — the same finding that
turned "use fillers sparingly" into _turns_since_filler.

The offer-specific half of this file is gone with the machinery it tested.
Policing a promotion the model kept bundling was the wrong shape of fix: the
promotion was removed from the tenant's system prompt, which was the only
place it came from. That also removed a text transform which had measurably
cost +339ms median per turn.
"""
import ast
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main

CALL_950_LAST_TURN = (
    "ठीक है, इसी number पे details भेज देती हूँ। हमारी team आपको call करके exact "
    "pricing और बाकी चीज़ें बता देगी। एक और बात — अभी offer चल रहा है, एक साल का "
    "domain और hosting बिल्कुल free मिल रहा है, बस enquiry के पंद्रह दिन"
)


class TheGateSaysTheRightThing(unittest.TestCase):
    def test_one_thing_per_turn_is_always_stated(self):
        self.assertIn("EXACTLY ONE OF", main._turn_shape_instruction(""))

    def test_a_long_previous_reply_forces_one_sentence(self):
        out = main._turn_shape_instruction(CALL_950_LAST_TURN)
        self.assertIn("ONE sentence", out)
        self.assertIn(str(len(CALL_950_LAST_TURN)), out)

    def test_a_short_previous_reply_does_not(self):
        self.assertNotIn("ONE sentence", main._turn_shape_instruction("ठीक है, तो बताइए।"))

    def test_the_threshold_is_between_the_two_measured_turns(self):
        """Call 950's bundled turn must trip it; an ordinary reply must not."""
        ordinary = "\nठीक है, direct enquiries वाली site चाहिए आपको। तो कब तक चाहिए?"
        self.assertGreater(len(CALL_950_LAST_TURN), main._LONG_REPLY_CHARS)
        self.assertLess(len(ordinary), main._LONG_REPLY_CHARS)


class ItReachesTheModel(unittest.TestCase):
    def test_the_gate_leads_the_per_turn_directive(self):
        """It must lead the block llm_node attaches — the directive is read
        top-down and turn shape gates everything else in it."""
        src = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"),
                      encoding="utf-8").read()
        assign = None
        for node in ast.walk(ast.parse(src)):
            if (isinstance(node, ast.Assign)
                    and any(getattr(t, "attr", "") == "_pending_turn_directive"
                            for t in node.targets)
                    and isinstance(node.value, ast.BinOp)):
                assign = node
        self.assertIsNotNone(assign)
        self.assertEqual(ast.unparse(assign.value).split("+")[0].strip(), "_turn_shape")


class TheOfferMachineryIsGone(unittest.TestCase):
    """It was replaced by removing the promotion from the prompt. Guard against
    it creeping back in as a text transform, which is where it cost +339ms."""

    def setUp(self):
        self.src = io.open(
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"),
            encoding="utf-8").read()

    def test_no_offer_transform(self):
        self.assertNotIn("_make_offer_turn_guard_transform", self.src)

    def test_only_two_text_transforms(self):
        """Every transform sits between the LLM and the TTS, so each one is a
        chance to re-break streaming."""
        i = self.src.index("tts_text_transforms=")
        block = self.src[i:i + 240]
        self.assertIn("filter_markdown", block)
        self.assertIn("_make_caller_gender_guard_transform", block)
        self.assertEqual(block.count("_make_"), 1)


if __name__ == "__main__":
    unittest.main()
