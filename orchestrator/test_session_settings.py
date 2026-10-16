"""Dashboard agent settings the orchestrator must honour the way agent/main.py
does: pause, call length, silence handling, outbound opener, enabled tools,
variables, post-call fields, emotion intensity, interruption sensitivity,
the integration attributes, and inbound route rules.

No network, no paid API: provider calls are faked. The route-rule SQL runs
against a throwaway pgserver Postgres (skipped when pgserver is missing),
never the DATABASE_URL from .env.
"""

import asyncio
import datetime
import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

# test_server_routing.py / test_compliance.py stub these modules; this file
# needs the real ones, and a server module imported against them.
for _name in ("session", "stt", "tts", "recording"):
    if isinstance(sys.modules.get(_name), SimpleNamespace):
        del sys.modules[_name]
if "server" in sys.modules and isinstance(getattr(sys.modules["server"], "session_module", None), SimpleNamespace):
    del sys.modules["server"]

import db
import dbconn
import session as session_module
import server

try:
    import pgserver
except ImportError:  # pragma: no cover - optional dev dependency
    pgserver = None


def _no_recording(*_a, **_k):
    return {"record_calls": False}


async def _build(cfg: dict, **kwargs):
    with patch.object(server.db, "get_agent_config", return_value=cfg), \
            patch.object(server.compliance, "recording_config", _no_recording):
        return await server._build_session(5, 7, kwargs.pop("call_type", "phone"), **kwargs)


class _FakeTime:
    """Drives CallGuards without real waiting; stops the loop past stop_at."""

    def __init__(self, stop_at: float) -> None:
        self.t = 0.0
        self.stop_at = stop_at

    def clock(self) -> float:
        return self.t

    async def sleep(self, seconds: float) -> None:
        self.t += seconds
        if self.t > self.stop_at:
            raise asyncio.CancelledError


def _guards(sess, stop_at: float):
    ft = _FakeTime(stop_at)
    spoken: list[tuple[float, str]] = []
    hung_up: list[float] = []

    async def speak(instr):
        spoken.append((ft.t, instr))

    async def hang_up():
        hung_up.append(ft.t)

    guards = session_module.CallGuards(
        sess, speak=speak, hang_up=hang_up, is_busy=lambda: False, clock=ft.clock, sleep=ft.sleep,
    )
    guards.fake_time = ft
    return guards, spoken, hung_up


class PauseTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        server._PENDING_ACCOUNT_BY_VOICE_ID.clear()
        server._PENDING_AGENT_BY_VOICE_ID.clear()
        server._PENDING_GREETING_BY_VOICE_ID.clear()

    async def test_paused_agent_inbound_call_is_not_answered(self):
        accept = AsyncMock(return_value={"ok": True})
        with patch.object(server.db, "get_phone_number_by_number", return_value={"account_id": 5, "agent_id": 7}), \
                patch.object(server.db, "is_on_orchestrator_pipeline", return_value=True), \
                patch.object(server.agent_rules, "inbound_rejection", return_value=None), \
                patch.object(server.db, "get_agent_config", return_value={"status": "paused"}), \
                patch.object(server.compliance, "recording_config", _no_recording), \
                patch.object(server.enablex, "accept_call", accept):
            await server.enablex_inbound_event(
                {"state": "incomingcall", "voice_id": "v-paused", "direction": "inbound",
                 "from": "+919800000000", "to": "+917700000000"}
            )
        accept.assert_not_called()
        self.assertNotIn("v-paused", server._PENDING_ACCOUNT_BY_VOICE_ID)

    async def test_paused_agent_outbound_is_refused_before_dialling(self):
        place = AsyncMock(return_value={"ok": True, "response": {"voice_id": "v1"}})
        with patch.object(server.compliance, "check_call_allowed", return_value=(True, "")), \
                patch.object(server.db, "get_agent_config", return_value={"status": "paused"}), \
                patch.object(server.enablex, "place_outbound_call", place), \
                patch.object(server.enablex, "public_base_url", return_value="https://orch.test"):
            result = await server.enablex_outbound_test_call(
                {"to": "+919800000000", "fromNumber": "+917700000000", "accountId": 5, "agentId": 7}, None,
            )
        place.assert_not_called()
        self.assertFalse(result["ok"])

    async def test_paused_agent_gets_no_browser_token(self):
        with patch.object(server.db, "get_agent_config", return_value={"status": "paused"}), \
                patch.object(server.enablex, "public_wss_host", return_value="wss://orch.test"):
            result = await server.browser_token(account_id=5, agent_id=7)
        self.assertFalse(result["ok"])


