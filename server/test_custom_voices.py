"""Clone your voice (custom_voices.py): the real routes on a small FastAPI
app against a throwaway Postgres (TEST_DATABASE_URL). Every vendor request,
ffmpeg and object storage are replaced: nothing leaves this machine.

Vendor mocks use Sarvam's documented response shapes (docs.sarvam.ai API
reference, read 2026-10-16): create 201 {"status","data":{"voice_id",
"status","reference_text"}}, delete 204, list {"data":{"voices","total"}},
errors {"error":{"request_id","message","code"}}.

Covers pricing (first clone free, later clones 25 credits once, refunded on
failure), 402/403 refusals, account isolation, vendor names never in a
response, stock premium voices owner-only, agent-save validation, billing
on the standard tier, Sarvam error mapping and retries, gender, all 12
languages, orphan reconcile, and the reference-clip chooser."""
import asyncio
import base64
import functools
import json
import math
import os
import random
import re
import unittest
import urllib.error
from array import array
from unittest import mock
from urllib.parse import parse_qs, urlparse

TEST_DB = os.environ.get("TEST_DATABASE_URL")
VENDOR_WORDS = ("eleven", "sarvam")

# Sarvam's own example values (create-voice API reference).
SVC = "svc-efb9cac0-c63d-433a-9903-b3f0b0865b2b"
REF_TEXT = "Hello, welcome to Sarvam AI. We build cutting edge voice technology for Indian languages."
CREATE_201 = json.dumps({"status": "success", "data": {"voice_id": SVC, "status": "saved",
                                                       "reference_text": REF_TEXT}}).encode()


def sarvam_err(code: str, message: str, request_id: str = "req_test_1") -> bytes:
    return json.dumps({"error": {"request_id": request_id, "message": message, "code": code}}).encode()


RATE = 24000


def synth(seconds: float, segments=(), amp=6000.0, noise=40.0, clip=False, gauss=0.0, seed=1) -> bytes:
    """24 kHz mono s16le test PCM: low uniform noise everywhere, plus
    speech-like amplitude-modulated harmonic tones inside `segments`
    ((start_s, end_s) pairs). clip=True makes them full-scale square waves;
    gauss>0 adds steady gaussian noise of that std-dev (a fan)."""
    rnd = random.Random(seed)
    n = int(seconds * RATE)
    out = array("h", bytes(2 * n))
    segs = sorted(segments)
    k = 0
    for i in range(n):
        t = i / RATE
        x = rnd.uniform(-noise, noise) if noise else 0.0
        if gauss:
            x += rnd.gauss(0.0, gauss)
        while k < len(segs) and t >= segs[k][1]:
            k += 1
        if k < len(segs) and segs[k][0] <= t < segs[k][1]:
            tt = t - segs[k][0]
            v = (math.sin(2 * math.pi * 180 * t) + 0.5 * math.sin(2 * math.pi * 360 * t)) / 1.5
            if clip:
                x += 32767.0 if v >= 0 else -32768.0
            else:
                x += amp * (0.6 + 0.4 * math.sin(2 * math.pi * 4 * tt)) * v
        out[i] = max(-32768, min(32767, int(x)))
    return out.tobytes()


def bursts(start: float, end: float, on: float = 1.7, off: float = 0.3) -> list[tuple[float, float]]:
    """Talking from start to end: on-second phrases with off-second pauses."""
    segs, t = [], start
    while t < end:
        segs.append((t, min(t + on, end)))
        t += on + off
    return segs


@functools.lru_cache(maxsize=4)
def speech_pcm(seconds: float) -> bytes:
    return synth(seconds, bursts(0.5, seconds - 0.5))


class FakeB2:
    def __init__(self):
        self.objects, self.deleted = {}, []

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)
        self.objects.pop(Key, None)


def form_fields(body: bytes) -> dict:
    """Plain (non-file) fields of a multipart body."""
    return {m.group(1).decode(): m.group(2).decode("utf-8")
            for m in re.finditer(rb'name="([^"]+)"\r\n\r\n([^\r]*)\r\n', body)}


class Vendors:
    """Stands in for custom_voices._http. Records every request. Sarvam
    responses follow its API reference exactly."""

    def __init__(self):
        self.calls, self.requests, self.fail = [], [], set()
        self.create_script: list = []      # queued (status, body) or Exception for /voices/create
        self.listed: list[dict] = []       # voices GET /voices returns
        self.delete_fail: set[str] = set()
        # POST /speech-to-text: None = 503 (STT down), else this transcript.
        self.stt_transcript: str | None = None
        self.clone_fail = False            # /voices/clone (preview) returns 500

    def __call__(self, method, url, headers, body=None, timeout=60):
        self.calls.append((method, url))
        self.requests.append((method, url, body or b""))
        assert "api-subscription-key" in headers or "xi-api-key" in headers
        vendor = "eleven" if "elevenlabs" in url else "sarvam"
        if vendor in self.fail:
            return 500, sarvam_err("internal_server_error", "vendor down")
        if url.endswith("/v1/voices/add"):
            return 200, b'{"voice_id":"EL_NEW"}'
        if url.endswith("/voices/create"):
            if self.create_script:
                step = self.create_script.pop(0)
                if isinstance(step, Exception):
                    raise step
                return step
            return 201, CREATE_201
        if "/text-to-speech/" in url:
            return 200, b"ID3eleven-audio"
        if url.endswith("/speech-to-text"):
            if self.stt_transcript is None:
                return 503, sarvam_err("internal_server_error", "overloaded")
            return 200, json.dumps({"request_id": "req_stt", "transcript": self.stt_transcript,
                                    "language_code": "en-IN"}).encode()
        if url.endswith("/voices/clone"):
            if self.clone_fail:
                return 500, sarvam_err("internal_server_error", "clone down")
            b64 = base64.b64encode(b"ID3sarvam-audio").decode()
            return 200, json.dumps({"audio_b64": b64, "audio": b64, "request_id": "req_c", "audio_duration": 1.2}).encode()
        if method == "GET" and urlparse(url).path == "/voices":
            q = parse_qs(urlparse(url).query)
            limit, offset = int(q["limit"][0]), int(q["offset"][0])
            page = self.listed[offset:offset + limit]
            return 200, json.dumps({"status": "success", "data": {"voices": page, "total": len(page)}}).encode()
        if method == "DELETE" and "/voices/delete/" in url:
            vid = url.rsplit("/", 1)[1]
            if vid in self.delete_fail:
                return 500, sarvam_err("internal_server_error", "delete failed")
            self.listed = [v for v in self.listed if v["id"] != vid]
            return 204, b""
        if method == "DELETE":
            return 200, b"{}"
        raise AssertionError(f"unexpected vendor request {method} {url}")

    def creates(self) -> list[dict]:
        return [form_fields(b) for m, u, b in self.requests if u.endswith("/voices/create")]

    def sarvam_deletes(self) -> list[str]:
        return [u.rsplit("/", 1)[1] for m, u in self.calls if m == "DELETE" and "/voices/delete/" in u]


def listed_voice(vid: str, name: str, status: str = "active") -> dict:
    return {"id": vid, "name": name, "language": "hi-IN", "status": status, "source": "cloned",
            "created_by": "user-uuid", "created_at": "2026-10-16T10:00:00Z", "has_preview": False,
            "gender": None, "accent": None, "descriptor": "conversational"}


def multipart(fields: dict, files: dict) -> tuple[bytes, str]:
    boundary = "testboundary123"
    out = b""
    for k, v in fields.items():
        out += f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    for k, (name, data, ctype) in files.items():
        out += (f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\n'
                f"Content-Type: {ctype}\r\n\r\n").encode() + data + b"\r\n"
    out += f"--{boundary}--\r\n".encode()
    return out, f"multipart/form-data; boundary={boundary}"


