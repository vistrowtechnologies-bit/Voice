"""Local boundary tests with synthetic accounts; no database or vendor calls."""
import logging
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import calls_db
import plan_policy
import psycopg
from fastapi import HTTPException, Request
from test_plan_policy import ROOT, function_from_file


class OfflinePlanAcceptance(unittest.TestCase):
    def test_agent_caps_for_each_plan(self):
        for plan, cap in (("starter", 1), ("growth", 5), ("scale", 20)):
            for count in (cap, cap + 1):
                with self.subTest(plan=plan, count=count):
                    conn = MagicMock()
                    conn.execute.return_value.fetchone.return_value = {"c": count}
                    with patch.object(calls_db, "_connect", return_value=conn), patch.object(calls_db, "_account_plan_and_owner", return_value=(plan, False)):
                        with self.assertRaises(calls_db.AgentLimitError) as error:
                            calls_db.create_agent({"name": "Extra agent"}, 901)
                    self.assertIn(f"includes {cap}", str(error.exception))
                    self.assertIn("upgrade", str(error.exception))
                    self.assertFalse(any("INSERT" in c.args[0] for c in conn.execute.call_args_list))

    def test_knowledge_below_at_and_above_caps(self):
        for plan, cap in (("starter", 1), ("growth", 5), ("scale", 15)):
            for count in (cap - 1, cap, cap + 1):
                with self.subTest(plan=plan, count=count):
                    conn = MagicMock()
                    conn.execute.return_value.fetchone.side_effect = [{"id": 901}, {"plan": plan, "is_platform_owner": 0}, {"c": count}]
                    with patch.object(calls_db, "_connect", return_value=conn):
                        if count >= cap:
                            with self.assertRaises(plan_policy.EntitlementError):
                                calls_db.create_knowledge_base("FAQ", 901)
                        else:
                            calls_db.create_knowledge_base("FAQ", 901)
                    self.assertEqual(any("INSERT" in c.args[0] for c in conn.execute.call_args_list), count < cap)
                    self.assertFalse(any("DELETE" in c.args[0] for c in conn.execute.call_args_list))

    def test_http_mutations_check_real_plan_policy(self):
        for plan in ("starter", "growth", "scale"):
            for path, feature in (("/campaigns", "campaigns"), ("/inbound-routes", "inbound_routing"), ("/project-listings/sync", "live_catalog"), ("/knowledge-bases", "knowledge"), ("/integrations/webhook", "crm"), ("/integrations/zoho_crm/test", "crm")):
                with self.subTest(plan=plan, path=path):
                    conn = MagicMock()
                    conn.execute.return_value.fetchone.return_value = {"plan": plan, "is_platform_owner": 0}
                    db = SimpleNamespace(require_feature=lambda aid, f: plan_policy.require(conn, aid, f), get_user_by_id=lambda uid: {"role": "member"}, ROLE_RANK={"member": 1})
                    fn = function_from_file(ROOT / "server/token_api.py", "current_user", {"Request": Request, "calls_db": db, "plan_policy": plan_policy, "HTTPException": HTTPException})
                    request = SimpleNamespace(state=SimpleNamespace(user_id=1, account_id=901, impersonator_id=None), method="POST", url=SimpleNamespace(path=path))
                    if plan_policy.allowed(plan, feature):
                        self.assertEqual(fn(request)["account_id"], 901)
                    else:
                        with self.assertRaises(HTTPException) as error:
                            fn(request)
                        self.assertEqual(error.exception.status_code, 403)

    def test_viewer_cannot_mutate_core_resources(self):
        db = SimpleNamespace(get_user_by_id=lambda uid: {"role": "viewer"}, ROLE_RANK={"viewer": 0, "member": 1})
        fn = function_from_file(ROOT / "server/token_api.py", "current_user", {"Request": Request, "calls_db": db, "plan_policy": plan_policy, "HTTPException": HTTPException})
        for path in ("/agents", "/knowledge-bases", "/campaigns", "/contacts", "/appointments"):
            with self.subTest(path=path), self.assertRaises(HTTPException) as error:
                fn(SimpleNamespace(state=SimpleNamespace(user_id=1, account_id=901, impersonator_id=None), method="POST", url=SimpleNamespace(path=path)))
            self.assertEqual(error.exception.status_code, 403)

    def test_runtime_voice_tiers_and_retained_knowledge(self):
        # Synthetic catalog isolates tier logic, not provider synthesis support.
        for plan in ("starter", "growth", "scale"):
            for tier in ("standard", "premium"):
                with self.subTest(plan=plan, tier=tier):
                    conn = MagicMock()
                    conn.execute.return_value.fetchone.side_effect = [{"plan": plan, "is_platform_owner": 0}, {"plan": plan, "is_platform_owner": 0}, {"c": 1}]
                    catalog = SimpleNamespace(get_voice=lambda voice: {"tier": tier}, allowed_tiers_for_plan=lambda p: ["standard", "premium"] if p == "scale" else ["standard"])
                    config = {"id": 1, "kb_id": 7, "voice": "synthetic"}
                    if tier == "premium" and plan != "scale":
                        with self.assertRaises(plan_policy.EntitlementError):
                            plan_policy.validate_agent(conn, 901, config, catalog)
                    else:
                        plan_policy.validate_agent(conn, 901, config, catalog)

    def test_concurrency_boundaries_for_each_plan(self):
        limits = {"starter": 5, "growth": 15, "scale": 30}
        for plan, cap in limits.items():
            for count in (cap - 1, cap, cap + 1):
                with self.subTest(plan=plan, count=count):
                    conn = MagicMock()
                    conn.execute.return_value.fetchone.side_effect = [{"plan": plan, "is_platform_owner": 0}, None, {"c": count}]
                    fn = function_from_file(ROOT / "agent/db.py", "try_start_call", {"dbconn": SimpleNamespace(connect=lambda: conn), "psycopg": psycopg, "plan_policy": plan_policy, "logger": logging.getLogger("test"), "voice_catalog": None, "CONCURRENT_CALL_LIMITS": limits})
                    self.assertEqual(fn("synthetic-room", 901), count < cap)
                    self.assertEqual(any("INSERT" in c.args[0] for c in conn.execute.call_args_list), count < cap)

    def test_existing_api_keys_after_plan_change(self):
        for plan in ("starter", "growth", "scale"):
            with self.subTest(plan=plan):
                conn = MagicMock()
                conn.execute.return_value.fetchone.side_effect = [{"id": 7, "account_id": 901}, {"plan": plan, "is_platform_owner": 0}]
                with patch.object(calls_db, "_connect", return_value=conn):
                    self.assertEqual(calls_db.resolve_api_key(calls_db._API_KEY_PREFIX + "local_synthetic"), 901 if plan == "scale" else None)
                self.assertTrue(any("SELECT plan, is_platform_owner" in c.args[0] for c in conn.execute.call_args_list))
                self.assertEqual(any("UPDATE api_keys" in c.args[0] for c in conn.execute.call_args_list), plan == "scale")

    def test_downgraded_excess_agent_is_retained_but_cannot_run(self):
        catalog = SimpleNamespace(get_voice=lambda v: {"tier": "standard"}, allowed_tiers_for_plan=lambda p: ["standard"])
        for agent_id in (1, 2):
            with self.subTest(agent_id=agent_id):
                conn = MagicMock()
                conn.execute.return_value.fetchone.side_effect = [{"plan": "starter", "is_platform_owner": 0}, {"c": 2}]
                conn.execute.return_value.fetchall.return_value = [{"id": 1}]
                if agent_id == 1:
                    plan_policy.validate_agent(conn, 901, {"id": agent_id}, catalog)
                else:
                    with self.assertRaises(plan_policy.EntitlementError):
                        plan_policy.validate_agent(conn, 901, {"id": agent_id}, catalog)
                self.assertFalse(any("DELETE" in c.args[0] or "UPDATE" in c.args[0] for c in conn.execute.call_args_list))

    def test_existing_room_is_not_reassigned_to_another_tenant(self):
        for owner in (901, 902):
            with self.subTest(room_owner=owner):
                conn = MagicMock()
                conn.execute.return_value.fetchone.side_effect = [{"plan": "starter", "is_platform_owner": 0}, {"account_id": owner}]
                fn = function_from_file(ROOT / "agent/db.py", "try_start_call", {"dbconn": SimpleNamespace(connect=lambda: conn), "psycopg": psycopg, "plan_policy": plan_policy, "logger": logging.getLogger("test"), "voice_catalog": None, "CONCURRENT_CALL_LIMITS": {"starter": 5}})
                self.assertEqual(fn("same-room", 901), owner == 901)
                self.assertFalse(any("INSERT" in c.args[0] for c in conn.execute.call_args_list))


if __name__ == "__main__":
    unittest.main()
