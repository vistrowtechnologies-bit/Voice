"""Exit-intent detection (_EXIT_INTENT_PATTERN, _current_objective).

On call 907 the caller asked to wrap up three separate times - "baad mein
dekhenge", "koi basic info WhatsApp pe bhej dena", "abhi sirf WhatsApp pe
info bhej do" - and after each one was asked another qualifying question,
including a decision-maker question they had already answered. The prompt
already forbade this; prose did not hold it across a long call, so the rule
lives in code and lands in the per-turn objective, which is the last thing
the model reads.

The precision tests matter more than the recall tests: a false positive ends
a call on an engaged lead.
"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main


class ExitIntentDetection(unittest.TestCase):
    def test_call_907_verbatim(self):
        # The three the agent talked straight through.
        for text in (
            "बाद में देखेंगे।",
            "कोई बेसिक इन्फो व्हाट्सएप पे भेज देना।",
            "अभी सिर्फ WhatsApp पे इन्फो भेज दो।",
        ):
            with self.subTest(text=text):
                self.assertEqual(main._detect_customer_intent(text, []), "wrap_up")

    def test_other_natural_exit_phrasings(self):
        for text in (
            "Aaj ke liye bas itna hi.",
            "अभी इतना ही काफी है",
            "Abhi zyada detail mein nahi jaana",
            "WhatsApp pe details bhej do",
            "main dekh loonga",
            "Abhi call end karte hain",
            "I have to go, send me the details",
            "I'll check and get back to you",
            "abhi time nahi hai",
        ):
            with self.subTest(text=text):
                self.assertEqual(main._detect_customer_intent(text, []), "wrap_up")

    def test_deferring_a_topic_while_asking_a_question_is_not_an_exit(self):
        # Call 911, verbatim: the caller pushed design aside and asked for the
        # price in the same breath. The agent said goodbye mid-question.
        # Someone who wants an answer wants the call to continue.
        text = "वो सब बाद में देखते हैं। पहले मुझे आप इसका प्राइस बताइए।"
        self.assertNotEqual(main._detect_customer_intent(text, []), "wrap_up")

    def test_other_defer_plus_ask_combinations(self):
        for text in (
            "Design baad mein dekhenge, pehle price bata do",
            "Baaki baad mein, abhi ye batao kitna kharcha aayega",
            "That we'll see later, but tell me how much it costs",
            "Bas itna hi features, par rate kya rahega?",
        ):
            with self.subTest(text=text):
                self.assertNotEqual(main._detect_customer_intent(text, []), "wrap_up")

    def test_a_real_exit_still_fires_when_it_asks_nothing_back(self):
        # The guard must not swallow genuine exits - these ask for nothing.
        for text in (
            "बाद में देखेंगे।",
            "कोई बेसिक इन्फो व्हाट्सएप पे भेज देना।",
            "Aaj ke liye bas itna hi.",
        ):
            with self.subTest(text=text):
                self.assertEqual(main._detect_customer_intent(text, []), "wrap_up")

    def test_does_not_fire_on_an_engaged_caller(self):
        # These all mention WhatsApp or "dekhna" but are REQUIREMENTS, not
        # exits. Ending the call on any of these loses a live lead.
        for text in (
            "Website mein WhatsApp button chahiye",
            "Log WhatsApp se contact kar sakein",
            "WhatsApp integration ho sakta hai kya?",
            "Mujhe ek nayi website banwani hai",
            "Haan boliye",
            "Do-teen hafte mein start karna hai",
            "Main hi decide karunga",
            "Aapki website dekhi thi maine",
        ):
            with self.subTest(text=text):
                self.assertNotEqual(main._detect_customer_intent(text, []), "wrap_up")


class MarathiExitIntent(unittest.TestCase):
    """Marathi shares Devanagari with Hindi but not its verbs, so none of the
    Hindi patterns fired on call 914 - the caller asked to stop three times
    and was questioned after each one. Marathi matters most of the languages
    we do not yet cover: STT is pinned to hi-IN, so Devanagari languages still
    transcribe correctly and actually reach these patterns intact."""

    def test_call_914_verbatim(self):
        for text in (
            "बेसिक इन्फॉर्मेशन पाहिजे मला व्हाट्सएप्प वर पाठवून द्या बघेन मी",
            "आता थोड़ा। पुढे नाही जायचं",
        ):
            with self.subTest(text=text):
                self.assertEqual(main._detect_customer_intent(text, []), "wrap_up")

    def test_common_marathi_exits(self):
        for text in (
            "बस एवढंच",
            "सध्या इतकंच पुरे",
            "नंतर बघू",
            "नंतर बोलू आपण",
            "मी बघतो आणि कळवतो",
            "आत्ता वेळ नाही",
            "फोन ठेवतो",
            "WhatsApp वर पाठवा",
        ):
            with self.subTest(text=text):
                self.assertEqual(main._detect_customer_intent(text, []), "wrap_up")

    def test_a_marathi_question_is_never_an_exit(self):
        # Call 914's actual price question, plus variants. The Hindi version
        # of this bug ended a call mid-question on call 911.
        for text in (
            "रेट्सचा थोडा अंदाजा मिळेल का? रफ रेंज सुधा",
            "किती खर्च येईल सांगा",
            "नंतर बघू, पण आधी दर सांगा",
            "पुढे नको, फक्त किती पैसे ते सांगा",
        ):
            with self.subTest(text=text):
                self.assertNotEqual(main._detect_customer_intent(text, []), "wrap_up")

    def test_engaged_marathi_caller_is_not_an_exit(self):
        for text in (
            "मला नवीन वेबसाइट पाहिजे",
            "माझा छोटासा स्वीट्सचा बिझनेस आहे",
            "WhatsApp चं बटण पाहिजे वेबसाइटवर",
            "हो सांगा",
        ):
            with self.subTest(text=text):
                self.assertNotEqual(main._detect_customer_intent(text, []), "wrap_up")


class WrapUpObjective(unittest.TestCase):
    def test_objective_forbids_further_questions(self):
        obj = main._current_objective(0, "wrap_up")
        self.assertIn("CLOSE THE CALL NOW", obj)
        self.assertIn("Ask NO further question", obj)

    def test_wrap_up_outranks_the_funnel_at_every_stage(self):
        for stage in range(len(main._FUNNEL_STAGES)):
            with self.subTest(stage=stage):
                self.assertIn("CLOSE THE CALL NOW",
                              main._current_objective(stage, "wrap_up"))

    def test_sticky_flag_holds_after_the_signal_turn(self):
        # The turn after "bhej do" is usually a bare "haan" or "theek hai",
        # which carries no exit signal of its own. Without the standing flag
        # the agent resumes qualifying, which is exactly what call 907 did.
        obj = main._current_objective(0, "", wrap_up_requested=True)
        self.assertIn("CLOSE THE CALL NOW", obj)

    def test_normal_calls_are_untouched(self):
        obj = main._current_objective(0, "")
        self.assertNotIn("CLOSE THE CALL NOW", obj)


if __name__ == "__main__":
    unittest.main(verbosity=2)
