"""Cloned voices ("custom:vv_<id>") at call time: resolved to the right
engine for this account only, falling back to a default voice on any
problem; billed on the voice the agent was set to; AI disclosure forced on.
No network: the lookup is a fake, and _build_tts is only constructed."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")

import call_disclosure as cd
import custom_voice
import plan_policy
import voice_catalog

VALUE = "custom:vv_abcdefghijklmnop"
READY = {"id": "vv_abcdefghijklmnop", "status": "ready", "language": "hi-IN",
         "engine_default": "sarvam", "elevenlabs_voice_id": "EL123", "sarvam_voice_id": "SV456"}


def lookup_for(row, owner=7):
    calls = []

    def lookup(voice_id, account_id):
        calls.append((voice_id, account_id))
        return dict(row) if row is not None and account_id == owner else None

    lookup.calls = calls
    return lookup


def speaker(*args):
    return custom_voice.resolve(*args, acquire_slot=lambda: True).speaker


class Resolve(unittest.TestCase):
    def test_sarvam_engine(self):
        lk = lookup_for(READY)
        self.assertEqual(speaker(VALUE, 7, lk, "e", "s"), custom_voice.SARVAM_CLONE_PREFIX + "SV456")
        self.assertEqual(lk.calls, [("vv_abcdefghijklmnop", 7)])

    def test_elevenlabs_engine(self):
        lk = lookup_for({**READY, "engine_default": "elevenlabs"})
        self.assertEqual(speaker(VALUE, 7, lk, "e", "s"), "elevenlabs:EL123")

    def test_other_engine_when_default_key_missing(self):
        lk = lookup_for(READY)
        self.assertEqual(speaker(VALUE, 7, lk, "e", ""), "elevenlabs:EL123")

    def test_other_account_falls_back(self):
        lk = lookup_for(READY, owner=7)
        self.assertEqual(speaker(VALUE, 8, lk, "e", "s"), custom_voice.FALLBACK_VOICE)

    def test_not_ready_deleted_error_and_no_keys_fall_back(self):
        for row in ({**READY, "status": "processing"}, {**READY, "status": "failed"}, None):
            self.assertEqual(speaker(VALUE, 7, lookup_for(row), "e", "s"), custom_voice.FALLBACK_VOICE)

        def boom(*_a):
            raise RuntimeError("db down")

        self.assertEqual(speaker(VALUE, 7, boom, "e", "s"), custom_voice.FALLBACK_VOICE)
        self.assertEqual(speaker(VALUE, 7, lookup_for(READY), "", ""), custom_voice.FALLBACK_VOICE)

    def test_fallback_voice_is_a_real_catalog_voice(self):
        self.assertIsNotNone(voice_catalog.get_voice(custom_voice.FALLBACK_VOICE))


class Disclosure(unittest.TestCase):
    def test_forced_on_even_when_announce_is_off(self):
        cfg = {"record_calls": True, "announce_recording": False}
        self.assertEqual(cd.recording_disclosure(cfg, "en-IN"), "")
        self.assertEqual(cd.recording_disclosure(cfg, "en-IN", cloned_voice=True), cd.DEFAULT_NOTICES["en"])

    def test_not_recording_says_ai_only(self):
        self.assertEqual(cd.recording_disclosure({}, "hi-IN", cloned_voice=True), cd.AI_ONLY_NOTICES["hi"])
        self.assertEqual(cd.recording_disclosure({"record_calls": False}, "en-IN", is_platform_demo=True,
                                                 cloned_voice=True), cd.AI_ONLY_NOTICES["en"])
        self.assertIn("AI assistant", cd.instruction(cd.AI_ONLY_NOTICES["en"]))
        self.assertNotIn("recorded", cd.instruction(cd.AI_ONLY_NOTICES["en"]))

    def test_force_folds_into_an_opener_that_mentions_recording(self):
        opener = "Hi, this call is recorded for quality."
        self.assertEqual(cd.with_disclosure(opener, cd.AI_ONLY_NOTICES["en"]), opener)
        self.assertIn("AI assistant", cd.with_disclosure(opener, cd.AI_ONLY_NOTICES["en"], force=True))


class Admission(unittest.TestCase):
    def conn(self, plan="growth", owner=0):
        from unittest.mock import MagicMock
        conn = MagicMock()
        conn.execute.return_value.fetchone.side_effect = [
            {"plan": plan, "is_platform_owner": owner}, {"c": 1},
        ]
        conn.execute.return_value.fetchall.return_value = []
        return conn

    def test_cloned_voice_never_refuses_a_call(self):
        plan_policy.validate_agent(self.conn(), 1, {"voice": VALUE, "id": 1}, voice_catalog)

    def test_existing_stock_premium_voice_keeps_taking_calls(self):
        # Owner-only (preview) since 2026-10-16, but a Scale agent using it works.
        value = "elevenlabs:zmh5xhBvMzqR4ZlXgcgL"
        self.assertTrue(voice_catalog.get_voice(value)["preview"])
        plan_policy.validate_agent(self.conn("scale"), 1, {"voice": value, "id": 1}, voice_catalog)


class AgentRuntime(unittest.TestCase):
    """The real RealEstateAgent: speaker resolved, call record keeps custom:."""

    @classmethod
    def setUpClass(cls):
        import main
        cls.main = main

    def build(self, row):
        base = {"id": 1, "account_id": 7, "name": "T", "model": "gpt-4.1-mini", "voice": VALUE,
                "language": "hi-IN", "tone": "balanced", "system_prompt": "x",
                "enabled_functions": "end_call", "_compliance_config": {}}
        with patch.object(self.main.db, "get_custom_voice", lookup_for(row)), \
             patch.object(custom_voice, "acquire_clone_slot", return_value=True), \
             patch.dict(os.environ, {"ELEVEN_API_KEY": "e", "SARVAM_API_KEY": "s"}), \
             patch.object(self.main, "_build_tts", return_value=(None, "sarvam")) as build:
            agent = self.main.RealEstateAgent(base, call_type="phone")
        return agent, build.call_args.args[1]

    def test_sarvam_clone_speaks_and_bills_custom_value(self):
        agent, speaker = self.build(READY)
        self.assertEqual(speaker, custom_voice.SARVAM_CLONE_PREFIX + "SV456")
        self.assertEqual(agent._voice, VALUE)  # call record -> billing
        self.assertTrue(agent._is_cloned_voice)
        self.assertEqual(agent._recording_disclosure, cd.AI_ONLY_NOTICES["hi"])

    def test_missing_clone_falls_back(self):
        agent, speaker = self.build(None)
        self.assertEqual(speaker, custom_voice.FALLBACK_VOICE)
        self.assertEqual(agent._voice, VALUE)

    def test_build_tts_sarvam_clone_branch(self):
        tts, provider = self.main._build_tts("hi-IN", custom_voice.SARVAM_CLONE_PREFIX + "SV456",
                                             dict(self.main.TONE_PRESETS[self.main.DEFAULT_TONE]),
                                             self.main.DEFAULT_TONE, is_phone=True)
        self.assertEqual(provider, "sarvam-clone")
        tts.update_options(target_language_code="ta-IN")
        self.assertEqual(tts._vistrow_clone._language, "ta-IN")


class CloneConfigShape(unittest.TestCase):
    def test_ws_config(self):
        import sarvam_clone_tts
        f = sarvam_clone_tts.clone_config("SV1", "hi-IN", pace=1.0, sample_rate=8000)
        self.assertEqual(f["voice_id"], "SV1")
        self.assertEqual(f["target_language_code"], "hi-IN")
        self.assertNotIn("language_code", f)
        self.assertEqual(f["output_audio_codec"], "linear16")
        self.assertNotIn("ref_audio", f)


if __name__ == "__main__":
    unittest.main()


ROMAN_HI = "Namaste ji, main Abhi bol raha hoon. Bataiye, main aapki kya madad kar sakta hoon?"
NATIVE_HI = "नमस्ते जी, मैं अभि बोल रहा हूँ। बताइए, मैं आपकी क्या मदद कर सकता हूँ?"


class NativeScriptDecision(unittest.TestCase):
    """Owner's test 17 Oct: a romanized welcome line in a clone sounded English."""

    def test_romanized_indic_line_is_converted(self):
        self.assertTrue(custom_voice.needs_native_script(ROMAN_HI, "hi-IN"))
        self.assertTrue(custom_voice.needs_native_script("Namaskar, tumhala kay madat havi aahe?", "mr-IN"))

    def test_left_alone(self):
        for text, lang in [
            (NATIVE_HI, "hi-IN"),                                           # already native
            ("Hello, thank you for calling. How can I help you today?", "hi-IN"),  # English on purpose
            (ROMAN_HI, "en-IN"),                                            # English agent
            (ROMAN_HI, "as-IN"),                                            # Sarvam cannot transliterate Assamese
            ("", "hi-IN"),
            ("123 456", "hi-IN"),
        ]:
            self.assertFalse(custom_voice.needs_native_script(text, lang), (text, lang))


