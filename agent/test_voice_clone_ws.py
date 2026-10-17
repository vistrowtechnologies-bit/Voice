"""Cloned voice, phase 2: one Sarvam WebSocket per call, and the call-time
rules around it (gender, plan, language, concurrency, pace, disclosure).

The WebSocket is a fake aiohttp server on 127.0.0.1 speaking the protocol
measured against the live Sarvam server (see sarvam_clone_tts docstring):
config / text / flush / ping in; audio (raw PCM, base64) + one "final" per
flush, or an error frame, out. No external network, no database."""
import asyncio
import base64
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import MagicMock, PropertyMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")

from aiohttp import WSMsgType, web
from livekit.agents import APIConnectOptions, APIError
from livekit.agents.tts import FallbackAdapter, TTS, TTSCapabilities
from livekit.agents.tts import ChunkedStream, AudioEmitter

import custom_voice
import plan_policy
import sarvam_clone_tts as sct

PCM = b"\x01\x00" * 1600  # 0.1 s at 16 kHz-equivalent bytes; content is irrelevant
VALUE = "custom:vv_abcdefghijklmnop"
ROW = {"id": "vv_abcdefghijklmnop", "status": "ready", "language": "hi-IN", "gender": "male",
       "engine_default": "sarvam", "elevenlabs_voice_id": None, "sarvam_voice_id": "svc-1",
       "plan_allows": True}


class FakeSarvam:
    """Per connection: every client message is recorded. On flush it replies
    with `chunks` audio frames and a final, unless a behaviour says otherwise."""

    def __init__(self):
        self.connections = []      # list of message lists, one per socket
        self.behaviour = "ok"      # ok | error | error_after_audio | stall | close_after_audio
        self.close_idle_after = None
        self.chunks = 3
        self.auth = []

    async def handler(self, request):
        self.auth.append(request.headers.get("api-subscription-key"))
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        msgs = []
        self.connections.append(msgs)
        idle_task = None
        if self.close_idle_after is not None and len(self.connections) == 1:
            async def close_later():
                await asyncio.sleep(self.close_idle_after)
                await ws.close(code=1000)
            idle_task = asyncio.ensure_future(close_later())
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            data = json.loads(msg.data)
            msgs.append(data)
            if data["type"] != "flush":
                continue
            if self.behaviour == "error":
                await ws.send_json({"type": "error", "data": {"message": "rate limited", "code": 429}})
                continue
            if self.behaviour == "stall":
                continue
            n = 1 if self.behaviour in ("error_after_audio", "close_after_audio") else self.chunks
            for _ in range(n):
                if self.behaviour == "slow":
                    await asyncio.sleep(0.1)
                await ws.send_json({"type": "audio", "data": {"audio": base64.b64encode(PCM).decode(),
                                                              "content_type": "audio/pcm"}})
            if self.behaviour == "error_after_audio":
                await ws.send_json({"type": "error", "data": {"message": "boom", "code": 500}})
                continue
            if self.behaviour == "close_after_audio":
                await ws.close(code=1011)
                break
            await ws.send_json({"type": "event", "data": {"event_type": "final"}})
        if idle_task:
            idle_task.cancel()
        return ws

    def of(self, kind, conn=None):
        conns = self.connections if conn is None else [self.connections[conn]]
        return [m for c in conns for m in c if m["type"] == kind]


class FakeBackup(TTS):
    """Stands in for the stock Sarvam voice: records what it was asked to say."""

    def __init__(self):
        super().__init__(capabilities=TTSCapabilities(streaming=False), sample_rate=8000, num_channels=1)
        self.texts = []
        self.options = []

    def update_options(self, **kw):
        self.options.append(kw)

    def synthesize(self, text, *, conn_options=APIConnectOptions()):
        self.texts.append(text)
        return _BackupChunk(tts=self, input_text=text, conn_options=conn_options)


class _BackupChunk(ChunkedStream):
    async def _run(self, output_emitter: AudioEmitter) -> None:
        output_emitter.initialize(request_id="b", sample_rate=8000, num_channels=1, mime_type="audio/pcm")
        output_emitter.push(b"\x02\x00" * 800)
        output_emitter.flush()


class WsCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.fake = FakeSarvam()
        app = web.Application()
        app.router.add_get("/voices/clone/ws", self.fake.handler)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        self.url = f"http://127.0.0.1:{port}/voices/clone/ws?send_completion_event=true"
        self.tts = sct.SarvamCloneTTS(voice_id="svc-1", language="hi-IN", sample_rate=8000, pace=1.0,
                                      api_key="k", ws_url=self.url, keepalive_interval=0.15,
                                      stall_timeout=0.6)

    async def asyncTearDown(self):
        await self.tts.aclose()
        await self.runner.cleanup()

    async def speak(self, tts, *pieces):
        audio = b""
        async with tts.stream() as stream:
            for piece in pieces:
                stream.push_text(piece)
            stream.end_input()
            async for ev in stream:
                audio += ev.frame.data.tobytes()
        return audio

    async def settle(self, seconds=0.05):
        await asyncio.sleep(seconds)


class OneSocketPerCall(WsCase):
    async def test_config_once_and_socket_reused_across_replies(self):
        a1 = await self.speak(self.tts, "नमस्ते, ", "मैं मदद करती हूँ।")
        a2 = await self.speak(self.tts, "जी, बताइए।")
        self.assertGreater(len(a1), 0)
        self.assertGreater(len(a2), 0)
        self.assertEqual(len(self.fake.connections), 1)
        self.assertEqual(self.tts.connections_opened, 1)
        configs = self.fake.of("config")
        self.assertEqual(len(configs), 1)
        cfg = configs[0]["data"]
        self.assertEqual(cfg["target_language_code"], "hi-IN")
        self.assertNotIn("language_code", cfg)
        self.assertEqual(cfg["voice_id"], "svc-1")
        self.assertEqual(cfg["output_audio_codec"], "linear16")
        self.assertEqual(cfg["speech_sample_rate"], 8000)
        self.assertEqual(self.fake.connections[0][0]["type"], "config")  # config first
        self.assertEqual(len(self.fake.of("flush")), 2)                  # one flush per reply
        self.assertEqual(self.fake.auth, ["k"])

    async def test_multiple_sentences_one_flush_at_the_end(self):
        pieces = ["पहला वाक्य थोड़ा लंबा है ताकि अलग जाए। ", "दूसरा वाक्य भी काफ़ी लंबा रखा गया है। ",
                  "और यह तीसरा वाक्य है।"]
        await self.speak(self.tts, *[w + " " for p in pieces for w in p.split()])
        msgs = self.fake.connections[0]
        texts = [m for m in msgs if m["type"] == "text"]
        self.assertGreaterEqual(len(texts), 2)                         # sentence by sentence
        self.assertEqual("".join(t["data"]["text"] for t in texts).split(), "".join(pieces).split())
        self.assertEqual([m["type"] for m in msgs][-1], "flush")
        self.assertEqual(len(self.fake.of("flush")), 1)

    async def test_empty_reply_opens_no_socket(self):
        async with self.tts.stream() as stream:
            stream.end_input()
            async for _ in stream:
                pass
        self.assertEqual(self.fake.connections, [])

    async def test_language_reconfigures_same_socket(self):
        await self.speak(self.tts, "नमस्ते।")
        self.tts.update_options(target_language_code="mr-IN")
        await self.speak(self.tts, "नमस्कार।")
        self.assertEqual(len(self.fake.connections), 1)
        langs = [c["data"]["target_language_code"] for c in self.fake.of("config")]
        self.assertEqual(langs, ["hi-IN", "mr-IN"])

    async def test_pace_goes_in_the_config_clamped(self):
        tts = sct.SarvamCloneTTS(voice_id="v", language="hi-IN", pace=3.0, api_key="k", ws_url=self.url)
        try:
            await self.speak(tts, "जी।")
        finally:
            await tts.aclose()
        self.assertEqual(self.fake.of("config")[0]["data"]["pace"], 2.0)
        self.assertEqual(sct.clamp_pace(0.2), 0.5)
        self.assertEqual(sct.clamp_pace(None), 1.0)

    async def test_idle_keepalive_pings(self):
        await self.speak(self.tts, "नमस्ते।")
        await self.settle(0.5)
        self.assertGreaterEqual(len(self.fake.of("ping")), 2)
        await self.speak(self.tts, "जी।")
        self.assertEqual(len(self.fake.connections), 1)

    async def test_reconnects_after_server_closes_idle_socket(self):
        self.fake.close_idle_after = 0.2
        await self.speak(self.tts, "नमस्ते।")
        await self.settle(0.5)
        audio = await self.speak(self.tts, "जी, बताइए।")
        self.assertGreater(len(audio), 0)
        self.assertEqual(len(self.fake.connections), 2)
        self.assertEqual(self.fake.connections[1][0]["type"], "config")  # config again on the new socket

    async def test_prewarm_opens_and_configures_before_first_reply(self):
        self.tts.prewarm()
        await self.settle(0.3)
        self.assertEqual(len(self.fake.connections), 1)
        self.assertEqual(self.fake.connections[0][0]["type"], "config")
        self.assertEqual(self.fake.of("text"), [])
        await self.speak(self.tts, "जी।")
        self.assertEqual(len(self.fake.connections), 1)
        self.assertEqual(len(self.fake.of("config")), 1)


