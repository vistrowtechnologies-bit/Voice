"""Compliance on the orchestrator path: DNC + calling window before an
outbound dial, and the record_calls / announce_recording settings.

No real DB: compliance.dbconn.connect is replaced by a fake that answers the
two queries compliance.py makes (settings row, dnc_list lookup)."""

import datetime
import json
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from zoneinfo import ZoneInfo

# Same stubs as test_server_routing.py, so either file can import server first.
sys.modules.setdefault("session", SimpleNamespace(Session=object))
sys.modules.setdefault("stt", SimpleNamespace(STTError=RuntimeError))
sys.modules.setdefault("tts", SimpleNamespace(TTSError=RuntimeError))
sys.modules.setdefault("recording", SimpleNamespace(CallRecorder=object))

import server

compliance = sys.modules.get("compliance")


class _FakeConn:
    def __init__(self, cfg: dict | None, dnc: set[str], fail: bool = False):
        self.cfg, self.dnc, self.fail = cfg, dnc, fail

    def execute(self, sql, params=()):
        if self.fail:
            raise RuntimeError("db down")
        row = None
        if "compliance.config" in sql:
            row = {"value": json.dumps(self.cfg)} if self.cfg is not None else None
        elif "dnc_list" in sql:
            _account, keys, tail, _ = params
            hit = any(
                n in keys or (tail and "".join(c for c in n if c.isdigit())[-10:] == tail)
                for n in self.dnc
            )
            row = {"?column?": 1} if hit else None
        return SimpleNamespace(fetchone=lambda: row)

    def close(self):
        pass


def _fake_db(cfg=None, dnc=(), fail=False):
    return patch("compliance.dbconn.connect", side_effect=lambda: _FakeConn(cfg, set(dnc), fail))


def _not_today() -> str:
    today = datetime.datetime.now(ZoneInfo("Asia/Kolkata")).weekday()
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(today + 1) % 7]


class OutboundDialComplianceTests(unittest.IsolatedAsyncioTestCase):
    async def _dial(self, to: str, cfg: dict | None, dnc=(), fail=False):
        place = AsyncMock(return_value={"ok": True, "response": {}})
        with _fake_db(cfg, dnc, fail), \
                patch.object(server.enablex, "place_outbound_call", place), \
                patch.object(server.enablex, "public_base_url", return_value="https://orch.test"):
            result = await server.enablex_outbound_test_call(
                {"to": to, "fromNumber": "+917713128715", "accountId": 5, "agentId": 7}, None,
            )
        return result, place

    async def test_dnc_number_is_refused_before_dialling(self):
        result, place = await self._dial(
            "9876543210", {"enforce_window": False}, dnc={"+919876543210"},
        )
        place.assert_not_called()
        self.assertFalse(result["ok"])
        self.assertTrue(result["blocked"])
        self.assertIn("Do-Not-Call", result["error"])

    async def test_outside_calling_window_is_refused(self):
        result, place = await self._dial("+919876543210", {"active_days": [_not_today()]})
        place.assert_not_called()
        self.assertFalse(result["ok"])
        self.assertTrue(result["blocked"])
        self.assertIn("Outside allowed calling days", result["error"])

    async def test_allowed_number_is_dialled(self):
        result, place = await self._dial(
            "+919876543210", {"enforce_window": False}, dnc={"+919999999999"},
        )
        place.assert_awaited_once()
        self.assertTrue(result["ok"])

    async def test_dnc_ignored_when_honor_dnc_off(self):
        result, place = await self._dial(
            "+919876543210", {"enforce_window": False, "honor_dnc": False}, dnc={"+919876543210"},
        )
        place.assert_awaited_once()

    async def test_unreadable_settings_refuse_without_marking_blocked(self):
        # Fail closed, but not "blocked": the dialer would spend the contact
        # permanently on a DB blip.
        result, place = await self._dial("+919876543210", None, fail=True)
        place.assert_not_called()
        self.assertFalse(result["ok"])
        self.assertFalse(result.get("blocked"))


class _FakeWebSocket:
    def __init__(self):
        self.query_params = {"token": "t"}
        self.accept = AsyncMock()
        self.send_json = AsyncMock()
        self.send_bytes = AsyncMock()
        self.close = AsyncMock()
        self._msgs = [
            {"type": "websocket.receive", "bytes": b"\x00\x00" * 960},
            {"type": "websocket.disconnect"},
        ]

    async def receive(self):
        return self._msgs.pop(0)


