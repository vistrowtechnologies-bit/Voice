"""The agent has to know it can transfer, not just be handed the tool.

Call 1035 (2026-09-21): a caller asked four separate times to be put through
to a colleague, and the agent replied that transferring was not possible each
time — without ever invoking transfer_call. The tool was registered and the
number was set; only the prompt was silent, while a standing rule tells the
agent never to offer what no tool supports.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import main


class TransferInstructions(unittest.TestCase):
    def test_a_configured_number_adds_the_instruction(self):
        text = main._transfer_instructions({"transfer_phone": "+917020950304"})
        self.assertIn("transfer_call", text)
        self.assertIn("CAN transfer", text)

    def test_it_forbids_the_refusal_the_agent_actually_gave(self):
        text = main._transfer_instructions({"transfer_phone": "+917020950304"})
        self.assertIn("Never tell them a transfer is impossible", text)
        self.assertIn("never offer a callback instead", text)

    def test_no_number_adds_nothing(self):
        self.assertEqual(main._transfer_instructions({"transfer_phone": ""}), "")
        self.assertEqual(main._transfer_instructions({}), "")
        self.assertEqual(main._transfer_instructions({"transfer_phone": "   "}), "")

    def test_it_matches_the_tool_registration_rule(self):
        # Both must key off the same thing, or the agent is told it can do
        # something it has no tool for (or the reverse, which is call 1035).
        config = {"transfer_phone": "+917020950304", "enabled_functions": "end_call"}
        names = {getattr(t, "__name__", getattr(getattr(t, "__wrapped__", None), "__name__", ""))
                 for t in main._build_tools(config)}
        self.assertIn("transfer_call", names)
        self.assertNotEqual(main._transfer_instructions(config), "")


class ItReachesEveryAgent(unittest.TestCase):
    """Whatever persona an agent runs — the built-in one or an operator's own
    system_prompt, which replaces it wholesale — the transfer guidance is
    appended on the one shared path, so no agent can be handed the tool
    without being told it has it."""

    BASE = {
        "id": 1, "account_id": 1, "name": "Test", "model": "gpt-4.1-mini",
        "voice": "shubh", "language": "hi-IN", "tone": "balanced",
        "enabled_functions": "end_call", "transfer_phone": "+917020950304",
    }

    def _instructions(self, **overrides):
        config = dict(self.BASE, **overrides)
        return main.RealEstateAgent(config, direction="outbound", call_type="phone").instructions

    def test_custom_operator_prompt_still_gets_it(self):
        text = self._instructions(system_prompt="You are a test agent.")
        self.assertIn("transfer_call", text)
        self.assertIn("Putting someone through", text)

    def test_built_in_persona_gets_it(self):
        text = self._instructions(system_prompt="")
        self.assertIn("transfer_call", text)

    def test_inbound_calls_get_it_too(self):
        config = dict(self.BASE, system_prompt="You are a test agent.")
        text = main.RealEstateAgent(config, direction="inbound", call_type="phone").instructions
        self.assertIn("transfer_call", text)

    def test_an_agent_without_a_number_is_never_told_it_can_transfer(self):
        text = self._instructions(system_prompt="You are a test agent.", transfer_phone="")
        self.assertNotIn("Putting someone through", text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
