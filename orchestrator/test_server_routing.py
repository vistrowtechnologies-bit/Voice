import unittest
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

# Keep this routing unit test independent from paid-provider SDKs. The route
# under test mocks session construction and never exercises STT/TTS/recording.
sys.modules.setdefault("session", SimpleNamespace(Session=object))
sys.modules.setdefault("stt", SimpleNamespace(STTError=RuntimeError))
sys.modules.setdefault("tts", SimpleNamespace(TTSError=RuntimeError))
sys.modules.setdefault("recording", SimpleNamespace(CallRecorder=object))

import server


class EnableXEventRoutingTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        server._PENDING_ACCOUNT_BY_VOICE_ID.clear()
        server._PENDING_AGENT_BY_VOICE_ID.clear()
        for _, greeting_task in server._PENDING_GREETING_BY_VOICE_ID.values():
            greeting_task.cancel()
        server._PENDING_GREETING_BY_VOICE_ID.clear()

    async def asyncTearDown(self) -> None:
        for _, greeting_task in server._PENDING_GREETING_BY_VOICE_ID.values():
            greeting_task.cancel()
        server._PENDING_GREETING_BY_VOICE_ID.clear()

    def test_number_candidate_order_follows_direction(self) -> None:
        inbound = {"direction": "inbound", "from": "+91111", "to": "+91222"}
        outbound = {"direction": "outbound", "from": "+91111", "to": "+91222"}
        self.assertEqual(server._event_number_candidates(inbound), ["+91222", "+91111"])
        self.assertEqual(server._event_number_candidates(outbound), ["+91111", "+91222"])

    async def test_connected_event_recovers_missing_incomingcall_context(self) -> None:
        event = {
            "state": "connected",
            "voice_id": "voice-1",
            "direction": "inbound",
            "from": "+919999999999",
            "to": "+917713128715",
        }
        session = SimpleNamespace()

        with (
            patch.object(server.db, "get_phone_number_by_number", return_value={"account_id": 7, "agent_id": 11}),
            patch.object(server.db, "is_on_orchestrator_pipeline", return_value=True),
            patch.object(server, "_build_session_for_test_call", AsyncMock(return_value=session)),
            patch.object(server.session_module, "build_greeting_audio", AsyncMock(return_value=None), create=True),
            patch.object(server.enablex, "public_wss_host", return_value="wss://orchestrator.example"),
            patch.object(server.enablex, "start_stream", AsyncMock(return_value={"ok": True})) as start_stream,
            patch.object(server.ws_security, "issue_stream_token", return_value="signed-token"),
        ):
            response = await server.enablex_inbound_event(event)

        self.assertEqual(response, {"ok": True})
        self.assertEqual(server._PENDING_ACCOUNT_BY_VOICE_ID["voice-1"], 7)
        self.assertEqual(server._PENDING_AGENT_BY_VOICE_ID["voice-1"], 11)
        start_stream.assert_awaited_once_with(
            "voice-1",
            "wss://orchestrator.example/stream?token=signed-token",
            7,
        )

    async def test_unknown_connected_event_does_not_start_stream(self) -> None:
        event = {
            "state": "connected",
            "voice_id": "voice-2",
            "from": "+919999999999",
            "to": "+918888888888",
        }
        with (
            patch.object(server.db, "get_phone_number_by_number", return_value=None),
            patch.object(server.enablex, "start_stream", AsyncMock()) as start_stream,
        ):
            response = await server.enablex_inbound_event(event)

        self.assertEqual(response, {"ok": True})
        start_stream.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
