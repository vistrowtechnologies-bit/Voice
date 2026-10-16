"""Security hardening, part 2 (2026-10-12): rate limits kept in Postgres,
DNS-rebinding-safe fetches (KB crawler and webhooks connect to the IP they
checked), and API key scopes. Unit tests run anywhere; DB tests need
TEST_DATABASE_URL."""

import ast
import asyncio
import datetime
import logging
import os
import re
import socket
import threading
import time
import types
import unittest
import urllib.error
from pathlib import Path
from unittest import mock

import calls_db
import integrations_dispatch
import kb_crawl

TEST_DB = os.environ.get("TEST_DATABASE_URL")
TOKEN_API = Path(__file__).resolve().parent / "token_api.py"
TREE = ast.parse(TOKEN_API.read_text())


def load(*names, **globs):
    """Exec the named top-level functions/assignments of token_api.py."""
    nodes = []
    for node in TREE.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names:
            node.decorator_list = []
            nodes.append(node)
        elif isinstance(node, ast.Assign) and any(getattr(t, "id", None) in names for t in node.targets):
            nodes.append(node)
    namespace = dict(globs)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(TOKEN_API), "exec"), namespace)
    return namespace


def addrinfo(*ips):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0)) for ip in ips]


PUBLIC, PRIVATE = "93.184.216.34", "10.0.0.5"


# ------------------------------------------------------------ SSRF pinning

class PinnedFetchTests(unittest.TestCase):
    def test_private_address_refused_before_connecting(self):
        with mock.patch("socket.getaddrinfo", return_value=addrinfo(PRIVATE)), \
                mock.patch("socket.create_connection") as connect:
            with self.assertRaises(ValueError):
                kb_crawl._fetch("http://internal.example.test/")
        connect.assert_not_called()

    def test_any_private_answer_refuses_the_host(self):
        with mock.patch("socket.getaddrinfo", return_value=addrinfo(PUBLIC, "127.0.0.1")):
            with self.assertRaises(ValueError):
                kb_crawl._pinned_create_connection(("mixed.example.test", 80))

    def test_connects_to_the_ip_it_checked_even_if_dns_changes(self):
        # A rebinding resolver: public on the first lookup, private after.
        lookups = mock.Mock(side_effect=[addrinfo(PUBLIC), addrinfo(PRIVATE), addrinfo(PRIVATE)])
        with mock.patch("socket.getaddrinfo", lookups), \
                mock.patch("socket.create_connection", side_effect=OSError("stop here")) as connect:
            with self.assertRaises(RuntimeError):  # _fetch wraps the URLError
                kb_crawl._fetch("http://rebind.example.test/page")
        connect.assert_called_once()
        self.assertEqual(connect.call_args.args[0], (PUBLIC, 80))
        self.assertEqual(lookups.call_count, 1)

    def test_https_keeps_hostname_for_sni_and_certificate(self):
        context = mock.Mock()
        conn = kb_crawl._PinnedHTTPSConnection("shop.example.test", 443, context=context)
        with mock.patch("socket.getaddrinfo", return_value=addrinfo(PUBLIC)), \
                mock.patch("socket.create_connection", return_value=mock.Mock()) as connect:
            conn.connect()
        self.assertEqual(connect.call_args.args[0], (PUBLIC, 443))
        self.assertEqual(context.wrap_socket.call_args.kwargs["server_hostname"], "shop.example.test")

    def test_opener_verifies_certificates_and_ignores_env_proxies(self):
        opener = kb_crawl.safe_opener()
        https = [h for h in opener.handlers if isinstance(h, kb_crawl._PinnedHTTPSHandler)]
        self.assertEqual(len(https), 1)
        self.assertTrue(https[0]._context.check_hostname)
        self.assertEqual(https[0]._context.verify_mode, __import__("ssl").CERT_REQUIRED)
        proxies = [h for h in opener.handlers if isinstance(h, __import__("urllib.request").request.ProxyHandler)]
        self.assertTrue(all(not h.proxies for h in proxies))

    def test_each_redirect_hop_is_checked_and_pinned(self):
        # First hop answers 302 to a host that resolves to a private address.
        server, client = socket.socketpair()
        server.sendall(b"HTTP/1.1 302 Found\r\nLocation: http://second.example.test/x\r\nContent-Length: 0\r\n\r\n")
        dns = {"first.example.test": addrinfo(PUBLIC), "second.example.test": addrinfo(PRIVATE)}
        connects = []

        class Sock:  # the socketpair end, minus TCP options it doesn't support
            def __getattr__(self, name):
                return getattr(client, name)

            def setsockopt(self, *args):
                pass

        def create_connection(address, *args):
            connects.append(address)
            return Sock()

        with mock.patch("socket.getaddrinfo", side_effect=lambda host, *a, **k: dns[host]), \
                mock.patch("socket.create_connection", side_effect=create_connection):
            with self.assertRaises(ValueError):
                kb_crawl._fetch("http://first.example.test/")
        self.assertEqual(connects, [(PUBLIC, 80)])
        server.close()
        client.close()

    def test_redirect_to_literal_internal_ip_refused(self):
        handler = kb_crawl._SafeRedirectHandler()
        with self.assertRaises(ValueError):
            handler.redirect_request(None, None, 302, "Found", {}, "http://169.254.169.254/latest")

    def test_webhook_uses_the_pinned_connection(self):
        with mock.patch("socket.getaddrinfo", return_value=addrinfo(PRIVATE)), \
                mock.patch("socket.create_connection") as connect:
            ok, detail = integrations_dispatch._post_json("https://hooks.example.test/x", {"a": 1})
        self.assertFalse(ok)
        self.assertIn("private/internal", detail)
        connect.assert_not_called()

        lookups = mock.Mock(side_effect=[addrinfo(PUBLIC), addrinfo(PRIVATE)])
        with mock.patch("socket.getaddrinfo", lookups), \
                mock.patch("socket.create_connection", side_effect=OSError("stop here")) as connect:
            ok, _ = integrations_dispatch._post_json("https://hooks.example.test/x", {"a": 1})
        self.assertFalse(ok)
        self.assertEqual(connect.call_args.args[0], (PUBLIC, 443))
        self.assertEqual(lookups.call_count, 1)


