"""Preemptive generation must survive on_user_turn_completed.

Phone call 948 threw it away on 6 of 6 turns, and widget call 946 on 2:

    WARNING  preemptive generation invalidated after `on_user_turn_completed`
             because the transcript, chat context, tools, or tool choice changed

agent_activity.py copies the chat context BEFORE calling the hook and keeps
the speculative LLM run only if the two are still equivalent afterwards. The
unconditional per-turn directive was appended inside the hook, so they never
were. Measured cost: the full ~500ms first-token time paid serially on every
turn, and preemptive_tts doing nothing at all.
"""
import ast
import asyncio
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")

_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.py")
_SRC = io.open(_PATH, encoding="utf-8").read()
_TREE = ast.parse(_SRC)


def _method(name):
    for node in ast.walk(_TREE):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name:
            return node
    raise AssertionError(f"{name} not found in main.py")


class TheHookNoLongerMutatesTheComparedContext(unittest.TestCase):
    def test_every_remaining_turn_ctx_mutation_is_conditional(self):
        """An unconditional one invalidates preemption on 100% of turns.

        The conditional ones (outbound re-establish, goodbye nudge, lead
        capture nudge) are rare and are worth their invalidation.
        """
        hook = _method("on_user_turn_completed")
        unconditional = []
        for node in ast.walk(hook):
            if not (isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Attribute)
                    and node.func.attr == "add_message"
                    and getattr(node.func.value, "id", "") == "turn_ctx"):
                continue
            # walk up: is this statement inside an if/for/while inside the hook?
            guarded = False
            for parent in ast.walk(hook):
                if isinstance(parent, (ast.If, ast.For, ast.While, ast.Try)):
                    if any(n is node for n in ast.walk(parent)):
                        guarded = True
                        break
            if not guarded:
                unconditional.append(node.lineno)
        self.assertEqual(unconditional, [],
                         f"unconditional turn_ctx.add_message at lines {unconditional} — "
                         "this invalidates preemptive generation on every turn")

    def test_the_directive_is_stored_instead(self):
        hook = _method("on_user_turn_completed")
        assigns = [n for n in ast.walk(hook)
                   if isinstance(n, ast.Assign)
                   and any(getattr(t, "attr", "") == "_pending_turn_directive" for t in n.targets)]
        self.assertEqual(len(assigns), 1, "directive is not stored for llm_node")


class LlmNodeDeliversIt(unittest.TestCase):
    def test_llm_node_exists_and_is_a_generator(self):
        node = _method("llm_node")
        self.assertTrue(any(isinstance(n, ast.Yield) for n in ast.walk(node)),
                        "llm_node must yield chunks through, not return")

    def test_it_appends_the_directive_without_touching_the_caller_context(self):
        """The context it is handed must not be mutated in place — that is the
        object the framework compares."""
        from livekit.agents import llm as _llm
        import main

        class _Fake(main.RealEstateAgent):
            def __init__(self):  # bypass the real, DB-dependent __init__
                self._pending_turn_directive = "SPEAK MARATHI"

        seen = {}

        async def _fake_default(agent, chat_ctx, tools, model_settings):
            seen["ctx"] = chat_ctx
            if False:
                yield None

        original = main.Agent.default.llm_node
        main.Agent.default.llm_node = _fake_default
        try:
            ctx = _llm.ChatContext.empty()
            ctx.add_message(role="user", content="hello")
            before = len(ctx.items)

            async def go():
                async for _ in _Fake().llm_node(ctx, [], None):
                    pass

            asyncio.run(go())
        finally:
            main.Agent.default.llm_node = original

        self.assertEqual(len(ctx.items), before, "llm_node mutated the caller's context")
        passed = seen["ctx"]
        self.assertEqual(len(passed.items), before + 1)
        self.assertEqual(passed.items[-1].role, "system")
        self.assertIn("SPEAK MARATHI", passed.items[-1].text_content)

    def test_no_directive_means_no_extra_message(self):
        from livekit.agents import llm as _llm
        import main

        class _Fake(main.RealEstateAgent):
            def __init__(self):
                self._pending_turn_directive = ""

        seen = {}

        async def _fake_default(agent, chat_ctx, tools, model_settings):
            seen["ctx"] = chat_ctx
            if False:
                yield None

        original = main.Agent.default.llm_node
        main.Agent.default.llm_node = _fake_default
        try:
            ctx = _llm.ChatContext.empty()
            ctx.add_message(role="user", content="hello")

            async def go():
                async for _ in _Fake().llm_node(ctx, [], None):
                    pass

            asyncio.run(go())
        finally:
            main.Agent.default.llm_node = original

        self.assertEqual(len(seen["ctx"].items), 1)


class PlaceholderNamesAreNotSpokenAloud(unittest.TestCase):
    """Call 948 opened with "Namaste Unknown, main Artha bol rahi hoon"."""

    def test_placeholder_names_are_dropped_cleanly(self):
        import main

        f = main._substitute_template_vars
        self.assertEqual(f("Namaste {{name}}, main Artha.", {"name": "Unknown"}),
                         "Namaste, main Artha.")
        self.assertEqual(f("नमस्कार {{name}}! मैं आर्था।", {"name": "  UNKNOWN  "}),
                         "नमस्कार! मैं आर्था।")
        self.assertEqual(f("Hi {{first_name}} {{last_name}}.", {"first_name": "N/A"}),
                         "Hi.")

    def test_a_real_name_still_survives(self):
        import main

        f = main._substitute_template_vars
        self.assertEqual(f("Namaste {{name}}, main Artha.", {"name": "Abhi"}),
                         "Namaste Abhi, main Artha.")
        # A company legitimately called "Lead" or a person called "Test" is a
        # stretch, but the guard is deliberately scoped to name tokens only.
        self.assertEqual(f("from {{company}}.", {"company": "Lead"}), "from Lead.")


if __name__ == "__main__":
    unittest.main()
