# -*- coding: utf-8 -*-
"""Two callers on the same agent must share almost the whole prompt.

Prompt caching (OpenAI today, Sarvam once they enable it) only reuses the
prefix up to the first differing character. Until 2026-09-24 the caller's
number and returning-caller memory sat BEFORE the knowledge base, voice
style and lead-capture rules, so only ~31% of a phone call's prompt was a
shared prefix; the rest was re-billed at full price on every turn. Anything
per-caller belongs in caller_tail, appended at the end with the timestamp.
"""

import os
import unittest
from unittest.mock import patch

import db
import main

CONFIG = {
    "id": 13, "name": "Mira", "model": "gpt-4.1-mini",
    "system_prompt": "You are Mira, a real-estate assistant. " * 40,
    "kb_id": 7, "memory_enabled": True, "language": "hi-IN",
}
KB = "Project X: 2BHK from 80 lakh. " * 150


def _prompt(phone, name=None, prior=None):
    with patch.object(db, "get_kb_content", return_value=KB), \
         patch.object(db, "is_kb_strict", return_value=False), \
         patch.object(db, "get_caller_memory", return_value=prior):
        agent = main.RealEstateAgent(
            config=dict(CONFIG), visitor_phone=phone, visitor_name=name,
            direction="inbound", call_type="phone",
        )
    return agent.instructions


class CallerDetailsStayAtTheEnd(unittest.TestCase):
    def _assert_shared(self, a, b):
        shared = len(os.path.commonprefix([a, b]))
        self.assertGreater(
            shared / len(a), 0.9,
            f"only {shared}/{len(a)} chars are shared between two callers — something "
            f"per-caller is mid-prompt again: {a[shared - 40:shared + 80]!r}",
        )
        # The knowledge base must sit inside the shared, cacheable part.
        self.assertIn(KB, a[:shared])

    def test_phone_callers_share_the_prompt(self):
        self._assert_shared(_prompt("+919800000001"), _prompt("+919811111112"))

    def test_returning_caller_memory_does_not_split_the_prefix(self):
        self._assert_shared(
            _prompt("+919800000001", prior="Wanted a 2BHK in Khopoli."),
            _prompt("+919811111112"),
        )

    def test_widget_callers_share_the_prompt(self):
        self._assert_shared(
            _prompt("+919800000001", name="Asha Rao"),
            _prompt("+919811111112", name="Vikram Shah"),
        )

    def test_caller_details_are_still_in_the_prompt(self):
        p = _prompt("+919800000001", name="Asha Rao", prior="Wanted a 2BHK in Khopoli.")
        self.assertIn("+919800000001", p)
        self.assertIn("Hi Asha", p)
        self.assertIn("Wanted a 2BHK in Khopoli.", p)
        # ...and the timestamp is still the very last block.
        self.assertGreater(p.rindex("# Current date and time"), p.rindex("# Caller context"))


if __name__ == "__main__":
    unittest.main()
