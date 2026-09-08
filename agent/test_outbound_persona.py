"""The built-in persona on a call WE placed.

A tenant who leaves system_prompt empty and runs an outbound campaign used to
get the inbound persona, which is written for someone who rang us - so it
opened with the equivalent of "how can I help you" on a call the recipient
did not make. Every rule asserted here is a failure seen on a real outbound
call before it was written down.

The layer is deliberately industry-agnostic. It must add nothing about
websites, property or clinics - the knowledge base says what the business
sells; this layer only says what is different about having dialled.
"""
import os, re, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
from prompts.generic_assistant import build_generic_assistant_prompt, build_outbound_layer


class OutboundLayer(unittest.TestCase):
    def setUp(self):
        self.raw = build_outbound_layer("Acme Dental")
        # The prompt is hard-wrapped for readability, so a phrase can straddle
        # a newline. Match against a whitespace-normalised copy rather than
        # writing assertions that break whenever a line is re-wrapped.
        self.text = re.sub(r"\s+", " ", self.raw)

    def test_states_plainly_that_we_dialled(self):
        self.assertIn("You called this person", self.text)
        self.assertIn("They did not call you", self.text)

    def test_forbids_inbound_opening(self):
        # The actual failure: an outbound call opening like a receptionist.
        self.assertIn("how can I help you", self.text)
        self.assertIn("NEVER open with", self.text)

    def test_forbids_asking_for_the_phone_number(self):
        # We are speaking to them on it. Asking reads as a scam call.
        self.assertIn("NEVER ask for their phone number", self.text)

    def test_covers_an_interrupted_opener(self):
        # Call 913: the opener was spoken over, the reason for the call was
        # never heard, and the recipient asked "did you even call me?".
        self.assertIn("cut off", self.text)

    def test_covers_stop_signals(self):
        # Call 907 and 914: asked to stop, questioned anyway.
        self.assertIn("send me the details", self.text)
        self.assertIn("Do NOT ask one more", self.text)

    def test_forbids_re_introducing_mid_call(self):
        # Call 899: three bare "hello"s produced three fresh introductions.
        self.assertIn("Never re-introduce yourself", self.text)

    def test_pricing_neither_invented_nor_stonewalled(self):
        self.assertIn("do not invent a figure", self.text)
        self.assertIn("do not stonewall", self.text)

    def test_accepts_approximate_answers(self):
        self.assertIn("Not sure yet", self.text)

    def test_business_name_is_interpolated(self):
        self.assertIn("Acme Dental", self.text)

    def test_stays_industry_agnostic(self):
        # A tenant selling dental appointments must not inherit a layer that
        # talks about websites. That belongs in their knowledge base.
        lowered = self.text.lower()
        for leaked in ("website development", "wordpress", "property", "bhk",
                       "real estate", "domain and hosting", "vistrow"):
            with self.subTest(term=leaked):
                self.assertNotIn(leaked, lowered)


class InboundIsUntouched(unittest.TestCase):
    def test_inbound_persona_has_no_outbound_rules(self):
        # An inbound caller DID ring us; telling that agent it dialled them
        # would be worse than the bug being fixed.
        inbound = build_generic_assistant_prompt("Artha", "Acme Dental", False)
        self.assertNotIn("You called this person", inbound)
        self.assertNotIn("NEVER ask for their phone number", inbound)

    def test_inbound_persona_still_asks_for_contact_details(self):
        # WHO is the first thing the inbound persona qualifies, and it needs
        # a number because an inbound caller has not given us one.
        inbound = build_generic_assistant_prompt("Artha", "Acme Dental", False)
        self.assertIn("WHO", inbound)


if __name__ == "__main__":
    unittest.main(verbosity=2)
