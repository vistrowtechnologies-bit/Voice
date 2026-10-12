"""Facebook Lead Ads and WhatsApp are switched off for NEW connections, while
an account that already has one connected can still update or disconnect it.
Route functions are lifted out of token_api.py (no DB, no network)."""
import ast
import os
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    TREE = ast.parse(handle.read())


class HTTPException(Exception):
    def __init__(self, status_code, detail=None):
        self.status_code, self.detail = status_code, detail


def load(*names):
    nodes = [n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in names]
    assert len(nodes) == len(names)
    for n in nodes:
        n.decorator_list = []
    calls_db = mock.Mock()
    ns = {"HTTPException": HTTPException, "calls_db": calls_db, "Body": lambda *a, **k: None,
          "RedirectResponse": object, "Depends": lambda *a, **k: None, "require_role": lambda r: None}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "token_api.py", "exec"), ns)
    return ns, calls_db


class NewConnectionGuard(unittest.TestCase):
    def test_new_whatsapp_connection_is_rejected(self):
        ns, db = load("_require_integration_connectable", "update_integration")
        db.integration_accepts_connect.return_value = False
        with self.assertRaises(HTTPException) as ctx:
            ns["update_integration"]("whatsapp", {"status": "connected", "config": {"url": "https://x.test"}}, {"account_id": 1})
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not available yet", ctx.exception.detail)
        db.update_integration.assert_not_called()

    def test_existing_connection_can_be_updated(self):
        ns, db = load("_require_integration_connectable", "update_integration")
        db.integration_accepts_connect.return_value = True
        ns["update_integration"]("whatsapp", {"status": "connected", "config": {"url": "https://y.test"}}, {"account_id": 1})
        db.update_integration.assert_called_once()

    def test_disconnect_is_always_allowed(self):
        ns, db = load("_require_integration_connectable", "update_integration")
        db.integration_accepts_connect.return_value = False
        ns["update_integration"]("facebook", {"status": "not_connected", "config": {}}, {"account_id": 1})
        db.update_integration.assert_called_once()

    def test_settings_on_unconnected_whatsapp_rejected(self):
        ns, db = load("_require_integration_connectable", "update_integration_settings")
        db.integration_accepts_connect.return_value = False
        with self.assertRaises(HTTPException) as ctx:
            ns["update_integration_settings"]("whatsapp", {"template": "hi"}, {"account_id": 1})
        self.assertEqual(ctx.exception.status_code, 400)
        db.update_integration_settings.assert_not_called()

    def test_facebook_start_rejected_for_new_account(self):
        ns, db = load("_require_integration_connectable", "integration_facebook_start")
        db.integration_accepts_connect.return_value = False
        with self.assertRaises(HTTPException) as ctx:
            ns["integration_facebook_start"]({"account_id": 1})
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Facebook Lead Ads", ctx.exception.detail)


class CopilotChoice(unittest.TestCase):
    def test_copilot_cannot_choose_unconnected_whatsapp(self):
        import copilot_tools
        with mock.patch.object(copilot_tools.calls_db, "integration_accepts_connect", side_effect=lambda a, k: k != "whatsapp"), \
             mock.patch.object(copilot_tools, "_agent", return_value={"name": "A"}), \
             mock.patch.object(copilot_tools, "_integration_names", return_value={"slack": "Slack"}):
            with self.assertRaises(copilot_tools.ActionError):
                copilot_tools._describe_integrations(1, {"agent_id": 1, "integration_keys": ["slack", "whatsapp"]})
            self.assertIn("Slack", copilot_tools._describe_integrations(1, {"agent_id": 1, "integration_keys": ["slack"]}))

    def test_helper_only_gates_the_two_keys(self):
        import calls_db
        self.assertEqual(calls_db.NEW_CONNECTIONS_UNAVAILABLE, frozenset({"facebook", "whatsapp"}))
        self.assertTrue(calls_db.integration_accepts_connect(1, "slack"))


if __name__ == "__main__":
    unittest.main()
