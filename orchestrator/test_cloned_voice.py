"""Cloned voices on the orchestrator pipeline: AI disclosure forced on, only
an account's own ready clone is loaded, and a clone this pipeline doesn't
speak gets a stock voice of the clone's gender (never fails the call).

No network, no paid API, no DATABASE_URL: the DB and providers are faked."""
import asyncio
import io
import os
import sys
import unittest
import wave
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# test_server_routing.py / test_compliance.py stub these modules; this file
# needs the real ones, and a server module imported against them.
for _name in ("session", "stt", "tts", "recording"):
    if isinstance(sys.modules.get(_name), SimpleNamespace):
        del sys.modules[_name]
if "server" in sys.modules and isinstance(getattr(sys.modules["server"], "session_module", None), SimpleNamespace):
    del sys.modules["server"]

import compliance
import db
import server
import tts


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


def _row(**overrides):
    row = {"elevenlabs_voice_id": None, "sarvam_voice_id": "sv_1", "gender": "female", "status": "ready"}
    row.update(overrides)
    return row


class ClonedVoiceLookup(unittest.TestCase):
    def _lookup(self, row, voice="custom:vv_abc", account_id=7):
        conn = mock.MagicMock()
        conn.execute.return_value.fetchone.return_value = row
        with mock.patch.object(db.dbconn, "connect", return_value=conn):
            return db.custom_voice(voice, account_id), conn

    def test_non_custom_or_no_account_never_queries(self):
        with mock.patch.object(db.dbconn, "connect") as connect:
            self.assertIsNone(db.custom_voice("elevenlabs:x", 1))
            self.assertIsNone(db.custom_voice("custom:vv_x", None))
        connect.assert_not_called()

    def test_scoped_to_account_ready_and_not_deleted(self):
        info, conn = self._lookup(_row())
        self.assertEqual(info, {"elevenlabs_voice_id": "", "sarvam_voice_id": "sv_1",
                                "gender": "female", "status": "ready"})
        sql, params = conn.execute.call_args.args
        self.assertIn("account_id = ?", sql)
        self.assertIn("status = 'ready'", sql)
        self.assertIn("deleted_at IS NULL", sql)
        self.assertIn("gender", sql)
        self.assertEqual(params, ("vv_abc", 7))

    def test_other_account_or_unready_row_is_none(self):
        # The SQL filter returns no row for another account's / unready clone.
        info, _ = self._lookup(None)
        self.assertIsNone(info)

    def test_unknown_gender_is_blank(self):
        self.assertEqual(self._lookup(_row(gender=None))[0]["gender"], "")
        self.assertEqual(self._lookup(_row(gender="Neutral"))[0]["gender"], "")
        self.assertEqual(self._lookup(_row(gender=" Male "))[0]["gender"], "male")

    def test_db_error_is_none(self):
        with mock.patch.object(db.dbconn, "connect", side_effect=db.psycopg.OperationalError("down")):
            self.assertIsNone(db.custom_voice("custom:vv_abc", 7))


def _no_recording(*_a, **_k):
    return {"record_calls": False}


def _build(clone, voice="custom:vv_abc", language="hi-IN", **cfg_extra):
    cfg = {"voice": voice, "language": language, "welcome_message": "Namaste, main Artha bol rahi hoon.", **cfg_extra}
    with mock.patch.object(server.db, "get_agent_config", return_value=cfg), \
            mock.patch.object(server.db, "custom_voice", return_value=clone) as lookup, \
            mock.patch.object(server.compliance, "recording_config", _no_recording):
        sess = asyncio.run(server._build_session(5, 7, "phone"))
    return sess, lookup


