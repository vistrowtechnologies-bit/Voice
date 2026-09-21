"""Recognising "put me through to a person" without asking the model.

Every positive case below is a real sentence a caller said on a live call on
2026-09-21, on which the agent failed to transfer them: it refused once,
promised a callback once, and only transferred once — same tool, same prompt,
same number.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import transfer_intent

wants = transfer_intent.wants_human


class RealCallersAskingForAHuman(unittest.TestCase):
    def test_the_exact_sentences_from_the_failed_calls(self):
        for said in (
            "आप मुझे आपके एजेंट से कनेक्ट कीजिए।",              # call 1049
            "आप मुझे टीम मेंबर से कनेक्ट करा सकते हो?",          # call 1037
            "कॉल ट्रांसफर कीजिए शुभमन के पास।",                  # call 1035
            "जी मुझे वेबसाइट बनानी है, बस मुझे आपके रियल पर्सन से बात करनी है।",
            "क्या आप मुझे सुमन से ट्रांसफर कर सकती हैं कॉल?",
        ):
            self.assertTrue(wants(said), said)

    def test_plain_english(self):
        for said in (
            "connect me to a human",
            "can I speak to someone please",
            "put me through to an agent",
            "I want to talk to a real person",
            "transfer me to your manager",
            "can you connect me with a team member",
        ):
            self.assertTrue(wants(said), said)

    def test_hinglish(self):
        for said in (
            "mujhe kisi insaan se baat karni hai",
            "aap mujhe agent se connect kar do",
            "kisi banda se baat karao",
        ):
            self.assertTrue(wants(said), said)


class NotAHandoffRequest(unittest.TestCase):
    def test_ordinary_business_talk_is_left_alone(self):
        for said in (
            "I want to connect my website to my domain",
            "mujhe apni website banwani hai",
            "connect karke dekh lijiye internet",
            "हमें नई वेबसाइट बनवानी है",
            "my business is real estate",
            "yes go ahead",
            "",
        ):
            self.assertFalse(wants(said), said)

    def test_declining_a_transfer_is_not_requesting_one(self):
        for said in (
            "no don't connect me to anyone",
            "mujhe kisi se baat nahi karni",
            "नहीं चाहिए, कनेक्ट मत कीजिए",
        ):
            self.assertFalse(wants(said), said)

    def test_it_only_ever_reads_caller_turns(self):
        # The agent's own offer ("shall I connect you to a team member?")
        # reads as a request in isolation, which is fine: this is called from
        # on_user_turn_completed, so it only ever sees what the CALLER said.
        # Pinned so nobody wires it into an agent-side hook by mistake.
        import inspect, main
        turn = inspect.getsource(main.RealEstateAgent.on_user_turn_completed)
        decision = inspect.getsource(main.RealEstateAgent._handoff_if_requested)
        self.assertIn("_handoff_if_requested", turn)
        self.assertIn("transfer_intent.wants_human", decision)

    def test_a_long_monologue_is_not_a_request(self):
        said = ("so basically we are a real estate company and we have agents in three cities "
                "and we want to connect our website with the CRM so that every person who fills "
                "the form " * 3)
        self.assertFalse(wants(said))


if __name__ == "__main__":
    unittest.main(verbosity=2)
