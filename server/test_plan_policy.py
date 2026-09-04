"""Offline commercial-policy regression tests. Never connect to a database."""
import ast
import logging
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock

import plan_policy

ROOT = Path(__file__).resolve().parent.parent


def function_from_file(path, name, namespace):
    tree = ast.parse(path.read_text())
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name)
    node.decorator_list = []
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), "exec"), namespace)
    return namespace[name]


class PolicyTests(unittest.TestCase):
    def test_knowledge_limits_and_owner_exemption(self):
        for plan, expected in (("starter", 1), ("growth", 5), ("scale", 15), ("unknown", 0)):
            conn = MagicMock()
            conn.execute.return_value.fetchone.return_value = {"plan": plan, "is_platform_owner": 0}
            self.assertEqual(plan_policy.account_policy(conn, 1)["knowledgeBaseLimit"], expected)
        conn.execute.return_value.fetchone.return_value = {"plan": "starter", "is_platform_owner": 1}
        self.assertIsNone(plan_policy.account_policy(conn, 1)["knowledgeBaseLimit"])

    def test_knowledge_creation_cap_is_locked_and_tenant_scoped(self):
        import calls_db
        from unittest.mock import patch
        for count, blocked in ((0, False), (1, True), (3, True)):
            conn = MagicMock()
            conn.execute.return_value.fetchone.side_effect = [
                {"id": 9}, {"plan": "starter", "is_platform_owner": 0}, {"c": count}]
            with patch.object(calls_db, "_connect", return_value=conn):
                if blocked:
                    with self.assertRaises(plan_policy.EntitlementError):
                        calls_db.create_knowledge_base("Business FAQs", 9)
                else:
                    calls_db.create_knowledge_base("Business FAQs", 9)
            self.assertIn("FOR UPDATE", conn.execute.call_args_list[0].args[0])
            self.assertEqual(conn.execute.call_args_list[0].args[1], (9,))
            queries = [c.args[0] for c in conn.execute.call_args_list]
            self.assertEqual(any("INSERT INTO knowledge_bases" in q for q in queries), not blocked)
            self.assertFalse(any("DELETE" in q for q in queries))

    def test_feature_matrix(self):
        for plan in plan_policy.PLANS:
            for feature in ("recording", "transfer", "functions", "memory", "calendar", "widget"):
                self.assertTrue(plan_policy.allowed(plan, feature))
            self.assertEqual(plan_policy.allowed(plan, "campaigns"), plan != "starter")
            self.assertEqual(plan_policy.allowed(plan, "api"), plan == "scale")
            self.assertTrue(plan_policy.allowed(plan, "knowledge"))
            self.assertTrue(plan_policy.allowed(plan, "basic_inbound"))
            self.assertEqual(plan_policy.allowed(plan, "live_catalog"), plan != "starter")

    def test_unknown_values_fail_closed(self):
        self.assertFalse(plan_policy.allowed("unknown", "api"))
        self.assertFalse(plan_policy.allowed("scale", "typo", owner=True))

    def test_owner_exemption_is_explicit(self):
        self.assertTrue(plan_policy.allowed("starter", "api", owner=True))
        self.assertFalse(plan_policy.allowed("starter", "api"))

    def test_existing_api_key_rechecks_plan(self):
        import calls_db
        from unittest.mock import patch
        conn = MagicMock()
        conn.execute.return_value.fetchone.side_effect = [
            {"id": 7, "account_id": 3}, {"plan": "starter", "is_platform_owner": 0}]
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertIsNone(calls_db.resolve_api_key(calls_db._API_KEY_PREFIX + "test_offline"))
        self.assertTrue(any("SELECT plan, is_platform_owner" in str(c) for c in conn.execute.call_args_list))
        self.assertFalse(any("UPDATE api_keys" in str(c) for c in conn.execute.call_args_list))

    def test_admission_database_failure_does_not_grant_slot(self):
        import psycopg
        connect = MagicMock(side_effect=psycopg.OperationalError("offline"))
        ns = {"dbconn": SimpleNamespace(connect=connect), "psycopg": psycopg,
              "plan_policy": plan_policy, "logger": logging.getLogger("test"),
              "voice_catalog": None, "CONCURRENT_CALL_LIMITS": {"starter": 5}}
        fn = function_from_file(ROOT / "agent/db.py", "try_start_call", ns)
        self.assertFalse(fn("room", 1))

    def test_admission_locks_account_and_refuses_full_capacity(self):
        import psycopg
        conn = MagicMock()
        conn.execute.return_value.fetchone.side_effect = [
            {"plan": "starter", "is_platform_owner": 0}, None, {"c": 5}]
        ns = {"dbconn": SimpleNamespace(connect=lambda: conn), "psycopg": psycopg,
              "plan_policy": plan_policy, "logger": logging.getLogger("test"),
              "voice_catalog": None, "CONCURRENT_CALL_LIMITS": {"starter": 5}}
        fn = function_from_file(ROOT / "agent/db.py", "try_start_call", ns)
        self.assertFalse(fn("room", 1))
        self.assertIn("FOR UPDATE", conn.execute.call_args_list[0].args[0])
        self.assertFalse(any("INSERT" in str(c) for c in conn.execute.call_args_list))

    def test_unknown_voice_cannot_bypass_catalog(self):
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = {"plan": "scale", "is_platform_owner": 0}
        catalog = SimpleNamespace(get_voice=lambda _: None)
        with self.assertRaises(plan_policy.EntitlementError):
            plan_policy.validate_agent(conn, 1, {"voice": "elevenlabs:unknown"}, catalog)

    def test_checkout_requires_explicit_live_or_sandbox_approval(self):
        import os
        import razorpay_client
        from unittest.mock import patch
        with patch.dict(os.environ, {"RAZORPAY_KEY_ID": "rzp_test_fake", "RAZORPAY_KEY_SECRET": "fake"}, clear=True):
            self.assertFalse(razorpay_client.checkout_ready())
            os.environ["BILLING_CHECKOUT_ENABLED"] = "true"
            self.assertFalse(razorpay_client.checkout_ready())
            os.environ["BILLING_ALLOW_TEST_CHECKOUT"] = "true"
            self.assertTrue(razorpay_client.checkout_ready())
            os.environ["RAZORPAY_KEY_ID"] = "rzp_live_fake"
            del os.environ["BILLING_ALLOW_TEST_CHECKOUT"]
            self.assertTrue(razorpay_client.checkout_ready())

    def test_retained_catalog_is_not_used_after_downgrade(self):
        conn = MagicMock()
        conn.execute.return_value.fetchone.return_value = {"plan": "starter", "is_platform_owner": 0}
        with self.assertRaises(plan_policy.EntitlementError):
            plan_policy.validate_agent(conn, 1, {"live_catalog_enabled": True}, None)

    def test_http_feature_gates_preserve_calendar_and_reads(self):
        from fastapi import HTTPException, Request
        db = SimpleNamespace(require_feature=MagicMock(side_effect=plan_policy.EntitlementError("Upgrade")))
        ns = {"Request": Request, "calls_db": db, "plan_policy": plan_policy, "HTTPException": HTTPException}
        fn = function_from_file(ROOT / "server/token_api.py", "current_user", ns)
        state = SimpleNamespace(user_id=2, account_id=1, impersonator_id=99)
        for method, path in [("GET", "/knowledge-bases"), ("DELETE", "/knowledge-bases/1"), ("PATCH", "/integrations/google_calendar")]:
            fn(SimpleNamespace(state=state, method=method, url=SimpleNamespace(path=path)))
        db.require_feature.assert_not_called()
        with self.assertRaises(HTTPException) as caught:
            fn(SimpleNamespace(state=state, method="POST", url=SimpleNamespace(path="/campaigns")))
        self.assertEqual(caught.exception.status_code, 403)

    def test_unknown_plan_cannot_admit_new_calls(self):
        import psycopg
        conn = MagicMock()
        conn.execute.return_value.fetchone.side_effect = [
            {"plan": "invalid", "is_platform_owner": 0}, None, {"c": 0}]
        ns = {"dbconn": SimpleNamespace(connect=lambda: conn), "psycopg": psycopg,
              "plan_policy": plan_policy, "logger": logging.getLogger("test"),
              "voice_catalog": None, "CONCURRENT_CALL_LIMITS": {"starter": 5}}
        fn = function_from_file(ROOT / "agent/db.py", "try_start_call", ns)
        self.assertFalse(fn("room", 1))


if __name__ == "__main__":
    unittest.main()