class CallLengthTests(unittest.IsolatedAsyncioTestCase):
    async def test_max_call_duration_read_from_config(self):
        sess = await _build({"max_call_duration_s": 60})
        self.assertEqual(sess.max_call_duration_s, 60)

    async def test_wrap_up_before_limit_then_hang_up_at_limit(self):
        sess = session_module.Session(account_id=5, agent_id=7, max_call_duration_s=60)
        guards, spoken, hung_up = _guards(sess, stop_at=1000)
        await guards._limit_guard()
        self.assertEqual(len(spoken), 1)
        self.assertAlmostEqual(spoken[0][0], 40.0)  # lead = min(25, 60/3)
        self.assertIn("time limit", spoken[0][1])
        self.assertTrue(sess.ending_call)
        self.assertEqual(hung_up, [60.0])

    async def test_unset_limit_uses_platform_ceiling(self):
        sess = session_module.Session(account_id=5, agent_id=7)
        guards, spoken, hung_up = _guards(sess, stop_at=10_000)
        await guards._limit_guard()
        self.assertEqual(hung_up, [45 * 60.0])


class SilenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_silence_settings_read_from_config(self):
        sess = await _build({"silence_reminder_ms": 5000, "silence_reminder_max": 0, "end_call_on_silence_ms": 9000})
        self.assertEqual((sess.silence_reminder_ms, sess.silence_reminder_max, sess.end_call_on_silence_ms), (5000, 0, 9000))
        self.assertEqual((await _build({"silence_reminder_max": None})).silence_reminder_max, 1)

    async def test_check_in_then_goodbye_when_still_silent(self):
        sess = session_module.Session(account_id=5, agent_id=7, silence_reminder_ms=5000)
        guards, spoken, _ = _guards(sess, stop_at=40)
        await guards._silence_loop()
        self.assertEqual([instr for _, instr in spoken],
                         [session_module.CHECKIN_INSTRUCTIONS, session_module.SILENT_GOODBYE_INSTRUCTIONS])
        self.assertAlmostEqual(spoken[0][0], 5.0)
        self.assertAlmostEqual(spoken[1][0], 17.0)  # 12 s after the check-in
        self.assertTrue(sess.ending_call)

    async def test_no_reminders_when_max_is_zero(self):
        sess = session_module.Session(account_id=5, agent_id=7, silence_reminder_ms=5000, silence_reminder_max=0)
        guards, spoken, hung_up = _guards(sess, stop_at=60)
        await guards._silence_loop()
        self.assertEqual(spoken, [])
        self.assertEqual(hung_up, [])

    async def test_end_call_on_silence_hangs_up(self):
        sess = session_module.Session(
            account_id=5, agent_id=7, silence_reminder_max=0, end_call_on_silence_ms=8000,
        )
        guards, spoken, hung_up = _guards(sess, stop_at=60)
        await guards._silence_loop()
        self.assertEqual(spoken, [])
        self.assertEqual(len(hung_up), 1)
        self.assertAlmostEqual(hung_up[0], 8.0)

    async def test_caller_voice_resets_silence(self):
        sess = session_module.Session(account_id=5, agent_id=7, silence_reminder_ms=5000)
        guards, spoken, _ = _guards(sess, stop_at=4.5)
        await guards._silence_loop()  # 4.5 s of quiet: nothing yet
        guards.caller_voice()  # the caller speaks
        guards.fake_time.stop_at = 9.0
        await guards._silence_loop()
        self.assertEqual(spoken, [])  # only 4.5 s of quiet since they spoke


class _PhoneSocket:
    """EnableX's side of /stream: starts media, then stays silent until we close."""

    def __init__(self):
        self.accept = AsyncMock()
        self.send_json = AsyncMock()
        self.closed = asyncio.Event()
        self._msgs = [{"event": "start_media", "stream_id": "st", "start": {"voice_id": "v-phone"}}]

    async def close(self, *a, **k):
        self.closed.set()

    async def receive_json(self):
        if self._msgs:
            return self._msgs.pop(0)
        await self.closed.wait()
        raise server.WebSocketDisconnect()


