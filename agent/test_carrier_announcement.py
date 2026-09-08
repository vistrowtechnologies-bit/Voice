"""Carrier-announcement detection (_CARRIER_UNAVAILABLE_PATTERN).

An Indian carrier answers an unreachable number with a recorded "the number
you have dialled is currently busy" message, and LiveKit reports that leg as
answered, so the agent used to hold a full conversation with the recording.
Confirmed on campaign call 890: 46 seconds, 3.1 credits, and the agent tried
to qualify the announcement as a lead.

The precision half of these tests matters more than the recall half: a false
positive hangs up on a real prospect mid-sentence.
"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main


class CarrierAnnouncementDetection(unittest.TestCase):
    def test_call_890_gujarati_announcement(self):
        # Verbatim from the call-890 transcript.
        text = ("તમે જે નંબર ડાયલ કર્યો છે. શ્રી ી તી. હાલમાં વ્યસ્ત છે. "
                "કહ્યુંછે ી કૃપા કરી થોડા સમય પછી Cheap ડંડો.")
        self.assertTrue(main._CARRIER_UNAVAILABLE_PATTERN.search(text))

    def test_call_890_english_and_hindi_fragments(self):
        for text in (
            "The number you have dialed",
            "के द्वारा डायल किया गया नंबर।",
            "the number you have dialled is currently busy, please try again later",
        ):
            with self.subTest(text=text):
                self.assertTrue(main._CARRIER_UNAVAILABLE_PATTERN.search(text))

    def test_other_indian_language_announcements(self):
        for text in (
            "आपण डायल केलेला क्रमांक व्यस्त आहे",
            "நீங்கள் டயல் செய்த எண் தற்போது பிஸியாக உள்ளது",
            "the subscriber is out of coverage area",
            "all lines are busy, please try again",
        ):
            with self.subTest(text=text):
                self.assertTrue(main._CARRIER_UNAVAILABLE_PATTERN.search(text))

    def test_does_not_fire_on_a_live_human(self):
        # Every one of these is something a real person says when they pick
        # up. Firing here would hang up on a prospect.
        for text in (
            "Hello?",
            "हाँ जी बोलिए",
            "Sorry, I'm busy right now, can you call me later?",
            "मैं अभी व्यस्त हूँ, थोड़ी देर बाद कॉल कीजिए",
            "My phone was switched off, that's why you couldn't reach me",
            "Haan, main abhi busy hoon",
            "I dialed your number yesterday but nobody picked up",
            "यह नंबर मेरा है, बताइए क्या काम है",
            "Who is this? Aapne call kiya tha?",
        ):
            with self.subTest(text=text):
                self.assertIsNone(main._CARRIER_UNAVAILABLE_PATTERN.search(text))

    def test_voicemail_and_carrier_patterns_stay_distinct(self):
        # A voicemail box gets a spoken apology; a carrier recording gets
        # silence and an immediate hang-up. Mixing them up means either
        # talking to a machine or leaving no message for a real person.
        voicemail = "Please leave a message after the tone"
        self.assertTrue(main._VOICEMAIL_GREETING_PATTERN.search(voicemail))
        self.assertIsNone(main._CARRIER_UNAVAILABLE_PATTERN.search(voicemail))


if __name__ == "__main__":
    unittest.main(verbosity=2)
