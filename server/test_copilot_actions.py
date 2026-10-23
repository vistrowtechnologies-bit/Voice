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
             "_ADMIN_ONLY_MODEL_PREFIXES", "_ADMIN_ONLY_MODELS", "_TENANT_REALTIME_MODELS"),
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

    def test_reply_under_a_proposal_never_claims_it_is_done(self):
        fake = FakeOpenAI([[("set_agent_status", {"agent_id": self.agent, "status": "paused"})]],
                          final={"reply": "Pausing agent 'Real estate agent' now.", "suggestTicket": False,
                                 "comingSoon": False, "articleSlug": ""})
        result = self.ask(fake)
        self.assertEqual(result["reply"], self.help_chat.CONFIRM_REPLY)

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
                         "Book a callback with Abhishek (+919800000003) on 2026-11-02 at 09:30, agent 'Real estate agent'")

    def test_the_card_shows_everything_the_write_will_do(self):
        """Review P1: nothing the action writes may be hidden from the card."""
        describe = lambda tool, args: self.tools.TOOLS[tool]["describe"](self.a, self.tools.TOOLS[tool]["clean"](args))
        greeting = "Namaste! " + "x" * 280
        label = describe("update_agent_basics", {"agent_id": self.agent, "welcome_message": greeting})
        self.assertIn(greeting, label, "the whole welcome message is on the card")
        with self.assertRaises(self.tools.ActionError):
            self.tools.TOOLS["update_agent_basics"]["clean"]({"agent_id": self.agent, "welcome_message": "y" * 301})
        label = describe("book_appointment", {"name": "Asha", "phone": "+919800000004", "date": "2026-11-03",
                                              "time": "11:00", "duration_minutes": 120, "purpose": "Site visit",
                                              "notes": "Bring the brochure"})
        for part in ("120 minutes", "Site visit", "Bring the brochure"):
            self.assertIn(part, label)
        pending = self.propose("update_agent_basics", {"agent_id": self.agent, "welcome_message": greeting})
        self.assertIn(greeting, self.rows()[0]["label"], "the audit keeps the whole card text")
        self.assertTrue(pending["token"])

    def test_events_only_for_integrations_that_have_a_choice(self):
        clean = self.tools.TOOLS["set_integration_events"]["clean"]
        describe = self.tools.TOOLS["set_integration_events"]["describe"]
        with self.assertRaises(self.tools.ActionError):
            describe(self.a, clean({"integration_key": "zoho_crm", "events": ["call_completed"]}))

    def test_malformed_token_is_a_400_not_a_crash(self):
        self.assertConfirmError(400, self.copilot.confirm, "abc.\u00e9", self.a, self.owner)

    def test_confirm_refuses_view_as_and_api_keys_itself(self):
        pending = self.propose()
        with self.assertRaises(self.copilot.ConfirmError) as ctx:
            self.copilot.confirm(pending["token"], self.a, self.owner, impersonating=True)
        self.assertEqual(ctx.exception.status, 403)
        with self.assertRaises(self.copilot.ConfirmError) as ctx:
            self.copilot.confirm(pending["token"], self.a, self.owner, via_api_key=True)
        self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(self.agent_status(), "live")

    def test_unanswered_proposal_lists_as_expired_after_the_link_lapses(self):
        self.propose()
        conn = self.db._connect()
        with conn:
            conn.execute("UPDATE copilot_actions SET created_at = '2000-01-01 00:00:00' WHERE account_id = ?", (self.a,))
        conn.close()
        self.assertEqual(self.rows()[0]["status"], "expired")

    def test_concurrent_confirms_run_the_action_once(self):
        from concurrent.futures import ThreadPoolExecutor
        pending = self.propose()

        def attempt(_):
            try:
                self.copilot.confirm(pending["token"], self.a, self.owner)
                return "ok"
            except self.copilot.ConfirmError as exc:
                return exc.status

        with ThreadPoolExecutor(max_workers=5) as pool:
            outcomes = list(pool.map(attempt, range(5)))
        self.assertEqual(outcomes.count("ok"), 1, outcomes)
        self.assertEqual(sorted(o for o in outcomes if o != "ok"), [409] * 4)

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


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class FollowUpActions(unittest.TestCase):
    """Copilot follow-up actions (owner, 22 Oct 2026): schedule, reschedule,
    cancel and call now, each through the same calls_db function as the
    Follow-ups page button, only after Confirm. Times are the account's
    calling time zone (Asia/Kolkata by default)."""

    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import datetime
        from zoneinfo import ZoneInfo

        import calls_db
        import copilot
        import copilot_tools
        import help_chat
        import help_tools

        cls.db, cls.copilot, cls.tools, cls.help_chat, cls.help_tools = calls_db, copilot, copilot_tools, help_chat, help_tools
        cls.dt, cls.IST = datetime, ZoneInfo("Asia/Kolkata")
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        a = calls_db.create_account_with_owner("FA", "Asha", f"fa-{stamp}@example.com", "h", email_verified=True)
        b = calls_db.create_account_with_owner("FB", "Bala", f"fb-{stamp}@example.com", "h", email_verified=True)
        cls.a, cls.owner, cls.b, cls.b_owner = a["account_id"], a["user_id"], b["account_id"], b["user_id"]
        conn = calls_db._connect()
        with conn:
            conn.execute("UPDATE accounts SET plan = 'growth' WHERE id IN (?, ?)", (cls.a, cls.b))
            cls.viewer = conn.execute(
                "INSERT INTO users (account_id, email, name, password_hash, role) VALUES (?, ?, 'Vik', 'h', 'viewer') RETURNING id",
                (cls.a, f"fv-{stamp}@example.com"),
            ).fetchone()["id"]
        conn.close()
        cls.agent = calls_db.create_agent({"name": "Siya"}, cls.a)["id"]
        cls.no_number_agent = calls_db.create_agent({"name": "No number"}, cls.a)["id"]
        cls.b_agent = calls_db.create_agent({"name": "Other"}, cls.b)["id"]
        tail = str(int(time.time() * 1000))[-7:]
        calls_db.add_phone_number(f"+91224{tail}", cls.a, agent_id=cls.agent)
        calls_db.add_phone_number(f"+91225{tail}", cls.b, agent_id=cls.b_agent)
        cls.n = 0

    def setUp(self):
        conn = self.db._connect()
        with conn:
            conn.execute("DELETE FROM copilot_actions WHERE account_id IN (?, ?)", (self.a, self.b))
        conn.close()

    def phone(self) -> str:
        type(self).n += 1
        return f"+91987{os.getpid() % 100:02d}{self.n:05d}"

    def day(self, days_ahead: int = 1) -> str:
        return (self.dt.datetime.now(self.IST) + self.dt.timedelta(days=days_ahead)).date().isoformat()

    def propose(self, tool, args, account=None, user=None) -> dict:
        return self.copilot.propose(account or self.a, user or self.owner, tool, args)

    def confirm(self, pending, account=None, user=None) -> str:
        return self.copilot.confirm(pending["token"], account or self.a, user or self.owner)["message"]

    def item(self, follow_up_id, account=None) -> dict:
        return next(i for i in self.db.list_follow_ups(account or self.a, view="all")["items"] if i["id"] == follow_up_id)

    def upcoming_for(self, phone, account=None) -> list[dict]:
        return [i for i in self.db.list_follow_ups(account or self.a, view="upcoming")["items"] if i["phone"] == phone]

    def schedule(self, phone=None, **extra) -> dict:
        args = {"name": "Ravi", "phone": phone or self.phone(), "agent_id": self.agent, "kind": "callback",
                "date": self.day(), "time": "11:00", **extra}
        return self.propose("schedule_follow_up", args)

    def scheduled(self, phone=None, **extra) -> dict:
        phone = phone or self.phone()
        self.confirm(self.schedule(phone, **extra))
        return self.upcoming_for(phone)[0]

    def assertProposeRefused(self, text, tool, args, account=None, user=None):
        with self.assertRaises(self.tools.ActionError) as ctx:
            self.propose(tool, args, account, user)
        self.assertIn(text, str(ctx.exception))

    # ------------------------------------------------------------------ tests

    def test_schedule_is_proposed_then_created_at_the_local_time(self):
        phone = self.phone()
        pending = self.schedule(phone, kind="nurture", note="Ask about the home loan")
        self.assertEqual(
            pending["label"],
            f"Schedule a follow-up call to Ravi ({phone}) on "
            f"{self.dt.date.fromisoformat(self.day()):%a} {self.dt.date.fromisoformat(self.day()).day} "
            f"{self.dt.date.fromisoformat(self.day()):%b}, 11:00 am (Asia/Kolkata) by agent 'Siya': "
            "Check in on their interest, note for the AI: \"Ask about the home loan\"")
        self.assertEqual(self.upcoming_for(phone), [], "nothing is scheduled before Confirm")

        self.assertIn("scheduled for", self.confirm(pending))
        [item] = self.upcoming_for(phone)
        due = self.dt.datetime.fromisoformat(item["dueAt"].replace("Z", "+00:00")).astimezone(self.IST)
        self.assertEqual((due.date().isoformat(), due.hour, due.minute), (self.day(), 11, 0))
        self.assertEqual((item["kind"], item["agentId"], item["name"]), ("nurture", self.agent, "Ravi"))
        conn = self.db._connect()
        fields = json.loads(conn.execute("SELECT custom_fields FROM campaign_contacts WHERE id = ?", (item["id"],)).fetchone()["custom_fields"])
        conn.close()
        self.assertEqual((fields["note_for_this_call"], fields["scheduled_by_user_id"]), ("Ask about the home loan", self.owner))
        self.assertEqual(self.db.list_copilot_actions(self.a)[0]["status"], "confirmed")

    def test_a_second_schedule_moves_the_waiting_one_and_the_card_says_so(self):
        phone = self.phone()
        first = self.scheduled(phone)
        pending = self.schedule(phone, date=self.day(2), time="16:30")
        self.assertIn("This moves the follow-up already waiting for them", pending["label"])
        self.assertIn("Moved the follow-up call to Ravi", self.confirm(pending))
        [item] = self.upcoming_for(phone)
        self.assertEqual(item["id"], first["id"])
        due = self.dt.datetime.fromisoformat(item["dueAt"].replace("Z", "+00:00")).astimezone(self.IST)
        self.assertEqual((due.date().isoformat(), due.hour, due.minute), (self.day(2), 16, 30))

    def test_schedule_refusals_come_before_the_card(self):
        base = {"name": "Ravi", "phone": self.phone(), "agent_id": self.agent, "kind": "callback", "date": self.day(), "time": "11:00"}
        self.assertProposeRefused("in the future", "schedule_follow_up", {**base, "date": self.day(-1)})
        self.assertProposeRefused("within the next 90 days", "schedule_follow_up", {**base, "date": self.day(91)})
        self.assertProposeRefused("YYYY-MM-DD", "schedule_follow_up", {**base, "date": "24/10/2026"})
        self.assertProposeRefused("HH:MM", "schedule_follow_up", {**base, "time": "11am"})
        self.assertProposeRefused("callback or nurture", "schedule_follow_up", {**base, "kind": "visit_reminder"})
        self.assertProposeRefused("valid phone", "schedule_follow_up", {**base, "phone": "12"})
        self.assertProposeRefused("no phone number to call from", "schedule_follow_up", {**base, "agent_id": self.no_number_agent})
        self.assertProposeRefused("not found", "schedule_follow_up", {**base, "agent_id": self.b_agent})
        self.assertProposeRefused("too long", "schedule_follow_up", {**base, "note": "x" * 301})
        dnc = self.phone()
        self.db.add_dnc(self.a, dnc)
        self.assertProposeRefused("Do-Not-Call", "schedule_follow_up", {**base, "phone": dnc})
        self.assertEqual(self.db.list_copilot_actions(self.a), [], "a refused proposal records nothing")

    def test_reschedule_moves_it_after_confirm(self):
        item = self.scheduled()
        pending = self.propose("reschedule_follow_up", {"follow_up_id": item["id"], "date": self.day(3), "time": "09:15"})
        self.assertIn(f"Move the follow-up call to Ravi (", pending["label"])
        self.assertIn("9:15 am (Asia/Kolkata)", pending["label"])
        self.assertEqual(self.item(item["id"])["dueAt"], item["dueAt"], "unchanged before Confirm")
        self.assertIn("is now at", self.confirm(pending))
        due = self.dt.datetime.fromisoformat(self.item(item["id"])["dueAt"].replace("Z", "+00:00")).astimezone(self.IST)
        self.assertEqual((due.date().isoformat(), due.hour, due.minute), (self.day(3), 9, 15))

    def test_cancel_after_confirm_and_not_twice(self):
        item = self.scheduled()
        pending = self.propose("cancel_follow_up", {"follow_up_id": item["id"]})
        self.assertTrue(pending["label"].startswith("Cancel the follow-up call to Ravi (Callback they asked for, due "),
                        pending["label"])
        self.assertEqual(self.item(item["id"])["state"], "upcoming", "unchanged before Confirm")
        self.assertIn("will not ring", self.confirm(pending))
        self.assertEqual(self.item(item["id"])["state"], "cancelled")
        self.assertProposeRefused("already finished", "cancel_follow_up", {"follow_up_id": item["id"]})

    def test_a_proposal_that_went_stale_fails_on_confirm(self):
        item = self.scheduled()
        pending = self.propose("cancel_follow_up", {"follow_up_id": item["id"]})
        self.db.act_on_follow_up(self.a, item["id"], "cancel")  # cancelled on the page meanwhile
        with self.assertRaises(self.copilot.ConfirmError) as ctx:
            self.confirm(pending)
        self.assertEqual(ctx.exception.status, 400)
        self.assertIn("already finished", ctx.exception.detail)
        self.assertEqual(self.db.list_copilot_actions(self.a)[0]["status"], "failed")

    def test_call_now_makes_it_due_now(self):
        item = self.scheduled()
        pending = self.propose("call_follow_up_now", {"follow_up_id": item["id"]})
        self.assertTrue(pending["label"].startswith("Call Ravi now ("), pending["label"])
        self.assertIn("calling window", self.confirm(pending))
        due = self.dt.datetime.fromisoformat(self.item(item["id"])["dueAt"].replace("Z", "+00:00"))
        self.assertLess(abs((due - self.dt.datetime.now(self.dt.timezone.utc)).total_seconds()), 120)

    def test_another_workspace_cannot_touch_it(self):
        item = self.scheduled()
        for tool, args in (("cancel_follow_up", {"follow_up_id": item["id"]}),
                           ("call_follow_up_now", {"follow_up_id": item["id"]}),
                           ("reschedule_follow_up", {"follow_up_id": item["id"], "date": self.day(2), "time": "10:00"})):
            self.assertProposeRefused("not found", tool, args, account=self.b, user=self.b_owner)
        self.assertEqual(self.help_tools.upcoming_follow_ups(self.b)["followUps"], [])
        self.assertEqual(self.item(item["id"])["state"], "upcoming")

    def test_viewer_cannot_confirm(self):
        item = self.scheduled()
        pending = self.propose("cancel_follow_up", {"follow_up_id": item["id"]}, user=self.viewer)
        with self.assertRaises(self.copilot.ConfirmError) as ctx:
            self.confirm(pending, user=self.viewer)
        self.assertEqual(ctx.exception.status, 403)
        self.assertEqual(self.item(item["id"])["state"], "upcoming")

    def test_read_tool_lists_waiting_ones_in_the_calling_time_zone(self):
        phone = self.phone()
        item = self.scheduled(phone, name="Kavya Iyer")
        out = self.help_tools.upcoming_follow_ups(self.a, query="kavya")
        self.assertEqual(out["timezone"], "Asia/Kolkata")
        [row] = out["followUps"]
        day = self.dt.date.fromisoformat(self.day())
        self.assertEqual((row["followUpId"], row["name"], row["agent"], row["due"]),
                         (item["id"], "Kavya Iyer", "Siya", f"{day:%a} {day.day} {day:%b} {day:%Y}, 11:00"))
        self.assertEqual([r["followUpId"] for r in self.help_tools.upcoming_follow_ups(self.a, query=phone[-6:])["followUps"]], [item["id"]])
        self.assertEqual(self.help_tools.upcoming_follow_ups(self.a, query="nobody-like-this")["followUps"], [])

    def test_the_copilot_looks_it_up_then_proposes_and_nothing_changes_before_confirm(self):
        item = self.scheduled(name="Neha Rao")
        fake = FakeOpenAI([[("upcoming_follow_ups", {"query": "Neha"})],
                           [("cancel_follow_up", {"follow_up_id": item["id"]})]])
        with mock.patch.dict("help_chat.os.environ", {"OPENAI_API_KEY": "test-key"}), \
                mock.patch("help_chat.urllib.request.urlopen", fake):
            result = self.help_chat.answer_help_question("Cancel Neha's follow-up call", [], self.a,
                                                         user_id=self.owner, role="owner")
        self.assertTrue({"upcoming_follow_ups", "cancel_follow_up", "schedule_follow_up",
                         "reschedule_follow_up", "call_follow_up_now"} <= fake.offered())
        lookup = [m["content"] for m in fake.requests[1]["messages"] if m.get("role") == "tool"][0]
        self.assertIn(f'"followUpId": {item["id"]}', lookup)
        self.assertEqual(result["pendingAction"]["tool"], "cancel_follow_up")
        self.assertEqual(result["reply"], self.help_chat.CONFIRM_REPLY)
        self.assertEqual(self.item(item["id"])["state"], "upcoming")
        self.assertIn("Checked your follow-ups", result.get("steps", []))


if __name__ == "__main__":
    unittest.main()