class Client:
    def __init__(self, app, user: dict):
        self.app, self.user = app, user

    def request(self, method, path, body=None, raw=None, ctype="application/json", query=b""):
        payload = raw if raw is not None else (json.dumps(body).encode() if body is not None else b"")
        headers = [(b"content-type", ctype.encode()), (b"x-test-user", json.dumps(self.user).encode())]
        scope = {"type": "http", "method": method, "path": path, "raw_path": path.encode(), "query_string": query,
                 "headers": headers, "root_path": "", "scheme": "http", "server": ("t", 80), "client": ("127.0.0.1", 1),
                 "http_version": "1.1", "app": self.app}
        sent = []

        async def receive():
            return {"type": "http.request", "body": payload, "more_body": False}

        async def send(message):
            sent.append(message)

        asyncio.run(self.app(scope, receive, send))
        start = next(m for m in sent if m["type"] == "http.response.start")
        data = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
        return start["status"], data, dict(start["headers"])


# The launch gate (VOICE_CLONE_OPEN) is tested on its own below; every other
# test exercises the launched feature.
os.environ.setdefault("VOICE_CLONE_OPEN", "1")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class CustomVoiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        import custom_voices
        from fastapi import FastAPI, HTTPException, Request

        cls.db, cls.cv = calls_db, custom_voices
        calls_db.init_tables()

        def require_role(min_role):
            def dep(request: Request) -> dict:
                user = json.loads(request.headers["x-test-user"])
                if calls_db.ROLE_RANK[user["role"]] < calls_db.ROLE_RANK[min_role]:
                    raise HTTPException(403, "You don't have permission to do this")
                return user
            return dep

        app = FastAPI()
        app.include_router(custom_voices.build_router(require_role))
        cls.app = app

    def setUp(self):
        stamp = os.urandom(4).hex()
        self.accounts = {}
        for key, plan in (("growth", "growth"), ("scale", "scale"), ("starter", "starter"), ("other", "scale")):
            acct = self.db.create_account_with_owner(f"Co {key} {stamp}", "Owner", f"{key}-{stamp}@example.com", "h",
                                                     email_verified=True)
            conn = self.db._connect()
            with conn:
                conn.execute("UPDATE accounts SET plan = ? WHERE id = ?", (plan, acct["account_id"]))
            conn.close()
            self.set_credits(acct["account_id"], 1000)
            self.accounts[key] = acct
        self.vendors = Vendors()
        self.b2 = FakeB2()
        self.seconds = 45.0
        self.sleeps: list[float] = []
        env = {"ELEVEN_API_KEY": "k-e", "SARVAM_API_KEY": "k-s"}
        patches = [
            mock.patch.dict(os.environ, env),
            mock.patch.object(self.cv, "_http", self.vendors),
            mock.patch.object(self.cv, "_sleep", self.sleeps.append),
            mock.patch.object(self.cv, "_ffmpeg", lambda: "/usr/bin/ffmpeg"),
            mock.patch.object(self.cv, "decode_pcm", lambda data: speech_pcm(self.seconds)
                              if data.startswith(b"SAMPLE") else b"\0\0" * 24000 * 4),
            mock.patch.object(self.cv, "to_mp3", lambda pcm: b"MP3"),
            mock.patch.object(self.cv.storage, "b2_client", lambda: (self.b2, "bucket")),
            mock.patch.object(self.cv, "stt_wav", lambda pcm: b"RIFF-16k-wav"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.bodies: list[bytes] = []
        # The all-accounts preview budget is one shared row: start each test empty.
        self.sql("DELETE FROM settings WHERE account_id = ? AND key = ?",
                 (self.db.PLATFORM_ACCOUNT_ID, self.cv._PREVIEW_GLOBAL_KEY))

    def tearDown(self):
        for body in self.bodies:
            low = body.lower()
            for word in VENDOR_WORDS:
                self.assertNotIn(word.encode(), low, body[:200])

    # helpers ------------------------------------------------------------
    def set_credits(self, account_id, total):
        conn = self.db._connect()
        with conn:
            conn.execute("INSERT INTO settings (account_id, key, value) VALUES (?, 'credits_total', ?) "
                         "ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value", (account_id, str(total)))
        conn.close()

    def credits(self, account_id):
        conn = self.db._connect()
        row = conn.execute("SELECT value FROM settings WHERE account_id = ? AND key = 'credits_total'",
                           (account_id,)).fetchone()
        conn.close()
        return int(row["value"])

    def sql(self, query, params=()):
        conn = self.db._connect()
        with conn:
            cur = conn.execute(query, params)
            try:
                rows = [dict(r) for r in cur.fetchall()]
            except Exception:
                rows = []
        conn.close()
        return rows

    def client(self, key, role="admin"):
        acct = self.accounts[key]
        return Client(self.app, {"account_id": acct["account_id"], "user_id": acct["user_id"], "role": role})

    def call(self, client, method, path, **kw):
        status, data, headers = client.request(method, path, **kw)
        if headers.get(b"content-type", b"").startswith(b"application/json"):
            self.bodies.append(data)
            return status, json.loads(data)
        return status, data

    def create(self, key, language="hi-IN", name="My voice", sample=b"SAMPLE-audio", gender="female"):
        fields = {"name": name, "language": language}
        if gender is not None:
            fields["gender"] = gender
        raw, ctype = multipart(fields, {"sample": ("s.webm", sample, "audio/webm"),
                                        "consent": ("c.webm", b"CONSENT", "audio/webm")})
        return self.call(self.client(key), "POST", "/voices/custom", raw=raw, ctype=ctype)

    def row(self, key, voice_id):
        return self.cv.get_row(self.accounts[key]["account_id"], voice_id)

    # tests --------------------------------------------------------------
    def test_quote_by_plan(self):
        status, q = self.call(self.client("starter", "member"), "GET", "/voices/custom/quote")
        self.assertEqual(status, 200)
        self.assertEqual((q["limit"], q["canCreate"]), (0, False))
        self.assertIn("Growth", q["reason"])
        status, q = self.call(self.client("growth", "member"), "GET", "/voices/custom/quote")
        self.assertEqual((q["limit"], q["used"], q["setupCredits"], q["firstCloneFree"], q["canCreate"]),
                         (1, 0, 0, True, True))
        self.assertEqual(q["creditsPerMinute"], 2)
        self.assertIn("Co growth", q["consentSentence"])
        self.assertTrue(q["script"] and q["scriptHi"])
        self.assertEqual(q["balance"], 1000)

    def test_launch_gate_blocks_customers_until_open(self):
        os.environ["VOICE_CLONE_OPEN"] = "0"
        try:
            status, q = self.call(self.client("growth", "member"), "GET", "/voices/custom/quote")
            self.assertEqual((status, q["canCreate"], q["reason"]), (200, False, "Voice cloning is coming soon."))
            status, body = self.create("growth")
            self.assertEqual(status, 403)
            self.assertIn("coming soon", json.dumps(body))
            self.assertTrue(self.cv.launched_for(True))   # the platform owner can always clone
            self.assertFalse(self.cv.launched_for(False))
        finally:
            os.environ["VOICE_CLONE_OPEN"] = "1"

    def test_first_clone_free_then_25_once(self):
        aid = self.accounts["scale"]["account_id"]
        status, v = self.create("scale")
        self.assertEqual(status, 201)
        self.assertEqual(v["creditsCharged"], 0)
        self.assertTrue(v["id"].startswith("vv_"))
        self.assertEqual(v["voiceValue"], "custom:" + v["id"])
        self.assertEqual(self.credits(aid), 1000)
        _s, listed = self.call(self.client("scale"), "GET", "/voices/custom")
        self.assertEqual(listed[0]["status"], "ready")  # background task ran
        _s, q = self.call(self.client("scale"), "GET", "/voices/custom/quote")
        self.assertEqual((q["setupCredits"], q["firstCloneFree"]), (25, False))
        status, v2 = self.create("scale", name="Second")
        self.assertEqual((status, v2["creditsCharged"]), (201, 25))
        self.assertEqual(self.credits(aid), 975)
        _s, listed = self.call(self.client("scale"), "GET", "/voices/custom")
        self.assertEqual(self.credits(aid), 975)  # listing never charges or refunds again
        self.assertEqual({x["status"] for x in listed}, {"ready"})

    def test_vendor_failure_refunds(self):
        # Sarvam failing is a failed clone: no fallback to the other vendor,
        # even with its key present. 500 is retried twice first.
        aid = self.accounts["scale"]["account_id"]
        self.create("scale")
        self.vendors.fail = {"sarvam"}
        status, v = self.create("scale", name="Broken")
        self.assertEqual((status, v["creditsCharged"]), (201, 25))
        _s, listed = self.call(self.client("scale"), "GET", "/voices/custom")
        broken = next(x for x in listed if x["id"] == v["id"])
        self.assertEqual(broken["status"], "failed")
        self.assertEqual(broken["error"], self.cv._CREATE_FAILED)
        self.assertEqual(self.credits(aid), 1000)
        self.assertEqual(self.sleeps, [2.0, 6.0])
        # a failed clone does not use a slot or the free clone
        _s, q = self.call(self.client("scale"), "GET", "/voices/custom/quote")
        self.assertEqual(q["used"], 1)

    def test_free_first_clone_failure_keeps_next_free(self):
        self.vendors.fail = {"eleven", "sarvam"}
        self.create("growth")
        _s, q = self.call(self.client("growth"), "GET", "/voices/custom/quote")
        self.assertEqual((q["setupCredits"], q["used"], q["canCreate"]), (0, 0, True))

    def test_low_balance_402(self):
        self.create("scale")
        self.set_credits(self.accounts["scale"]["account_id"], 10)
        status, body = self.create("scale", name="Too poor")
        self.assertEqual(status, 402)
        self.assertIn("25 credits", body["detail"])
        _s, q = self.call(self.client("scale"), "GET", "/voices/custom/quote")
        self.assertFalse(q["canCreate"])

    def test_plan_limits_403(self):
        status, body = self.create("starter")
        self.assertEqual(status, 403)
        self.assertEqual(self.create("growth")[0], 201)
        status, body = self.create("growth", name="Second")
        self.assertEqual(status, 403)
        self.assertIn("1 cloned voice", body["detail"])

    def test_member_cannot_create(self):
        raw, ctype = multipart({"name": "x", "language": "hi-IN", "gender": "male"},
                               {"sample": ("s.webm", b"SAMPLE", "audio/webm"), "consent": ("c.webm", b"C", "audio/webm")})
        status, _ = self.call(self.client("scale", "member"), "POST", "/voices/custom", raw=raw, ctype=ctype)
        self.assertEqual(status, 403)

    def test_sample_too_short_400(self):
        self.seconds = 9
        status, body = self.create("scale")
        self.assertEqual(status, 400)
        self.assertIn("at least 10 seconds", body["detail"])
        self.assertEqual(self.vendors.creates(), [])

    def test_missing_keys_503(self):
        # The ElevenLabs key alone is not enough: cloning is Sarvam only.
        with mock.patch.dict(os.environ, {"SARVAM_API_KEY": ""}):
            status, body = self.create("scale")
        self.assertEqual(status, 503)
        self.assertEqual(body["detail"], self.cv._UNAVAILABLE)

    def test_sarvam_only_for_every_language(self):
        _s, hi = self.create("scale")
        _s, en = self.create("scale", language="en-IN", name="English")
        aid = self.accounts["scale"]["account_id"]
        for v in (hi, en):
            row = self.cv.get_row(aid, v["id"])
            self.assertEqual((row["status"], row["engine_default"], row["elevenlabs_voice_id"], row["sarvam_voice_id"]),
                             ("ready", "sarvam", None, SVC))
        self.assertFalse(any("elevenlabs" in url for _m, url in self.vendors.calls))
        row_hi = self.cv.get_row(aid, hi["id"])
        self.assertTrue(row_hi["sarvam_ref_key"].endswith("reference.wav"))
        self.assertIn(row_hi["sarvam_ref_key"], self.b2.objects)
        self.assertFalse(row_hi["consent_verified"])

    # B1: Sarvam's real create response nests the id under data ----------
    def test_create_stores_data_voice_id_reference_text_and_sends_documented_fields(self):
        status, v = self.create("scale", gender="male")
        self.assertEqual(status, 201)
        row = self.row("scale", v["id"])
        self.assertEqual((row["status"], row["sarvam_voice_id"], row["reference_text"], row["gender"]),
                         ("ready", SVC, REF_TEXT, "male"))
        self.assertEqual(v["gender"], "male")
        sent = self.vendors.creates()
        self.assertEqual(len(sent), 1)
        # Exactly the documented fields; never a Studio-only one (those 400).
        self.assertEqual(sent[0], {"name": v["id"], "language": "hi-IN", "style": "conversational", "gender": "male"})
        _s, listed = self.call(self.client("scale"), "GET", "/voices/custom")
        self.assertEqual(listed[0]["gender"], "male")
        self.assertNotIn("reference_text", listed[0])
        self.assertNotIn("referenceText", listed[0])

    # Gender --------------------------------------------------------------
    def test_gender_required(self):
        for gender, label in ((None, "missing"), ("", "empty"), ("other", "invalid")):
            status, body = self.create("scale", gender=gender)
            self.assertEqual(status, 400, label)
            self.assertEqual(body["detail"], self.cv._GENDER_REQUIRED, label)
        self.assertEqual(self.vendors.creates(), [])
        self.assertEqual(self.create("scale", gender="Female")[0], 201)  # case-insensitive

    # Languages -----------------------------------------------------------
    def test_all_twelve_languages_including_assamese(self):
        self.assertEqual(set(self.cv.LANGUAGES), {"as-IN", "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN",
                                                  "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"})
        self.assertEqual(set(self.cv._DEFAULT_PREVIEW), set(self.cv.LANGUAGES))
        self.assertEqual(self.cv.LANGUAGES["as-IN"], "Assamese")
        status, v = self.create("scale", language="as-IN")
        self.assertEqual(status, 201)
        self.assertEqual(self.vendors.creates()[0]["language"], "as-IN")
        self.assertEqual(sorted(v["speaksLanguages"]), sorted(self.cv.LANGUAGES))
        status, body = self.create("scale", language="fr-FR", name="French")
        self.assertEqual(status, 400)
        c = self.client("scale", "member")
        status, audio = self.call(c, "GET", f"/voices/custom/{v['id']}/preview", query=b"language=as-IN")
        self.assertEqual((status, audio), (200, b"ID3sarvam-audio"))
        clone_req = [form_fields(b) for m, u, b in self.vendors.requests if u.endswith("/voices/clone")][-1]
        self.assertEqual((clone_req["language_code"], clone_req["text"], clone_req["voice_id"]),
                         ("as-IN", self.cv._DEFAULT_PREVIEW["as-IN"], SVC))
        status, _ = self.call(c, "GET", f"/voices/custom/{v['id']}/preview", query=b"language=fr-FR")
        self.assertEqual(status, 400)

    # B3 / M3: error mapping ----------------------------------------------
    def test_422_asks_to_rerecord_and_refunds_without_retry(self):
        aid = self.accounts["scale"]["account_id"]
        self.create("scale")
        self.vendors.create_script = [(422, sarvam_err("unprocessable_entity_error", "Reference audio failed QC"))]
        status, v = self.create("scale", name="Noisy")
        self.assertEqual((status, v["creditsCharged"]), (201, 25))
        row = self.row("scale", v["id"])
        self.assertEqual((row["status"], row["error"]), ("failed", self.cv._RERECORD))
        self.assertIn("quiet room", row["error"])
        self.assertEqual(self.credits(aid), 1000)
        self.assertEqual((len(self.vendors.creates()), self.sleeps), (2, []))

    def test_401_403_unavailable_ops_alert_and_refund(self):
        aid = self.accounts["scale"]["account_id"]
        self.create("scale")
        for n, (status_code, code) in enumerate(((403, "invalid_request_error"), (401, "invalid_api_key_error"))):
            rid = f"req_acct_{os.urandom(3).hex()}"
            self.vendors.create_script = [(status_code, sarvam_err(code, "TIER_LIMIT_REACHED", rid))]
            status, v = self.create("scale", name=f"Capped {n}")
            self.assertEqual((status, v["creditsCharged"]), (201, 25))
            row = self.row("scale", v["id"])
            self.assertEqual((row["status"], row["error"]), ("failed", self.cv._UNAVAILABLE_REFUNDED))
            self.assertEqual(self.credits(aid), 1000)
            events = self.sql("SELECT source, level, message, account_id FROM error_events WHERE message LIKE ?",
                              (f"%{rid}%",))
            self.assertEqual(len(events), 1)
            self.assertEqual((events[0]["source"], events[0]["level"], events[0]["account_id"]),
                             ("custom_voices", "error", aid))
            self.assertIn(f"HTTP {status_code}", events[0]["message"])
            self.assertNotIn("k-s", events[0]["message"])  # never the key
        self.assertEqual(self.sleeps, [])  # never retried

    def test_quota_429_is_account_level_not_retried(self):
        self.vendors.create_script = [(429, sarvam_err("insufficient_quota_error", "Credits exhausted"))]
        status, v = self.create("scale")
        self.assertEqual(self.row("scale", v["id"])["error"], self.cv._UNAVAILABLE_REFUNDED)
        self.assertEqual(self.sleeps, [])

    def test_transient_errors_retried_then_ready(self):
        self.vendors.create_script = [(503, sarvam_err("rate_limit_exceeded_error", "overloaded")),
                                      (502, sarvam_err("model_call_error", "retry"))]
        status, v = self.create("scale")
        self.assertEqual(self.row("scale", v["id"])["status"], "ready")
        self.assertEqual((len(self.vendors.creates()), self.sleeps), (3, [2.0, 6.0]))

    def test_transient_errors_exhausted_fail_and_refund(self):
        aid = self.accounts["scale"]["account_id"]
        self.create("scale")
        self.vendors.create_script = [(429, sarvam_err("rate_limit_exceeded_error", "slow down")),
                                      (504, sarvam_err("gateway_timeout_error", "timeout")),
                                      (500, sarvam_err("internal_server_error", "boom"))]
        status, v = self.create("scale", name="Unlucky")
        row = self.row("scale", v["id"])
        self.assertEqual((row["status"], row["error"]), ("failed", self.cv._CREATE_FAILED))
        self.assertEqual(self.credits(aid), 1000)
        self.assertEqual((len(self.vendors.creates()) - 1, self.sleeps), (3, [2.0, 6.0]))

    def test_network_error_retried(self):
        self.vendors.create_script = [urllib.error.URLError("connection reset"), TimeoutError("read timed out")]
        status, v = self.create("scale")
        self.assertEqual(self.row("scale", v["id"])["status"], "ready")
        self.assertEqual(self.sleeps, [2.0, 6.0])

    # M5: orphans ---------------------------------------------------------
    def test_vendor_id_persisted_before_anything_else_can_fail(self):
        with mock.patch.object(self.cv, "_mark_ready", side_effect=RuntimeError("db hiccup")):
            status, v = self.create("scale")
        row = self.sql("SELECT status, sarvam_voice_id, reference_text, vendor_deleted_at FROM custom_voices "
                       "WHERE id = ?", (v["id"],))[0]
        self.assertEqual((row["status"], row["sarvam_voice_id"], row["reference_text"]), ("failed", SVC, REF_TEXT))
        self.assertIsNone(row["vendor_deleted_at"])
        # reconcile cleans it up
        with mock.patch.dict(os.environ, {"VOICE_CLONE_RECONCILE": "1"}), \
                mock.patch.object(self.cv, "_RECONCILE_MAX_DELETES", 1000):
            self.cv.reconcile_once()
        self.assertIn(SVC, self.vendors.sarvam_deletes())
        self.assertIsNotNone(self.sql("SELECT vendor_deleted_at FROM custom_voices WHERE id = ?",
                                      (v["id"],))[0]["vendor_deleted_at"])

    def _insert_row(self, voice_id, status, sarvam_id, deleted=False):
        aid = self.accounts["scale"]["account_id"]
        self.sql("INSERT INTO custom_voices (id, account_id, name, language, gender, status, sarvam_voice_id, deleted_at) "
                 f"VALUES (?, ?, 'x', 'hi-IN', 'female', ?, ?, {self.db._NOW if deleted else 'NULL'})",
                 (voice_id, aid, status, sarvam_id))

    def test_reconcile(self):
        def vid():
            return "vv_" + "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(16))
        a, b, c, d, e = vid(), vid(), vid(), vid(), vid()
        foreign = vid()
        self._insert_row(a, "ready", "svc-a")                 # live: kept
        self._insert_row(b, "ready", "svc-b", deleted=True)   # deleted, vendor delete failed earlier
        self._insert_row(c, "ready", "svc-c")                 # live, plus a duplicate svc-c2 from a retry
        self._insert_row(d, "processing", None)               # mid-create: kept
        self._insert_row(e, "failed", None)                   # failed, but a late create landed: svc-e
        self.vendors.listed = [
            listed_voice("svc-a", a), listed_voice("svc-b", b), listed_voice("svc-c", c),
            listed_voice("svc-c2", c), listed_voice("svc-d", d), listed_voice("svc-e", "vistrow-" + e),
            listed_voice("svc-h", "Ravi studio voice"),       # made by a human in Studio
            listed_voice("svc-f", foreign),                   # ours-looking, no row here (other env)
            listed_voice("svc-x", vid(), status="deleted"),
        ]
        # Off by default: no vendor traffic at all.
        self.assertEqual(self.cv.reconcile_once(), {"deleted": 0, "failed": 0, "kept": 0, "foreign": 0})
        self.assertEqual(self.vendors.calls, [])
        with mock.patch.dict(os.environ, {"VOICE_CLONE_RECONCILE": "1"}), \
                mock.patch.object(self.cv, "_LIST_PAGE", 2), \
                mock.patch.object(self.cv, "_RECONCILE_MAX_DELETES", 1000):
            out = self.cv.reconcile_once()
            deleted = set(self.vendors.sarvam_deletes())
            self.assertTrue({"svc-b", "svc-c2", "svc-e"} <= deleted, deleted)
            self.assertFalse({"svc-a", "svc-c", "svc-d", "svc-h", "svc-f", "svc-x"} & deleted, deleted)
            self.assertGreaterEqual(out["kept"], 3)
            self.assertGreaterEqual(out["foreign"], 1)
            lists = [u for m, u in self.vendors.calls if m == "GET"]
            self.assertGreaterEqual(len(lists), 5)  # paginated: 9 voices, 2 per page
            self.assertIsNotNone(self.sql("SELECT vendor_deleted_at FROM custom_voices WHERE id = ?",
                                          (b,))[0]["vendor_deleted_at"])
            self.assertTrue(all(s == self.cv._RECONCILE_SPACING_S for s in self.sleeps))
            # A failed vendor delete stays pending and is retried next pass.
            g = vid()
            self._insert_row(g, "ready", "svc-g", deleted=True)
            self.vendors.listed.append(listed_voice("svc-g", g))
            self.vendors.delete_fail = {"svc-g"}
            self.cv.reconcile_once()
            self.assertIsNone(self.sql("SELECT vendor_deleted_at FROM custom_voices WHERE id = ?",
                                       (g,))[0]["vendor_deleted_at"])
            self.vendors.delete_fail = set()
            self.vendors.calls.clear()
            self.cv.reconcile_once()
            self.assertEqual(self.vendors.sarvam_deletes().count("svc-g"), 1)
            self.assertNotIn("svc-b", self.vendors.sarvam_deletes())  # done once, never again

    def test_reconcile_claim_is_hourly_and_single(self):
        self.sql("DELETE FROM settings WHERE account_id = ? AND key = ?",
                 (self.db.PLATFORM_ACCOUNT_ID, self.cv._RECONCILE_MARK))
        now = 1_800_000_000.0
        self.assertTrue(self.cv._claim_reconcile(now))
        self.assertFalse(self.cv._claim_reconcile(now + 10))       # another replica, same hour
        self.assertFalse(self.cv._claim_reconcile(now + 3599))
        self.assertTrue(self.cv._claim_reconcile(now + 3600))

    # plan limit helper ----------------------------------------------------
    def test_clone_allowed_for_account(self):
        self.assertFalse(self.cv.clone_allowed_for_account(self.accounts["starter"]["account_id"]))
        self.assertTrue(self.cv.clone_allowed_for_account(self.accounts["growth"]["account_id"]))
        aid = self.accounts["scale"]["account_id"]
        _s, v1 = self.create("scale")
        self.create("scale", name="Two")
        self.assertTrue(self.cv.clone_allowed_for_account(aid))
        self.cv.validate_agent_voice(aid, v1["voiceValue"])
        self.sql("UPDATE accounts SET plan = 'growth' WHERE id = ?", (aid,))  # downgrade: 2 clones, limit 1
        self.assertFalse(self.cv.clone_allowed_for_account(aid))
        with self.assertRaises(self.cv.CloneError) as ctx:
            self.cv.validate_agent_voice(aid, v1["voiceValue"])
        self.assertEqual(ctx.exception.status, 403)
        self.sql("UPDATE accounts SET plan = 'starter' WHERE id = ?", (aid,))
        with self.assertRaises(self.cv.CloneError) as ctx:
            self.cv.validate_agent_voice(aid, v1["voiceValue"])
        self.assertIn("Growth and Scale", ctx.exception.detail)

    def test_isolation(self):
        _s, v = self.create("scale")
        other = self.client("other")
        base = f"/voices/custom/{v['id']}"
        self.assertEqual(self.call(other, "GET", base + "/preview")[0], 404)
        self.assertEqual(self.call(other, "PATCH", base, body={"name": "x"})[0], 404)
        self.assertEqual(self.call(other, "DELETE", base)[0], 404)
        self.assertEqual(self.call(other, "GET", "/voices/custom")[1], [])
        with self.assertRaises(self.cv.CloneError):
            self.cv.validate_agent_voice(self.accounts["other"]["account_id"], v["voiceValue"])
        self.cv.validate_agent_voice(self.accounts["scale"]["account_id"], v["voiceValue"])

    def test_preview_cached_and_rename(self):
        _s, v = self.create("scale")
        c = self.client("scale", "member")
        status, audio = self.call(c, "GET", f"/voices/custom/{v['id']}/preview")
        self.assertEqual((status, audio), (200, b"ID3sarvam-audio"))
        n = len(self.vendors.calls)
        self.assertEqual(self.call(c, "GET", f"/voices/custom/{v['id']}/preview")[1], audio)
        self.assertEqual(len(self.vendors.calls), n)  # cached
        status, _ = self.call(c, "GET", f"/voices/custom/{v['id']}/preview", query=b"text=" + b"x" * 201)
        self.assertEqual(status, 400)
        status, renamed = self.call(self.client("scale"), "PATCH", f"/voices/custom/{v['id']}", body={"name": "Ravi"})
        self.assertEqual((status, renamed["name"]), (200, "Ravi"))

    def test_delete_refused_while_in_use_then_deleted(self):
        _s, v = self.create("scale")
        aid = self.accounts["scale"]["account_id"]
        conn = self.db._connect()
        with conn:
            agent_id = conn.execute("SELECT id FROM agents WHERE account_id = ? LIMIT 1", (aid,)).fetchone()
            if agent_id is None:
                agent_id = conn.execute("INSERT INTO agents (account_id, name) VALUES (?, 'Front desk') RETURNING id",
                                        (aid,)).fetchone()
            conn.execute("UPDATE agents SET voice = ?, name = 'Front desk' WHERE id = ?", (v["voiceValue"], agent_id["id"]))
        conn.close()
        status, body = self.call(self.client("scale"), "DELETE", f"/voices/custom/{v['id']}")
        self.assertEqual(status, 409)
        self.assertIn("Front desk", body["detail"])
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE agents SET voice = 'shubh' WHERE id = ?", (agent_id["id"],))
        conn.close()
        status, body = self.call(self.client("scale"), "DELETE", f"/voices/custom/{v['id']}")
        self.assertEqual((status, body), (200, {"ok": True}))
        self.assertIn(("DELETE", f"https://api.sarvam.ai/voices/delete/{SVC}"), self.vendors.calls)
        self.assertIsNotNone(self.sql("SELECT vendor_deleted_at FROM custom_voices WHERE id = ?",
                                      (v["id"],))[0]["vendor_deleted_at"])
        self.assertTrue(any(k.endswith("sample.webm") for k in self.b2.deleted))
        self.assertEqual(self.call(self.client("scale"), "GET", "/voices/custom")[1], [])
        # a deleted clone can't be assigned
        with self.assertRaises(self.cv.CloneError):
            self.cv.validate_agent_voice(aid, v["voiceValue"])

    def test_failed_vendor_delete_left_for_reconcile(self):
        _s, v = self.create("scale")
        self.vendors.delete_fail = {SVC}
        status, _ = self.call(self.client("scale"), "DELETE", f"/voices/custom/{v['id']}")
        self.assertEqual(status, 200)  # the customer's delete still succeeds
        self.assertIsNone(self.sql("SELECT vendor_deleted_at FROM custom_voices WHERE id = ?",
                                   (v["id"],))[0]["vendor_deleted_at"])


    # preview limits (H3) ---------------------------------------------
    def previews(self, key, voice_id, texts):
        aid = self.accounts[key]["account_id"]
        out = []
        for t in texts:
            try:
                self.cv.preview(aid, voice_id, t)
                out.append(200)
            except self.cv.CloneError as e:
                out.append((e.status, e.detail))
        return out

    def clone_calls(self):
        return sum(1 for _m, u in list(self.vendors.calls) if u.endswith("/voices/clone"))

    def seed_log(self, account_id, key, ages):
        """Attempts `ages` seconds before the database's clock."""
        conn = self.db._connect()
        with conn:
            now = float(conn.execute("SELECT EXTRACT(EPOCH FROM clock_timestamp()) AS t").fetchone()["t"])
            conn.execute("INSERT INTO settings (account_id, key, value) VALUES (?, ?, ?) "
                         "ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value",
                         (account_id, key, json.dumps([now - a for a in ages])))
        conn.close()

    def clear_log(self, account_id, key):
        self.sql("DELETE FROM settings WHERE account_id = ? AND key = ?", (account_id, key))

    def log_len(self, account_id, key):
        rows = self.sql("SELECT value FROM settings WHERE account_id = ? AND key = ?", (account_id, key))
        return len(json.loads(rows[0]["value"])) if rows else 0

    def test_preview_per_account_minute_cap_and_cache_is_free(self):
        _s, v = self.create("scale")
        busy = (429, self.cv._PREVIEWS_BUSY)
        self.assertEqual(self.previews("scale", v["id"], ["one", "two", "three", "four"]), [200, 200, 200, busy])
        self.assertEqual(self.clone_calls(), 3)
        # Cached previews still play and are not counted.
        self.assertEqual(self.previews("scale", v["id"], ["one", "two"]), [200, 200])
        self.assertEqual(self.clone_calls(), 3)
        # Over the cap through the route: 429 with the friendly message.
        status, body = self.call(self.client("scale", "member"), "GET", f"/voices/custom/{v['id']}/preview",
                                 query=b"text=five")
        self.assertEqual((status, body["detail"]), busy)
        # Attempts older than a minute no longer count against the minute caps.
        aid = self.accounts["scale"]["account_id"]
        self.seed_log(aid, self.cv._PREVIEW_LOG_KEY, [61, 62, 63])
        self.seed_log(self.db.PLATFORM_ACCOUNT_ID, self.cv._PREVIEW_GLOBAL_KEY, [61, 62, 63, 64])
        self.assertEqual(self.previews("scale", v["id"], ["six"]), [200])

    def test_preview_daily_cap_counts_failed_attempts(self):
        _s, v = self.create("scale")
        aid = self.accounts["scale"]["account_id"]
        # 39 attempts earlier today (none in the last minute) and one 25 h ago.
        self.seed_log(aid, self.cv._PREVIEW_LOG_KEY, [3600 + i for i in range(39)] + [90000])
        self.vendors.clone_fail = True
        self.assertEqual(self.previews("scale", v["id"], ["fails"]), [(502, self.cv._PREVIEW_FAILED)])
        self.vendors.clone_fail = False
        self.assertEqual(self.previews("scale", v["id"], ["fails", "other"]), [(429, self.cv._PREVIEWS_DAILY)] * 2)
        self.assertEqual(self.clone_calls(), 1)
        self.assertEqual(self.log_len(aid, self.cv._PREVIEW_LOG_KEY), 40)  # the 25 h old one dropped

    def test_preview_global_cap_across_accounts_counts_nothing_when_refused(self):
        _s, a = self.create("scale")
        _s, b = self.create("other")
        busy = (429, self.cv._PREVIEWS_BUSY)
        self.assertEqual(self.previews("scale", a["id"], ["a1", "a2", "a3"]), [200, 200, 200])
        self.assertEqual(self.previews("other", b["id"], ["b1", "b2"]), [200, busy])
        self.assertEqual(self.clone_calls(), 4)
        # The refused attempt was rolled back: not counted for the account.
        self.assertEqual(self.log_len(self.accounts["other"]["account_id"], self.cv._PREVIEW_LOG_KEY), 1)
        self.assertEqual(self.log_len(self.db.PLATFORM_ACCOUNT_ID, self.cv._PREVIEW_GLOBAL_KEY), 4)

    def test_concurrent_previews_never_exceed_the_caps(self):
        import threading
        _s, a = self.create("scale")
        _s, b = self.create("other")
        results, lock = [], threading.Lock()

        def run(key, vid, text, gate):
            gate.wait()
            r = self.previews(key, vid, [text])[0]
            with lock:
                results.append((key, r))

        def burst(jobs):
            results.clear()
            gate = threading.Barrier(len(jobs))
            threads = [threading.Thread(target=run, args=(*j, gate)) for j in jobs]
            for t in threads:
                t.start()
            for t in threads:
                t.join(60)
            self.assertEqual(len(results), len(jobs))
            return list(results)

        # One account, 8 at once: exactly its 3 per minute go through.
        r = burst([("scale", a["id"], f"s{i}") for i in range(8)])
        self.assertEqual(sum(1 for _k, x in r if x == 200), 3)
        self.assertEqual(self.clone_calls(), 3)
        # Fresh windows, two accounts with 6 each at once: exactly the 4 global slots go through.
        for key in ("scale", "other"):
            self.clear_log(self.accounts[key]["account_id"], self.cv._PREVIEW_LOG_KEY)
        self.clear_log(self.db.PLATFORM_ACCOUNT_ID, self.cv._PREVIEW_GLOBAL_KEY)
        r = burst([("scale", a["id"], f"t{i}") for i in range(6)] + [("other", b["id"], f"u{i}") for i in range(6)])
        ok = [k for k, x in r if x == 200]
        self.assertEqual(len(ok), 4)
        self.assertTrue(all(ok.count(k) <= 3 for k in ("scale", "other")))
        self.assertEqual(self.clone_calls(), 7)
        self.assertEqual(self.log_len(self.db.PLATFORM_ACCOUNT_ID, self.cv._PREVIEW_GLOBAL_KEY), 4)

    # spoken consent (M4) ---------------------------------------------
    def consent_row(self, voice_id):
        return self.sql("SELECT status, consent_verified, consent_transcript FROM custom_voices WHERE id = ?",
                        (voice_id,))[0]

    def stt_requests(self):
        return [form_fields(b) for _m, u, b in self.vendors.requests if u.endswith("/speech-to-text")]

    def test_consent_transcript_matches(self):
        sentence = self.call(self.client("scale"), "GET", "/voices/custom/quote")[1]["consentSentence"]
        company = sentence.split(" give ")[1].split(" permission")[0]
        # Indian-English ASR: company name misheard, punctuation and case differ.
        heard = sentence.replace(company, "go scale company").rstrip(".").upper()
        self.vendors.stt_transcript = heard
        status, v = self.create("scale", language="hi-IN")
        self.assertEqual(status, 201)
        self.assertNotIn("consent", json.dumps(v).lower())  # never in the tenant's view
        row = self.consent_row(v["id"])
        self.assertEqual((row["status"], row["consent_verified"], row["consent_transcript"]), ("ready", True, heard))
        # Hindi voice, English sentence: transcribed as English.
        self.assertEqual(self.stt_requests(), [{"model": "saaras:v3", "mode": "transcribe", "language_code": "en-IN"}])

    def test_consent_mismatch_flagged_not_blocked(self):
        self.vendors.stt_transcript = "haan ji theek hai"
        status, v = self.create("growth")
        self.assertEqual(status, 201)
        row = self.consent_row(v["id"])
        self.assertEqual((row["status"], row["consent_verified"], row["consent_transcript"]),
                         ("ready", False, "haan ji theek hai"))
        events = self.sql("SELECT level, message FROM error_events WHERE source = 'custom_voices' AND message LIKE ?",
                          (f"%{v['id']}%",))
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["level"], "warning")
        self.assertNotIn("theek", events[0]["message"])  # the speech itself is not logged

    def test_consent_stt_failure_leaves_unverified_never_fails(self):
        self.vendors.stt_transcript = None  # 503
        status, v = self.create("growth")
        self.assertEqual(status, 201)
        row = self.consent_row(v["id"])
        self.assertEqual((row["status"], row["consent_verified"], row["consent_transcript"]), ("ready", False, ""))
        self.vendors.stt_transcript = "x"
        with mock.patch.object(self.cv, "stt_wav", mock.Mock(side_effect=self.cv.AudioError("bad"))):
            status, v2 = self.create("scale")
        self.assertEqual((status, self.consent_row(v2["id"])["status"]), (201, "ready"))
        self.assertEqual(len(self.stt_requests()), 1)

    # names shown for a cloned voice (dashboard + help chat) -------------
    def test_agent_voice_name_is_the_clone_name(self):
        import help_tools
        _s, v = self.create("scale", name="Abhi voice")
        aid = self.accounts["scale"]["account_id"]
        value = "custom:" + v["id"]
        self.sql("INSERT INTO agents (account_id, name, voice) VALUES (?, 'Cloned desk', ?)", (aid, value))
        self.sql("INSERT INTO agents (account_id, name, voice) VALUES (?, 'Stock desk', 'google:chirp3:Achernar')",
                 (aid,))
        agents = {a["name"]: a for a in self.db.list_agents(aid)}
        self.assertEqual((agents["Cloned desk"]["voice"], agents["Cloned desk"]["voiceName"]), (value, "Abhi voice"))
        self.assertNotIn("Cloned", agents["Stock desk"]["voiceName"])
        listed = {a["name"]: a for a in help_tools.list_my_agents(aid)["agents"]}
        self.assertEqual(listed["Cloned desk"]["voice"], "Abhi voice")
        self.assertEqual(help_tools.agent_detail(aid, agents["Cloned desk"]["id"])["voice"], "Abhi voice")
        # Another account's id, or an unknown one: a generic label, never the raw id.
        self.assertEqual(self.cv.display_name(self.accounts["other"]["account_id"], value), "Cloned voice")
        self.assertEqual(self.cv.display_name(aid, "custom:vv_nope"), "Cloned voice")

    def test_listing_agents_with_clones_uses_one_connection(self):
        aid = self.accounts["scale"]["account_id"]
        _s, v = self.create("scale", name="Abhi voice")
        for i in range(15):
            self.sql("INSERT INTO agents (account_id, name, voice) VALUES (?, ?, ?)",
                     (aid, f"Clone agent {i}", "custom:" + v["id"]))
        real, opened = self.db._connect, []

        def counting():
            opened.append(1)
            return real()

        with mock.patch.object(self.db, "_connect", counting):
            agents = [a for a in self.db.list_agents(aid) if a["name"].startswith("Clone agent")]
            self.assertEqual(len(opened), 1)
            opened.clear()
            one = self.db.get_agent_by_id_unscoped(agents[0]["id"])
            self.assertEqual(len(opened), 1)
        self.assertEqual(len(agents), 15)
        self.assertEqual({a["voiceName"] for a in agents} | {one["voiceName"]}, {"Abhi voice"})

    # Build with AI ------------------------------------------------------
    def test_build_with_ai_offers_ready_clones_and_plays_them_through_preview(self):
        import agent_builder
        _s, v = self.create("scale", name="Abhi | voice", gender="male")
        aid = self.accounts["scale"]["account_id"]
        value = "custom:" + v["id"]
        opts = agent_builder._account_options(aid)
        self.assertIn({"value": value, "name": "Abhi   voice", "gender": "male"}, opts["voices"])
        # Not offered to other accounts, or on a plan without cloning.
        for key in ("other", "starter"):
            values = {o["value"] for o in agent_builder._account_options(self.accounts[key]["account_id"])["voices"]}
            self.assertNotIn(value, values)
        drafted = agent_builder.validate_draft({"voice": value, "welcomeMessage": "नमस्ते, मैं अमित बोल रही हूँ"}, opts)
        self.assertEqual(drafted["voice"], value)
        self.assertEqual(drafted["welcomeMessage"], "नमस्ते, मैं अमित बोल रहा हूँ")
        body = {"voice": value, "language": "hi-IN", "text": "नमस्ते " * 40}  # 280 chars: allowed for a greeting
        self.assertEqual(agent_builder.greeting_audio(body, aid, 1), (b"ID3sarvam-audio", "audio/mpeg"))
        self.assertEqual(self.clone_calls(), 1)
        self.assertEqual(self.log_len(aid, self.cv._PREVIEW_LOG_KEY), 1)
        # A language clones can't speak falls back to the voice's own.
        self.assertEqual(agent_builder.greeting_audio({**body, "language": "en-US", "text": "Hi"}, aid, 1)[1],
                         "audio/mpeg")
        # The preview caps apply to greetings too.
        self.seed_log(self.db.PLATFORM_ACCOUNT_ID, self.cv._PREVIEW_GLOBAL_KEY, [1, 2, 3, 4])
        with self.assertRaises(agent_builder.BuilderError) as ctx:
            agent_builder.greeting_audio({**body, "text": "new words"}, aid, 1)
        self.assertEqual((ctx.exception.status, ctx.exception.detail), (429, self.cv._PREVIEWS_BUSY))
        # Another account can't play this clone.
        with self.assertRaises(agent_builder.BuilderError) as ctx:
            agent_builder.greeting_audio(body, self.accounts["other"]["account_id"], 1)
        self.assertEqual(ctx.exception.status, 400)


class ConsentMatching(unittest.TestCase):
    def setUp(self):
        import custom_voices
        self.cv = custom_voices
        self.sentence = custom_voices.consent_sentence("Sharma Builders")

    def test_exact_and_asr_variants_match(self):
        m = self.cv.consent_match
        self.assertEqual(m(self.sentence, self.sentence), 1.0)
        self.assertGreaterEqual(m(self.sentence, self.sentence.lower().replace(",", "").replace(".", "")), 0.99)
        misheard = self.sentence.replace("Sharma Builders", "Sharma Bill Does")
        self.assertGreaterEqual(m(self.sentence, misheard), self.cv.CONSENT_MATCH_MIN)
        self.assertEqual(m("मैं बोल रहा हूँ।", "मैं बोल रहा हूं"), 1.0)  # candrabindu / anusvara

    def test_half_sentence_or_other_speech_fails(self):
        m = self.cv.consent_match
        words = self.sentence.split()
        self.assertLess(m(self.sentence, " ".join(words[: len(words) // 2])), self.cv.CONSENT_MATCH_MIN)
        self.assertLess(m(self.sentence, "Hello, this is a test of my microphone, one two three."),
                        self.cv.CONSENT_MATCH_MIN)
        self.assertEqual(m(self.sentence, ""), 0.0)

    def test_language_follows_the_sentence_script(self):
        self.assertEqual(self.cv.consent_language(self.sentence, "hi-IN"), "en-IN")
        self.assertEqual(self.cv.consent_language(self.cv.consent_sentence("शर्मा"), "hi-IN"), "en-IN")
        self.assertEqual(self.cv.consent_language("मैं पुष्टि करता हूँ कि यह मेरी आवाज़ है", "hi-IN"), "hi-IN")

    def test_stt_parsing(self):
        ok = b'{"request_id":"r","transcript":" hi ","language_code":"en-IN"}'
        with mock.patch.object(self.cv, "_http", lambda *a, **k: (200, ok)):
            self.assertEqual(self.cv.sarvam_stt(b"RIFF", "en-IN"), "hi")
        with mock.patch.object(self.cv, "_http", lambda *a, **k: (429, sarvam_err("rate_limit_exceeded_error", "slow"))):
            with self.assertRaises(self.cv.SarvamError) as ctx:
                self.cv.sarvam_stt(b"RIFF", "en-IN")
        self.assertEqual((ctx.exception.status, ctx.exception.code), (429, "rate_limit_exceeded_error"))


class SarvamCreateParsing(unittest.TestCase):
    """B1: no database needed; _http is mocked with Sarvam's documented bodies."""

    def run_create(self, status, body):
        import custom_voices as cv
        with mock.patch.object(cv, "_http", lambda *a, **k: (status, body)), \
                mock.patch.dict(os.environ, {"SARVAM_API_KEY": "k"}):
            return cv.sarvam_create("vv_abcdefghijklmnop", "hi-IN", b"RIFF", "female")

    def test_documented_201_body(self):
        # Fails on the old parser, which read only a top-level voice_id.
        self.assertEqual(self.run_create(201, CREATE_201), (SVC, REF_TEXT))

    def test_top_level_fallback_and_null_reference_text(self):
        self.assertEqual(self.run_create(201, b'{"voice_id":"svc-old"}'), ("svc-old", ""))
        body = json.dumps({"status": "success", "data": {"voice_id": SVC, "status": "saved", "reference_text": None}})
        self.assertEqual(self.run_create(201, body.encode()), (SVC, ""))

    def test_error_body_parsed(self):
        import custom_voices as cv
        with self.assertRaises(cv.SarvamError) as ctx:
            self.run_create(403, sarvam_err("invalid_request_error", "TIER_LIMIT_REACHED", "req_42"))
        e = ctx.exception
        self.assertEqual((e.status, e.code, e.request_id, e.message),
                         (403, "invalid_request_error", "req_42", "TIER_LIMIT_REACHED"))
        with self.assertRaises(cv.SarvamError) as ctx:
            self.run_create(502, b"<html>bad gateway</html>")
        self.assertEqual(ctx.exception.status, 502)
        with self.assertRaises(cv.SarvamError):
            self.run_create(201, b'{"status":"success","data":{}}')


class ReferenceChooser(unittest.TestCase):
    """H5: choose_reference on synthetic 24 kHz PCM (no database)."""

    @classmethod
    def setUpClass(cls):
        import custom_voices
        cls.cv = custom_voices

    def refused(self, pcm, message=None):
        with self.assertRaises(self.cv.CloneError) as ctx:
            self.cv.choose_reference(pcm)
        self.assertEqual(ctx.exception.status, 400)
        if message is not None:
            self.assertEqual(ctx.exception.detail, message)
        return ctx.exception.detail

    def test_good_speech_accepted_with_12_to_15_s_window(self):
        pcm = synth(20.0, bursts(0.5, 20.0), noise=40)
        start, end = self.cv.choose_reference(pcm)
        seconds = (end - start) / RATE
        self.assertGreaterEqual(seconds, 12.0)
        self.assertLessEqual(seconds, 15.0)
        # the window starts at or just before a phrase onset, not mid-phrase
        onsets = [s for s, _e in bursts(0.5, 20.0)]
        self.assertTrue(any(-0.15 <= o - start / RATE <= 0.35 for o in onsets), start / RATE)

    def test_short_good_speech_uses_whole_span(self):
        pcm = synth(14.0, bursts(0.5, 13.5), noise=40)
        start, end = self.cv.choose_reference(pcm)
        self.assertLessEqual((end - start) / RATE, 15.0)
        self.assertGreaterEqual((end - start) / RATE, 12.5)

    def test_fan_noise_only_refused(self):
        self.refused(synth(30.0, (), noise=0, gauss=2500.0), self.cv._ONLY_NOISE)

    def test_two_coughs_in_silence_refused(self):
        self.refused(synth(60.0, [(20.0, 20.4), (40.0, 40.4)], amp=20000, noise=40))

    def test_fully_clipped_refused(self):
        self.refused(synth(20.0, bursts(0.5, 20.0), clip=True), self.cv._CLIPPED)

    def test_nine_seconds_of_speech_refused(self):
        detail = self.refused(synth(16.0, bursts(0.5, 9.5), noise=40))
        self.assertIn("seconds of you speaking", detail)

    def test_digital_silence_refused(self):
        self.refused(b"\0\0" * RATE * 20, self.cv._TOO_LITTLE_SPEECH.format(secs=0))
        self.refused(b"", self.cv._TOO_LITTLE_SPEECH.format(secs=0))

    def test_scattered_speech_without_a_continuous_window_refused(self):
        # 12 s of talking overall, but in 1 s phrases 3 s apart: no 15 s
        # window holds 10 s of speech.
        self.refused(synth(50.0, bursts(0.5, 48.0, on=1.0, off=3.0), noise=40), self.cv._NOT_CONTINUOUS)


class AgentSaveGuard(unittest.TestCase):
    """token_api._guard_voice_tier: custom voices must be the account's own;
    an agent keeping its (now owner-only) stock premium voice still saves."""

    def guard(self, owner_account=7, saved_voice="shubh"):
        from pathlib import Path
        from types import SimpleNamespace

        import custom_voices
        import voice_catalog
        from test_plan_policy import function_from_file

        class HTTPException(Exception):
            def __init__(self, status, detail):
                self.status, self.detail = status, detail

        def validate(account_id, value):
            if account_id != owner_account:
                raise custom_voices.CloneError(400, "Select one of your own cloned voices.")

        db = SimpleNamespace(
            get_agent_by_id_unscoped=lambda agent_id: {"voice": saved_voice},
            agent_account_id=lambda agent_id: 8,
            is_platform_owner=lambda account_id: False,
            get_account_plan=lambda account_id: "scale",
        )
        ns = {"HTTPException": HTTPException, "voice_catalog": voice_catalog, "calls_db": db,
              "custom_voices": SimpleNamespace(is_custom_value=custom_voices.is_custom_value,
                                               validate_agent_voice=validate, CloneError=custom_voices.CloneError)}
        fn = function_from_file(Path(__file__).resolve().parent / "token_api.py", "_guard_voice_tier", ns)
        return fn, HTTPException

    def test_other_accounts_clone_refused(self):
        fn, exc = self.guard(owner_account=7)
        fn({"voice": "custom:vv_abcdefghijklmnop"}, 7)
        with self.assertRaises(exc) as ctx:
            fn({"voice": "custom:vv_abcdefghijklmnop"}, 8)
        self.assertEqual(ctx.exception.status, 400)

    def test_stock_premium_voice_owner_only_but_kept_on_resave(self):
        value = "elevenlabs:zmh5xhBvMzqR4ZlXgcgL"
        fn, exc = self.guard(saved_voice=value)
        with self.assertRaises(exc):
            fn({"voice": value}, 8)  # newly chosen: refused for a tenant
        fn({"voice": value}, 8, agent_id=3)  # unchanged on its own agent: kept


class Billing(unittest.TestCase):
    def test_cloned_voice_bills_like_a_standard_voice(self):
        import calls_db
        self.assertEqual(calls_db.voice_tier("custom:vv_abcdefghijklmnop"), "standard")
        row = {"call_type": "phone", "voice": "custom:vv_abcdefghijklmnop", "model": "sarvam/sarvam-105b-conversations"}
        self.assertEqual(calls_db.credits_for_call(row, {"phone": 1.0}, 1.0), 2.0)
        import custom_voices
        self.assertEqual(custom_voices.BHARAT_CREDITS_PER_MINUTE, 2.0)


class StockPremiumVoicesOwnerOnly(unittest.TestCase):
    def test_catalog_flags(self):
        import voice_catalog as vc
        els = [e for e in vc.CATALOG if e["value"].startswith("elevenlabs:")]
        self.assertTrue(els)
        for e in els:
            self.assertTrue(e.get("preview"), e["value"])
            self.assertFalse(vc.is_hidden(e["value"]), e["value"])
            self.assertTrue(vc.is_grandfathered(e["value"]))

    @unittest.skipUnless(TEST_DB, "needs TEST_DATABASE_URL")
    def test_tenant_catalog_hides_them_owner_sees_them(self):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        tenant = calls_db.create_account_with_owner("T", "T", f"t-{stamp}@example.com", "h", email_verified=True)["account_id"]
        owner = calls_db.create_account_with_owner("O", "O", f"o-{stamp}@example.com", "h", email_verified=True)["account_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'scale' WHERE id = ?", (tenant,))
            conn.execute("UPDATE accounts SET is_platform_owner = 1 WHERE id = ?", (owner,))
        conn.close()
        tenant_values = {v["value"] for v in calls_db.voice_catalog_for_account(tenant)["voices"]}
        owner_values = {v["value"] for v in calls_db.voice_catalog_for_account(owner)["voices"]}
        self.assertFalse(any(v.startswith("elevenlabs:") for v in tenant_values))
        self.assertTrue(any(v.startswith("elevenlabs:") for v in owner_values))
        with self.assertRaises(calls_db.VoiceMenuError):
            calls_db.add_account_voice(tenant, "elevenlabs:zmh5xhBvMzqR4ZlXgcgL")


if __name__ == "__main__":
    unittest.main()
