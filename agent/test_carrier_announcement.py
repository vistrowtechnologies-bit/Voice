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


class CarrierOutcome(unittest.TestCase):
    """busy vs switched_off: the follow-up rules retry them on different
    gaps (10 min vs 2 h by default), so the agent must record which it heard."""

    def test_busy_announcements(self):
        for text in (
            "the number you have dialled is currently busy, please try again later",
            "all lines are busy, please try again",
            "आपने जिस व्यक्ति को कॉल किया है वह दूसरी कॉल पर व्यस्त है",
            "आपण डायल केलेला क्रमांक सध्या व्यस्त आहे",
            "તમે જે નંબર ડાયલ કર્યો છે તે હાલમાં વ્યસ્ત છે",
            "நீங்கள் டயல் செய்த எண் தற்போது பிஸியாக உள்ளது",
            # Telugu: "the customer you are calling is busy on another call"
            "మీరు కాల్ చేస్తున్న కస్టమర్ మరో కాల్‌లో బిజీగా ఉన్నారు",
        ):
            with self.subTest(text=text):
                self.assertEqual(main._carrier_outcome(text), "busy")

    def test_switched_off_and_not_reachable_announcements(self):
        for text in (
            "the number you have dialled is currently switched off",
            "the subscriber is out of coverage area",
            "the number you are calling is not reachable at the moment",
            "आप द्वारा डायल किया गया नंबर अभी बंद है",
            # Telugu: "the customer you are calling is switched off" /
            # "not in the coverage area" / "currently not available"
            "మీరు కాల్ చేస్తున్న కస్టమర్ స్విచ్ ఆఫ్ చేయబడింది",
            "మీరు డయల్ చేసిన నంబర్ ప్రస్తుతం కవరేజ్ ప్రాంతంలో లేరు",
            "కస్టమర్ ప్రస్తుతం అందుబాటులో లేరు దయచేసి కొంత సమయం తర్వాత ప్రయత్నించండి",
        ):
            with self.subTest(text=text):
                self.assertEqual(main._carrier_outcome(text), "switched_off")

    def test_a_live_person_is_neither(self):
        for text in ("hello?", "sorry, I'm busy right now", "my phone was switched off yesterday",
                     "హలో, ఎవరు మాట్లాడుతున్నారు?", ""):
            with self.subTest(text=text):
                self.assertEqual(main._carrier_outcome(text), "")

    def test_telugu_voicemail_greeting(self):
        for text in ("మీ కాల్ వాయిస్ మెయిల్‌కు మళ్లించబడింది", "బీప్ తర్వాత మీ సందేశాన్ని రికార్డ్ చేయండి"):
            with self.subTest(text=text):
                self.assertTrue(main._VOICEMAIL_GREETING_PATTERN.search(text))
        self.assertFalse(main._VOICEMAIL_GREETING_PATTERN.search("నేను మీకు సందేశం పంపుతాను"))


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

    def test_call_980_busy_on_another_call(self):
        # Verbatim from the call-980 transcript, in the pieces STT delivered them.
        for text in (
            "केलेला आहे. सध्या इतर कोणाशी बोलत आहे. आपण प्रतीक्षा करू शकता किंवा नंतर पुन्हा प्रयत्न करू शकता.",
            "आपने जिस व्यक्ति को कॉल किया है, वह अभी दूसरे कॉल पर व्यस्त है।",
            "कृपया प्रतीक्षा करिए। या कुछ समय पश्चात प्रयास करें।",
            "द पर्सन यू हैव कॉल्ड इज स्पीकिंग टू समवन एल्स।",
            "The person you have called is speaking to someone else",
        ):
            with self.subTest(text=text):
                self.assertTrue(main._CARRIER_UNAVAILABLE_PATTERN.search(text))

    def test_call_983_marathi_number_busy(self):
        # Verbatim first line of the call-983 transcript — नंबर, not क्रमांक (already
        # covered). The follow-up line ("please try again after a while") is deliberately
        # NOT asserted here: on its own it's plausible from a real caller too, and this
        # first line is what the detector actually needs — it already checks the first 3
        # outbound turns, not just the first one, so this alone is enough to catch the call.
        self.assertTrue(main._CARRIER_UNAVAILABLE_PATTERN.search("आपण डायल केलेला नंबर सध्या व्यस्त आहे."))

    def test_a_human_on_another_call_is_not_an_announcement(self):
        for text in (
            "मैं अभी दूसरे कॉल पर हूँ, बाद में बात करते हैं",
            "Sorry, I'm speaking to someone else, call me later",
            "आपने किसको कॉल किया है?",
            "थोड़ी देर बाद कॉल कीजिए",
        ):
            with self.subTest(text=text):
                self.assertIsNone(main._CARRIER_UNAVAILABLE_PATTERN.search(text))

    def test_does_not_fire_on_a_live_human(self):
        # Every one of these is something a real person says when they pick
        # up. Firing here would hang up on a prospect.
        for text in (
            "Hello?",
            "हाँ जी बोलिए",
            "Sorry, I'm busy right now, can you call me later?",
            "मैं अभी व्यस्त हूँ, थोड़ी देर बाद कॉल कीजिए",
            "मी सध्या व्यस्त आहे, नंतर बोलूया",  # "I'm busy right now" — no "नंबर" or "डायल केलेला", must not match
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
