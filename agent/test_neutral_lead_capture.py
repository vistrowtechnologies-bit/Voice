# -*- coding: utf-8 -*-
"""Platform lead-capture wording must not steer a non-property business into
real-estate questions (call 1439, 21 Oct 2026).

A website enquiry on Vistrow's digital-marketing agent was asked "business
ke liye ya investment ke liye?" and for a locality: the platform's lead
capture block, its examples and log_lead's `purpose` field were written when
every tenant sold property. Property tenants' own prompts ask these.
"""

import inspect
import unittest
from unittest.mock import patch

import db
import main
import tools

CONFIG = {
    "id": 26, "name": "Artha", "model": "sarvam/sarvam-105b-conversations",
    "system_prompt": "You are Artha at a digital-marketing agency: websites and ads.",
    "kb_id": 0, "language": "hi-IN",
}


def _instructions():
    with patch.object(db, "get_kb_content", return_value=""), \
         patch.object(db, "is_kb_strict", return_value=False), \
         patch.object(db, "get_caller_memory", return_value=None):
        agent = main.RealEstateAgent(
            config=dict(CONFIG), visitor_phone="+919800000001", visitor_name=None,
            direction="inbound", call_type="web",
        )
    return agent.instructions


class LeadCaptureIsIndustryNeutral(unittest.TestCase):
    def test_no_property_examples_in_platform_rules(self):
        text = _instructions()
        self.assertNotIn("self-use ke liye", text)
        self.assertNotIn("a property type, a configuration", text)
        # Call 1458: naming the words, even to forbid them, primed Sarvam 105B.
        for word in ("investment", "self-use", "locality", "BHK", "Two localities"):
            self.assertNotIn(word, text)
        self.assertIn("Ask only about what THIS business offers", text)

    def test_log_lead_property_fields_are_marked_property_only(self):
        doc = inspect.getdoc(tools.log_lead) or ""
        self.assertIn("purpose: Only if this business sells property", doc)
        for word in ("investment", "self-use", "BHK", "villa"):
            self.assertNotIn(word, doc)
        self.assertNotIn("When they want to buy", doc)


if __name__ == "__main__":
    unittest.main()
