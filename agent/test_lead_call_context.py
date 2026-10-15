"""Outbound calls to ArthaLeads leads: the lead's language and the default opener.

A lead that says "Telugu" on the form is called in Telugu when the agent's
voice can speak it (for that call only), and an agent with no opener of its
own opens by naming the person and what they enquired about. Operator-written
openers and every non-ArthaLeads call are unchanged."""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main
from language import lead_language

BASE = {
    "id": 1, "account_id": 1, "name": "Test", "model": "gpt-4.1-mini",
    "voice": "shubh", "language": "hi-IN", "tone": "balanced",
    "system_prompt": "You are a test agent.", "enabled_functions": "end_call",
    "_compliance_config": {},
}
LEAD = {"source": "arthaleads", "channel_source": "facebook", "project": "SP Khopoli",
        "preferred_language": "Telugu"}


def _context(fields=LEAD, direction="outbound"):
    return {"direction": direction, "custom_fields": dict(fields)}


class LeadLanguage(unittest.TestCase):
    def test_names_codes_and_endonyms(self):
        for value, code in (("Telugu", "te-IN"), ("telugu ", "te-IN"), ("te-IN", "te-IN"), ("te", "te-IN"),
                            ("తెలుగు", "te-IN"), ("हिंदी", "hi-IN"), ("English", "en-IN"), ("Oriya", "od-IN"),
                            ("Bangla", "bn-IN"), ("Telugu language", "te-IN")):
            self.assertEqual(lead_language(value), code, value)

    def test_unknown_blank_or_ambiguous_is_none(self):
        for value in (None, "", "French", "Hindi or English", "Any", "N/A"):
            self.assertIsNone(lead_language(value), value)


class ApplyLeadContext(unittest.TestCase):
    def test_lead_language_becomes_the_call_language(self):
        config = main._apply_lead_context(dict(BASE), _context(), "room")
        self.assertEqual(config["language"], "te-IN")
        self.assertEqual(config["_lead_fields"]["project"], "SP Khopoli")

    def test_stt_tts_and_prompt_follow_it(self):
        agent = main.RealEstateAgent(main._apply_lead_context(dict(BASE), _context(), "room"),
                                     "Priya Sharma", direction="outbound", call_type="phone")
        self.assertEqual(agent._reply_language, "te-IN")
        self.assertIn("speak first in Telugu", agent.instructions)
        self.assertEqual(getattr(agent.tts, "_opts").target_language_code, "te-IN")

        def stt_options(a):
            return str(vars(a.stt._opts) if hasattr(a.stt, "_opts") else vars(a.stt))

        control = main.RealEstateAgent(dict(BASE), "Priya Sharma", direction="outbound", call_type="phone")
        self.assertIn("te-IN", stt_options(agent))
        self.assertNotIn("te-IN", stt_options(control))

    def test_a_voice_that_cannot_speak_it_keeps_the_agent_language(self):
        for voice in ("google:hi-IN-Standard-A", "elevenlabs:zT03pEAEi0VHKciJODfn"):
            config = main._apply_lead_context({**BASE, "voice": voice}, _context(), "room")
            self.assertEqual(config["language"], "hi-IN", voice)
            self.assertIn("_lead_fields", config)
        # A multilingual Google persona can.
        config = main._apply_lead_context({**BASE, "voice": "google:chirp3:Kore"}, _context(), "room")
        self.assertEqual(config["language"], "te-IN")

    def test_inbound_and_non_arthaleads_calls_are_untouched(self):
        self.assertEqual(main._apply_lead_context(dict(BASE), _context(direction="inbound"), "r"), BASE)
        other = {**LEAD, "source": "facebook_lead_ads"}
        self.assertEqual(main._apply_lead_context(dict(BASE), _context(other), "r"), BASE)

    def test_unsupported_language_keeps_the_agent_language(self):
        config = main._apply_lead_context(dict(BASE), _context({**LEAD, "preferred_language": "French"}), "r")
        self.assertEqual(config["language"], "hi-IN")


class DefaultOpener(unittest.TestCase):
    def _agent(self, **overrides):
        config = main._apply_lead_context({**BASE, **overrides}, _context({**LEAD, "preferred_language": ""}), "r")
        return main.RealEstateAgent(config, "Priya Sharma", direction="outbound", call_type="phone")

    def test_no_operator_opener_gets_the_lead_opening(self):
        agent = self._agent()
        self.assertIn('"SP Khopoli"', agent._lead_opening)
        self.assertIn("Priya", agent._lead_opening)
        self.assertIn("In Hindi", agent._lead_opening)

    def test_operator_openers_stay_untouched(self):
        self.assertEqual(self._agent(welcome_message_outbound="Namaste, Mira here.")._lead_opening, "")
        self.assertEqual(self._agent(welcome_message="Hello from Acme.")._lead_opening, "")

    def test_other_calls_get_no_lead_opening(self):
        agent = main.RealEstateAgent(dict(BASE), "Priya", direction="outbound", call_type="phone")
        self.assertEqual(agent._lead_opening, "")

    def test_held_opening_release_speaks_the_lead_opening(self):
        said = []

        class Session:
            userdata = {"outbound_opening_pending": True, "user_state": "listening"}

            def generate_reply(self, instructions=""):
                said.append(instructions)

        class Agent:
            _HELD_OPENING_AFTER_SHORT_SPEECH_S = 0.05
            _HELD_OPENING_AFTER_SPEECH_S = 0.05
            _SHORT_FIRST_UTTERANCE_S = 1.2
            _HELD_OPENING_HARD_CAP_S = 0.1
            _welcome_message = ""
            _lead_opening = self._agent()._lead_opening
            session = Session()
            _release_held_opening_if_unheard = main.RealEstateAgent._release_held_opening_if_unheard

        asyncio.run(Agent()._release_held_opening_if_unheard())
        self.assertEqual(len(said), 1)
        self.assertTrue(said[0].startswith("They just sent us an enquiry about \"SP Khopoli\""), said[0])


if __name__ == "__main__":
    unittest.main()
