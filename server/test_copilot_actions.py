"""Copilot write actions (copilot.py / copilot_tools.py): the model can only
propose; a signed token plus POST /help/chat/confirm runs the write once,
after role, plan and daily-cap checks, and every step is in copilot_actions.
Runs against a throwaway Postgres (TEST_DATABASE_URL); the model is a fake
urllib responder, so no OpenAI call is made."""
import ast
import io
import json
import os
import re
import time
import types
import unittest
from unittest import mock

TEST_DB = os.environ.get("TEST_DATABASE_URL")
HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    TOKEN_API = handle.read()
TREE = ast.parse(TOKEN_API)


def token_api_namespace(names: tuple[str, ...], namespace: dict) -> dict:
    nodes = [n for n in TREE.body
             if (isinstance(n, ast.FunctionDef) and n.name in names)
             or (isinstance(n, ast.Assign) and any(getattr(t, "id", None) in names for t in n.targets))]
    for n in nodes:
        if isinstance(n, ast.FunctionDef):
            n.decorator_list = []
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "token_api.py", "exec"), namespace)
    return namespace


class SupportSessionBlocksConfirm(unittest.TestCase):
    def test_confirm_is_refused_while_viewing_as_a_customer(self):
        ns = token_api_namespace(("support_session_blocks", "_SUPPORT_BLOCKED_PATHS"), {"re": re})
        self.assertTrue(ns["support_session_blocks"]("POST", "/help/chat/confirm"))
        self.assertFalse(ns["support_session_blocks"]("POST", "/help/chat"), "read-only answers still work")


class AgentIntegrationsSentinel(unittest.TestCase):
    def test_same_sentinel_as_the_integrations_page(self):
        import copilot_tools

        clean = copilot_tools.TOOLS["set_agent_integrations"]["clean"]
        self.assertEqual(clean({"agent_id": 1, "integration_keys": []})["integration_keys"], ["none"])
        self.assertEqual(clean({"agent_id": 1, "integration_keys": ["none"]})["integration_keys"], ["none"])
        self.assertEqual(clean({"agent_id": 1, "integration_keys": ["all"]})["integration_keys"], [])
        self.assertEqual(clean({"agent_id": 1, "integration_keys": list(copilot_tools.DELIVERY_KEYS)})["integration_keys"], [])
        self.assertEqual(clean({"agent_id": 1, "integration_keys": ["Slack", "webhook"]})["integration_keys"], ["webhook", "slack"])
        with self.assertRaises(copilot_tools.ActionError):
            clean({"agent_id": 1, "integration_keys": ["salesforce"]})

    def test_no_tool_takes_account_id(self):
        import copilot_tools

        for name, spec in copilot_tools.TOOLS.items():
            self.assertNotIn("account_id", spec["schema"]["function"]["parameters"]["properties"], name)