class PhoneGuardWiringTests(unittest.IsolatedAsyncioTestCase):
    async def test_silent_phone_caller_gets_check_in_then_goodbye_then_hang_up(self):
        sess = await _build({"silence_reminder_ms": 100, "first_speaker": "user"})
        spoken = []

        async def fake_speak(s, instructions, *a, **k):
            spoken.append(instructions)

        async def no_greeting():
            return None

        server._PENDING_GREETING_BY_VOICE_ID["v-phone"] = (sess, asyncio.create_task(no_greeting()))
        ws = _PhoneSocket()
        with patch.object(server.ws_security, "verify_stream_token", return_value={"voice_id": "v-phone"}), \
                patch.object(server.session_module, "speak_instruction", fake_speak), \
                patch.object(server.session_module, "finalize_call", AsyncMock(return_value=None)) as finalize, \
                patch.object(session_module, "_POST_CHECKIN_TIMEOUT_S", 0.2), \
                patch.object(session_module, "_GUARD_POLL_S", 0.01):
            await asyncio.wait_for(server.stream_ws(ws, token="t"), timeout=5)
        self.assertEqual(spoken, [session_module.CHECKIN_INSTRUCTIONS, session_module.SILENT_GOODBYE_INSTRUCTIONS])
        self.assertTrue(ws.closed.is_set())
        finalize.assert_awaited_once()


class OpenerAndVariablesTests(unittest.IsolatedAsyncioTestCase):
    async def test_outbound_call_uses_outbound_welcome_message(self):
        cfg = {"welcome_message": "Thanks for calling!", "welcome_message_outbound": "Hi, is now a good time?"}
        place = AsyncMock(return_value={"ok": True, "response": {"voice_id": "v-out"}})
        with patch.object(server.compliance, "check_call_allowed", return_value=(True, "")), \
                patch.object(server.db, "get_agent_config", return_value=cfg), \
                patch.object(server.compliance, "recording_config", _no_recording), \
                patch.object(server.enablex, "place_outbound_call", place), \
                patch.object(server.enablex, "public_base_url", return_value="https://orch.test"), \
                patch.object(server.session_module, "build_greeting_audio", AsyncMock(return_value=None)):
            await server.enablex_outbound_test_call(
                {"to": "+919800000000", "fromNumber": "+917700000000", "accountId": 5, "agentId": 7}, None,
            )
        sess, task = server._PENDING_GREETING_BY_VOICE_ID.pop("v-out")
        await task
        self.assertEqual(sess.welcome_message, "Hi, is now a good time?")
        self.assertEqual((await _build(cfg)).welcome_message, "Thanks for calling!")
        self.assertEqual(
            (await _build({"welcome_message": "Inbound line"}, direction="outbound")).welcome_message, "Inbound line",
        )

    async def test_variable_defaults_fill_missing_values(self):
        sess = await _build({
            "welcome_message": "Namaste {{name}}, about your {{custom.bhk}} enquiry",
            "variables": json.dumps([{"name": "name", "defaultValue": "ji"}, {"name": "custom.bhk", "defaultValue": "2BHK"}]),
        })
        self.assertEqual(session_module._substitute_template_vars(sess, sess.welcome_message),
                         "Namaste ji, about your 2BHK enquiry")
        sess.visitor_name = "Asha"
        self.assertTrue(session_module._substitute_template_vars(sess, sess.welcome_message).startswith("Namaste Asha,"))


class ToolsTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _names(sess):
        return {s["function"]["name"] for s in sess.tool_schemas}

    async def test_enabled_functions_gates_optional_tools(self):
        sess = await _build({"enabled_functions": "end_call"})
        names = self._names(sess)
        self.assertIn("end_call", names)
        self.assertNotIn("web_search", names)
        self.assertIn("log_lead", names)  # core tools are never optional
        self.assertNotIn("web_search", sess.tool_handlers)

    async def test_blank_enabled_functions_keeps_every_tool(self):
        names = self._names(await _build({"enabled_functions": ""}))
        self.assertTrue({"end_call", "web_search"} <= names)


class PostCallFieldsTests(unittest.IsolatedAsyncioTestCase):
    async def test_post_call_fields_extracted_saved_and_delivered(self):
        cfg = {"post_call_fields": json.dumps([{"key": "bhk", "description": "Flat size wanted"}])}
        sess = await _build(cfg)
        sess.transcript = [{"role": "user", "text": "I want a 3BHK"}]

        class _Completions:
            async def create(self, **kw):
                self.kw = kw
                msg = SimpleNamespace(content=json.dumps({"fields": {"bhk": "3BHK"}}))
                return SimpleNamespace(choices=[SimpleNamespace(message=msg)])

        completions = _Completions()
        fake_client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
        saved, delivered = [], []

        async def deliver(account_id, event, call_id=None, allowed_keys=None):
            delivered.append(event)

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test"}), \
                patch("openai.AsyncOpenAI", return_value=fake_client), \
                patch.object(db, "save_call", side_effect=lambda r: saved.append(r) or 1), \
                patch.object(session_module.tools, "_deliver_to_integrations", deliver):
            await session_module.finalize_call(sess, "room-x")
        self.assertIn("bhk", completions.kw["messages"][0]["content"])
        self.assertEqual(saved[0]["extracted_data"], {"bhk": "3BHK"})
        self.assertEqual(delivered[0]["extracted_data"], {"bhk": "3BHK"})


