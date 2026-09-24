"""A call's lead/appointment webhook must go to ITS account's URL only.

get_webhook_url used to select any connected 'webhook' integration row
platform-wide, so the first tenant to connect one would have received every
other tenant's leads. Never connects to a database.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db


class WebhookIsScopedToTheAccount(unittest.TestCase):
    def _conn(self, row):
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = row
        return conn

    def test_lookup_filters_by_account(self):
        conn = self._conn({"config_json": '{"url": "https://tenant-7.example/hook"}'})
        with patch.object(db.dbconn, "connect", return_value=conn):
            self.assertEqual(db.get_webhook_url(7), "https://tenant-7.example/hook")
        sql, params = conn.execute.call_args.args
        self.assertIn("account_id = ?", sql)
        self.assertEqual(params, (7,))

    def test_no_account_means_no_webhook(self):
        with patch.object(db.dbconn, "connect") as connect:
            self.assertIsNone(db.get_webhook_url(None))
        connect.assert_not_called()

    def test_account_without_a_connected_webhook_gets_none(self):
        with patch.object(db.dbconn, "connect", return_value=self._conn(None)):
            self.assertIsNone(db.get_webhook_url(3))


class AgentWebhookIsDelivered(unittest.TestCase):
    """Agents → Webhook was saved and never read until 2026-09-24."""

    def _run(self, account_url, agent_url, fail=()):
        import asyncio
        os.environ.setdefault("LIVEKIT_URL", "ws://x")
        os.environ.setdefault("LIVEKIT_API_KEY", "x")
        os.environ.setdefault("LIVEKIT_API_SECRET", "x")
        import tools
        posted = []

        class Session:
            def __init__(self, *a, **k): pass
            async def __aenter__(self): return self
            async def __aexit__(self, *a): return False
            async def post(self, url, json=None):
                posted.append(url)
                if url in fail:
                    raise RuntimeError("endpoint down")

        ctx = MagicMock()
        ctx.userdata = {"account_id": 2, "agent_webhook_url": agent_url}
        with patch.object(tools.db, "get_webhook_url", return_value=account_url), \
             patch.object(tools.aiohttp, "ClientSession", Session):
            asyncio.run(tools._post_webhook(ctx, {"type": "lead"}))
        return posted

    def test_both_the_account_and_the_agent_webhook_receive_it(self):
        self.assertEqual(self._run("https://acct.example/h", "https://agent.example/h"),
                         ["https://acct.example/h", "https://agent.example/h"])

    def test_agent_webhook_alone(self):
        self.assertEqual(self._run(None, "https://agent.example/h"), ["https://agent.example/h"])

    def test_same_url_twice_is_one_delivery(self):
        self.assertEqual(self._run("https://same.example/h", "https://same.example/h"), ["https://same.example/h"])

    def test_one_dead_endpoint_does_not_block_the_other(self):
        posted = self._run("https://acct.example/h", "https://agent.example/h", fail=("https://acct.example/h",))
        self.assertEqual(posted, ["https://acct.example/h", "https://agent.example/h"])

    def test_non_http_urls_are_ignored(self):
        self.assertEqual(self._run(None, "file:///etc/passwd"), [])


if __name__ == "__main__":
    unittest.main()