class FakeOpenAI:
    """Answers each request with the next tool-call round in `rounds` while
    tools are offered, then with a final JSON reply."""

    def __init__(self, rounds: list[list[tuple[str, dict]]], final: dict | None = None):
        self.rounds = list(rounds)
        self.final = final or {"reply": "Ready to confirm.", "suggestTicket": False, "comingSoon": False, "articleSlug": ""}
        self.requests: list[dict] = []

    def __call__(self, request, timeout=0):
        body = json.loads(request.data.decode("utf-8"))
        self.requests.append(body)
        if "tools" in body and self.rounds:
            calls = self.rounds.pop(0)
            message = {"role": "assistant", "content": None, "tool_calls": [
                {"id": f"c{len(self.requests)}_{i}", "type": "function",
                 "function": {"name": name, "arguments": json.dumps(args)}}
                for i, (name, args) in enumerate(calls)
            ]}
        else:
            message = {"role": "assistant", "content": json.dumps(self.final)}
        return io.BytesIO(json.dumps({"choices": [{"message": message}]}).encode("utf-8"))

    def offered(self, index: int = 0) -> set[str]:
        return {t["function"]["name"] for t in self.requests[index].get("tools", [])}


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class CopilotActions(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        import copilot
        import copilot_tools
        import help_chat
        import plan_policy
        import voice_catalog
        from fastapi import HTTPException

        cls.db, cls.copilot, cls.tools, cls.help_chat = calls_db, copilot, copilot_tools, help_chat
        calls_db.init_tables()
        # The real PATCH /agents guards, as token_api.py wires them up.
        ns = token_api_namespace(
            ("_guard_agent_patch", "_guard_stt_provider", "_guard_voice_tier", "_guard_realtime_voice",
             "_guard_admin_only_model", "_realtime_voice_usable", "_GEMINI_LIVE_VOICES",
             "_ADMIN_ONLY_MODEL_PREFIXES", "_ADMIN_ONLY_MODELS"),
            {"HTTPException": HTTPException, "calls_db": calls_db, "plan_policy": plan_policy, "voice_catalog": voice_catalog},
        )
        cls._saved_guard = copilot_tools.AGENT_PATCH_GUARD
        copilot_tools.AGENT_PATCH_GUARD = ns["_guard_agent_patch"]

        stamp = os.urandom(4).hex()
        a = calls_db.create_account_with_owner("A", "Asha", f"a-{stamp}@example.com", "h", email_verified=True)
        b = calls_db.create_account_with_owner("B", "Bala", f"b-{stamp}@example.com", "h", email_verified=True)
        c = calls_db.create_account_with_owner("C", "Chetan", f"c-{stamp}@example.com", "h", email_verified=True)
        cls.a, cls.owner = a["account_id"], a["user_id"]
        cls.b, cls.b_owner = b["account_id"], b["user_id"]
        cls.c, cls.c_owner = c["account_id"], c["user_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id IN (?, ?)", (cls.a, cls.b))
            conn.execute("UPDATE accounts SET plan = 'starter' WHERE id = ?", (cls.c,))
            cls.viewer = conn.execute(
                "INSERT INTO users (account_id, email, name, password_hash, role) VALUES (?, ?, 'Vik', 'h', 'viewer') RETURNING id",
                (cls.a, f"v-{stamp}@example.com"),
            ).fetchone()["id"]
            cls.member = conn.execute(
                "INSERT INTO users (account_id, email, name, password_hash, role) VALUES (?, ?, 'Meera', 'h', 'member') RETURNING id",
                (cls.a, f"m-{stamp}@example.com"),
            ).fetchone()["id"]
        conn.close()
        cls.agent = calls_db.create_agent({"name": "Real estate agent"}, cls.a)["id"]
        cls.foreign_agent = calls_db.create_agent({"name": "Other tenant agent"}, cls.b)["id"]

    @classmethod
    def tearDownClass(cls):
        cls.tools.AGENT_PATCH_GUARD = cls._saved_guard

    def setUp(self):
        conn = self.db._connect()
        with conn:
            conn.execute("DELETE FROM copilot_actions WHERE account_id IN (?, ?, ?)", (self.a, self.b, self.c))
            conn.execute("UPDATE agents SET status = 'live', crm_integration_keys = '[]' WHERE id = ?", (self.agent,))
        conn.close()

    # ---------------------------------------------------------------- helpers

    def ask(self, fake: FakeOpenAI, account=None, user=None, role="owner", impersonating=False) -> dict:
        with mock.patch.dict("help_chat.os.environ", {"OPENAI_API_KEY": "test-key"}), \
                mock.patch("help_chat.urllib.request.urlopen", fake):
            return self.help_chat.answer_help_question(
                "Pause the real estate agent", [], account or self.a,
                user_id=user or self.owner, role=role, impersonating=impersonating)

    def propose(self, tool="set_agent_status", args=None, account=None, user=None) -> dict:
        args = args if args is not None else {"agent_id": self.agent, "status": "paused"}
        return self.copilot.propose(account or self.a, user or self.owner, tool, args)

    def rows(self, account=None) -> list[dict]:
        return self.db.list_copilot_actions(account or self.a)

    def agent_status(self) -> str:
        return next(a for a in self.db.list_agents(self.a) if a["id"] == self.agent)["status"]

    def assertConfirmError(self, status: int, fn, *args):
        with self.assertRaises(self.copilot.ConfirmError) as ctx:
            fn(*args)
        self.assertEqual(ctx.exception.status, status, ctx.exception.detail)
        return ctx.exception

    # ------------------------------------------------------------------ tests

    def test_write_tool_is_proposed_not_executed(self):
        fake = FakeOpenAI([[("set_agent_status", {"agent_id": self.agent, "status": "paused", "account_id": self.b})]])
        result = self.ask(fake)

        self.assertIn("set_agent_status", fake.offered())
        self.assertEqual(self.agent_status(), "live", "nothing runs before Confirm")
        pending = result["pendingAction"]
        self.assertEqual((pending["tool"], pending["label"]), ("set_agent_status", "Pause agent 'Real estate agent'"))
        self.assertEqual([r["status"] for r in self.rows()], ["proposed"])
        self.assertNotIn("account_id", self.rows()[0]["args"], "the model cannot pick the account")
        self.assertNotIn("tools", fake.requests[-1], "after a proposal the next round must answer")
        self.assertIn("confirmation card", fake.requests[0]["messages"][0]["content"])

    def test_only_one_action_per_reply(self):
        fake = FakeOpenAI([[("set_agent_status", {"agent_id": self.agent, "status": "paused"}),
                            ("book_callback", {"name": "Abhishek", "phone": "+919800000001", "date": "2026-11-02", "time": "15:00"})]])
        result = self.ask(fake)
        self.assertEqual(result["pendingAction"]["tool"], "set_agent_status")
        self.assertEqual(len(self.rows()), 1)
        tool_messages = [m["content"] for m in fake.requests[-1]["messages"] if m.get("role") == "tool"]
        self.assertIn("one action", tool_messages[1])

    def test_confirm_executes_exactly_once_and_is_audited(self):
        pending = self.propose()
        self.assertEqual(self.copilot.confirm(pending["token"], self.a, self.owner),
                         {"ok": True, "message": "Agent 'Real estate agent' is now paused."})
        self.assertEqual(self.agent_status(), "paused")
        self.assertConfirmError(409, self.copilot.confirm, pending["token"], self.a, self.owner)
        row = self.rows()[0]
        self.assertEqual((row["status"], row["result"], row["label"]),
                         ("confirmed", "Agent 'Real estate agent' is now paused.", "Pause agent 'Real estate agent'"))
        self.assertIsNotNone(row["decidedAt"])
        self.assertEqual(row["userName"], "Asha")

    def test_cancel_is_audited_and_cannot_then_confirm(self):
        pending = self.propose()
        self.assertTrue(self.copilot.cancel(pending["token"], self.a, self.owner)["ok"])
        self.assertConfirmError(409, self.copilot.confirm, pending["token"], self.a, self.owner)
        self.assertEqual(self.agent_status(), "live")
        self.assertEqual(self.rows()[0]["status"], "cancelled")

    def test_tampered_token_is_rejected(self):
        pending = self.propose()
        body, sig = pending["token"].split(".")
        payload = json.loads(self.copilot.auth._unb64(body))
        payload["x"]["status"] = "live"
        forged = self.copilot.auth._b64(json.dumps(payload, separators=(",", ":")).encode()) + "." + sig
        self.assertConfirmError(400, self.copilot.confirm, forged, self.a, self.owner)
        self.assertConfirmError(400, self.copilot.confirm, pending["token"][:-2] + "xx", self.a, self.owner)
        self.assertConfirmError(400, self.copilot.confirm, "garbage", self.a, self.owner)
        self.assertEqual(self.rows()[0]["status"], "proposed")

    def test_expired_token_is_rejected_and_marked_expired(self):
        pending = self.propose()
        with mock.patch("copilot.time.time", return_value=time.time() + self.copilot.TOKEN_TTL_SECONDS + 5):
            self.assertConfirmError(400, self.copilot.confirm, pending["token"], self.a, self.owner)
        self.assertEqual(self.rows()[0]["status"], "expired")
        self.assertEqual(self.agent_status(), "live")

    def test_another_users_or_accounts_token_is_refused(self):
        pending = self.propose()
        self.assertConfirmError(403, self.copilot.confirm, pending["token"], self.a, self.member)
        self.assertConfirmError(403, self.copilot.confirm, pending["token"], self.b, self.b_owner)
        self.assertConfirmError(403, self.copilot.cancel, pending["token"], self.b, self.b_owner)
        self.assertEqual(self.agent_status(), "live")

    def test_viewer_gets_no_write_tools_and_cannot_confirm(self):
        fake = FakeOpenAI([])
        self.ask(fake, user=self.viewer, role="viewer")
        self.assertFalse(fake.offered() & set(self.tools.TOOLS))
        # Proposed while a member, demoted before confirming: the fresh role check wins.
        pending = self.propose(user=self.member)
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE users SET role = 'viewer' WHERE id = ?", (self.member,))
        conn.close()
        try:
            self.assertConfirmError(403, self.copilot.confirm, pending["token"], self.a, self.member)
        finally:
            conn = self.db._connect()
            with conn:
                conn.execute("UPDATE users SET role = 'member' WHERE id = ?", (self.member,))
            conn.close()
        self.assertEqual(self.agent_status(), "live")

    def test_member_gets_member_tools_only(self):
        fake = FakeOpenAI([])
        self.ask(fake, user=self.member, role="member")
        offered = fake.offered() & set(self.tools.TOOLS)
        self.assertIn("book_callback", offered)
        self.assertNotIn("assign_number_to_agent", offered)
        self.assertNotIn("set_integration_events", offered)

    def test_starter_plan_gets_no_write_tools_and_an_upgrade_flag(self):
        final = {"reply": "That needs the Growth plan.", "suggestTicket": False, "comingSoon": False, "articleSlug": "", "upgrade": True}
        fake = FakeOpenAI([], final=final)
        result = self.ask(fake, account=self.c, user=self.c_owner)
        self.assertFalse(fake.offered() & set(self.tools.TOOLS))
        self.assertIn("Growth plan", fake.requests[0]["messages"][0]["content"])
        self.assertTrue(result["upgrade"])
        self.assertNotIn("pendingAction", result)
        # A token minted for a starter workspace still cannot run.
        pending = self.copilot.propose(self.c, self.c_owner, "book_callback",
                                       {"name": "A", "phone": "+919800000002", "date": "2026-11-02", "time": "10:00"})
        self.assertConfirmError(403, self.copilot.confirm, pending["token"], self.c, self.c_owner)

    def test_impersonation_offers_no_write_tools(self):
        fake = FakeOpenAI([])
        self.ask(fake, impersonating=True)
        self.assertFalse(fake.offered() & set(self.tools.TOOLS))

    def test_another_tenants_agent_is_not_found(self):
        with self.assertRaises(self.tools.ActionError) as ctx:
            self.propose(args={"agent_id": self.foreign_agent, "status": "paused"})
        self.assertIn("not found", str(ctx.exception))
        self.assertEqual(self.rows(), [])
        fake = FakeOpenAI([[("set_agent_status", {"agent_id": self.foreign_agent, "status": "paused"})]])
        result = self.ask(fake)
        self.assertNotIn("pendingAction", result)
        self.assertIn("not found", [m for m in fake.requests[-1]["messages"] if m.get("role") == "tool"][0]["content"])

    def test_daily_write_cap(self):
        with mock.patch.object(self.copilot, "DAILY_WRITE_CAP", 1):
            self.copilot.confirm(self.propose()["token"], self.a, self.owner)
            error = self.assertConfirmError(429, self.copilot.confirm,
                                            self.propose(args={"agent_id": self.agent, "status": "live"})["token"], self.a, self.owner)
        self.assertIn("limit", error.detail)
        self.assertEqual(self.agent_status(), "paused")

    def test_daily_proposal_cap_withdraws_write_tools(self):
        self.propose()
        with mock.patch.object(self.copilot, "DAILY_PROPOSAL_CAP", 1):
            fake = FakeOpenAI([])
            self.ask(fake)
        self.assertFalse(fake.offered() & set(self.tools.TOOLS))
        self.assertIn("limit", fake.requests[0]["messages"][0]["content"])

    def test_describe_resolves_names(self):
        describe = lambda tool, args: self.tools.TOOLS[tool]["describe"](self.a, self.tools.TOOLS[tool]["clean"](args))
        self.assertEqual(describe("set_agent_status", {"agent_id": self.agent, "status": "live"}),
                         "Put live agent 'Real estate agent'")
        self.assertEqual(describe("update_agent_basics", {"agent_id": self.agent, "language": "Marathi"}),
                         "Update agent 'Real estate agent': language Marathi")
        self.assertEqual(describe("set_agent_integrations", {"agent_id": self.agent, "integration_keys": []}),
                         "Stop sending agent 'Real estate agent' leads to any integration")
        self.assertIn("Slack", describe("set_agent_integrations", {"agent_id": self.agent, "integration_keys": ["slack"]}))
        self.assertEqual(describe("book_callback", {"name": "Abhishek", "phone": "+919800000003", "date": "2026-11-02",
                                                    "time": "9:30", "agent_id": self.agent}),
                         "Book a callback with Abhishek (+919800000003) on 2026-11-02 at 09:30 for agent 'Real estate agent'")

    def test_set_agent_integrations_stores_the_none_sentinel(self):
        pending = self.propose("set_agent_integrations", {"agent_id": self.agent, "integration_keys": []})
        self.copilot.confirm(pending["token"], self.a, self.owner)
        agent = next(a for a in self.db.list_agents(self.a) if a["id"] == self.agent)
        self.assertEqual(agent["crmIntegrationKeys"], ["none"])

    def test_update_agent_basics_uses_the_allowlist(self):
        pending = self.propose("update_agent_basics", {"agent_id": self.agent, "welcome_message": "Namaste!",
                                                       "isPlatformDemo": True, "model": "gpt-5-nano"})
        self.assertEqual(set(self.rows()[0]["args"]), {"agent_id", "welcome_message"})
        self.copilot.confirm(pending["token"], self.a, self.owner)
        agent = next(a for a in self.db.list_agents(self.a) if a["id"] == self.agent)
        self.assertEqual(agent["welcomeMessage"], "Namaste!")
        self.assertFalse(agent.get("isPlatformDemo"))

    def test_callback_books_an_appointment_and_conflict_is_a_message(self):
        args = {"name": "Abhishek", "phone": "+919800000004", "date": "2031-01-06", "time": "11:00"}
        first = self.propose("book_callback", args)
        self.assertIn("booked", self.copilot.confirm(first["token"], self.a, self.owner)["message"])
        booked = self.db.list_appointments(self.a, "2031-01-06", "2031-01-06")
        self.assertEqual([(b["purpose"], b["name"]) for b in booked], [("Callback", "Abhishek")])
        error = self.assertConfirmError(400, self.copilot.confirm, self.propose("book_callback", args)["token"], self.a, self.owner)
        self.assertIn("already booked", error.detail)
        self.assertEqual([r["status"] for r in self.rows()], ["failed", "confirmed"])
        with self.assertRaises(self.tools.ActionError):
            self.propose("book_callback", {**args, "date": "06/01/2031"})

    def test_assign_number_needs_admin_and_syncs_routing(self):
        number_id = self.db.add_phone_number("+9122" + str(int(time.time() * 1000))[-8:], self.a)
        pending = self.propose("assign_number_to_agent", {"number_id": number_id, "agent_id": self.agent}, user=self.member)
        self.assertConfirmError(403, self.copilot.confirm, pending["token"], self.a, self.member)
        pending = self.propose("assign_number_to_agent", {"number_id": number_id, "agent_id": self.agent})
        sync = mock.AsyncMock()
        with mock.patch("livekit_sip.upsert_dispatch_rule", sync):
            self.copilot.confirm(pending["token"], self.a, self.owner)
        self.assertEqual(self.db.get_phone_number(number_id, self.a)["agentId"], self.agent)
        sync.assert_awaited_once()
        with self.assertRaises(self.tools.ActionError):
            self.propose("assign_number_to_agent", {"number_id": number_id, "agent_id": self.agent}, account=self.b, user=self.b_owner)

    def test_admin_account_detail_lists_copilot_actions(self):
        import admin_db

        self.propose()
        detail = admin_db.account_detail(self.a)
        self.assertEqual([r["label"] for r in detail["copilotActions"]], ["Pause agent 'Real estate agent'"])


if __name__ == "__main__":
    unittest.main()
