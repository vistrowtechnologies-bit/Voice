"""Clone your voice (custom_voices.py): the real routes on a small FastAPI
app against a throwaway Postgres (TEST_DATABASE_URL). Every vendor request,
ffmpeg and object storage are replaced: nothing leaves this machine.

Covers pricing (first clone free, later clones 25 credits once, refunded on
failure), 402/403 refusals, account isolation, vendor names never in a
response, stock premium voices owner-only, agent-save validation, billing
on the standard tier."""
import asyncio
import json
import os
import unittest
from unittest import mock

TEST_DB = os.environ.get("TEST_DATABASE_URL")
VENDOR_WORDS = ("eleven", "sarvam")


class FakeB2:
    def __init__(self):
        self.objects, self.deleted = {}, []

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[Key] = Body

    def delete_object(self, Bucket, Key):
        self.deleted.append(Key)
        self.objects.pop(Key, None)


class Vendors:
    """Stands in for custom_voices._http. Records every request."""

    def __init__(self):
        self.calls, self.fail = [], set()

    def __call__(self, method, url, headers, body=None, timeout=60):
        self.calls.append((method, url))
        vendor = "eleven" if "elevenlabs" in url else "sarvam"
        if vendor in self.fail:
            return 500, b'{"detail":"vendor down"}'
        if url.endswith("/v1/voices/add"):
            return 200, b'{"voice_id":"EL_NEW"}'
        if url.endswith("/voices/create"):
            return 200, b'{"voice_id":"SV_NEW","reference_text":"..."}'
        if "/text-to-speech/" in url:
            return 200, b"ID3eleven-audio"
        if url.endswith("/voices/clone"):
            import base64
            return 200, json.dumps({"audio": base64.b64encode(b"ID3sarvam-audio").decode()}).encode()
        if method == "DELETE":
            return 200, b"{}"
        raise AssertionError(f"unexpected vendor request {method} {url}")


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
        env = {"ELEVEN_API_KEY": "k-e", "SARVAM_API_KEY": "k-s"}
        patches = [
            mock.patch.dict(os.environ, env),
            mock.patch.object(self.cv, "_http", self.vendors),
            mock.patch.object(self.cv, "_ffmpeg", lambda: "/usr/bin/ffmpeg"),
            mock.patch.object(self.cv, "decode_pcm", lambda data: b"\0\0" * int(self.seconds * 24000)
                              if data.startswith(b"SAMPLE") else b"\0\0" * 24000 * 4),
            mock.patch.object(self.cv, "to_mp3", lambda pcm: b"MP3"),
            mock.patch.object(self.cv.storage, "b2_client", lambda: (self.b2, "bucket")),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.bodies: list[bytes] = []

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

    def client(self, key, role="admin"):
        acct = self.accounts[key]
        return Client(self.app, {"account_id": acct["account_id"], "user_id": acct["user_id"], "role": role})

    def call(self, client, method, path, **kw):
        status, data, headers = client.request(method, path, **kw)
        if headers.get(b"content-type", b"").startswith(b"application/json"):
            self.bodies.append(data)
            return status, json.loads(data)
        return status, data

    def create(self, key, language="hi-IN", name="My voice", sample=b"SAMPLE-audio"):
        raw, ctype = multipart({"name": name, "language": language},
                               {"sample": ("s.webm", sample, "audio/webm"), "consent": ("c.webm", b"CONSENT", "audio/webm")})
        return self.call(self.client(key), "POST", "/voices/custom", raw=raw, ctype=ctype)

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
        # even with its key present.
        aid = self.accounts["scale"]["account_id"]
        self.create("scale")
        self.vendors.fail = {"sarvam"}
        status, v = self.create("scale", name="Broken")
        self.assertEqual((status, v["creditsCharged"]), (201, 25))
        _s, listed = self.call(self.client("scale"), "GET", "/voices/custom")
        broken = next(x for x in listed if x["id"] == v["id"])
        self.assertEqual(broken["status"], "failed")
        self.assertTrue(broken["error"])
        self.assertEqual(self.credits(aid), 1000)
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
        raw, ctype = multipart({"name": "x", "language": "hi-IN"},
                               {"sample": ("s.webm", b"SAMPLE", "audio/webm"), "consent": ("c.webm", b"C", "audio/webm")})
        status, _ = self.call(self.client("scale", "member"), "POST", "/voices/custom", raw=raw, ctype=ctype)
        self.assertEqual(status, 403)

    def test_sample_too_short_400(self):
        self.seconds = 10
        status, body = self.create("scale")
        self.assertEqual(status, 400)
        self.assertIn("30 seconds", body["detail"])

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
                             ("ready", "sarvam", None, "SV_NEW"))
        self.assertFalse(any("elevenlabs" in url for _m, url in self.vendors.calls))
        row_hi = self.cv.get_row(aid, hi["id"])
        self.assertTrue(row_hi["sarvam_ref_key"].endswith("reference.wav"))
        self.assertIn(row_hi["sarvam_ref_key"], self.b2.objects)
        self.assertFalse(row_hi["consent_verified"])

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
        self.assertIn(("DELETE", "https://api.sarvam.ai/voices/delete/SV_NEW"), self.vendors.calls)
        self.assertTrue(any(k.endswith("sample.webm") for k in self.b2.deleted))
        self.assertEqual(self.call(self.client("scale"), "GET", "/voices/custom")[1], [])
        # a deleted clone can't be assigned
        with self.assertRaises(self.cv.CloneError):
            self.cv.validate_agent_voice(aid, v["voiceValue"])


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