class DeliveryToneTests(unittest.IsolatedAsyncioTestCase):
    async def test_emotion_intensity_scales_tone(self):
        with patch.object(session_module.emotion, "detect_caller_emotion", return_value="frustrated"):
            strong = session_module._tone_kwargs_for(await _build({"emotion_intensity": "strong"}), "x")
            subtle = session_module._tone_kwargs_for(await _build({"emotion_intensity": "subtle"}), "x")
            off = session_module._tone_kwargs_for(await _build({"emotion_intensity": "off"}), "x")
        self.assertEqual(off, {})
        self.assertAlmostEqual(1.0 - subtle["pace"], (1.0 - strong["pace"]) / 2)

    async def test_interruption_sensitivity_scales_barge_in_length(self):
        sess = await _build({"interruption_sensitivity": 1.0})
        self.assertEqual(sess.interruption_sensitivity, 1.0)
        self.assertIsNone((await _build({})).interruption_sensitivity)
        self.assertEqual(server._barge_in_frames(4, None), 4)
        self.assertEqual(server._barge_in_frames(4, 0.5), 4)
        self.assertLess(server._barge_in_frames(4, 1.0), 4)
        self.assertGreater(server._barge_in_frames(4, 0.0), 4)
        self.assertEqual(server._barge_in_frames(15, 0.0), 21)


class IntegrationAttributeTests(unittest.IsolatedAsyncioTestCase):
    async def test_crm_keys_and_webhook_url_set_on_session(self):
        sess = await _build({"crm_integration_keys": '["hubspot", "arthaleads"]', "webhook_url": "https://h.test/x"})
        self.assertEqual(sess.crm_integration_keys, ["hubspot", "arthaleads"])
        self.assertEqual(sess.agent_webhook_url, "https://h.test/x")
        bare = await _build({})
        self.assertEqual((bare.crm_integration_keys, bare.agent_webhook_url), ([], ""))


class InboundRouteServerTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        server._PENDING_ACCOUNT_BY_VOICE_ID.clear()
        server._PENDING_AGENT_BY_VOICE_ID.clear()
        server._PENDING_GREETING_BY_VOICE_ID.clear()
        server._INBOUND_NUMBER_BY_VOICE_ID.clear()

    def _patches(self, rejection):
        return (
            patch.object(server.db, "get_phone_number_by_number", return_value={"account_id": 5, "agent_id": 7}),
            patch.object(server.db, "is_on_orchestrator_pipeline", return_value=True),
            patch.object(server.agent_rules, "inbound_rejection", side_effect=rejection),
            patch.object(server.db, "get_agent_config", return_value={}),
            patch.object(server.compliance, "recording_config", _no_recording),
            patch.object(server.session_module, "build_greeting_audio", AsyncMock(return_value=None)),
        )

    async def _incoming(self, voice_id, rejection, accept):
        p = self._patches(rejection)
        with p[0], p[1], p[2], p[3], p[4], p[5], patch.object(server.enablex, "accept_call", accept):
            await server.enablex_inbound_event(
                {"state": "incomingcall", "voice_id": voice_id, "direction": "inbound",
                 "from": "+919800000000", "to": "+917700000000"}
            )

    async def test_blocked_route_is_not_answered(self):
        accept = AsyncMock(return_value={"ok": True})
        await self._incoming("v-blocked", lambda number, live: "outside 09:00-18:00", accept)
        accept.assert_not_called()

    async def test_live_calls_on_the_number_are_counted(self):
        seen = []
        accept = AsyncMock(return_value={"ok": True})

        def rejection(number, live):
            seen.append((number, live))
            return "at its 1-call limit" if live >= 1 else None

        await self._incoming("v-first", rejection, accept)
        await self._incoming("v-second", rejection, accept)
        self.assertEqual(seen, [("+917700000000", 0), ("+917700000000", 1)])
        self.assertEqual(accept.await_count, 1)
        for _, task in server._PENDING_GREETING_BY_VOICE_ID.values():
            await task


_ROUTE_SCHEMA = """
CREATE TABLE inbound_routes (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id INTEGER,
    phone_number TEXT,
    agent_id INTEGER,
    timezone TEXT DEFAULT 'Asia/Kolkata',
    max_concurrent INTEGER DEFAULT 1,
    start_date TEXT,
    end_date TEXT,
    window_start TEXT,
    window_end TEXT,
    active_days TEXT DEFAULT 'Mon,Tue,Wed,Thu,Fri',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS'))
);
CREATE TABLE phone_numbers (
    id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    account_id INTEGER,
    number TEXT NOT NULL UNIQUE,
    label TEXT DEFAULT '',
    provider TEXT DEFAULT 'enablex',
    agent_id INTEGER,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')),
    lk_trunk_id TEXT,
    lk_dispatch_rule_id TEXT
)
"""

