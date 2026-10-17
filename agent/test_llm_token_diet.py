"""What each LLM request carries: history window, directive, prompt order.

Measured with agent/scripts/measure_prompt_tokens.py. These pin the parts of
that change that could hurt a call if they regressed: a tool result losing its
call, captured facts vanishing with old turns, and per-call text drifting back
into the cached prefix.
"""
import asyncio
import json
import os
import sys
import types
import unittest
from unittest.mock import PropertyMock, patch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "scripts"))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
import main  # noqa: E402
from livekit.agents import llm  # noqa: E402

import measure_prompt_tokens as harness  # noqa: E402
from token_fixtures import AGENTS, CONTACT_NOTES, CONVERSATION  # noqa: E402

TENANT = AGENTS["custom-prompt tenant, strict 8k KB"]


def _call(n_turns: int, tool_turns: dict | None = None) -> llm.ChatContext:
    """System + greeting + n caller turns; tool_turns maps turn -> tool name."""
    tool_turns = tool_turns or {}
    ctx = llm.ChatContext.empty()
    ctx.add_message(role="system", content="INSTRUCTIONS")
    ctx.add_message(role="assistant", content="GREETING")
    for t in range(1, n_turns + 1):
        ctx.add_message(role="user", content=f"user {t}")
        if t in tool_turns:
            cid = f"c{t}"
            ctx.items.append(llm.FunctionCall(call_id=cid, name=tool_turns[t], arguments="{}"))
            ctx.items.append(llm.FunctionCallOutput(call_id=cid, name=tool_turns[t],
                                                    output=f"result {t}", is_error=False))
        ctx.add_message(role="assistant", content=f"reply {t}")
    return ctx


def _texts(ctx, role):
    return [it.text_content for it in ctx.items if getattr(it, "type", None) == "message" and it.role == role]


class HistoryWindow(unittest.TestCase):
    def test_short_calls_are_sent_untouched(self):
        ctx = _call(main._HISTORY_KEEP_TURNS + main._HISTORY_TRIM_STEP - 1)
        out, dropped = main._window_history(ctx)
        self.assertIs(out, ctx)
        self.assertEqual(dropped, 0)

    def test_long_call_keeps_recent_turns_greeting_and_system(self):
        ctx = _call(25)
        out, dropped = main._window_history(ctx)
        self.assertEqual(dropped, 12)  # 25 turns -> drop in steps of 6, keep >= 12
        users = _texts(out, "user")
        self.assertEqual(users, [f"user {t}" for t in range(13, 26)])
        self.assertEqual(_texts(out, "system"), ["INSTRUCTIONS"])
        self.assertEqual(_texts(out, "assistant")[0], "GREETING")
        self.assertEqual(len(ctx.items), 2 + 25 * 2, "the persisted context must not be modified")

    def test_tool_calls_and_results_stay_paired(self):
        tools = {2: "log_lead", 3: "book_appointment", 4: "check_calendar_availability",
                 5: "switch_reply_language", 9: "log_lead", 20: "log_lead"}
        out, dropped = main._window_history(_call(25, tools))
        self.assertTrue(dropped)
        calls = {it.call_id: it.name for it in out.items if it.type == "function_call"}
        outputs = {it.call_id for it in out.items if it.type == "function_call_output"}
        self.assertEqual(set(calls), outputs, "every kept call has its result and vice versa")
        # Old bookings, slots and the language switch survive the trim...
        self.assertTrue({"c3", "c4", "c5"} <= set(calls))
        # ...old log_lead rounds go (the facts reminder carries their values),
        # and one inside the window is untouched.
        self.assertNotIn("c2", calls)
        self.assertNotIn("c9", calls)
        self.assertIn("c20", calls)
        # And the provider format accepts it: no tool message without its call.
        msgs, _ = out.to_provider_format(format="openai")
        seen = set()
        for m in msgs:
            for tc in m.get("tool_calls") or []:
                seen.add(tc["id"])
            if m["role"] == "tool":
                self.assertIn(m["tool_call_id"], seen)

    def test_trims_in_steps_so_the_request_stays_append_only(self):
        """Between two trims a turn only adds to the end of the request."""
        def rendered(n):
            out, _ = main._window_history(_call(n, {3: "book_appointment"}))
            return json.dumps(out.to_provider_format(format="openai")[0], ensure_ascii=False)

        for n in range(18, 23):  # one step: 18..23 drop the same 6 turns
            self.assertTrue(rendered(n + 1)[:-1].startswith(rendered(n)[:-1]), n)

    def test_can_be_switched_off(self):
        ctx = _call(40)
        out, dropped = main._window_history(ctx, keep_turns=0)
        self.assertIs(out, ctx)
        self.assertEqual(dropped, 0)


def _agent(cfg=TENANT, **kw):
    agent, stub = harness.build_agent(cfg, **kw)
    return agent, stub


