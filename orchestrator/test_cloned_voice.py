"""Cloned voices on the orchestrator pipeline: AI disclosure forced on,
and only an account's own ElevenLabs clone is spoken (else default)."""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import compliance
import db


class ClonedDisclosure(unittest.TestCase):
    def test_forced_even_with_announce_off(self):
        cfg = {"record_calls": True, "announce_recording": False}
        self.assertEqual(compliance.recording_disclosure(cfg, "en-IN"), "")
        self.assertTrue(compliance.recording_disclosure(cfg, "en-IN", cloned_voice=True))

    def test_not_recording_says_ai_only(self):
        line = compliance.recording_disclosure({}, "en-IN", cloned_voice=True)
        self.assertEqual(line, compliance.AI_ONLY_NOTICES["en"])
        self.assertNotIn("recorded", compliance.first_reply_instruction(line))
        opener = "Hi, this call is recorded."
        self.assertIn("AI assistant", compliance.with_disclosure(opener, line, force=True))


class ClonedVoiceLookup(unittest.TestCase):
    def test_non_custom_or_no_account_never_queries(self):
        with mock.patch.object(db.dbconn, "connect") as connect:
            self.assertIsNone(db.custom_voice_tts("elevenlabs:x", 1))
            self.assertIsNone(db.custom_voice_tts("custom:vv_x", None))
        connect.assert_not_called()

    def test_scoped_to_account_and_ready(self):
        conn = mock.MagicMock()
        conn.execute.return_value.fetchone.return_value = {"elevenlabs_voice_id": "EL1"}
        with mock.patch.object(db.dbconn, "connect", return_value=conn):
            self.assertEqual(db.custom_voice_tts("custom:vv_abc", 7), "elevenlabs:EL1")
        sql, params = conn.execute.call_args.args
        self.assertIn("account_id = ?", sql)
        self.assertIn("status = 'ready'", sql)
        self.assertEqual(params, ("vv_abc", 7))


if __name__ == "__main__":
    unittest.main()
