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

    def test_tts_node_counts_chars_and_audio(self):
        src = inspect.getsource(main.RealEstateAgent.tts_node)
        self.assertIn('usage["ttsCharsSent"]', src)
        self.assertIn('usage["ttsAudioSOut"]', src)


if __name__ == "__main__":
    unittest.main()
