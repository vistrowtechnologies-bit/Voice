"""Offline: rebuild the exact chat-completions request the agent sends each turn
and count its tokens per component. No network, no LLM, no database.

    DATABASE_URL=postgresql://localhost:1/placeholder TIKTOKEN_PYTHON=/usr/bin/python3 \
        <venv with livekit-agents 1.8.6>/bin/python agent/scripts/measure_prompt_tokens.py

The request is built the way livekit's OpenAI plugin builds it for Sarvam:
`chat_ctx.to_provider_format("openai")` plus `ToolContext.parse_function_tools
("openai", strict=True)`, from the context llm_node sends — instructions as the
first system item (as AgentActivity inserts them), the conversation with its
tool call/result pairs, the one-turn nudges on_user_turn_completed adds, and
the per-turn directive (RealEstateAgent._llm_request_ctx when it exists).

Tokens are tiktoken o200k_base as a proxy for Sarvam's tokenizer. If this
interpreter has no tiktoken, set TIKTOKEN_PYTHON to one that has it; the
strings are piped to it. Without either, chars/3.9 (the calibration in
docs/LLM-TOKEN-AUDIT-2026-10-12.md).

MEASURE_AGENT_DIR points it at another checkout's agent/ directory (e.g. a
`git archive origin/main agent` export) for before/after numbers.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
AGENT_DIR = os.environ.get("MEASURE_AGENT_DIR") or os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, AGENT_DIR)
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")
os.environ.setdefault("OPENAI_API_KEY", "test-key-not-used-offline")
# Run directly, never let main's load_dotenv() reach the production DB. Only
# then: test_llm_token_diet imports this module, and rewriting DATABASE_URL
# for the whole pytest process broke later real-DB tests (PR #250).
if __name__ == "__main__" and not os.environ.get("DATABASE_URL", "").startswith("postgresql://localhost"):
    os.environ["DATABASE_URL"] = "postgresql://localhost:1/placeholder"

import main  # noqa: E402
from livekit.agents import llm  # noqa: E402
from livekit.agents.voice.generation import update_instructions  # noqa: E402

from token_fixtures import AGENTS, CONTACT_NOTES, CONVERSATION  # noqa: E402

REPORT_TURNS = (1, 5, 10, 20)
# Sarvam rates, ₹ per million tokens.
RATE_IN, RATE_CACHED, RATE_OUT = 23.0, 11.0, 70.0


# ---------------------------------------------------------------- counting
def _count_many(texts: list[str]) -> list[int]:
    try:
        import tiktoken

        enc = tiktoken.get_encoding("o200k_base")
        return [len(enc.encode(t)) for t in texts]
    except ImportError:
        pass
    py = os.environ.get("TIKTOKEN_PYTHON")
    if py:
        code = (
            "import json,sys,tiktoken;e=tiktoken.get_encoding('o200k_base');"
            "print(json.dumps([len(e.encode(t)) for t in json.load(sys.stdin)]))"
        )
        out = subprocess.run([py, "-c", code], input=json.dumps(texts), capture_output=True,
                             text=True, check=True).stdout
        return json.loads(out)
    return [round(len(t) / 3.9) for t in texts]


def tokenizer_name() -> str:
    try:
        import tiktoken  # noqa: F401

        return "tiktoken o200k_base"
    except ImportError:
        return "tiktoken o200k_base (via TIKTOKEN_PYTHON)" if os.environ.get("TIKTOKEN_PYTHON") \
            else "chars/3.9 estimate"


# ------------------------------------------------------------ the request
def with_contact_notes(cfg: dict, notes: str) -> dict:
    """What entrypoint() does with a contact's lead notes, in whichever form the
    checkout being measured does it (before: glued onto system_prompt)."""
    if not notes:
        return dict(cfg)
    if hasattr(main.RealEstateAgent, "_llm_request_ctx"):
        return dict(cfg, _contact_notes=notes)
    return dict(cfg, system_prompt=(cfg.get("system_prompt") or "").rstrip() + "\n\n" + notes)


def build_agent(cfg: dict, *, visitor_phone: str = "+919800000001"):
    cfg = dict(cfg)
    notes = cfg.pop("_fixture_contact_notes", "")
    direction = cfg.pop("_fixture_direction", "inbound")
    agent = main.RealEstateAgent(with_contact_notes(cfg, notes), visitor_phone=visitor_phone,
                                 direction=direction, call_type="phone")
    stub = types.SimpleNamespace(
        userdata={"latency_metrics": {}, "lead_data": {}, "greeting_played": True},
        agent_state="listening",
    )
    # A per-agent subclass, so the stub session never leaks onto RealEstateAgent.
    agent.__class__ = type("MeasuredAgent", (type(agent),), {"session": property(lambda self, _s=stub: _s)})
    return agent, stub


def request_for(agent, chat_ctx: llm.ChatContext) -> dict:
    """The messages + tools the OpenAI plugin would send for this context."""
    if hasattr(agent, "_llm_request_ctx"):
        ctx = agent._llm_request_ctx(chat_ctx)  # exactly what llm_node sends
    else:  # older checkout: llm_node appended the directive and nothing else
        ctx = chat_ctx.copy()
        if agent._pending_turn_directive:
            ctx.add_message(role="system", content=agent._pending_turn_directive)
    messages, _ = ctx.to_provider_format(format="openai")
    tools = llm.ToolContext(agent.tools).parse_function_tools("openai", strict=True)
    return {"messages": messages, "tools": tools}


def split_components(req: dict, n_turn_nudges: int) -> dict[str, str]:
    """Serialize each component the way it travels (JSON), so counts add up."""
    msgs = req["messages"]
    system, rest = msgs[0], msgs[1:]
    directive = rest[-1] if (rest and rest[-1].get("role") == "system") else None
    if directive is not None:
        rest = rest[:-1]
    nudges = rest[len(rest) - n_turn_nudges:] if n_turn_nudges else []
    history = rest[: len(rest) - n_turn_nudges] if n_turn_nudges else rest
    instr = system["content"]
    kb_start = instr.find("\n\n# Knowledge base")
    voice_start = instr.find("\n\n" + main.VOICE_STYLE_PROMPT[:40])
    tail_start = min(i for i in (instr.find("\n\n# Caller context"),
                                 instr.find("\n\n# Current date and time"), len(instr)) if i >= 0)
    kb = instr[kb_start:voice_start] if 0 <= kb_start < voice_start else ""
    head = instr[:tail_start]
    return {
        "system: static rules+persona": head.replace(kb, "", 1) if kb else head,
        "system: knowledge base": kb,
        "system: per-call tail": instr[tail_start:],
        "tool schemas": json.dumps(req["tools"], ensure_ascii=False),
        "history": json.dumps(history, ensure_ascii=False),
        "turn nudges": json.dumps(nudges, ensure_ascii=False) if nudges else "",
        "per-turn directive": json.dumps(directive, ensure_ascii=False) if directive else "",
    }


async def simulate(cfg: dict, conversation=CONVERSATION, *, visitor_phone: str = "+919800000001"):
    """Drive on_user_turn_completed over a scripted call.

    Returns [(turn, agent, request, n_turn_nudges)] for the first LLM request
    of each caller turn."""
    agent, stub = build_agent(cfg, visitor_phone=visitor_phone)
    chat_ctx = agent.chat_ctx.copy()
    # What AgentActivity does on start: the instructions become the first
    # (system) item of the agent's chat context.
    update_instructions(chat_ctx, instructions=agent.instructions, add_if_missing=True)
    chat_ctx.add_message(role="assistant", content=conversation[0]["assistant"])
    out = []
    for i, turn in enumerate(conversation[1:], start=1):
        stub.userdata["lead_data"] = dict(turn.get("lead_data") or {})
        msg = llm.ChatMessage(role="user", content=[turn["user"]])
        temp = chat_ctx.copy()
        before = len(temp.items)
        try:
            await agent.on_user_turn_completed(temp, new_message=msg)
        except main.StopResponse:
            continue
        # agent_activity next puts the user message into the context the
        # generation sees, after whatever the hook added.
        nudges = temp.items[before:]
        gen_ctx = chat_ctx.copy()
        gen_ctx.items.append(msg)
        gen_ctx.items.extend(nudges)
        out.append((i, agent, request_for(agent, gen_ctx), len(nudges)))
        # Persisted history: the user message, any tool round, the reply.
        chat_ctx.items.append(msg)
        for j, call in enumerate(turn.get("tools") or []):
            cid = f"call_{i}_{j}"
            chat_ctx.items.append(llm.FunctionCall(
                call_id=cid, name=call["name"], arguments=json.dumps(call["args"], ensure_ascii=False)))
            chat_ctx.items.append(llm.FunctionCallOutput(
                call_id=cid, name=call["name"], output=call["output"], is_error=False))
        chat_ctx.add_message(role="assistant", content=turn["assistant"])
    return out


# ----------------------------------------------------------------- report
def render(req: dict) -> str:
    """Tools first, then messages: how an OpenAI-style server lays out a chat
    template (tool block ahead of the conversation)."""
    return json.dumps(req["tools"], ensure_ascii=False) + "".join(
        json.dumps(m, ensure_ascii=False) for m in req["messages"])


def cacheable_prefix_tokens(prev_req: dict | None, req: dict) -> int:
    """Tokens of `req` that repeat `prev_req` byte-for-byte from the start: the
    most an automatic prefix cache could reuse (before any block granularity)."""
    if prev_req is None:
        return 0
    a, b = render(prev_req), render(req)
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return _count_many([b[:n]])[0]


def rupees_per_min(total_in: int, cached: int, n_requests: int, *, out_per_req: int = 60,
                   requests_per_min: float = 8.0) -> float:
    """₹ per call-minute. 8 requests/min is what the Oct 1-16 bill implies
    (~100k tokens/min over ~12.5k tokens per request measured here); ~60
    output tokens per request (one or two short spoken sentences)."""
    per_in, per_cached = total_in / n_requests, cached / n_requests
    cost = (per_cached * RATE_CACHED + (per_in - per_cached) * RATE_IN + out_per_req * RATE_OUT) / 1e6
    return cost * requests_per_min


async def measure(label: str) -> dict:
    results = {}
    for name, cfg in AGENTS.items():
        runs = await simulate(cfg)
        rows, prev = [], None
        for turn, _agent, req, n_nudges in runs:
            comps = split_components(req, n_nudges)
            counts = dict(zip(comps, _count_many(list(comps.values()))))
            counts["TOTAL"] = sum(counts.values())
            counts["cacheable from prev request"] = cacheable_prefix_tokens(prev, req)
            prev = req
            rows.append((turn, counts))
        # A second call on the same agent: another caller, another contact.
        other = dict(cfg)
        if other.get("_fixture_contact_notes"):
            other["_fixture_contact_notes"] = CONTACT_NOTES[1]
        first_b = (await simulate(other, CONVERSATION[:2], visitor_phone="+919800000777"))[0][2]
        results[name] = {"rows": rows, "cross_call": cacheable_prefix_tokens(runs[0][2], first_b),
                         "first_total": rows[0][1]["TOTAL"]}
    return {"label": label, "results": results}


def print_report(m: dict) -> None:
    print(f"\n=== {m['label']} ({tokenizer_name()}) ===")
    for name, res in m["results"].items():
        rows = res["rows"]
        print(f"\n-- agent fixture: {name}")
        comps = list(rows[0][1].keys())
        by_turn = dict(rows)
        shown = [t for t in REPORT_TURNS if t in by_turn]
        print(f"{'component':34}" + "".join(f"{'turn ' + str(t):>10}" for t in shown))
        for c in comps:
            print(f"{c:34}" + "".join(f"{by_turn[t][c]:>10}" for t in shown))
        total_in = sum(c["TOTAL"] for _, c in rows)
        cached = sum(c["cacheable from prev request"] for _, c in rows)
        print(f"sum over {len(rows)} requests: {total_in} input tokens, "
              f"{cached} ({100 * cached / total_in:.0f}%) repeat the previous request's prefix")
        print(f"first request of a 2nd call (other caller/contact): {res['cross_call']} of "
              f"{res['first_total']} tokens repeat the 1st call's first request")
        print(f"predicted Rs/min at 8 requests/min: "
              f"{rupees_per_min(total_in, cached, len(rows)):.2f} (prefix-cache ideal) | "
              f"{rupees_per_min(total_in, int(0.45 * total_in), len(rows)):.2f} (45% cached, as billed)")


if __name__ == "__main__":
    print_report(asyncio.run(measure(f"agent dir {AGENT_DIR}")))
