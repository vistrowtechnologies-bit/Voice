"""Tenant agents must not be sent platform-only tools.

capture_platform_lead records a lead for Vistrow Voice itself; only the
platform demos (is_platform_demo) can use it. Sending its schema to every
tenant request cost ~900 chars per LLM request (token audit 2026-10-12).
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")

import main

PLATFORM_ONLY = {"capture_platform_lead"}

TENANT = {
    "id": 1, "account_id": 5, "name": "Test", "model": "gpt-4.1-mini",
    "voice": "shubh", "language": "hi-IN", "tone": "balanced",
    "system_prompt": "You are a test agent.", "enabled_functions": "",
    "_compliance_config": {},
}


def tool_names(config):
    return {
        getattr(t, "__name__", getattr(getattr(t, "__wrapped__", None), "__name__", ""))
        for t in main._build_tools(config)
    }


class PlatformOnlyTools(unittest.TestCase):
    def test_tenant_agent_gets_no_platform_only_tools(self):
        names = tool_names(dict(TENANT))
        self.assertFalse(names & PLATFORM_ONLY, names & PLATFORM_ONLY)
        # The tenant lead tools are still there.
        self.assertIn("log_lead", names)
        self.assertIn("switch_reply_language", names)

    def test_plain_platform_demo_keeps_capture_platform_lead(self):
        names = tool_names(dict(TENANT, is_platform_demo=True))
        self.assertIn("capture_platform_lead", names)

    def test_industry_roleplay_demo_keeps_capture_platform_lead(self):
        names = tool_names(dict(TENANT, is_platform_demo=True, public_demo_slug="healthcare"))
        self.assertIn("capture_platform_lead", names)

    def test_tenant_prompt_does_not_mention_the_missing_tool(self):
        agent = main.RealEstateAgent(dict(TENANT))
        self.assertNotIn("capture_platform_lead —", agent.instructions)
        self.assertIn("log_lead", agent.instructions)

    def test_platform_demo_prompt_still_explains_it(self):
        agent = main.RealEstateAgent(dict(TENANT, is_platform_demo=True))
        self.assertIn("Vistrow Voice platform-assistant calls", agent.instructions)


if __name__ == "__main__":
    unittest.main(verbosity=2)
