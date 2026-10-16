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


class Resolve(unittest.TestCase):
    def test_sarvam_engine(self):
        lk = lookup_for(READY)
        self.assertEqual(custom_voice.resolve(VALUE, 7, lk, "e", "s"), custom_voice.SARVAM_CLONE_PREFIX + "SV456")
        self.assertEqual(lk.calls, [("vv_abcdefghijklmnop", 7)])

    def test_elevenlabs_engine(self):
        lk = lookup_for({**READY, "engine_default": "elevenlabs"})
        self.assertEqual(custom_voice.resolve(VALUE, 7, lk, "e", "s"), "elevenlabs:EL123")

    def test_other_engine_when_default_key_missing(self):
        lk = lookup_for(READY)
        self.assertEqual(custom_voice.resolve(VALUE, 7, lk, "e", ""), "elevenlabs:EL123")

    def test_other_account_falls_back(self):
        lk = lookup_for(READY, owner=7)
        self.assertEqual(custom_voice.resolve(VALUE, 8, lk, "e", "s"), custom_voice.FALLBACK_VOICE)

    def test_not_ready_deleted_error_and_no_keys_fall_back(self):
        for row in ({**READY, "status": "processing"}, {**READY, "status": "failed"}, None):
            self.assertEqual(custom_voice.resolve(VALUE, 7, lookup_for(row), "e", "s"), custom_voice.FALLBACK_VOICE)

        def boom(*_a):
            raise RuntimeError("db down")

        self.assertEqual(custom_voice.resolve(VALUE, 7, boom, "e", "s"), custom_voice.FALLBACK_VOICE)
        self.assertEqual(custom_voice.resolve(VALUE, 7, lookup_for(READY), "", ""), custom_voice.FALLBACK_VOICE)

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


class CloneRequestShape(unittest.TestCase):
    def test_form_fields(self):
        import sarvam_clone_tts
        f = sarvam_clone_tts.form_fields("SV1", "x" * 1200, "hi-IN")
        self.assertEqual(f["voice_id"], "SV1")
        self.assertEqual(len(f["text"]), 1000)
        self.assertEqual(f["output_audio_codec"], "linear16")
        self.assertNotIn("ref_audio", f)


if __name__ == "__main__":
    unittest.main()
