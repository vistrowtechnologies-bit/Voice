"""Public integration agent picker is scoped, authenticated, and minimal."""
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from fastapi import HTTPException, Request

from test_plan_policy import function_from_file


ROOT = Path(__file__).resolve().parent.parent


class ArthaLeadsAgentPickerTests(unittest.TestCase):
    def _endpoint(self, *, token_account=42, agents=None, knowledge_bases=None):
        db = SimpleNamespace(
            account_id_for_lead_webhook_token=Mock(return_value=token_account),
            list_agents=Mock(return_value=agents or []),
            list_knowledge_bases=Mock(return_value=knowledge_bases or []),
        )
        fn = function_from_file(
            ROOT / "server/token_api.py",
            "leads_inbound_agents",
            {"Request": Request, "calls_db": db, "HTTPException": HTTPException},
        )
        return fn, db

    def test_returns_only_active_agents_with_a_named_knowledge_base(self):
        fn, db = self._endpoint(
            agents=[
                {"id": 7, "name": "Siya Khopoli", "status": "active", "kbId": 3,
                 "systemPrompt": "private prompt"},
                {"id": 8, "name": "Paused", "status": "inactive", "kbId": 3},
                {"id": 9, "name": "No knowledge", "status": "active", "kbId": None},
            ],
            knowledge_bases=[{"id": 3, "name": "Khopoli project"}],
        )
        request = SimpleNamespace(headers={"x-vistrow-webhook-token": "account-key"})

        result = fn(42, request)

        self.assertEqual(result, {"agents": [{
            "id": "7", "name": "Siya Khopoli", "knowledge_base": "Khopoli project"
        }]})
        self.assertNotIn("systemPrompt", str(result))
        db.account_id_for_lead_webhook_token.assert_called_once_with("account-key")
        db.list_agents.assert_called_once_with(42)
        db.list_knowledge_bases.assert_called_once_with(42)

    def test_accepts_bearer_key_without_putting_secret_in_url(self):
        fn, db = self._endpoint()
        request = SimpleNamespace(headers={"authorization": "Bearer secret-key"})

        self.assertEqual(fn(42, request), {"agents": []})
        db.account_id_for_lead_webhook_token.assert_called_once_with("secret-key")

    def test_wrong_account_or_bad_key_is_not_found(self):
        fn, db = self._endpoint(token_account=41)
        request = SimpleNamespace(headers={"x-vistrow-webhook-token": "wrong-key"})

        with self.assertRaises(HTTPException) as error:
            fn(42, request)

        self.assertEqual(error.exception.status_code, 404)
        db.list_agents.assert_not_called()
        db.list_knowledge_bases.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