class RequestContext(unittest.TestCase):
    def test_trimmed_request_still_carries_captured_facts_and_says_turns_are_gone(self):
        agent, stub = _agent()
        stub.userdata["lead_data"] = {"name": "Rahul Deshmukh", "budget": "80 lakh",
                                      "configuration": "2 BHK"}
        ctx = _call(25)
        asyncio.run(agent.on_user_turn_completed(ctx.copy(), llm.ChatMessage(role="user", content=["हाँ"])))
        out = agent._llm_request_ctx(ctx)
        last = out.items[-1]
        self.assertEqual(last.role, "system")
        for fact in ("Rahul Deshmukh", "80 lakh", "2 BHK", "first 12 caller turns"):
            self.assertIn(fact, last.text_content)
        self.assertEqual(len(ctx.items), 2 + 25 * 2)

    def test_directive_already_in_the_turn_is_sent_once_and_last(self):
        """Corrected-fact turns add the directive to turn_ctx; llm_node used to add it again."""
        agent, _ = _agent()
        agent._pending_turn_directive = "DIRECTIVE TEXT"
        ctx = _call(3)
        ctx.add_message(role="system", content="DIRECTIVE TEXT")
        ctx.items.append(llm.FunctionCall(call_id="x", name="log_lead", arguments="{}"))
        ctx.items.append(llm.FunctionCallOutput(call_id="x", name="log_lead", output="ok", is_error=False))
        out = agent._llm_request_ctx(ctx)
        self.assertEqual(_texts(out, "system").count("DIRECTIVE TEXT"), 1)
        self.assertEqual(out.items[-1].text_content, "DIRECTIVE TEXT")
        self.assertEqual(_texts(ctx, "system").count("DIRECTIVE TEXT"), 1, "input untouched")


def _first_requests(cfg, phone, n=3):
    return asyncio.run(harness.simulate(cfg, CONVERSATION[: n + 1], visitor_phone=phone))


class CacheablePrefix(unittest.TestCase):
    def test_each_request_extends_the_previous_one_within_a_call(self):
        runs = _first_requests(TENANT, "+919800000001", n=6)
        for (_, _, a, _), (_, _, b, _) in zip(runs, runs[1:]):
            self.assertEqual(a["tools"], b["tools"])
            self.assertEqual(a["messages"][0], b["messages"][0], "system prompt changed mid-call")
            # Everything but this turn's directive is repeated verbatim.
            self.assertEqual(a["messages"][:-1], b["messages"][: len(a["messages"]) - 1])

    def _instructions(self, cfg, phone):
        return _first_requests(cfg, phone, n=1)[0][2]

    def test_two_calls_share_everything_before_the_per_call_tail(self):
        cfg = AGENTS["custom-prompt tenant, outbound lead with contact notes"]
        a = self._instructions(cfg, "+919800000001")
        b = self._instructions(dict(cfg, _fixture_contact_notes=CONTACT_NOTES[1]), "+919811111111")
        self.assertEqual(a["tools"], b["tools"])
        sa, sb = a["messages"][0]["content"], b["messages"][0]["content"]
        tail = sa.index("\n\n# Caller context")
        self.assertEqual(sa[:tail], sb[:tail])
        # Everything static (KB included) is in the shared part; the caller's
        # number and the contact's notes are only in the tail.
        self.assertIn("# Knowledge base", sa[:tail])
        self.assertNotIn("+919800000001", sa[:tail])
        self.assertNotIn("- BHK:", sa[:tail])
        self.assertIn("- BHK: 2 BHK", sa[tail:])
        self.assertLess(sa.index("# This contact"), sa.index("# Current date and time"))


class ContactNotesKeepThePersona(unittest.TestCase):
    def test_built_in_persona_agent_with_contact_notes_keeps_its_persona(self):
        """Gluing notes onto an empty system_prompt replaced the whole built-in persona."""
        base = dict(AGENTS["built-in persona tenant, 8k KB, chirp"])
        plain, _ = _agent(base)
        noted, _ = _agent(dict(base, _fixture_contact_notes=CONTACT_NOTES[0]))
        head = plain.instructions[: plain.instructions.index("\n\n# Caller context")]
        self.assertTrue(noted.instructions.startswith(head))
        self.assertIn("- Project: Sunrise Greens", noted.instructions)


class WarmUpMatchesTheRealRequest(unittest.TestCase):
    def test_prompt_cache_warm_up_sends_the_agents_tools(self):
        agent, _ = _agent()
        seen = {}

        class _Stream:
            def __aiter__(self):
                return self

            async def __anext__(self):
                raise StopAsyncIteration

            async def aclose(self):
                pass

        fake = types.SimpleNamespace(chat=lambda **kw: (seen.update(kw), _Stream())[1])

        async def run():
            with patch.object(type(agent), "llm", new_callable=PropertyMock, return_value=fake):
                agent._warm_llm_prompt_cache()
                await agent._llm_warm_task

        asyncio.run(run())
        self.assertEqual(seen["tools"], list(agent.tools))
        self.assertEqual(seen["chat_ctx"].items[0].text_content, agent.instructions)


if __name__ == "__main__":
    unittest.main()