class Failures(WsCase):
    def adapter(self):
        import main
        backup = FakeBackup()
        adapter = main._CloneFallbackAdapter([self.tts, backup], sample_rate=8000)
        adapter._vistrow_clone, adapter._vistrow_backup = self.tts, backup
        return adapter, backup

    async def test_error_frame_falls_back_without_retry(self):
        self.fake.behaviour = "error"
        adapter, backup = self.adapter()
        audio = await self.speak(adapter, "नमस्ते, कैसे हैं आप?")
        self.assertGreater(len(audio), 0)
        self.assertEqual(len(backup.texts), 1)                 # backup spoke the reply
        self.assertEqual(len(self.fake.of("flush")), 1)       # clone asked exactly once (no retry)
        await adapter.aclose()

    async def test_error_after_audio_is_not_replayed(self):
        self.fake.behaviour = "error_after_audio"
        adapter, backup = self.adapter()
        audio = await self.speak(adapter, "नमस्ते, कैसे हैं आप?")
        self.assertGreater(len(audio), 0)
        self.assertEqual(backup.texts, [])                    # nothing replayed by the backup
        self.assertEqual(len(self.fake.of("flush")), 1)       # nor by the clone
        await adapter.aclose()

    async def test_error_after_audio_is_not_retryable(self):
        self.fake.behaviour = "close_after_audio"
        with self.assertRaises(APIError) as caught:
            await self.speak(self.tts, "नमस्ते।")
        self.assertFalse(caught.exception.retryable)
        self.assertEqual(len(self.fake.of("flush")), 1)

    async def test_stall_falls_back(self):
        self.fake.behaviour = "stall"
        adapter, backup = self.adapter()
        t0 = time.monotonic()
        audio = await self.speak(adapter, "नमस्ते।")
        self.assertGreater(len(audio), 0)
        self.assertEqual(len(backup.texts), 1)
        self.assertLess(time.monotonic() - t0, 3.0)
        await adapter.aclose()

    async def test_failed_socket_is_not_reused(self):
        self.fake.behaviour = "error"
        with self.assertRaises(APIError):
            await self.speak(self.tts, "नमस्ते।")
        await self.settle(0.2)
        self.fake.behaviour = "ok"
        audio = await self.speak(self.tts, "जी।")
        self.assertGreater(len(audio), 0)
        self.assertGreaterEqual(len(self.fake.connections), 2)

    async def test_interrupted_reply_never_leaks_into_the_next(self):
        self.fake.behaviour, self.fake.chunks = "slow", 10
        stream = self.tts.stream()
        stream.push_text("एक लंबा जवाब जो बीच में रोका जाएगा।")
        stream.end_input()
        await stream.__anext__()          # first audio arrived, then the caller barges in
        await stream.aclose()
        self.fake.behaviour, self.fake.chunks = "ok", 2
        await self.settle(0.2)
        audio = await self.speak(self.tts, "जी।")
        self.assertEqual(len(audio), 2 * len(PCM))   # only this reply's two chunks
        self.assertEqual(len(self.fake.connections), 2)

    async def test_unsupported_language_never_reaches_sarvam(self):
        adapter, backup = self.adapter()
        adapter.update_options(target_language_code="ur-IN")
        audio = await self.speak(adapter, "آپ کیسے ہیں؟")
        self.assertGreater(len(audio), 0)
        self.assertEqual(len(backup.texts), 1)
        self.assertEqual(self.fake.connections, [])
        await adapter.aclose()

    async def test_language_switch_reaches_clone_and_backup(self):
        adapter, backup = self.adapter()
        adapter.update_options(target_language_code="mr-IN")
        self.assertEqual(self.tts.language, "mr-IN")
        self.assertEqual(backup.options, [{"target_language_code": "mr-IN"}])
        await adapter.aclose()


