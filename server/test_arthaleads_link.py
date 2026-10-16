"""ArthaLeads single-token handshake (contract 2026-10-16).

Saving the ArthaLeads connection key links the account at ArthaLeads
(POST /webhook/vistrow/link); a rejected key is not saved; an unreachable
ArthaLeads saves the key as "pending"; Send test re-links; Disconnect
unlinks; and the same key authenticates ArthaLeads -> Voice on the inbound
routes. The real token_api routes run as plain functions (lifted via ast, as
test_instant_lead_calls does) against a throwaway Postgres
(TEST_DATABASE_URL). ArthaLeads' HTTP is faked at
integrations_dispatch._arthaleads_api_post; no network."""
import ast
import asyncio
import json
import os
import re
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import Body, Depends, HTTPException, Request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = Path(__file__).resolve().parent.parent
TEST_DB = os.environ.get("TEST_DATABASE_URL")

_ROUTES = {
    "update_integration", "test_integration", "leads_inbound", "leads_inbound_agents",
    "_require_integration_connectable", "_SERVER_MANAGED_INTEGRATION_KEYS",
    "_LEAD_CONTROL_CHARS", "_FORM_IDENTITY_KEYS", "_lead_text", "_lead_form_fields", "_queued_until",
    "_parse_facebook_field_data",
}


def _routes(calls_db, integrations_dispatch) -> dict:
    tree = ast.parse((ROOT / "server/token_api.py").read_text())
    body = []
    for node in tree.body:
        name = getattr(node, "name", None) or next(
            (t.id for t in getattr(node, "targets", []) if isinstance(t, ast.Name)), None)
        if name in _ROUTES:
            if hasattr(node, "decorator_list"):
                node.decorator_list = []
            body.append(node)
    ns = {"re": re, "asyncio": asyncio, "calls_db": calls_db, "integrations_dispatch": integrations_dispatch,
          "campaign_dialer": Mock(), "logger": Mock(), "HTTPException": HTTPException, "Request": Request,
          "Body": Body, "Depends": Depends, "require_role": lambda role: None}
    exec(compile(ast.Module(body=body, type_ignores=[]), "token_api.py", "exec"), ns)
    return ns