class FakeResponse:
    def __init__(self, status, body):
        self.status, self._body = status, body

    async def json(self):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class FakeSession:
    calls = []
    reply = (200, {"transliterated_text": NATIVE_HI})
    raise_exc = None

    def __init__(self, *a, **k):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    def post(self, url, json=None, headers=None):
        FakeSession.calls.append((url, json, headers))
        if FakeSession.raise_exc:
            raise FakeSession.raise_exc
        return FakeResponse(*FakeSession.reply)


class NativeScriptCall(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        custom_voice._NATIVE_CACHE.clear()
        FakeSession.calls, FakeSession.reply, FakeSession.raise_exc = [], (200, {"transliterated_text": NATIVE_HI}), None
        import aiohttp
        self.patch = patch.object(aiohttp, "ClientSession", FakeSession)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()

    async def test_converts_once_then_caches(self):
        self.assertEqual(await custom_voice.native_script(ROMAN_HI, "hi-IN", api_key="k"), NATIVE_HI)
        self.assertEqual(await custom_voice.native_script(ROMAN_HI, "hi-IN", api_key="k"), NATIVE_HI)
        self.assertEqual(len(FakeSession.calls), 1)
        url, body, headers = FakeSession.calls[0]
        self.assertEqual(url, custom_voice.TRANSLITERATE_URL)
        self.assertEqual(body, {"input": ROMAN_HI, "source_language_code": "en-IN", "target_language_code": "hi-IN"})
        self.assertEqual(headers, {"api-subscription-key": "k"})

    async def test_any_failure_keeps_the_typed_line(self):
        FakeSession.reply = (429, {})
        self.assertEqual(await custom_voice.native_script(ROMAN_HI, "hi-IN", api_key="k"), ROMAN_HI)
        FakeSession.reply = (200, {"transliterated_text": ""})
        self.assertEqual(await custom_voice.native_script(ROMAN_HI, "hi-IN", api_key="k"), ROMAN_HI)
        FakeSession.reply, FakeSession.raise_exc = (200, {}), TimeoutError()
        self.assertEqual(await custom_voice.native_script(ROMAN_HI, "hi-IN", api_key="k"), ROMAN_HI)
        self.assertEqual(await custom_voice.native_script(ROMAN_HI, "hi-IN", api_key=""), ROMAN_HI)
        self.assertEqual(custom_voice._NATIVE_CACHE, {})

    async def test_not_needed_makes_no_request(self):
        self.assertEqual(await custom_voice.native_script(NATIVE_HI, "hi-IN", api_key="k"), NATIVE_HI)
        self.assertEqual(FakeSession.calls, [])


class NativeWelcomeOnAgent(unittest.IsolatedAsyncioTestCase):
    """The real agent swaps its welcome line in the background, disclosure kept."""

    def build(self, welcome):
        import main
        base = {"id": 1, "account_id": 7, "name": "T", "model": "gpt-4.1-mini", "voice": VALUE,
                "language": "hi-IN", "tone": "balanced", "system_prompt": "x", "welcome_message": welcome,
                "enabled_functions": "end_call", "_compliance_config": {}}
        with patch.object(main.db, "get_custom_voice", lookup_for(READY)), \
             patch.object(custom_voice, "acquire_clone_slot", return_value=True), \
             patch.dict(os.environ, {"ELEVEN_API_KEY": "e", "SARVAM_API_KEY": "s"}), \
             patch.object(main, "_build_tts", return_value=(None, "sarvam")):
            return main.RealEstateAgent(base, call_type="phone")

    async def test_romanized_welcome_becomes_native_with_disclosure(self):
        async def fake(text, language, **k):
            return NATIVE_HI if text == ROMAN_HI else text
        with patch.object(custom_voice, "native_script", fake):
            agent = self.build(ROMAN_HI)
            # typed line until the swap lands
            self.assertEqual(agent._welcome_message, cd.with_disclosure(ROMAN_HI, agent._recording_disclosure, force=True))
            await agent._native_welcome_task
        self.assertEqual(agent._welcome_message,
                         cd.with_disclosure(NATIVE_HI, agent._recording_disclosure, force=True))

    async def test_native_or_english_welcome_untouched(self):
        for welcome in (NATIVE_HI, "Hello, thank you for calling. How can I help you today?"):
            agent = self.build(welcome)
            self.assertFalse(hasattr(agent, "_native_welcome_task"), welcome)
            self.assertEqual(agent._welcome_message, cd.with_disclosure(welcome, agent._recording_disclosure, force=True))

    async def test_cleared_welcome_is_not_overwritten(self):
        async def fake(text, language, **k):
            return NATIVE_HI
        with patch.object(custom_voice, "native_script", fake):
            agent = self.build(ROMAN_HI)
            agent._welcome_message = ""  # e.g. a follow-up opening replaced it
            await agent._native_welcome_task
        self.assertEqual(agent._welcome_message, "")
