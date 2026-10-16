"""Support can reset a locked-out user's two-step login: only for a user in
that account who has it on, with a reason, audited, and the user is emailed."""

import ast
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

TOKEN_API = Path(__file__).resolve().parent / "token_api.py"


def load(namespace: dict) -> dict:
    """Only the route and its helpers: importing token_api starts every
    background worker and needs a database (test_admin_impersonation does the same)."""
    wanted = {"admin_reset_two_step", "_admin_reason", "AdminReasonRequest"}
    tree = ast.parse(TOKEN_API.read_text())
    nodes = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in wanted:
            node.decorator_list = []
            nodes.append(node)
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(TOKEN_API), "exec"), namespace)
    return namespace


ADMIN = {"user_id": 1, "email": "owner@example.test"}
REQUEST = SimpleNamespace(headers={"user-agent": "test"})


class ResetTwoStepTests(unittest.TestCase):
    def _call(self, user, mfa, reason="Lost phone and codes, verified by call"):
        calls_db, admin_db, email = MagicMock(), MagicMock(), MagicMock()
        calls_db.get_user_by_id.return_value = user
        calls_db.get_user_mfa.return_value = mfa
        admin_db.account_detail.return_value = {"ok": True}
        ns = load({
            "BaseModel": BaseModel, "HTTPException": HTTPException, "Depends": Depends, "Request": Request,
            "require_platform_owner": None, "calls_db": calls_db, "admin_db": admin_db,
            "_admin_account_or_404": lambda account_id: {}, "_email_security_notice": email,
        })
        result = ns["admin_reset_two_step"](7, 42, ns["AdminReasonRequest"](reason=reason), REQUEST, ADMIN)
        return result, calls_db.disable_mfa, calls_db.record_security_event, admin_db.write_audit, email

    def test_resets_audits_and_emails(self) -> None:
        result, disable, event, audit, email = self._call(
            {"account_id": 7, "email": "user@example.test"}, {"enabled_at": "2026-10-01"}
        )
        self.assertEqual(result, {"ok": True})
        disable.assert_called_once_with(42)
        self.assertEqual(event.call_args.args[:2], (42, "mfa_reset_by_support"))
        self.assertEqual(audit.call_args.args[2:4], ("reset_two_step", 7))
        self.assertIn("user@example.test", audit.call_args.kwargs["detail"])
        email.assert_called_once()

    def test_refuses_user_from_another_account(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            self._call({"account_id": 8, "email": "x@example.test"}, {"enabled_at": "2026-10-01"})
        self.assertEqual(ctx.exception.status_code, 404)

    def test_refuses_when_already_off_or_no_reason(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            self._call({"account_id": 7}, {"enabled_at": None})
        self.assertEqual(ctx.exception.status_code, 400)
        with self.assertRaises(HTTPException):
            self._call({"account_id": 7}, {"enabled_at": "2026-10-01"}, reason="no")


if __name__ == "__main__":
    unittest.main()
