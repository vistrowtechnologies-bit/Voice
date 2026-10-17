"""Widget text chats reach the account's integrations when they end.

Voice calls fan out from the agent at call end; a text chat has no agent,
so the server delivers it: the dialer tick's idle sweep
(campaign_dialer._deliver_idle_widget_chats) 3 minutes after the last turn,
or at once when the widget reports the chat ended (POST /widget/chat/end).
Runs against a throwaway Postgres (TEST_DATABASE_URL); every outbound HTTP
is faked at integrations_dispatch._post_json, so no network. The real
/widget/chat/end route runs as a plain function (lifted via ast, as
test_arthaleads_link does) with the delivery thread run inline."""
import ast
import asyncio
import datetime
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException, Request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = Path(__file__).resolve().parent.parent
TEST_DB = os.environ.get("TEST_DATABASE_URL")
WEBHOOK_URL = "https://crm.example.com/hook"


class _InlineThread:
    def __init__(self, target, args=(), **_):
        self._run = lambda: target(*args)

    def start(self):
        self._run()


def _route(calls_db, integrations_dispatch):
    tree = ast.parse((ROOT / "server/token_api.py").read_text())
    body = []
    for node in tree.body:
        if getattr(node, "name", None) == "widget_chat_end":
            node.decorator_list = []
            body.append(node)
    ns = {
        "json": json, "calls_db": calls_db, "integrations_dispatch": integrations_dispatch,
        "HTTPException": HTTPException, "Request": Request,
        "_limited": lambda *a: False, "_client_ip": lambda request: "127.0.0.1",
        "threading": SimpleNamespace(Thread=_InlineThread),
    }
    exec(compile(ast.Module(body=body, type_ignores=[]), "token_api.py", "exec"), ns)
    return ns.get("widget_chat_end")