class ConcurrencyCap(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        custom_voice.release_clone_slot()

    def tearDown(self):
        custom_voice.release_clone_slot()

    def hold_slot_in_child(self):
        code = ("import sys,time; sys.path.insert(0, %r); import custom_voice; "
                "print(custom_voice.acquire_clone_slot(), flush=True); time.sleep(30)") % os.path.dirname(
                    os.path.abspath(__file__))
        env = {**os.environ, custom_voice.SLOT_DIR_ENV: self.dir, custom_voice.MAX_CONCURRENT_ENV: "2"}
        proc = subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE, env=env, text=True)
        self.addCleanup(proc.kill)
        self.assertEqual(proc.stdout.readline().strip(), "True")
        return proc

    def test_third_call_on_a_worker_gets_the_fallback(self):
        self.hold_slot_in_child()
        self.hold_slot_in_child()
        with patch.dict(os.environ, {custom_voice.SLOT_DIR_ENV: self.dir, custom_voice.MAX_CONCURRENT_ENV: "2"}):
            self.assertFalse(custom_voice.acquire_clone_slot())
            res = custom_voice.resolve_row(VALUE, 7, ROW, "", "s")
        self.assertEqual(res.speaker, "google:chirp3:Charon")
        self.assertIn("limit of 2", res.reason)

    def test_slot_frees_when_the_call_process_exits(self):
        proc = self.hold_slot_in_child()
        with patch.dict(os.environ, {custom_voice.SLOT_DIR_ENV: self.dir, custom_voice.MAX_CONCURRENT_ENV: "1"}):
            self.assertFalse(custom_voice.acquire_clone_slot())
            proc.kill()
            proc.wait()
            self.assertTrue(custom_voice.acquire_clone_slot())
            res = custom_voice.resolve_row(VALUE, 7, ROW, "", "s")
        self.assertEqual(res.speaker, custom_voice.SARVAM_CLONE_PREFIX + "svc-1")

    def test_elevenlabs_clone_needs_no_slot(self):
        row = {**ROW, "engine_default": "elevenlabs", "elevenlabs_voice_id": "EL1"}
        res = custom_voice.resolve_row(VALUE, 7, row, "e", "s", acquire_slot=lambda: False)
        self.assertEqual(res.speaker, "elevenlabs:EL1")


class GenderPlanLanguage(unittest.TestCase):
    def test_gender_matched_fallback(self):
        for gender, voice in (("male", "google:chirp3:Charon"), ("female", "google:chirp3:Achernar")):
            res = custom_voice.resolve_row(VALUE, 7, {**ROW, "gender": gender, "status": "failed"}, "", "s")
            self.assertEqual((res.speaker, res.gender), (voice, gender))
        res = custom_voice.resolve_row(VALUE, 7, None, "", "s")
        self.assertEqual((res.speaker, res.gender), ("google:chirp3:Achernar", "female"))

    def test_clone_speaking_keeps_its_gender(self):
        res = custom_voice.resolve_row(VALUE, 7, ROW, "", "s", acquire_slot=lambda: True)
        self.assertEqual((res.speaker, res.gender, res.fallback),
                         (custom_voice.SARVAM_CLONE_PREFIX + "svc-1", "male", "google:chirp3:Charon"))

    def test_plan_downgrade_uses_fallback(self):
        res = custom_voice.resolve_row(VALUE, 7, {**ROW, "plan_allows": False}, "e", "s", acquire_slot=lambda: True)
        self.assertEqual(res.speaker, "google:chirp3:Charon")
        self.assertIn("plan", res.reason)

    def test_clones_allowed_mirrors_the_server(self):
        def conn(plan, owner, used, account=True):
            c = MagicMock()
            c.execute.return_value.fetchone.side_effect = [
                {"plan": plan, "is_platform_owner": owner} if account else None, {"c": used}]
            return c
        self.assertTrue(plan_policy.clones_allowed(conn("growth", 0, 1), 7))
        self.assertFalse(plan_policy.clones_allowed(conn("growth", 0, 2), 7))   # over limit after downgrade
        self.assertFalse(plan_policy.clones_allowed(conn("starter", 0, 1), 7))  # plan limit 0
        self.assertTrue(plan_policy.clones_allowed(conn("starter", 1, 5), 7))   # platform owner
        self.assertFalse(plan_policy.clones_allowed(conn(None, 0, 0, account=False), 7))

    def test_db_lookup_reads_gender_and_plan(self):
        import db
        fake = MagicMock()
        fake.execute.return_value.fetchone.side_effect = [
            {**{k: v for k, v in ROW.items() if k != "plan_allows"}},
            {"plan": "scale", "is_platform_owner": 0}, {"c": 2}]
        with patch.object(db.dbconn, "connect", return_value=fake):
            row = db.get_custom_voice("vv_abcdefghijklmnop", 7)
        self.assertIn("gender", fake.execute.call_args_list[0].args[0])
        self.assertEqual(row["gender"], "male")
        self.assertIs(row["plan_allows"], True)


