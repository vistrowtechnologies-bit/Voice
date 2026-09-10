"""The three gaps between our config and Sarvam's telephony reference.

docs.sarvam.ai/api/integration/livekit-production-best-practices

Verified twice, deliberately by two different routes, because a source grep
proves only that a line was typed:

  1. the values are read out of main.py's REAL AgentSession call by parsing
     it, so a test cannot pass against a copy that drifted from the source;
  2. those same values are handed to a live AgentSession and read back from
     session.options, so the framework is shown to accept and resolve them
     rather than silently ignore a misnamed key — which is exactly how
     turn_detection was dropped on the floor once before (see the comment on
     turn_handling in main.py).
"""
import ast
import asyncio
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

_SRC = io.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py"),
               encoding="utf-8").read()
_TREE = ast.parse(_SRC)


def _agent_session_call() -> ast.Call:
    for node in ast.walk(_TREE):
        if isinstance(node, ast.Call) and getattr(node.func, "id", "") == "AgentSession":
            return node
    raise AssertionError("no AgentSession(...) call found in main.py")


def _kwarg(call: ast.Call, name: str) -> ast.expr:
    for kw in call.keywords:
        if kw.arg == name:
            return kw.value
    raise AssertionError(f"AgentSession(...) has no {name}= argument")


def _turn_handling_key(name: str) -> ast.expr:
    th = _kwarg(_agent_session_call(), "turn_handling")
    assert isinstance(th, ast.Call), "turn_handling is no longer TurnHandlingOptions(...)"
    return _kwarg(th, name)


class ReadFromTheRealSource(unittest.TestCase):
    def test_max_tool_steps_is_2(self):
        self.assertEqual(ast.literal_eval(_kwarg(_agent_session_call(), "max_tool_steps")), 2)

    def test_user_turn_limit_max_duration_is_45(self):
        self.assertEqual(ast.literal_eval(_turn_handling_key("user_turn_limit")),
                         {"max_duration": 45.0})

    def test_away_timeout_is_20_on_a_phone_call(self):
        """Evaluate main.py's own away_timeout expression, not a copy of it."""
        assign = None
        for node in ast.walk(_TREE):
            if (isinstance(node, ast.Assign) and len(node.targets) == 1
                    and getattr(node.targets[0], "id", "") == "away_timeout"):
                assign = node
        self.assertIsNotNone(assign, "away_timeout assignment not found")
        expr = compile(ast.Expression(assign.value), "<away_timeout>", "eval")

        def run(is_phone, configured_ms=0, is_demo=False):
            return eval(expr, {}, {  # noqa: S307 - main.py's own expression
                "_is_phone_call": is_phone,
                "silence_reminder_ms": configured_ms,
                "cfg": {"is_platform_demo": is_demo},
            })

        self.assertEqual(run(is_phone=True), 20.0)          # Sarvam's telephony value
        self.assertEqual(run(is_phone=False), 6.5)          # widget tenant, unchanged
        self.assertEqual(run(is_phone=False, is_demo=True), 18.0)  # demo, unchanged
        # An operator's own setting still wins on every channel.
        self.assertEqual(run(is_phone=True, configured_ms=9000), 9.0)


class TheFrameworkActuallyAcceptsThem(unittest.TestCase):
    """A key the framework does not recognise is silently ignored, not raised."""

    def setUp(self):
        # AgentSession.__init__ calls asyncio.get_event_loop(). Run alone
        # these passed; under full discovery an earlier test had already
        # closed the loop and all three errored. Own the loop here so the
        # result does not depend on test order.
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)

    def tearDown(self):
        self._loop.close()
        asyncio.set_event_loop(None)

    @staticmethod
    def _session():
        from livekit.agents import AgentSession
        from livekit.agents.voice.turn import TurnHandlingOptions

        return AgentSession(
            vad=None,
            turn_handling=TurnHandlingOptions(
                turn_detection="stt",
                user_turn_limit=ast.literal_eval(_turn_handling_key("user_turn_limit")),
            ),
            max_tool_steps=ast.literal_eval(_kwarg(_agent_session_call(), "max_tool_steps")),
        )

    def test_user_turn_limit_resolves_on_the_session(self):
        opts = self._session().options.turn_handling["user_turn_limit"]
        self.assertEqual(opts.get("max_duration"), 45.0)

    def test_max_tool_steps_resolves_on_the_session(self):
        self.assertEqual(self._session().options.max_tool_steps, 2)

    def test_the_default_would_have_been_different(self):
        """Guards against a value that only looks set because it is the default."""
        from livekit.agents import AgentSession

        bare = AgentSession(vad=None)
        self.assertEqual(bare.options.max_tool_steps, 3)
        self.assertIsNone(bare.options.turn_handling["user_turn_limit"].get("max_duration"))


if __name__ == "__main__":
    unittest.main()