def _request(token: str):
    async def _json():
        return {}
    return SimpleNamespace(headers={"x-vistrow-webhook-token": token}, json=_json)


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class ArthaLeadsLinkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        os.environ["PUBLIC_BASE_URL"] = "https://voice.test"
        import calls_db
        import integrations_dispatch

        cls.db, cls.dispatch = calls_db, integrations_dispatch
        calls_db.init_tables()
        cls.routes = _routes(calls_db, integrations_dispatch)
        # The sample lead the Test button still sends: no network either.
        # Restored in tearDownClass so later test modules see the real one.
        cls._real = (integrations_dispatch._post_json, integrations_dispatch._arthaleads_api_post)
        integrations_dispatch._post_json = lambda url, payload, timeout=8: (True, "HTTP 200")

    @classmethod
    def tearDownClass(cls):
        cls.dispatch._post_json, cls.dispatch._arthaleads_api_post = cls._real
        os.environ.pop("PUBLIC_BASE_URL", None)

    def setUp(self):
        stamp = os.urandom(4).hex()
        self.a = self.db.create_account_with_owner("Prophunt LLP", "A", f"a-{stamp}@example.com", "h", email_verified=True)
        self.b = self.db.create_account_with_owner("Other Co", "B", f"b-{stamp}@example.com", "h", email_verified=True)
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id IN (?, ?)", (self.a["account_id"], self.b["account_id"]))
        conn.close()
        self.calls = []
        # Keys are unique per test: the DB keeps earlier tests' connected rows.
        self.token = f"AW-{stamp}"
        self.answer = (200, json.dumps({"success": True, "org_id": "org1", "org_name": "Prophunt LLP",
                                        "account_id": str(self.a["account_id"]), "enabled": False,
                                        "switched_off": False, "linked_at": "2026-10-16T10:00:00.000Z"}))
        self.dispatch._arthaleads_api_post = self._fake_post

    def _fake_post(self, path, payload, timeout=8):
        self.calls.append((path, payload))
        return self.answer

    def save(self, token=None, status="connected", account=None, config=None):
        account = account or self.a
        config = {"token": token or self.token} if config is None else config
        return self.routes["update_integration"](
            "arthaleads", {"status": status, "config": config}, {"account_id": account["account_id"], "user_id": account["user_id"]},
        )

    def integration(self, account=None):
        account = account or self.a
        return next(i for i in self.db.list_integrations(account["account_id"]) if i["key"] == "arthaleads")

    def test_saving_the_key_sends_the_handshake_and_stores_the_link(self):
        self.save()
        self.assertEqual(self.calls, [("/webhook/vistrow/link", {
            "token": self.token, "account_id": str(self.a["account_id"]),
            "base_url": "https://voice.test", "account_name": "Prophunt LLP",
        })])
        integ = self.integration()
        self.assertEqual(integ["status"], "connected")
        self.assertEqual(integ["config"]["token"], self.token)
        link = integ["config"]["link"]
        self.assertEqual((link["status"], link["org_name"], link["linked_at"]),
                         ("linked", "Prophunt LLP", "2026-10-16T10:00:00.000Z"))
        self.assertTrue(link["checked_at"])

    def test_rejected_key_is_a_400_and_is_not_saved(self):
        self.answer = (401, json.dumps({"success": False, "code": "key_rejected", "message": "nope"}))
        with self.assertRaises(HTTPException) as err:
            self.save(token="AW-bad")
        self.assertEqual(err.exception.status_code, 400)
        self.assertEqual(err.exception.detail,
                         "ArthaLeads did not accept this key. Copy it again from ArthaLeads → Integrations → Vistrow Voice.")
        integ = self.integration()
        self.assertEqual(integ["status"], "not_connected")
        self.assertNotIn("token", integ["config"])

    def test_plan_rejection_is_a_400_with_the_plan_text(self):
        self.answer = (403, json.dumps({"success": False, "code": "plan", "message": "Enterprise"}))
        with self.assertRaises(HTTPException) as err:
            self.save()
        self.assertEqual(err.exception.status_code, 400)
        self.assertEqual(err.exception.detail, "ArthaLeads says this feature needs its Enterprise plan.")
        self.assertEqual(self.integration()["status"], "not_connected")

    def test_unreachable_arthaleads_saves_the_key_as_pending(self):
        self.answer = (0, "<urlopen error timed out>")
        self.save()
        integ = self.integration()
        self.assertEqual((integ["status"], integ["config"]["token"]), ("connected", self.token))
        link = integ["config"]["link"]
        self.assertEqual(link["status"], "pending")
        self.assertIn("timed out", link["error"])
        self.assertTrue(link["checked_at"])

    def test_a_link_sent_by_the_browser_is_ignored(self):
        self.answer = (0, "connection refused")
        self.save(config={"token": self.token, "link": {"status": "linked", "org_name": "Forged"}})
        self.assertEqual(self.integration()["config"]["link"]["status"], "pending")

    def test_send_test_re_links_and_refreshes_the_link(self):
        self.answer = (0, "connection refused")
        self.save()
        self.assertEqual(self.integration()["config"]["link"]["status"], "pending")
        self.answer = (200, json.dumps({"success": True, "org_name": "Prophunt LLP", "linked_at": "2026-10-16T11:00:00Z"}))
        result = self.routes["test_integration"]("arthaleads", {"account_id": self.a["account_id"], "user_id": self.a["user_id"]})
        self.assertTrue(result["ok"], result)
        self.assertIn(f"Linked with ArthaLeads (Prophunt LLP). Vistrow account {self.a['account_id']}.", result["detail"])
        self.assertEqual(self.calls[-1][0], "/webhook/vistrow/link")
        link = self.integration()["config"]["link"]
        self.assertEqual((link["status"], link["linked_at"]), ("linked", "2026-10-16T11:00:00Z"))

    def test_disconnect_unlinks_with_the_old_key(self):
        self.save()
        self.answer = (200, json.dumps({"success": True, "unlinked": True}))
        self.save(status="not_connected", config={})
        self.assertEqual(self.calls[-1], ("/webhook/vistrow/unlink", {"token": self.token}))
        integ = self.integration()
        self.assertEqual((integ["status"], integ["config"]), ("not_connected", {}))

    def test_inbound_lead_route_accepts_the_arthaleads_key_for_its_account_only(self):
        self.save()
        aid, bid = self.a["account_id"], self.b["account_id"]
        inbound = self.routes["leads_inbound"]

        result = asyncio.run(inbound(aid, _request(self.token)))
        self.assertEqual(result, {"ok": False, "reason": "no_phone_in_payload"}, "authenticated; empty body")

        with self.assertRaises(HTTPException) as err:
            asyncio.run(inbound(bid, _request(self.token)))
        self.assertEqual(err.exception.status_code, 404)

        webhook_token = self.db.get_or_create_lead_webhook_token(aid)
        self.assertEqual(asyncio.run(inbound(aid, _request(webhook_token))), {"ok": False, "reason": "no_phone_in_payload"})

        # A key on a disconnected integration row must not open the door.
        stale = f"{self.token}-stale"
        self.db.update_integration("arthaleads", "not_connected", {"token": stale}, bid)
        with self.assertRaises(HTTPException) as err:
            asyncio.run(inbound(bid, _request(stale)))
        self.assertEqual(err.exception.status_code, 404)

    def test_agents_route_accepts_the_arthaleads_key(self):
        self.save()
        agents = self.routes["leads_inbound_agents"]
        self.assertEqual(agents(self.a["account_id"], _request(self.token)), {"agents": []})
        with self.assertRaises(HTTPException) as err:
            agents(self.b["account_id"], _request(self.token))
        self.assertEqual(err.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