class AgentWiring(unittest.IsolatedAsyncioTestCase):
    """The real RealEstateAgent / _build_tts."""

    @classmethod
    def setUpClass(cls):
        import main
        cls.main = main

    def base(self, **kw):
        return {"id": 1, "account_id": 7, "name": "T", "model": "gpt-4.1-mini", "voice": VALUE,
                "language": "hi-IN", "tone": "balanced", "system_prompt": "x",
                "enabled_functions": "end_call", "_compliance_config": {}, **kw}

    def build(self, config, call_type="phone"):
        with patch.object(custom_voice, "acquire_clone_slot", return_value=True, create=True), \
             patch.object(self.main.db, "get_custom_voice", side_effect=AssertionError("looked up on the loop")):
            return self.main.RealEstateAgent(config, call_type=call_type)

    async def test_build_tts_clone_branch(self):
        tts, provider = self.main._build_tts(
            "hi-IN", custom_voice.SARVAM_CLONE_PREFIX + "svc-1",
            dict(self.main.TONE_PRESETS["balanced"], pace=1.3), "balanced", is_phone=True, voice_gender="male")
        self.assertEqual(provider, "sarvam-clone")
        clone, backup = tts._vistrow_clone, tts._vistrow_backup
        self.assertIsInstance(clone, sct.SarvamCloneTTS)
        self.assertTrue(clone.capabilities.streaming)
        self.assertEqual(tts._tts_instances[0], clone)                 # no StreamAdapter in front
        self.assertEqual(clone.sample_rate, 8000)
        self.assertEqual(clone.config()["pace"], 1.3)
        self.assertEqual(backup._opts.speaker, "shubh_hi_customer")    # male stock backup
        self.assertEqual(clone.stream()._conn_options.max_retry, 0)
        female, _ = self.main._build_tts("hi-IN", custom_voice.SARVAM_CLONE_PREFIX + "svc-1",
                                         dict(self.main.TONE_PRESETS["balanced"]), "balanced",
                                         is_phone=False, voice_gender="female")
        self.assertEqual(female._vistrow_backup._opts.speaker, "ritu_hi_customer")
        self.assertEqual(female._vistrow_clone.sample_rate, 24000)

    def test_preloaded_row_male_clone(self):
        agent = self.build(self.base(_runtime_custom_voice=ROW))
        self.assertEqual(agent._tts_speaker, custom_voice.SARVAM_CLONE_PREFIX + "svc-1")
        self.assertEqual(agent._voice_gender, "male")
        self.assertIn("ARE a man", agent.instructions)
        self.assertEqual(agent._voice, VALUE)                          # billing keeps custom:
        self.assertEqual(agent.tts._vistrow_backup._opts.speaker, "shubh_hi_customer")

    def test_preloaded_missing_row_uses_fallback_and_its_voice(self):
        agent = self.build(self.base(_runtime_custom_voice=None))
        self.assertEqual(agent._tts_speaker, "google:chirp3:Achernar")
        self.assertEqual(agent._speaking_voice, "google:chirp3:Achernar")
        self.assertEqual(agent._voice_gender, "female")
        self.assertEqual(agent._voice, VALUE)

    def test_plan_downgrade_at_call_time(self):
        agent = self.build(self.base(_runtime_custom_voice={**ROW, "plan_allows": False}))
        self.assertEqual(agent._tts_speaker, "google:chirp3:Charon")
        self.assertEqual(agent._voice_gender, "male")

    async def test_lookup_runs_in_the_async_context_load(self):
        seen = {}

        def lookup(voice_id, account_id):
            import threading
            seen["thread"] = threading.current_thread() is not threading.main_thread()
            seen["args"] = (voice_id, account_id)
            return ROW

        with patch.object(self.main.db, "get_custom_voice", side_effect=lookup), \
             patch.object(self.main.db, "get_compliance_config", return_value={}), \
             patch.object(self.main.db, "get_availability_config", return_value={}):
            config = await self.main._load_runtime_call_context(self.base(), None)
        self.assertEqual(config["_runtime_custom_voice"], ROW)
        self.assertEqual(seen["args"], ("vv_abcdefghijklmnop", 7))
        self.assertTrue(seen["thread"])

    async def test_failed_lookup_in_context_load_is_none(self):
        with patch.object(self.main.db, "get_custom_voice", side_effect=RuntimeError("db")), \
             patch.object(self.main.db, "get_compliance_config", return_value={}), \
             patch.object(self.main.db, "get_availability_config", return_value={}):
            config = await self.main._load_runtime_call_context(self.base(), None)
        self.assertIn("_runtime_custom_voice", config)
        self.assertIsNone(config["_runtime_custom_voice"])

    async def test_language_switch_on_chirp_fallback_swaps_locale(self):
        primary = MagicMock()
        chirp = MagicMock()
        chirp._vistrow_primary = primary
        real_build = self.main._build_tts

        def build_tts(language, speaker, *a, **k):
            # No Google credentials offline; the chirp branch is what is under test.
            return (chirp, "google-native") if speaker.startswith("google:chirp3:") else real_build(language, speaker, *a, **k)

        with patch.object(self.main, "_build_tts", side_effect=build_tts):
            agent = self.build(self.base(_runtime_custom_voice=None))
        self.assertEqual(agent._tts_provider, "google-native")
        agent._pending_language, agent._pending_language_streak = "mr-IN", 99
        with patch.object(self.main, "detect_reply_language", return_value="mr-IN"):
            await self._run_turn(agent)
        primary.update_options.assert_called_with(language="mr-IN", voice_name="mr-IN-Chirp3-HD-Achernar")

    async def _run_turn(self, agent):
        # Only the language-switch tail of on_user_turn_completed is under test.
        src_owner = type(agent)
        from livekit.agents import llm
        msg = llm.ChatMessage(role="user", content=["मी मराठीत बोलतो आहे आणि मला घर हवे आहे"])
        session = MagicMock()
        session.userdata = {"latency_metrics": {}}
        with patch.object(src_owner, "session", new_callable=PropertyMock, return_value=session):
            try:
                await agent.on_user_turn_completed(llm.ChatContext(), msg)
            except Exception:
                pass

    async def test_platform_demo_opener_discloses_for_clone(self):
        agent = self.build(self.base(is_platform_demo=True, system_prompt="", _runtime_custom_voice=ROW,
                                     _compliance_config={"record_calls": False}))
        session = MagicMock()
        session.userdata = {}

        async def _say(*a, **k):
            return None

        session.say = MagicMock(side_effect=lambda *a, **k: _say())
        with patch.object(type(agent), "session", new_callable=PropertyMock, return_value=session), \
             patch.object(agent, "_await_own_audio_track", side_effect=lambda *_: _say()), \
             patch.object(agent, "_warm_llm_prompt_cache"):
            agent._welcome_message = ""
            await agent.on_enter()
        spoken = session.say.call_args.args[0]
        self.assertIn(agent._recording_disclosure, spoken)
        self.assertTrue(agent._recording_disclosure)


if __name__ == "__main__":
    unittest.main()
