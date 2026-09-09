"""RealEstateAgent must actually construct. Nothing tested that until now.

Commit 2841656 added `is_phone=(call_context or {}).get("call_type")` inside
__init__, where call_context is a LOCAL of entrypoint() and not in scope. That
is a NameError on every single call, and it was deployed to both workers — the
19:05 test call produced no call record at all because the agent died before
the session started.

The whole suite passed the entire time. 122 tests, and not one of them built
the agent: test_held_opening uses a stand-in class, the persona tests call the
prompt builders directly. A crash in __init__ was invisible.
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

# A config with no external dependencies — enough to exercise __init__.
BASE = {
    "id": 1, "account_id": 1, "name": "Test", "model": "gpt-4.1-mini",
    "voice": "shubh", "language": "hi-IN", "tone": "balanced",
    "system_prompt": "You are a test agent.", "enabled_functions": "end_call",
}


class ItConstructs(unittest.TestCase):
    def test_outbound_phone(self):
        a = main.RealEstateAgent(dict(BASE), direction="outbound", call_type="phone")
        self.assertEqual(a._direction, "outbound")
        self.assertTrue(a.instructions)

    def test_inbound_phone(self):
        main.RealEstateAgent(dict(BASE), direction="inbound", call_type="phone")

    def test_widget(self):
        # No direction at all — the browser path. This must not assume the
        # phone-only fields exist.
        main.RealEstateAgent(dict(BASE), call_type="widget")

    def test_browser_with_nothing_passed(self):
        # The most permissive call shape. If __init__ reads anything that
        # only exists on a phone call, this is where it shows.
        main.RealEstateAgent(dict(BASE))


class TheChannelReachesTheStt(unittest.TestCase):
    """Sarvam's per-channel VAD silence: 500ms telephony, 300ms browser."""

    def test_call_type_is_an_explicit_parameter(self):
        import inspect
        sig = inspect.signature(main.RealEstateAgent.__init__)
        self.assertIn("call_type", sig.parameters,
                      "call_type must be passed in, not read from a caller's local")

    def test_entrypoint_passes_it(self):
        import inspect
        src = inspect.getsource(main)
        self.assertIn('call_type=call_context.get("call_type")', src)

    def test_init_does_not_reach_for_call_context(self):
        # The actual bug: reading a name that only exists in entrypoint().
        # Checks CODE, not prose — the comment above the parameter explains
        # the bug and legitimately mentions the name.
        import ast, inspect
        tree = ast.parse(inspect.getsource(main.RealEstateAgent.__init__).strip())
        names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
        self.assertNotIn("call_context", names,
                         "__init__ reads call_context, which is a local of entrypoint()")


if __name__ == "__main__":
    unittest.main(verbosity=2)
