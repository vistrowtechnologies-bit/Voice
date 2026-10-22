# -*- coding: utf-8 -*-
"""Calls 1447-1449 (21 Oct 2026): voice-path fixes.

* the lead webhook lookup ran a synchronous DB read on the agent loop (~0.9 s
  stall per lead save);
* the 2.0 s thinking ack began ~3 s in on slow-starting voices (Studio,
  Studio Lite, Native), on top of the reply it was meant to cover;
* Studio voices emit no TTS metrics, so tts_node counts characters and audio.
"""
import asyncio
import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import main
import tools


class WebhookLookupOffTheLoop(unittest.TestCase):
    def test_get_webhook_url_runs_in_a_thread(self):
        seen = {}

        async def fake_to_thread(fn, *a, **k):
            seen["fn"] = fn
            return None

        ctx = SimpleNamespace(userdata={"account_id": 2, "agent_webhook_url": ""})
        with patch.object(tools.asyncio, "to_thread", fake_to_thread):
            asyncio.run(tools._post_webhook(ctx, {"type": "lead"}))
        self.assertIs(seen.get("fn"), tools.db.get_webhook_url)


class SourceGuards(unittest.TestCase):
    def test_backchannel_skips_slow_start_voices(self):
        src = inspect.getsource(main)
        i = src.index("def _arm_backchannel")
        block = src[i:i + 1600]
        self.assertIn("_GEMINI_PROVIDERS.values()", block)
        self.assertIn('_provider == "google-native"', block)

    def test_backchannel_needs_a_committed_turn(self):
        src = inspect.getsource(main)
        i = src.index("def _arm_backchannel")
        self.assertIn('userdata.get("turn_committed_at", 0) < userdata.get("speech_ended_at", 0)', src[i:i + 3000])
        self.assertIn('_userdata["turn_committed_at"] = time.monotonic()', inspect.getsource(main.RealEstateAgent.on_user_turn_completed))

    def test_tts_node_counts_chars_and_audio(self):
        src = inspect.getsource(main.RealEstateAgent.tts_node)
        self.assertIn('usage["ttsCharsSent"]', src)
        self.assertIn('usage["ttsAudioSOut"]', src)


if __name__ == "__main__":
    unittest.main()


class BharatVoiceFollowsLanguage(unittest.TestCase):
    """Call 1450: the Bharat (Sarvam) voice sits in a FallbackAdapter with no
    update_options, so a switch to Marathi never reached it."""

    def test_switch_reaches_the_sarvam_primary(self):
        seen = {}
        primary = SimpleNamespace(update_options=lambda **k: seen.update(k))
        adapter = SimpleNamespace(_vistrow_primary=primary)  # no update_options, like FallbackAdapter
        agent = SimpleNamespace(
            _reply_language="hi-IN", _pending_language=None, _pending_language_streak=0,
            _tts_provider="sarvam", _voice="priya", _speaking_voice="priya", tts=adapter,
        )
        items = [SimpleNamespace(role="user", text_content="Okay तुम्ही मराठीमध्ये बोलू शकता.")]
        session = SimpleNamespace(current_agent=agent, history=SimpleNamespace(items=items), userdata={})
        out = asyncio.run(tools.switch_reply_language(SimpleNamespace(session=session, userdata={}), "Marathi"))
        self.assertEqual(seen.get("target_language_code"), "mr-IN")
        self.assertIn("Marathi", out)

    def test_sarvam_branch_stashes_its_primary(self):
        src = inspect.getsource(main)
        self.assertIn("_adapter._vistrow_primary = sarvam_tts", src)


class NativeVoiceDropsHmm(unittest.TestCase):
    """Call 1452: the LLM's "हम्म," sounds odd on a Native Standard voice."""

    def _agent(self, voice, provider):
        return SimpleNamespace(_tts_provider=provider, _speaking_voice=voice, _last_opener="")

    def test_native_voice_drops_leading_hmm(self):
        a = self._agent("google:hi-IN-Standard-A", "google-native")
        self.assertEqual(main._vary_opener(a, "हम्म, पुढच्या महिन्यात"), "पुढच्या महिन्यात")

    def test_other_voices_keep_it(self):
        for voice, provider in (("google:chirp3:Callirrhoe", "google-native"), ("priya", "sarvam")):
            with self.subTest(voice=voice):
                a = self._agent(voice, provider)
                self.assertTrue(main._vary_opener(a, "हम्म, ठीक है").startswith("हम्म"))


class PlatformErrorLogOffTheLoop(unittest.TestCase):
    """Call 1460: logging a TTS failover held the agent loop ~0.9 s."""

    def test_runs_in_a_worker_thread(self):
        import threading
        seen = {}

        def fake_log(msg, **kw):
            seen["thread"] = threading.current_thread() is threading.main_thread()

        async def go():
            with patch.object(main.db, "log_platform_error", fake_log):
                main._log_platform_error_off_loop("tts down", source="agent_tts", level="warning")
                for _ in range(50):
                    if "thread" in seen:
                        break
                    await asyncio.sleep(0.01)
        asyncio.run(go())
        self.assertIs(seen.get("thread"), False)
