"""What a brand-new tenant gets by default.

The LLM is sarvam-105b-conversations ("Vistrow Bharat") - moved from
gpt-4.1-mini on 2026-09-09. Measured on this product's real prompt and
tools, it is equal on quality - 9/12 each on the grounding benchmark - at
roughly half the time to first token: 450-500ms median on live calls
against 1,058ms over eight comparable ones.

The TTS voice is Chirp 3 HD (google:chirp3:Achernar, "Myra HD") again as of
2026-10-12: real test calls that day put its first audio at ~190 ms, the same
as Sarvam pooja, at ~Rs 0.13/min against pooja's ~Rs 1.2/min, and every live
customer agent already runs on it. History: pooja was the default from
2026-09-14. Chirp 3
measured fastest of the TTS options on real calls and was the default until
then - see google_tts_streaming_patch.py and the latency notes for those
numbers, which still stand. It was moved off default because Google Cloud's
billing account for the project backing Chirp3/Gemini TTS went past-due on
09-11, and every call requiring it now fails with PermissionDenied
regardless of the ~Rs27k free credit still sitting unused behind that gate -
the credit does not waive the payment-method requirement. Sarvam has no
dependency on that account. Move this back to Chirp 3 once a payment method
is added (console.cloud.google.com/billing) and it is confirmed reachable
again on a real call, not just assumed from the account page looking fixed.

Four separate places decide the voice default and they have disagreed with
each other before - the schema column default said 'pooja', create_agent
said 'shubh', and the seeded picker menu contained neither. These tests pin
all four together so a change to one is not silently undone by another.
"""
import os, re, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import voice_catalog

EXPECTED_VOICE = "google:chirp3:Achernar"   # Myra HD - see module docstring
EXPECTED_MODEL = "sarvam/sarvam-105b-conversations"   # Vistrow Bharat
_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "calls_db.py")


def _source():
    with open(_DB, encoding="utf-8") as fh:
        return fh.read()


class TenantDefaults(unittest.TestCase):
    def test_schema_column_default_is_the_fastest_voice(self):
        # provision_account_defaults INSERTs a starter agent WITHOUT a voice,
        # so the column default is what a new tenant actually gets.
        self.assertIn(f"voice TEXT DEFAULT '{EXPECTED_VOICE}'", _source())

    def test_schema_column_default_model(self):
        self.assertIn(f"model TEXT DEFAULT '{EXPECTED_MODEL}'", _source())

    def test_create_agent_agrees_with_the_schema(self):
        # The dashboard's "new agent" button goes through create_agent, which
        # passes its own default rather than relying on the column.
        self.assertIn(f'data.get("voice", "{EXPECTED_VOICE}")', _source())
        self.assertIn(f'data.get("model", "{EXPECTED_MODEL}")', _source())

    def test_migration_updates_existing_databases(self):
        # A CREATE TABLE default only applies to a fresh database. Without the
        # ALTER, every already-deployed environment keeps the old default.
        self.assertIn(
            f"ALTER TABLE agents ALTER COLUMN voice SET DEFAULT '{EXPECTED_VOICE}'",
            _source(),
        )
        self.assertIn(
            f"ALTER TABLE agents ALTER COLUMN model SET DEFAULT '{EXPECTED_MODEL}'",
            _source(),
        )

    def test_the_migration_calls_no_helper_that_does_not_exist(self):
        # The first draft of the model migration guarded the ALTER with a
        # _column_default() helper that was never written. init_tables runs at
        # server startup, so that NameError would have taken the API down for
        # every tenant on deploy. SET DEFAULT is idempotent and needs no guard.
        self.assertNotIn("_column_default(", _source())

    def test_default_voice_is_in_the_seeded_picker_menu(self):
        # _seed_default_voices builds the account's voice menu. If the default
        # voice is missing from it, the tenant's own agent is using a voice
        # their picker will not show.
        self.assertIn(EXPECTED_VOICE, voice_catalog.DEFAULT_ACCOUNT_VOICES)

    def test_default_voice_leads_the_menu(self):
        self.assertEqual(voice_catalog.DEFAULT_ACCOUNT_VOICES[0], EXPECTED_VOICE)

    def test_existing_sarvam_voices_are_not_dropped(self):
        # They are the fallback whenever GOOGLE_APPLICATION_CREDENTIALS_JSON
        # is absent, and accounts already using one must not lose it.
        for v in ("shubh", "priya"):
            self.assertIn(v, voice_catalog.DEFAULT_ACCOUNT_VOICES)

    def test_default_voice_exists_in_the_catalog(self):
        self.assertIsNotNone(voice_catalog.get_voice(EXPECTED_VOICE))

    def test_default_voice_does_not_change_what_tenants_are_billed(self):
        # Switching the default must not quietly move tenants to a pricier
        # credit tier. All the seeded voices are the same tier.
        tiers = {
            (voice_catalog.get_voice(v) or {}).get("tier")
            for v in voice_catalog.DEFAULT_ACCOUNT_VOICES
        }
        self.assertEqual(tiers, {"standard"})


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TheDefaultModelBillsCorrectly(unittest.TestCase):
    """Minute pricing (owner, 2026-10-17): the default Vistrow Bharat pipeline
    is the standard minute, 1 credit per minute (it billed 2x from 2026-10-13
    to 2026-10-17). Matched by prefix, so every Sarvam model is the standard
    minute. Gemini Live ("Vistrow Live") bills 3 standard minutes per minute."""

    def test_the_default_model_is_the_standard_minute(self):
        import calls_db
        self.assertEqual(calls_db.model_tier(EXPECTED_MODEL), "standard")
        self.assertEqual(calls_db._MODEL_TIER_MULTIPLIERS["standard"], 1.0)

    def test_every_sarvam_model_is_the_standard_minute(self):
        import calls_db
        self.assertEqual(calls_db.model_tier("sarvam/sarvam-999b-future"), "standard")

    def test_gemini_live_is_not_billed_as_standard(self):
        import calls_db
        self.assertEqual(calls_db.model_tier("gemini-live:gemini-3.1-flash-live-preview"), "realtime_plus")
        self.assertEqual(calls_db.model_tier("gemini-live"), "realtime")
        self.assertEqual(calls_db.model_tier("gemini-live:gemini-3.8-live"), "realtime_plus")
        self.assertEqual(calls_db.model_tier("gpt-live:gpt-live-1"), "realtime_plus")
        self.assertEqual(calls_db._MODEL_TIER_MULTIPLIERS["realtime"], 2.0)
        self.assertEqual(calls_db._MODEL_TIER_MULTIPLIERS["realtime_plus"], 2.0)
