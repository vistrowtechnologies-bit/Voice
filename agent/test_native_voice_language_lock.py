# -*- coding: utf-8 -*-
"""A Native (locale Standard) voice speaks one language: no switch (call 1447).

Asked for Marathi, the Hindi Standard voice read Marathi text; "हिंदी is good"
then flipped the language back and forth until the tool-step limit left the
caller in silence.
"""
import asyncio
import os
import sys
import unittest
from types import SimpleNamespace

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tools


def _switch(voice, language, reply_language="hi-IN", turn="क्या आप मराठी में बात कर सकते हो?"):
    agent = SimpleNamespace(
        _reply_language=reply_language, _pending_language=None, _pending_language_streak=0,
        _tts_provider="google-native", _voice=voice, _speaking_voice=voice,
        tts=SimpleNamespace(update_options=lambda **k: None),
    )
    items = [SimpleNamespace(role="user", text_content=turn)]
    session = SimpleNamespace(current_agent=agent, history=SimpleNamespace(items=items), userdata={})
    ctx = SimpleNamespace(session=session, userdata={})
    return asyncio.run(tools.switch_reply_language(ctx, language)), agent


class NativeVoiceIsLocked(unittest.TestCase):
    def test_standard_voice_refuses_marathi_and_keeps_hindi(self):
        out, agent = _switch("google:hi-IN-Standard-A", "Marathi")
        self.assertIn("Not switched: this voice speaks only Hindi", out)
        self.assertEqual(agent._reply_language, "hi-IN")

    def test_asking_for_the_current_language_is_still_a_no_op(self):
        out, agent = _switch("google:hi-IN-Standard-A", "Hindi", turn="हिंदी is good")
        self.assertIn("No switch needed", out)
        self.assertEqual(agent._reply_language, "hi-IN")

    def test_chirp3_hd_voice_still_switches(self):
        out, agent = _switch("google:chirp3:Callirrhoe", "Marathi")
        self.assertNotIn("Not switched", out)


if __name__ == "__main__":
    unittest.main()