class RecordingSettingsTests(unittest.IsolatedAsyncioTestCase):
    async def _browser_call(self, cfg: dict):
        recorder = MagicMock()
        recorder.stop.return_value = "/nonexistent/call.wav"
        fake_recording = SimpleNamespace(
            CallRecorder=MagicMock(return_value=recorder),
            upload_recording=MagicMock(return_value="key"),
            RECORDING_SAMPLE_RATE=16000,
        )
        fake_session = SimpleNamespace(
            build_greeting_audio=AsyncMock(return_value=None),
            get_listening_cue_audio=AsyncMock(),
            finalize_call=AsyncMock(return_value=42),
        )
        sess = SimpleNamespace(account_id=5, voice="v", reply_language="en-IN", transcript=[])
        with _fake_db(cfg), \
                patch.object(server, "recording", fake_recording), \
                patch.object(server, "session_module", fake_session), \
                patch.object(server, "_build_session", AsyncMock(return_value=sess)), \
                patch.object(server.ws_security, "verify_stream_token",
                             return_value={"voice_id": "s1", "account_id": 5, "agent_id": 7}), \
                patch.object(server.db, "set_call_recording"):
            await server.browser_stream_ws(_FakeWebSocket())
        return fake_recording

    async def test_record_calls_off_uploads_nothing(self):
        rec = await self._browser_call({"record_calls": False})
        rec.upload_recording.assert_not_called()

    async def test_record_calls_on_uploads(self):
        rec = await self._browser_call({"record_calls": True})
        rec.upload_recording.assert_called_once()

    async def test_consent_required_is_not_recorded(self):
        rec = await self._browser_call({"record_calls": True, "require_consent": True})
        rec.upload_recording.assert_not_called()


class RecordingAnnouncementTests(unittest.IsolatedAsyncioTestCase):
    async def _session(self, cfg: dict, agent: dict):
        fake_session = SimpleNamespace(
            Session=lambda **kw: SimpleNamespace(messages=[], **kw),
            build_tools_for_session=lambda *a: None,
            build_system_prompt=AsyncMock(return_value="PERSONA"),
            _DEFAULT_OPENERS={},
            _DEFAULT_OPENER_EN="{greeting} this is {agent_name}. Thanks for calling — how can I help you today?",
        )
        with _fake_db(cfg), \
                patch.object(server, "session_module", fake_session), \
                patch.object(server.db, "get_agent_config", return_value=agent):
            return await server._build_session(5, 7, "phone")

    async def test_announcement_folded_into_welcome_message(self):
        sess = await self._session(
            {"record_calls": True},
            {"language": "en-IN", "welcome_message": "Hello from Acme. How can I help you?"},
        )
        self.assertIn("this call is recorded", sess.welcome_message)
        self.assertTrue(sess.welcome_message.endswith("How can I help you?"))

    async def test_announcement_added_to_default_opener(self):
        sess = await self._session({"record_calls": True}, {"language": "en-IN", "name": "Asha"})
        self.assertIn("this is Asha", sess.welcome_message)
        self.assertIn("this call is recorded", sess.welcome_message)

    async def test_custom_notice_used(self):
        sess = await self._session(
            {"record_calls": True, "recording_notice": "Calls are recorded for quality."},
            {"language": "en-IN", "welcome_message": "Hi there."},
        )
        self.assertEqual(sess.welcome_message, "Hi there. Calls are recorded for quality.")

    async def test_caller_first_agent_told_to_announce_in_first_reply(self):
        sess = await self._session({"record_calls": True}, {"language": "en-IN", "first_speaker": "user"})
        self.assertEqual(sess.messages[0]["role"], "system")
        self.assertIn("# Recording notice", sess.messages[0]["content"])

    async def test_no_announcement_when_not_recording_or_turned_off(self):
        for cfg in ({"record_calls": False}, {"record_calls": True, "announce_recording": False},
                    {"record_calls": True, "require_consent": True}):
            sess = await self._session(cfg, {"language": "en-IN", "welcome_message": "Hi there."})
            self.assertEqual(sess.welcome_message, "Hi there.", cfg)
            self.assertEqual(sess.messages, [], cfg)


if __name__ == "__main__":
    unittest.main()
