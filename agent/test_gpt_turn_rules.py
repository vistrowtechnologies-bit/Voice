# -*- coding: utf-8 -*-
"""GPT models get a hard reply-length rule; Sarvam does not (call 1443)."""
import unittest
from unittest.mock import patch

import db
import main


def _instructions(model):
    cfg = {"id": 26, "name": "Artha", "model": model, "system_prompt": "You are Artha.",
           "kb_id": 0, "language": "hi-IN"}
    with patch.object(db, "get_kb_content", return_value=""), \
         patch.object(db, "is_kb_strict", return_value=False), \
         patch.object(db, "get_caller_memory", return_value=None):
        return main.RealEstateAgent(config=cfg, visitor_phone="+919800000001", visitor_name=None,
                                    direction="inbound", call_type="web").instructions


class GptTurnRules(unittest.TestCase):
    def test_gpt_gets_the_hard_limit(self):
        text = _instructions("gpt-5.4-nano")
        self.assertIn("# Reply length (hard limit)", text)
        self.assertIn("ONE question per turn", text)

    def test_sarvam_prompt_is_unchanged(self):
        self.assertNotIn("# Reply length (hard limit)", _instructions("sarvam/sarvam-105b-conversations"))


if __name__ == "__main__":
    unittest.main()