def _request(payload: dict):
    async def _body():
        return json.dumps(payload).encode()
    return SimpleNamespace(body=_body, headers={})


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class WidgetChatDeliveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        import campaign_dialer
        import integrations_dispatch

        cls.db, cls.dispatch, cls.dialer = calls_db, integrations_dispatch, campaign_dialer
        calls_db.init_tables()
        cls.end_route = staticmethod(_route(calls_db, integrations_dispatch))
        cls._real_post = integrations_dispatch._post_json

    @classmethod
    def tearDownClass(cls):
        cls.dispatch._post_json = cls._real_post

    def setUp(self):
        stamp = os.urandom(4).hex()
        self.aid = self.db.create_account_with_owner("Prophunt LLP", "A", f"a-{stamp}@example.com", "h",
                                                     email_verified=True)["account_id"]
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id = ?", (self.aid,))
            self.agent = conn.execute(
                "INSERT INTO agents (account_id, name, status) VALUES (?, 'Siya', 'live') RETURNING id", (self.aid,)
            ).fetchone()["id"]
        conn.close()
        self.site = self.db.get_site_by_key(
            self.db.create_site("Site", self.agent, self.aid, "example.com", widget_mode="chat")["siteKey"]
        )
        self.db.update_integration("webhook", "connected", {"url": WEBHOOK_URL}, self.aid)
        self.db.update_integration("arthaleads", "connected", {"token": f"AW-{stamp}"}, self.aid)
        self.posts = []
        self.dispatch._post_json = self._fake_post

    def _fake_post(self, url, payload, timeout=8):
        self.posts.append((url, payload))
        return True, "HTTP 200"

    def chat(self, phone="9876543210", email="", ended_ago_s=600, started_ago_s=None):
        """A logged chat whose last turn was ended_ago_s ago."""
        session = os.urandom(6).hex()
        now = datetime.datetime.now(datetime.timezone.utc)
        started = now - datetime.timedelta(seconds=started_ago_s if started_ago_s is not None else ended_ago_s + 49)
        self.db.upsert_widget_chat_call(
            self.site, {"id": self.agent}, session, started.isoformat(),
            [{"role": "assistant", "content": "Hi, how can I help?"},
             {"role": "user", "content": "Do you have 2BHK in Khopoli?"},
             {"role": "assistant", "content": "Yes, from 45 lakh."}],
            {"name": "Ravi", "phone": phone, "email": email},
        )
        conn = self.db._connect()
        with conn:
            row = conn.execute(
                "UPDATE calls SET ended_at = ?, started_at = ? WHERE room_name = ? RETURNING id",
                ((now - datetime.timedelta(seconds=ended_ago_s)).isoformat(), started.isoformat(),
                 f"widget-chat-{session}"),
            ).fetchone()
        conn.close()
        return row["id"], session

    def row(self, call_id):
        conn = self.db._connect()
        row = conn.execute(
            "SELECT integrations_delivered_at, integrations_delivery_json, arthaleads_status FROM calls WHERE id = ?",
            (call_id,),
        ).fetchone()
        conn.close()
        return dict(row)

    def posts_for(self, call_id):
        return [(url, p) for url, p in self.posts if p.get("call_id") == call_id]

    def test_idle_chat_with_phone_is_delivered_once_to_every_integration(self):
        call_id, _ = self.chat()
        self.dialer._deliver_idle_widget_chats()

        posts = self.posts_for(call_id)
        self.assertEqual(sorted(url for url, _ in posts), sorted([WEBHOOK_URL, self.dispatch._ARTHALEADS_URL]))
        webhook = next(p for url, p in posts if url == WEBHOOK_URL)
        self.assertEqual((webhook["name"], webhook["phone"], webhook["channel"], webhook["type"]),
                         ("Ravi", "+919876543210", "Website chat", "call_completed"))
        self.assertEqual(webhook["transcript"][1], {"speaker": "Caller", "text": "Do you have 2BHK in Khopoli?"})
        self.assertEqual(webhook["agent_name"], "Siya")
        self.assertNotIn("recording_url", webhook)
        artha = next(p for url, p in posts if url == self.dispatch._ARTHALEADS_URL)
        self.assertEqual(artha["transcript"][1], {"speaker": "Caller", "text": "Do you have 2BHK in Khopoli?"})
        self.assertIn("Caller: Do you have 2BHK", artha["message"])

        row = self.row(call_id)
        self.assertTrue(row["integrations_delivered_at"])
        stored = json.loads(row["integrations_delivery_json"])
        self.assertEqual({k: stored[k] for k in ("webhook", "arthaleads")}, {"webhook": "ok", "arthaleads": "ok"})
        self.assertTrue(stored["upTo"], "records the last turn the delivery covered")
        self.assertEqual(row["arthaleads_status"], "sent")

        self.dialer._deliver_idle_widget_chats()
        self.assertEqual(len(self.posts_for(call_id)), 2, "second sweep must not resend")

    def test_chat_that_ended_30s_ago_is_not_delivered_yet(self):
        call_id, _ = self.chat(ended_ago_s=30)
        self.dialer._deliver_idle_widget_chats()
        self.assertEqual(self.posts_for(call_id), [])
        self.assertIsNone(self.row(call_id)["integrations_delivered_at"])

    def test_chat_without_phone_or_email_is_skipped_and_marked(self):
        call_id, _ = self.chat(phone="", email="")
        self.dialer._deliver_idle_widget_chats()
        self.assertEqual(self.posts_for(call_id), [])
        row = self.row(call_id)
        self.assertTrue(row["integrations_delivered_at"])
        self.assertEqual(json.loads(row["integrations_delivery_json"])["skipped"], "no_contact")
        self.assertIsNone(row["arthaleads_status"])

    def test_chat_older_than_seven_days_is_left_alone(self):
        call_id, _ = self.chat(ended_ago_s=8 * 86400)
        self.dialer._deliver_idle_widget_chats()
        self.assertEqual(self.posts_for(call_id), [])
        self.assertIsNone(self.row(call_id)["integrations_delivered_at"])

    def test_end_route_delivers_a_fresh_chat_immediately(self):
        call_id, session = self.chat(ended_ago_s=0)
        out = asyncio.run(self.end_route(_request({"siteKey": self.site["siteKey"], "sessionId": session})))
        self.assertEqual(out, {"ok": True})
        self.assertEqual(len(self.posts_for(call_id)), 2)
        self.assertTrue(self.row(call_id)["integrations_delivered_at"])
        # The later idle sweep finds it already claimed.
        self.dialer._deliver_idle_widget_chats()
        self.assertEqual(len(self.posts_for(call_id)), 2)

    def test_end_route_checks_the_site_key(self):
        _, session = self.chat(ended_ago_s=0)
        with self.assertRaises(HTTPException) as err:
            asyncio.run(self.end_route(_request({"siteKey": "nope", "sessionId": session})))
        self.assertEqual(err.exception.status_code, 404)
        other = self.db.get_site_by_key(self.db.create_site("Other", self.agent, self.aid)["siteKey"])
        out = asyncio.run(self.end_route(_request({"siteKey": other["siteKey"], "sessionId": session})))
        self.assertEqual(out, {"ok": False})
        self.assertEqual(self.posts, [])

    def test_manual_send_still_works_after_automatic_delivery(self):
        call_id, _ = self.chat()
        self.dialer._deliver_idle_widget_chats()
        ok, detail = self.dispatch.push_call_to_arthaleads(self.aid, call_id)
        self.assertTrue(ok, detail)
        artha = [p for url, p in self.posts_for(call_id) if url == self.dispatch._ARTHALEADS_URL]
        self.assertEqual(len(artha), 2)
        self.assertEqual(artha[0]["call_id"], artha[1]["call_id"])
        self.assertEqual(self.row(call_id)["arthaleads_status"], "sent")

    def more_turns(self, call_id, session, ended_ago_s):
        """The visitor kept chatting after the first delivery."""
        self.db.upsert_widget_chat_call(
            self.site, {"id": self.agent}, session,
            (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=1)).isoformat(),
            [{"role": "assistant", "content": "Hi, how can I help?"},
             {"role": "user", "content": "Do you have 2BHK in Khopoli?"},
             {"role": "assistant", "content": "Yes, from 45 lakh."},
             {"role": "user", "content": "My budget is 1 crore."},
             {"role": "assistant", "content": "Noted, 1 crore."}],
            {"name": "Ravi", "phone": "9876543210", "email": ""},
        )
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE calls SET ended_at = ? WHERE id = ?", (
                (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=ended_ago_s)).isoformat(),
                call_id,
            ))
        conn.close()

    def test_turns_after_an_early_delivery_are_resent_to_arthaleads_only(self):
        # Live case 16 Oct (chat 1393): the end beacon fired after the first
        # message, the visitor kept typing, and ArthaLeads never got the rest.
        call_id, session = self.chat(ended_ago_s=1000)
        asyncio.run(self.end_route(_request({"siteKey": self.site["siteKey"], "sessionId": session})))
        self.assertEqual(len(self.posts_for(call_id)), 2)

        self.more_turns(call_id, session, ended_ago_s=30)
        self.dialer._deliver_idle_widget_chats()
        self.assertEqual(len(self.posts_for(call_id)), 2, "not while the visitor may still be typing")

        self.more_turns(call_id, session, ended_ago_s=600)
        self.dialer._deliver_idle_widget_chats()
        posts = self.posts_for(call_id)
        self.assertEqual(len(posts), 3)
        url, resent = posts[-1]
        self.assertEqual(url, self.dispatch._ARTHALEADS_URL, "webhooks/Sheets would get a duplicate row")
        self.assertEqual(resent["call_id"], call_id)
        self.assertEqual(resent["transcript"][3], {"speaker": "Caller", "text": "My budget is 1 crore."})
        stored = json.loads(self.row(call_id)["integrations_delivery_json"])
        self.assertEqual((stored["arthaleads"], stored["resent"]), ("ok", True))

        conn = self.db._connect()
        logged = conn.execute(
            "SELECT event_type, status FROM integration_deliveries WHERE call_id = ? ORDER BY id DESC LIMIT 1", (call_id,)
        ).fetchone()
        conn.close()
        self.assertEqual((logged["event_type"], logged["status"]), ("call_updated", "sent"))

        self.dialer._deliver_idle_widget_chats()
        self.assertEqual(len(self.posts_for(call_id)), 3, "no new turns, no new send")

    def test_a_chat_delivered_complete_is_never_resent(self):
        call_id, session = self.chat(ended_ago_s=1000)
        asyncio.run(self.end_route(_request({"siteKey": self.site["siteKey"], "sessionId": session})))
        for _ in range(2):
            self.dialer._deliver_idle_widget_chats()
        self.assertEqual(len(self.posts_for(call_id)), 2)

    def test_a_failed_arthaleads_delivery_is_left_to_the_manual_button(self):
        self.dispatch._post_json = lambda url, payload, timeout=8: (False, "HTTP 500")
        call_id, session = self.chat(ended_ago_s=1000)
        asyncio.run(self.end_route(_request({"siteKey": self.site["siteKey"], "sessionId": session})))
        self.dispatch._post_json = self._fake_post
        self.more_turns(call_id, session, ended_ago_s=600)
        self.dialer._deliver_idle_widget_chats()
        self.assertEqual(self.posts_for(call_id), [])


if __name__ == "__main__":
    unittest.main()
