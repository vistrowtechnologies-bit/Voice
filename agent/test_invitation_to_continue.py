"""The caller asking you to speak is never a reason to hang up.

Campaign calls 917 and 918 ended 39 and 52 seconds in, on recipients whose
last words were "बोलिए ना।" and "हाँ बोलिए।" - go ahead, speak. Every existing
end_call guard passed them: nine characters is not a fragment, and neither is
a question, so nothing objected to hanging up on someone actively inviting
the agent to continue.

The same phrase family broke the opening: _OPENING_ACK_PATTERN lists "बोलिए"
but not the particle "ना", and it anchors on the whole string, so "बोलिए ना।"
failed and the configured opening was never played verbatim - the model
improvised one, flagged live as "Agent replayed its opening line mid-call".
"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
from language import invites_you_to_continue
import main


class Invitation(unittest.TestCase):
    def test_call_917_and_918_verbatim(self):
        for text in ("बोलिए ना।", "हाँ बोलिए।", "हाँ, बात कर सकते हैं।"):
            with self.subTest(text=text):
                self.assertTrue(invites_you_to_continue(text))

    def test_other_ways_of_handing_over_the_floor(self):
        for text in ("जी बताइए", "बताइए ना", "कहिए", "हो सांगा", "बोला ना",
                     "go ahead", "yes tell me", "boliye na", "please continue",
                     "I'm listening"):
            with self.subTest(text=text):
                self.assertTrue(invites_you_to_continue(text))

    def test_not_an_invitation(self):
        for text in ("बस इतना ही", "WhatsApp pe bhej dena", "मुझे वेबसाइट चाहिए",
                     "धन्यवाद, अलविदा", "मला नवीन वेबसाइट पाहिजे",
                     "आता थोड़ा। पुढे नाही जायचं"):
            with self.subTest(text=text):
                self.assertFalse(invites_you_to_continue(text))

    def test_a_long_question_is_not_an_invitation(self):
        # 30-char cap. At 60 this slipped through on the word "bataiye", but
        # it is a question to answer, not a cue to recite the opening.
        # end_call has its own question guard for these.
        self.assertFalse(invites_you_to_continue(
            "bataiye kitne ka padega yeh sab milakar total kitna hoga"))

    def test_an_exit_signal_still_wins(self):
        # A wrap-up must not be mistaken for an invitation just because it
        # contains a verb of speaking.
        for text in ("बस इतना ही, बाकी WhatsApp pe bhej dena", "अभी call end karte hain"):
            with self.subTest(text=text):
                self.assertEqual(main._detect_customer_intent(text, []), "wrap_up")


class OpeningAckAcceptsThem(unittest.TestCase):
    def test_invitations_release_the_configured_opening(self):
        # False here means the opening is not played verbatim and the model
        # improvises one instead.
        for text in ("बोलिए ना।", "हाँ, बात कर सकते हैं।", "हाँ बोलिए।"):
            with self.subTest(text=text):
                self.assertTrue(main._looks_like_opening_ack(text))

    def test_plain_acknowledgements_still_work(self):
        for text in ("जी", "हाँ", "hello", "yes", "okay"):
            with self.subTest(text=text):
                self.assertTrue(main._looks_like_opening_ack(text))

    def test_a_substantive_first_turn_is_not_an_ack(self):
        # Someone who opens with a requirement must get a real reply, not the
        # scripted opener recited over the top of what they just said.
        self.assertFalse(main._looks_like_opening_ack(
            "Haan, mujhe apne restaurant ke liye nayi website banwani hai"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
