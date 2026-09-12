"""The public latency selector may dispatch only the isolated lab worker."""
import ast
import os
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


class SarvamLatencyDispatch(unittest.TestCase):
    def test_profile_is_dispatched_only_to_the_dedicated_demo_worker(self):
        self.assertIn('_PLATFORM_DEMO_AGENT_NAME = "platform-demo"', SOURCE)
        dispatch = function_source("_demo_dispatch_kwargs")
        self.assertIn("pipeline_profile == _SARVAM_LATENCY_PROFILE", dispatch)
        self.assertIn("agent_name=_PLATFORM_DEMO_AGENT_NAME", dispatch)

    def test_only_allowlisted_profile_is_accepted(self):
        create_token = function_source("create_token")
        self.assertIn("pipeline_profile != _SARVAM_LATENCY_PROFILE", create_token)
        self.assertIn("Unknown pipeline profile", create_token)

    def test_profile_cannot_target_a_tenant_or_industry_demo(self):
        create_token = function_source("create_token")
        self.assertIn("pipeline_profile and (req.agentId is not None or req.demoSlug)", create_token)


if __name__ == "__main__":
    unittest.main()