NUMBER = "+917700000000"
# Wednesday 2026-10-14 11:00 IST, as UTC.
WED_11_IST = datetime.datetime(2026, 10, 14, 5, 30, tzinfo=datetime.timezone.utc)


@unittest.skipIf(pgserver is None, "pgserver not installed")
class PostgresRouteRuleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import agent_rules

        cls.rules = agent_rules
        cls._tmp = tempfile.TemporaryDirectory()
        cls._pg = pgserver.get_server(cls._tmp.name, cleanup_mode="stop")
        cls._env = patch.dict(os.environ, {"DATABASE_URL": cls._pg.get_uri()})
        cls._env.start()
        if dbconn._pool is not None:
            dbconn._pool.close()
        dbconn._pool = None

    @classmethod
    def tearDownClass(cls):
        if dbconn._pool is not None:
            dbconn._pool.close()
            dbconn._pool = None
        cls._env.stop()
        cls._pg.cleanup()
        cls._tmp.cleanup()

    def setUp(self):
        conn = dbconn.connect()
        try:
            with conn:
                conn.execute("DROP TABLE IF EXISTS inbound_routes")
                conn.execute("DROP TABLE IF EXISTS phone_numbers")
                for stmt in _ROUTE_SCHEMA.split(";"):
                    if stmt.strip():
                        conn.execute(stmt)
                conn.execute("INSERT INTO phone_numbers (account_id, number, agent_id) VALUES (5, ?, 7)", (NUMBER,))
        finally:
            conn.close()

    def _route(self, account_id=5, **cols):
        # Same column shapes server/calls_db.create_inbound_route writes from
        # the dashboard form: "HH:MM" times, ISO dates, "Mon,Tue" day names.
        data = {
            "phone_number": NUMBER, "agent_id": 7, "timezone": "Asia/Kolkata", "max_concurrent": 1,
            "start_date": None, "end_date": None, "window_start": None, "window_end": None,
            "active_days": "Mon,Tue,Wed,Thu,Fri",
        }
        data.update(cols)
        conn = dbconn.connect()
        try:
            with conn:
                conn.execute(
                    "INSERT INTO inbound_routes (account_id, phone_number, agent_id, timezone, max_concurrent, "
                    "start_date, end_date, window_start, window_end, active_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (account_id, data["phone_number"], data["agent_id"], data["timezone"], data["max_concurrent"],
                     data["start_date"], data["end_date"], data["window_start"], data["window_end"],
                     data["active_days"]),
                )
        finally:
            conn.close()

    def _reject(self, live=0, now=WED_11_IST):
        return self.rules.inbound_rejection(NUMBER, live, now=now)

    def test_no_route_answers(self):
        self.assertIsNone(self._reject())

    def test_active_day_and_window_answer(self):
        self._route(window_start="09:00", window_end="18:00")
        self.assertIsNone(self._reject())

    def test_inactive_day_blocks(self):
        self._route(active_days="Mon,Tue")
        self.assertEqual(self._reject(), "Wed is not an active day")

    def test_outside_window_blocks_in_route_timezone(self):
        self._route(window_start="12:00", window_end="18:00")
        self.assertEqual(self._reject(), "outside 12:00-18:00")
        # The newest route wins; the same instant is 05:30 in a UTC-zoned one.
        self._route(window_start="05:00", window_end="06:00", timezone="UTC")
        self.assertIsNone(self._reject())

    def test_date_range_blocks(self):
        self._route(start_date="2026-10-20")
        self.assertEqual(self._reject(), "route starts on 2026-10-20")
        self._route(end_date="2026-10-01")
        self.assertEqual(self._reject(), "route ended on 2026-10-01")

    def test_max_concurrent_blocks(self):
        self._route(max_concurrent=1)
        self.assertIsNone(self._reject(live=0))
        self.assertEqual(self._reject(live=1), "at its 1-call limit")

    def test_route_from_another_account_is_ignored(self):
        self._route(account_id=9, active_days="Mon")
        self.assertIsNone(self._reject())

    def test_unnormalized_dialled_number_matches(self):
        self._route(active_days="Mon")
        self.assertEqual(self.rules.inbound_rejection("07700000000", 0, now=WED_11_IST), "Wed is not an active day")


if __name__ == "__main__":
    unittest.main()
