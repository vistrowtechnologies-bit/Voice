"""A transfer number must be enough to give the agent a transfer tool.

The dashboard states that transfer is "governed by whether a transfer number
is set", and offers no toggle for it — so transfer_call can only be missing
from enabled_functions by accident. Agent 26 was in exactly that state on
2026-09-21: a transfer number saved against an agent whose enabled_functions
read "end_call", which silently meant the agent could not transfer anyone.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import main
import tools as agent_tools


def tool_names(config):
    return {getattr(t, "__name__", getattr(getattr(t, "__wrapped__", None), "__name__", "")) for t in main._build_tools(config)}


class TransferRegistration(unittest.TestCase):
    def test_a_number_alone_registers_the_tool(self):
        # Agent 26's real shape: a number set, and a list that omits transfer_call.
        names = tool_names({"transfer_phone": "+917020950304", "enabled_functions": "end_call"})
        self.assertIn("transfer_call", names)

    def test_no_number_means_no_transfer_tool(self):
        names = tool_names({"transfer_phone": "", "enabled_functions": ""})
        self.assertNotIn("transfer_call", names)

    def test_blank_number_is_not_a_number(self):
        names = tool_names({"transfer_phone": "   ", "enabled_functions": "transfer_call"})
        self.assertNotIn("transfer_call", names)

    def test_default_all_on_still_works(self):
        names = tool_names({"transfer_phone": "+917020950304", "enabled_functions": ""})
        self.assertIn("transfer_call", names)

    def test_other_optional_tools_still_obey_the_list(self):
        names = tool_names({"transfer_phone": "+917020950304", "enabled_functions": "transfer_call"})
        self.assertNotIn("end_call", names)


if __name__ == "__main__":
    unittest.main(verbosity=2)
