"""GPT-4 family retired 2026-10-14. Every OpenAI call site uses a GPT-5 model
with the parameters GPT-5.4 actually accepts (measured against the API that
day): max_completion_tokens not max_tokens, a token limit of at least 4 (1-2
are rejected with 400), and temperature only together with reasoning off."""
import os
import re
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "server"))
import plan_policy

CALL_SITES = [
    "server/widget_chat.py", "server/kb_extract.py", "server/call_intelligence.py",
    "server/agent_builder.py", "server/vendor_health.py", "server/llm_warmer.py",
    "agent/main.py",
]


def _code(path: str) -> str:
    """Source with comments stripped, so notes about the old models don't count."""
    with open(os.path.join(ROOT, path), encoding="utf-8") as fh:
        return "\n".join(line.split("#", 1)[0] for line in fh)


class NoGpt4ModelIsRequested(unittest.TestCase):
    def test_no_call_site_names_a_gpt4_model(self):
        for path in CALL_SITES:
            code = _code(path)
            # The successor map is the one place GPT-4 names may appear in code.
            code = code.replace("plan_policy.current_openai_model(model)", "")
            self.assertIsNone(re.search(r"[\"']gpt-4[\w.\-]*[\"']", code), path)

    def test_every_retired_name_has_a_gpt5_successor(self):
        for old in ("gpt-4o-mini", "gpt-4.1-nano", "gpt-4.1-mini", "gpt-4.1", "gpt-4o"):
            new = plan_policy.current_openai_model(old)
            self.assertTrue(new.startswith("gpt-5"), (old, new))
        self.assertEqual(plan_policy.current_openai_model("gpt-5.4-nano"), "gpt-5.4-nano")
        self.assertEqual(plan_policy.current_openai_model("sarvam/sarvam-105b-conversations"),
                         "sarvam/sarvam-105b-conversations")


class Gpt5Parameters(unittest.TestCase):
    def test_no_openai_request_uses_max_tokens(self):
        # Sarvam's API still takes max_tokens; only OpenAI requests may not.
        for path in ("server/widget_chat.py", "server/kb_extract.py", "server/call_intelligence.py",
                     "server/vendor_health.py", "server/llm_warmer.py"):
            for line in _code(path).splitlines():
                if '"max_tokens"' in line:
                    self.assertIn("sarvam", line, f"{path}: {line.strip()}")

    def test_token_limits_are_at_least_four(self):
        for path in ("server/vendor_health.py", "server/llm_warmer.py"):
            for value in re.findall(r'"max_completion_tokens":\s*(\d+)', _code(path)):
                self.assertGreaterEqual(int(value), 4, path)

    def test_temperature_only_with_reasoning_off(self):
        for path in ("server/widget_chat.py", "server/call_intelligence.py", "server/agent_builder.py"):
            code = _code(path)
            if '"temperature"' in code and "gpt-5" in code:
                self.assertIn('"reasoning_effort": "none"', code, path)


if __name__ == "__main__":
    unittest.main()
