"""Tool guardrails from the LLM bake-off (docs/LLM-BAKEOFF-2026-10-16.md).

Replaying 30 real turns through sarvam-105b-conversations showed two misses
the tools themselves can stop:
  * switch_reply_language called when the caller did not ask to change
    language (#10, #19) or with the language already active (#16);
  * end_call on "आप details मुझे WhatsApp पे भेज दीजिए" (#22) - a request,
    not a goodbye - hung up with no acknowledgement.
"""
import asyncio
import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import tools


def _ctx(turns, reply_language="hi-IN", userdata=None, provider="sarvam"):
    """turns: list of (role, text), oldest first."""
    agent = SimpleNamespace(
        _reply_language=reply_language, _pending_language=None, _pending_language_streak=0,
        _tts_provider=provider, _voice="", tts=SimpleNamespace(update_options=lambda **k: None),
    )
    items = [SimpleNamespace(role=r, text_content=t) for r, t in turns]
    ud = {} if userdata is None else userdata
    session = SimpleNamespace(current_agent=agent, history=SimpleNamespace(items=items), userdata=ud)
    return SimpleNamespace(session=session, userdata=ud), agent, ud


def _end(turns, userdata=None, **kw):
    ctx, _, ud = _ctx(turns, userdata=userdata, **kw)
    return asyncio.run(tools.end_call(ctx)), ud


def _switch(turns, language, reply_language="hi-IN"):
    ctx, agent, _ = _ctx(turns, reply_language=reply_language)
    return asyncio.run(tools.switch_reply_language(ctx, language)), agent


AGENT_LINE = ("assistant", "हमारे पास दो प्रोजेक्ट हैं, दोनों में प्लॉट उपलब्ध हैं।")


class EndCallOnInformationRequest(unittest.TestCase):
    REQUESTS = (
        # bake-off #22, verbatim
        "हम्म देखता हूं मैं, वापस कॉल करता हूं। आप details मुझे WhatsApp पे भेज दीजिए।",
        "WhatsApp पर details भेज दो",
        "माहिती पाठवा",
        "मला WhatsApp वर माहिती पाठवून द्या",
        "brochure bhej dijiye",
        "Please send me the details on WhatsApp",
        "मुझे कल कॉल कीजिए",
        "please call me back in the evening",
        "मला परत कॉल करा",
        "mujhe shaam ko call karna",
    )

    def test_refuses_and_asks_for_acknowledgement(self):
        for text in self.REQUESTS:
            with self.subTest(text=text):
                out, ud = _end([AGENT_LINE, ("user", text)])
                self.assertTrue(out.startswith("NOT ending the call"), out)
                self.assertIn("confirm", out)
                self.assertFalse(ud.get("ending_call"))

    def test_second_attempt_on_same_turn_ends_with_confirmation(self):
        # After the refusal the model speaks the confirmation and calls
        # end_call again; that must go through (main.py's wrap-up flow), and
        # the goodbye must still confirm the request.
        ud = {}
        turns = [AGENT_LINE, ("user", "ठीक है, आप मुझे व्हाट्सएप पर पूरी जानकारी भेज दीजिए")]
        first, _ = _end(turns, userdata=ud)
        self.assertTrue(first.startswith("NOT ending"))
        second, _ = _end(turns, userdata=ud)
        self.assertTrue(ud.get("ending_call"))
        self.assertIn("confirm the team will send", second)

    def test_request_with_explicit_bye_ends_now_and_confirms(self):
        out, ud = _end([AGENT_LINE, ("user", "ठीक है WhatsApp पे details भेज देना, bye")])
        self.assertTrue(ud.get("ending_call"))
        self.assertIn("confirm the team will send", out)

    def test_not_a_request(self):
        for text in ("WhatsApp button chahiye website mein", "मैं वापस कॉल करता हूं, ठीक है धन्यवाद",
                     "मला वेबसाइट पाहिजे"):
            with self.subTest(text=text):
                self.assertFalse(tools._asks_for_information(text))


class EndCallLegitimateEndings(unittest.TestCase):
    def test_farewells_still_end(self):
        for text in ("ठीक है bye", "धन्यवाद, नंतर बोलू", "जी ना, थैंक यू। थैंक यू, बाय।",
                     "No thanks, not interested. Bye.", "ok thank you so much"):
            with self.subTest(text=text):
                out, ud = _end([AGENT_LINE, ("user", text)])
                self.assertTrue(ud.get("ending_call"), out)
                self.assertTrue(out.startswith("The caller is done"), out)
                self.assertNotIn("send them what they asked for", out)


class SwitchReplyLanguageGuards(unittest.TestCase):
    def test_same_language_is_a_no_op_that_asks_for_the_answer(self):
        # bake-off #16: Marathi already active, caller asked about the offer.
        out, agent = _switch([("user", "की ऑफर बद्दल सांगा तुम्ही आत्ता काय बोलला ते")], "Marathi", "mr-IN")
        self.assertEqual(agent._reply_language, "mr-IN")
        self.assertIn("nothing changed", out)
        self.assertIn("Answer what the caller just said", out)

    def test_question_about_languages_does_not_switch(self):
        # bake-off #10
        out, agent = _switch([("user", "आप कितनी भाषाओं में बात कर सकते हो मुझसे?")], "English")
        self.assertEqual(agent._reply_language, "hi-IN")
        self.assertTrue(out.startswith("Not switching"), out)
        self.assertIn("answer what they just said", out)

    def test_marathi_reply_does_not_switch_to_english(self):
        # bake-off #19 shape on a Marathi call
        out, agent = _switch([("user", "नाही आहे, अजून ठरवलं नाही")], "English", "mr-IN")
        self.assertEqual(agent._reply_language, "mr-IN")
        self.assertTrue(out.startswith("Not switching"), out)

    def test_explicit_requests_still_switch(self):
        cases = [
            ("मला मराठीतून बोलायचं आहे", "Marathi", "mr-IN"),     # bake-off #7
            ("ओके, तुम्ही मराठी में बोलू शकता का?", "Marathi", "mr-IN"),  # #15
            ("अंग्रेजी में बात करो please", "English", "en-IN"),
            ("ओके, कुड यू प्लीज स्पीक इन इंग्लिश?", "English", "en-IN"),  # #11
            ("तुम्ही इंग्रजीत बोलू शकता का", "English", "en-IN"),
            ("Can you speak in Hindi please", "Hindi", "hi-IN"),
        ]
        for text, lang, code in cases:
            with self.subTest(text=text):
                out, agent = _switch([("user", text)], lang, "en-IN" if code == "hi-IN" else "hi-IN")
                self.assertEqual(agent._reply_language, code, out)

    def test_caller_who_switched_themselves_still_switches(self):
        # Whole turn in English on a Hindi call; whole turn in Marathi
        # (same script as Hindi) on a Hindi call.
        out, agent = _switch([("user", "Okay so what is the price of the two bedroom flat")], "English")
        self.assertEqual(agent._reply_language, "en-IN", out)
        out, agent = _switch([("user", "मला दोन बेडरूमचा फ्लॅट पाहिजे, किंमत किती आहे")], "Marathi")
        self.assertEqual(agent._reply_language, "mr-IN", out)


if __name__ == "__main__":
    unittest.main()
