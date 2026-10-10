"""Help chat spends OpenAI money per message; one user can't loop it."""
import ast
import os
import time
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def load(limits):
    node = next(n for n in ast.walk(TREE) if isinstance(n, ast.FunctionDef) and n.name == "_help_chat_rate_limited")
    ns = {"time": time, "_HELP_CHAT_LIMITS": limits, "_help_chat_calls": {}}
    exec(ast.get_source_segment(SOURCE, node), ns)
    return ns["_help_chat_rate_limited"]


class HelpChatRateLimit(unittest.TestCase):
    def test_burst_cap_then_recovers(self):
        limited = load(((60, 3), (86400, 100)))
        self.assertEqual([limited(1, now=t) for t in (0, 1, 2, 3)], [False, False, False, True])
        self.assertFalse(limited(1, now=61), "window has passed")

    def test_daily_cap(self):
        limited = load(((60, 100), (86400, 5)))
        results = [limited(1, now=i * 120) for i in range(6)]
        self.assertEqual(results, [False] * 5 + [True])

    def test_users_are_independent(self):
        limited = load(((60, 1), (86400, 100)))
        self.assertFalse(limited(1, now=0))
        self.assertTrue(limited(1, now=1))
        self.assertFalse(limited(2, now=1))

    def test_route_checks_before_calling_openai(self):
        node = next(n for n in ast.walk(TREE) if isinstance(n, ast.FunctionDef) and n.name == "help_chat_message")
        src = ast.get_source_segment(SOURCE, node)
        self.assertLess(src.index("_help_chat_rate_limited("), src.index("answer_help_question("))


if __name__ == "__main__":
    unittest.main()