# ------------------------------------------------------------- rate limits

def offline(*_args, **_kwargs):
    raise OSError("db offline")


class RateLimitFallbackTests(unittest.TestCase):
    def test_database_down_falls_back_to_memory_and_warns(self):
        ns = load("_limited", "_auth_rate_limited", "_AUTH_WINDOW_SECONDS", "_AUTH_MAX_PER_WINDOW", time=time,
                  _limit_hits={}, _auth_calls={}, logger=logging.getLogger("test-rl"),
                  calls_db=types.SimpleNamespace(rate_limit_hit=offline))
        with self.assertLogs("test-rl", level="WARNING"):
            self.assertEqual([ns["_limited"]("b", 1, 2, 60) for _ in range(3)], [False, False, True])
        with self.assertLogs("test-rl", level="WARNING"):
            results = [ns["_auth_rate_limited"]("1.2.3.4") for _ in range(9)]
        self.assertEqual(results, [False] * 8 + [True])


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class RateLimitDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()

    def setUp(self):
        self.key = "k-" + os.urandom(4).hex()
        self.ns = load("_limited", "_auth_rate_limited", "_login_locked", "_note_login_failure",
                       "_clear_login_failures", "_AUTH_WINDOW_SECONDS", "_AUTH_MAX_PER_WINDOW",
                       "_LOGIN_FAIL_WINDOW_S", "_LOGIN_FAIL_MAX", time=time, calls_db=calls_db,
                       logger=logging.getLogger("test"), _limit_hits={}, _auth_calls={}, _login_failures={})

    def test_limited_is_shared_and_survives_a_restart(self):
        self.assertEqual([self.ns["_limited"]("test", self.key, 3, 60) for _ in range(3)], [False] * 3)
        # A fresh copy of the code (a restart, another instance) sees the hits.
        fresh = load("_limited", time=time, calls_db=calls_db, logger=logging.getLogger("test"), _limit_hits={})
        self.assertTrue(fresh["_limited"]("test", self.key, 3, 60))
        self.assertFalse(fresh["_limited"]("other-bucket", self.key, 3, 60))
        # Refused hits are not counted for _limited (same as before).
        self.assertEqual(calls_db.rate_limit_count("test", self.key, 60), 3)

    def test_auth_ip_limit_counts_refused_attempts(self):
        results = [self.ns["_auth_rate_limited"](self.key) for _ in range(10)]
        self.assertEqual(results, [False] * 8 + [True, True])
        self.assertEqual(calls_db.rate_limit_count("auth-ip", self.key, 60), 10)

    def test_login_lockout_persists_and_clears(self):
        for _ in range(9):
            self.ns["_note_login_failure"](self.key)
        self.assertFalse(self.ns["_login_locked"](self.key))
        self.ns["_note_login_failure"](self.key)
        self.assertTrue(self.ns["_login_locked"](self.key))
        self.assertFalse(self.ns["_login_locked"]("mfa:" + self.key))
        self.ns["_clear_login_failures"](self.key)
        self.assertFalse(self.ns["_login_locked"](self.key))

    def test_concurrent_hits_never_exceed_the_limit(self):
        results, barrier = [], threading.Barrier(12)

        def hit():
            barrier.wait()
            results.append(calls_db.rate_limit_hit("race", self.key, 5, 60))

        threads = [threading.Thread(target=hit) for _ in range(12)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(results.count(False), 5)

    def test_window_and_cleanup(self):
        conn = calls_db._connect()
        with conn:
            conn.execute("INSERT INTO rate_limit_hits (bucket, key, hit_at) VALUES (?, ?, now() - interval '2 days')",
                         ("old", self.key))
            conn.execute("INSERT INTO rate_limit_hits (bucket, key, hit_at) VALUES (?, ?, now() - interval '2 minutes')",
                         ("old", self.key))
        conn.close()
        self.assertEqual(calls_db.rate_limit_count("old", self.key, 60), 0)
        self.assertEqual(calls_db.rate_limit_count("old", self.key, 3600), 1)
        with mock.patch.object(calls_db.secrets, "randbelow", return_value=0):
            calls_db.rate_limit_record("old", self.key)
        self.assertEqual(calls_db.rate_limit_count("old", self.key, 10 * 86400), 2)


# ----------------------------------------------------------- API key scopes

class ApiKeyScopeTests(unittest.TestCase):
    ns = load("_API_KEY_SCOPE_WRITES", "_api_key_allows", re=re)

    def allows(self, scopes, method, path):
        return self.ns["_api_key_allows"](scopes, method, path)

    def test_scope_map(self):
        cases = [
            (["read"], "GET", "/calls", True),
            (["read"], "GET", "/agents/4", True),
            (["read"], "POST", "/contacts", False),
            (["read"], "PATCH", "/agents/4", False),
            (["calls"], "GET", "/calls", False),
            (["calls"], "POST", "/contacts/9/call", True),
            (["calls"], "POST", "/campaigns", True),
            (["calls"], "PATCH", "/campaigns/3", True),
            (["calls"], "DELETE", "/contacts/9", True),
            (["calls"], "POST", "/telephony/test-call", True),
            (["calls"], "POST", "/agents", False),
            (["calls"], "POST", "/contactsx", False),
            (["agents"], "POST", "/agents", True),
            (["agents"], "PATCH", "/agents/4", True),
            (["agents"], "DELETE", "/agents/4", True),
            (["agents"], "POST", "/knowledge-bases/2/sources", True),
            (["agents"], "POST", "/campaigns", False),
            (["read", "calls"], "POST", "/inbound-routes", False),
            (["read", "calls"], "PATCH", "/integrations/webhook", False),
            (["full"], "POST", "/inbound-routes", True),
            (["full"], "PATCH", "/integrations/webhook", True),
            ([], "GET", "/calls", False),
        ]
        for scopes, method, path, expected in cases:
            with self.subTest(scopes=scopes, method=method, path=path):
                self.assertEqual(self.allows(scopes, method, path), expected)

    def test_normalize(self):
        self.assertEqual(calls_db.normalize_api_key_scopes(["calls", "read"]), ["read", "calls"])
        for bad in ([], ["admin"], ["read", "everything"]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                calls_db.normalize_api_key_scopes(bad)
        self.assertEqual(calls_db._api_key_scopes('["full"]'), ["full"])
        self.assertEqual(calls_db._api_key_scopes("not json"), [])

    def run_middleware(self, method, path, scopes, status="active"):
        from starlette.requests import Request
        from starlette.responses import JSONResponse, Response

        ns = load("require_session", "_API_KEY_BLOCKED_PATHS", "_API_KEY_SCOPE_WRITES", "_api_key_allows",
                  re=re, os=os, logger=logging.getLogger("test"), JSONResponse=JSONResponse, Request=Request,
                  _PUBLIC_PATHS=set(), _PUBLIC_PREFIXES=(),
                  auth=types.SimpleNamespace(COOKIE_NAME="vv", read_session_token=lambda _token: None),
                  ACCOUNT_SUSPENDED_MESSAGE="suspended",
                  calls_db=types.SimpleNamespace(resolve_api_key_with_scopes=lambda key: (7, scopes),
                                                 account_owner_user_id=lambda aid: 70,
                                                 account_status=lambda aid: status))
        request = Request({"type": "http", "method": method, "path": path, "query_string": b"",
                           "headers": [(b"x-api-key", b"vv_live_test")]})

        async def call_next(_request):
            return Response("ok")

        return asyncio.run(ns["require_session"](request, call_next)).status_code

    def test_suspended_account_api_key_is_refused(self):
        # Admin audit 2026-10-15: suspend used to stop calls only.
        self.assertEqual(self.run_middleware("GET", "/calls", ["full"], status="suspended"), 403)
        self.assertEqual(self.run_middleware("GET", "/calls", ["full"], status="active"), 200)

    def test_middleware_enforces_scopes(self):
        self.assertEqual(self.run_middleware("GET", "/calls", ["read", "calls"]), 200)
        self.assertEqual(self.run_middleware("POST", "/contacts/5/call", ["read", "calls"]), 200)
        self.assertEqual(self.run_middleware("PATCH", "/agents/5", ["read", "calls"]), 403)
        self.assertEqual(self.run_middleware("PATCH", "/agents/5", ["full"]), 200)  # existing keys
        self.assertEqual(self.run_middleware("GET", "/team", ["full"]), 403)  # still blocked


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class ApiKeyScopeDatabaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()

    def test_new_keys_default_to_read_and_calls_and_old_keys_keep_full(self):
        stamp = os.urandom(4).hex()
        account_id = calls_db.create_account_with_owner("K", "K", f"key-{stamp}@example.com", "h",
                                                        email_verified=True)["account_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'scale' WHERE id = ?", (account_id,))
            # A key created before scopes existed (no scopes value written).
            conn.execute("INSERT INTO api_keys (account_id, name, prefix, key_hash) VALUES (?, 'old', 'p', ?)",
                         (account_id, calls_db._hash_api_key("vv_live_old" + stamp)))
        conn.close()
        created = calls_db.create_api_key(account_id, "new")
        self.assertEqual(created["scopes"], ["read", "calls"])
        agents_only = calls_db.create_api_key(account_id, "agents", ["agents"])
        listed = {k["name"]: k["scopes"] for k in calls_db.list_api_keys(account_id)}
        self.assertEqual(listed, {"old": ["full"], "new": ["read", "calls"], "agents": ["agents"]})
        self.assertEqual(calls_db.resolve_api_key_with_scopes(created["key"]), (account_id, ["read", "calls"]))
        self.assertEqual(calls_db.resolve_api_key_with_scopes("vv_live_old" + stamp), (account_id, ["full"]))
        self.assertEqual(calls_db.resolve_api_key(agents_only["key"]), account_id)


if __name__ == "__main__":
    unittest.main()
