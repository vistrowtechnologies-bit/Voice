"""Recording + AI disclosure in the opening line (privacy audit gap 7)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")

import call_disclosure as cd

HI = cd.DEFAULT_NOTICES["hi"]
EN = cd.DEFAULT_NOTICES["en"]
RECORDING = {"record_calls": True}


class WhatIsAnnounced(unittest.TestCase):
    def test_recording_on_announces_in_call_language(self):
        self.assertEqual(cd.recording_disclosure(RECORDING, "hi-IN"), HI)
        self.assertEqual(cd.recording_disclosure(RECORDING, "en-IN"), EN)
        # No Indian-language translation shipped beyond Hindi: English, not
        # a guessed translation.
        self.assertEqual(cd.recording_disclosure(RECORDING, "ta-IN"), EN)

    def test_existing_config_without_the_key_announces(self):
        # Accounts saved before announce_recording existed get the default (on).
        self.assertEqual(cd.recording_disclosure({"record_calls": True, "require_consent": False}, "hi-IN"), HI)

    def test_recording_off_never_says_recorded(self):
        self.assertEqual(cd.recording_disclosure({"record_calls": False}, "hi-IN"), "")
        self.assertEqual(cd.recording_disclosure({}, "hi-IN"), "")
        self.assertEqual(cd.recording_disclosure(None, "en-IN"), "")

    def test_owner_turned_it_off(self):
        self.assertEqual(cd.recording_disclosure({"record_calls": True, "announce_recording": False}, "hi-IN"), "")

    def test_owner_wording_wins(self):
        cfg = {"record_calls": True, "recording_notice": "  Yeh call   record ho rahi hai. "}
        self.assertEqual(cd.recording_disclosure(cfg, "en-IN"), "Yeh call record ho rahi hai.")

    def test_platform_demo_is_left_alone(self):
        self.assertEqual(cd.recording_disclosure(RECORDING, "hi-IN", is_platform_demo=True), "")


class FoldedIntoTheOpener(unittest.TestCase):
    def test_before_the_closing_question_english(self):
        out = cd.with_disclosure("Hi, thanks for calling Acme Dental — how can I help you today?", EN)
        self.assertEqual(out, f"Hi, thanks for calling Acme Dental. {EN} How can I help you today?")

    def test_before_the_closing_question_hindi(self):
        opener = "नमस्ते, Acme से बात कर रही हूँ। मैं आपकी कैसे मदद कर सकती हूँ?"
        out = cd.with_disclosure(opener, HI)
        self.assertEqual(out, f"नमस्ते, Acme से बात कर रही हूँ। {HI} मैं आपकी कैसे मदद कर सकती हूँ?")

    def test_single_question_appends(self):
        out = cd.with_disclosure("नमस्ते, क्या अभी दो मिनट बात कर सकते हैं?", HI)
        self.assertEqual(out, f"नमस्ते, क्या अभी दो मिनट बात कर सकते हैं? {HI}")

    def test_statement_appends_with_punctuation(self):
        self.assertEqual(cd.with_disclosure("Welcome to Acme", EN), f"Welcome to Acme. {EN}")

    def test_owner_already_disclosed(self):
        opener = "Hello! This call may be recorded for quality. How can I help?"
        self.assertEqual(cd.with_disclosure(opener, EN), opener)
        hindi = "नमस्ते, यह कॉल रिकॉर्ड की जाती है। बताइए?"
        self.assertEqual(cd.with_disclosure(hindi, HI), hindi)

    def test_nothing_to_say(self):
        self.assertEqual(cd.with_disclosure("Hi there — how can I help?", ""), "Hi there — how can I help?")

    def test_disclosure_is_short(self):
        # Spoken before the caller's first turn: keep it to one short sentence.
        for text in cd.DEFAULT_NOTICES.values():
            self.assertLess(len(text), 80)

    def test_instruction(self):
        self.assertEqual(cd.instruction(""), "")
        self.assertIn(EN, cd.instruction(EN))


class AgentWiring(unittest.TestCase):
    """The real RealEstateAgent folds the line into its welcome message."""

    @classmethod
    def setUpClass(cls):
        import main
        cls.main = main

    def _agent(self, compliance, **extra):
        cfg = {
            "id": 1, "account_id": 1, "name": "Test", "model": "gpt-4.1-mini",
            "voice": "shubh", "language": "hi-IN", "tone": "balanced",
            "system_prompt": "You are a test agent.", "enabled_functions": "end_call",
            "welcome_message": "नमस्ते, Acme से बात कर रही हूँ। मैं आपकी कैसे मदद कर सकती हूँ?",
            "_compliance_config": compliance,
        }
        cfg.update(extra)
        return self.main.RealEstateAgent(cfg, direction="inbound", call_type="phone")

    def test_recording_on_welcome_message_carries_disclosure(self):
        a = self._agent({"record_calls": True})
        self.assertIn(HI, a._welcome_message)
        self.assertEqual(a._recording_disclosure, HI)

    def test_recording_off_welcome_message_unchanged(self):
        a = self._agent({"record_calls": False})
        self.assertNotIn(HI, a._welcome_message)
        self.assertEqual(a._recording_disclosure, "")

    def test_announcement_off(self):
        a = self._agent({"record_calls": True, "announce_recording": False})
        self.assertNotIn(HI, a._welcome_message)

    def test_caller_speaks_first_gets_it_in_first_reply(self):
        a = self._agent({"record_calls": True}, first_speaker="user")
        self.assertIn("# Recording notice", a.instructions)
        b = self._agent({"record_calls": True})
        self.assertNotIn("# Recording notice", b.instructions)


if __name__ == "__main__":
    unittest.main()
