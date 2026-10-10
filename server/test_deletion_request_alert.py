"""An account deletion request alerts the support inbox, not only the user."""
import ast
import html
import os
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def source_of(name):
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.FunctionDef) and n.name == name)
    return ast.get_source_segment(SOURCE, node)


def alert_with(send_ok):
    sent, errors = [], []
    email_sender = types.SimpleNamespace(
        FROM_SUPPORT="support@x",
        render_email=lambda **kw: kw["body_html"] + "|" + kw["cta_url"],
        send_email=lambda to, subject, body, sender: sent.append((to, subject, body)) or send_ok,
    )
    ns = {"html": html, "email_sender": email_sender, "_support_inbox": lambda: "team@x",
          "admin_db": types.SimpleNamespace(log_error=lambda msg, **kw: errors.append(msg))}
    exec(source_of("_email_deletion_request_alert"), ns)
    ns["_email_deletion_request_alert"]("https://app", 12, 7, "a<b>@x.in")
    return sent, errors


class DeletionAlert(unittest.TestCase):
    def test_support_inbox_is_emailed_with_a_link_to_the_admin_page(self):
        sent, errors = alert_with(True)
        self.assertEqual(sent[0][0], "team@x")
        self.assertIn("#12", sent[0][1])
        self.assertIn("https://app/admin/privacy-requests", sent[0][2])
        self.assertIn("a&lt;b&gt;@x.in", sent[0][2], "the address is escaped")
        self.assertEqual(errors, [])

    def test_failed_alert_is_recorded_in_system_health(self):
        _, errors = alert_with(False)
        self.assertEqual(len(errors), 1)

    def test_route_schedules_the_alert(self):
        self.assertIn("_email_deletion_request_alert", source_of("request_account_deletion"))


if __name__ == "__main__":
    unittest.main()