class ClonedVoiceSession(unittest.TestCase):
    def setUp(self):
        os.environ.pop("ORCH_SPEAK_CLONES", None)

    def test_female_sarvam_clone_gets_female_voice_and_grammar(self):
        sess, lookup = _build(_row(gender="female"))
        lookup.assert_called_once_with("custom:vv_abc", 5)
        self.assertEqual(sess.voice, "priya")
        self.assertEqual(sess.voice_gender, "female")

    def test_male_sarvam_clone_gets_male_voice(self):
        sess, _ = _build(_row(gender="male"))
        self.assertEqual(sess.voice, "shubh")
        self.assertEqual(sess.voice_gender, "male")

    def test_missing_clone_uses_default_never_fails(self):
        sess, _ = _build(None)
        self.assertEqual(sess.voice, "shubh")
        self.assertEqual(sess.billed_voice, "custom:vv_abc")

    def test_unknown_gender_uses_default(self):
        sess, _ = _build(_row(gender=""))
        self.assertEqual(sess.voice, "shubh")

    def test_fallbacks_are_catalog_voices_of_that_gender(self):
        # Both are Standard (bulbul:v3) speakers, the same tier the clone bills at.
        for gender, voice in server._CLONE_FALLBACK_VOICES.items():
            entry = server.session_module.voice_catalog.get_voice(voice)
            self.assertEqual((entry["gender"], entry["tier"]), (gender, "standard"))

    def test_billing_keeps_custom_voice(self):
        sess, _ = _build(_row(gender="female"))
        self.assertEqual(sess.billed_voice, "custom:vv_abc")

    def test_ai_disclosure_forced_on_fallback(self):
        sess, _ = _build(_row(gender="female"))
        self.assertIn(compliance.AI_ONLY_NOTICES["hi"], sess.welcome_message)
        sess, _ = _build(None, language="en-IN")
        self.assertIn(compliance.AI_ONLY_NOTICES["en"], sess.welcome_message)

    def test_elevenlabs_clone_spoken_with_clone_gender(self):
        sess, _ = _build(_row(elevenlabs_voice_id="EL1", sarvam_voice_id="", gender="female"))
        self.assertEqual(sess.voice, "elevenlabs:EL1")
        self.assertEqual(sess.voice_gender, "female")
        self.assertEqual(sess.billed_voice, "custom:vv_abc")

    def test_speak_clones_flag_routes_sarvam_clone(self):
        with mock.patch.dict(os.environ, {"ORCH_SPEAK_CLONES": "1"}):
            sess, _ = _build(_row(gender="female"))
        self.assertEqual(sess.voice, "sarvamclone:priya:sv_1")
        self.assertEqual(sess.voice_gender, "female")
        self.assertEqual(sess.billed_voice, "custom:vv_abc")

    def test_stock_voice_unchanged(self):
        sess, lookup = _build(None, voice="priya")
        lookup.assert_not_called()
        self.assertEqual((sess.voice, sess.voice_gender, sess.billed_voice), ("priya", "female", ""))


class SarvamCloneTTS(unittest.TestCase):
    def test_not_streamed_and_routes_to_clone_endpoint(self):
        voice = tts.sarvam_clone_voice("sv_1", "priya")
        self.assertIsNone(tts.synthesize_stream(voice, "hello", "hi-IN"))
        pcm = b"\x01\x00" * 240
        resp = mock.MagicMock(content=pcm, headers={"content-type": "application/octet-stream"})
        client = mock.MagicMock()
        client.post = mock.AsyncMock(return_value=resp)
        with mock.patch.object(tts, "_SARVAM_API_KEY", "k"), mock.patch.object(tts, "_get_client", return_value=client):
            audio, ctype = asyncio.run(tts.synthesize(voice, "x" * 1500, "ta-IN"))
        self.assertEqual(ctype, "audio/wav")
        with wave.open(io.BytesIO(audio)) as w:
            self.assertEqual((w.getframerate(), w.getnchannels(), w.readframes(240)), (24000, 1, pcm))
        url = client.post.call_args.args[0]
        files = client.post.call_args.kwargs["files"]
        self.assertEqual(url, "https://api.sarvam.ai/voices/clone/stream")
        self.assertEqual(files["voice_id"], (None, "sv_1"))
        self.assertEqual(files["language_code"], (None, "ta-IN"))
        self.assertEqual(len(files["text"][1]), 1000)
        self.assertEqual(client.post.call_args.kwargs["headers"], {"api-subscription-key": "k"})

    def test_clone_failure_speaks_stock_fallback(self):
        voice = tts.sarvam_clone_voice("sv_1", "priya")
        with mock.patch.object(tts, "_synth_sarvam_clone", mock.AsyncMock(side_effect=tts.TTSError("429"))), \
                mock.patch.object(tts, "_synth_sarvam", mock.AsyncMock(return_value=(b"w", "audio/wav"))) as stock:
            self.assertEqual(asyncio.run(tts.synthesize(voice, "hi", "hi-IN")), (b"w", "audio/wav"))
        self.assertEqual(stock.call_args.args[:4], ("priya", "bulbul:v3", "hi-IN", "hi"))


if __name__ == "__main__":
    unittest.main()
