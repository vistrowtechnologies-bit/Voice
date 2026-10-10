"""Every agent setting the dashboard sends must be a column update_agent writes.

welcome_message_outbound and noise_cancellation were mapped in
_AGENT_CAMEL_TO_SNAKE but missing from _AGENT_FIELDS, so update_agent's
`if column not in _AGENT_FIELDS: continue` dropped them without an error.
"""
import ast
import os
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "calls_db.py"), encoding="utf-8") as handle:
    TREE = ast.parse(handle.read())


def module_constant(name: str):
    for node in TREE.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise KeyError(name)


class AgentFieldsSaved(unittest.TestCase):
    def test_every_mapped_dashboard_field_is_writable(self):
        fields = set(module_constant("_AGENT_FIELDS"))
        mapped = set(module_constant("_AGENT_CAMEL_TO_SNAKE").values())
        self.assertEqual(sorted(mapped - fields), [])

    def test_outbound_welcome_and_noise_suppression_are_writable(self):
        fields = set(module_constant("_AGENT_FIELDS"))
        self.assertIn("welcome_message_outbound", fields)
        self.assertIn("noise_cancellation", fields)


if __name__ == "__main__":
    unittest.main()
