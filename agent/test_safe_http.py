"""safe_http refuses internal addresses at connect time; tools use it for
customer URLs; the webhook checks the reply status; the KB cache serves each
caller its own length."""
import asyncio
import unittest
from unittest import mock

import aiohttp
from aiohttp import web

import db
import safe_http
import tools


async def _local_server(status=200):
    hits = []

    async def handler(request):
        hits.append(request.path)
        return web.Response(status=status, text="ok")

    app = web.Application()
    app.router.add_route("*", "/{tail:.*}", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]
    return runner, port, hits


class PublicSession(unittest.IsolatedAsyncioTestCase):
    async def test_loopback_literal_ip_is_refused_and_never_reached(self):
        runner, port, hits = await _local_server()
        try:
            async with safe_http.public_session(aiohttp.ClientTimeout(total=3)) as http:
                with self.assertRaises(aiohttp.ClientConnectorError):
                    await http.get(f"http://127.0.0.1:{port}/secret")
            # The plain session does reach it, so the refusal is the connector's.
            async with aiohttp.ClientSession() as http:
                async with http.get(f"http://127.0.0.1:{port}/plain") as resp:
                    self.assertEqual(resp.status, 200)
        finally:
            await runner.cleanup()
        self.assertEqual(hits, ["/plain"])

    async def test_hostname_resolving_to_loopback_is_refused(self):
        runner, port, hits = await _local_server()
        try:
            async with safe_http.public_session(aiohttp.ClientTimeout(total=3)) as http:
                with self.assertRaises(aiohttp.ClientConnectorError):
                    await http.get(f"http://localhost:{port}/secret")
        finally:
            await runner.cleanup()
        self.assertEqual(hits, [])

    def test_ip_classification(self):
        for ip in ("127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.0.1", "::1", "::ffff:127.0.0.1", "0.0.0.0"):
            self.assertFalse(safe_http.is_public_ip(ip), ip)
        for ip in ("8.8.8.8", "2606:4700:4700::1111"):
            self.assertTrue(safe_http.is_public_ip(ip), ip)
        self.assertTrue(safe_http.is_http_url("https://example.com/x"))
        for url in ("", None, "ftp://example.com", "https://", "javascript:alert(1)"):
            self.assertFalse(safe_http.is_http_url(url), url)


class WebhookStatus(unittest.IsolatedAsyncioTestCase):
    async def _post(self, status):
        runner, port, hits = await _local_server(status)
        ctx = mock.Mock(userdata={"account_id": 1, "agent_webhook_url": f"http://127.0.0.1:{port}/hook"})
        try:
            # Local test server: lift the public-only rule for this test only.
            with mock.patch.object(db, "get_webhook_url", return_value=None), \
                    mock.patch.object(safe_http, "is_public_ip", return_value=True), \
                    self.assertLogs(tools.logger, level="INFO") as logs:
                await tools._post_webhook(ctx, {"type": "lead"})
        finally:
            await runner.cleanup()
        return hits, "\n".join(logs.output)

    async def test_2xx_is_logged_as_posted(self):
        hits, out = await self._post(200)
        self.assertEqual(hits, ["/hook"])
        self.assertIn("posted lead event", out)

    async def test_5xx_is_not_logged_as_posted(self):
        hits, out = await self._post(500)
        self.assertEqual(hits, ["/hook"])
        self.assertNotIn("posted lead event", out)
        self.assertIn("HTTP 500", out)

    async def test_internal_webhook_url_is_never_reached(self):
        runner, port, hits = await _local_server()
        ctx = mock.Mock(userdata={"account_id": 1, "agent_webhook_url": f"http://127.0.0.1:{port}/hook"})
        try:
            with mock.patch.object(db, "get_webhook_url", return_value=None):
                await tools._post_webhook(ctx, {"type": "lead"})
        finally:
            await runner.cleanup()
        self.assertEqual(hits, [])


class CustomFunctionUrl(unittest.IsolatedAsyncioTestCase):
    async def test_custom_function_cannot_reach_internal_address(self):
        runner, port, hits = await _local_server()
        try:
            tool = tools.build_custom_function_tools(
                [{"name": "probe", "url": f"http://127.0.0.1:{port}/admin", "method": "GET"}]
            )[0]
            fn = getattr(tool, "__wrapped__", None) or getattr(tool, "_func", None) or tool
            result = await fn({})
        finally:
            await runner.cleanup()
        self.assertEqual(hits, [])
        self.assertIn("could not be completed", result)


class KbCacheLength(unittest.TestCase):
    def setUp(self):
        self._saved = dict(db._kb_cache)
        db._kb_cache.clear()

    def tearDown(self):
        db._kb_cache.clear()
        db._kb_cache.update(self._saved)

    def test_each_caller_gets_its_own_cut(self):
        import time
        db._kb_cache[3] = (time.monotonic(), ("x" * 9000, True))
        self.assertEqual(len(db.get_kb_content(3, 5500)), 5500)
        self.assertEqual(len(db.get_kb_content(3, 8000)), 8000)
        self.assertEqual(len(db.get_kb_content(3, 5500)), 5500)


if __name__ == "__main__":
    unittest.main()
