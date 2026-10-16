"""LLM bake-off: replay real caller turns against several text LLMs.

Scratch measurement tooling, not production code. Nothing in agent/ imports
it. It answers one owner question (2026-10-16): can cheaper models
(gemini-3.5-flash-lite, gpt-5.4-nano) take some turns from
sarvam-105b-conversations without losing latency or Hindi quality?

What it reproduces from main.py, so the numbers mean what a live call means:
  * the LLM objects come from main._build_llm (same plugin, params, max
    output tokens, Gemini MINIMAL thinking, GPT-5 reasoning_effort "none",
    Sarvam via the OpenAI plugin at api.sarvam.ai). LLM_FALLBACK=0 so a
    Sarvam turn is measured on Sarvam, not on the gpt-5.4-nano fallback;
  * the system prompt and tool list come from constructing the real
    RealEstateAgent with the agents row of the agent that handled the call;
  * the per-turn directive comes from running the agent's own
    on_user_turn_completed over every earlier caller turn and the target
    turn (fake session, no room), then attaching it exactly as llm_node does;
  * the request is streamed through LLM.chat() with the agent's tools.

Safety:
  * DATABASE_URL is read from the repo-root .env, never printed. Every
    connection is forced read-only with PGOPTIONS
    (default_transaction_read_only=on) and the script asserts it.
  * Only calls of accounts 1 and 2 (Vistrow's own) are read.
  * Phone-like digit runs are replaced with a synthetic number BEFORE any
    text leaves this machine; every digit is masked in printed/report output.
  * Stops when the estimated spend reaches --cap-inr (default 150).

Usage (from a venv built from agent/requirements.txt):
  python agent/scripts/llm_bakeoff.py run --out /tmp/bakeoff.json
  python agent/scripts/llm_bakeoff.py report --results /tmp/bakeoff.json \
      --md docs/LLM-BAKEOFF-2026-10-16.md
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import statistics
import sys
import time
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parents[1]
INTERNAL_ACCOUNTS = (1, 2)

MODELS = [
    "sarvam/sarvam-105b-conversations",
    "gemini-3.5-flash-lite",
    "gpt-5.4-nano",
]

USD_INR = 88.0  # assumption; stated in the report
# ₹ per 1M tokens: (uncached input, cached input, output)
PRICES_INR = {
    # owner-supplied Sarvam billing rates
    "sarvam/sarvam-105b-conversations": (23.0, 11.0, 70.0),
    # ai.google.dev/gemini-api/docs/pricing, 2026-10-16: $0.30 / $0.03 / $2.50
    "gemini-3.5-flash-lite": (0.30 * USD_INR, 0.03 * USD_INR, 2.50 * USD_INR),
    # developers.openai.com/api/docs/pricing, 2026-10-16: $0.20 / $0.02 / $1.25
    "gpt-5.4-nano": (0.20 * USD_INR, 0.02 * USD_INR, 1.25 * USD_INR),
}


# (call_id, index of the LAST caller line of the turn in transcript_json,
#  category, language label, expected tool(s) or None for "reply, no tool",
#  reply-language override for the agent or None)
# Consecutive caller lines ending at that index are merged into one turn,
# as the STT would have delivered them across an interruption.
CASES = [
    (1389, 9, "kb_price", "Hindi", None, None),
    (1389, 11, "ack_after_offer", "Hindi", {"request_callback", "log_lead"}, None),
    (1389, 13, "ending", "Hindi", {"end_call"}, None),
    (1090, 3, "kb_question", "Hindi", None, None),
    (1090, 9, "kb_price", "Hinglish", None, None),
    (1090, 14, "general", "Hinglish", None, None),
    (1090, 20, "ending", "English", {"end_call"}, None),
    (1164, 1, "language_switch", "Marathi", {"switch_reply_language"}, None),
    (1164, 3, "general", "Marathi", None, "mr-IN"),
    (1164, 7, "demo_request", "Marathi", None, "mr-IN"),
    (1160, 7, "kb_question", "Hindi", None, None),
    (1160, 9, "language_switch", "English", {"switch_reply_language"}, None),
    (1128, 1, "kb_question", "Hindi", None, None),
    (1128, 6, "general", "Hinglish", None, None),
    (1128, 22, "ending", "Hindi", {"end_call"}, None),
    (912, 20, "language_switch", "Marathi", {"switch_reply_language"}, None),
    (912, 22, "kb_question", "Marathi", None, "mr-IN"),
    (776, 19, "short_ack", "English", None, "en-IN"),
    (776, 23, "short_ack", "English", None, "en-IN"),
    (776, 38, "short_ack", "Marathi", None, "mr-IN"),
    (959, 1, "kb_price", "Hinglish", None, None),
    (959, 9, "booking", "Hinglish", {"check_calendar_availability"}, None),
    (959, 16, "general", "Hinglish", None, None),
    (851, 5, "booking", "Hindi", {"check_calendar_availability"}, None),
    # Name given after a slot was offered. The transcript has no tool items, so
    # the earlier availability result is missing from the replay; re-checking
    # availability before booking is therefore also accepted.
    (851, 11, "booking", "Hindi", {"book_appointment", "check_calendar_availability"}, None),
    (1157, 23, "lead_capture", "Hindi", {"capture_platform_lead"}, None),
    # agent 19 is a tenant-shaped agent (not is_platform_demo): log_lead, not capture_platform_lead
    (796, 21, "lead_capture", "English", {"log_lead"}, "en-IN"),
    (956, 17, "kb_price", "English", None, "en-IN"),
    (1376, 10, "general", "Hinglish (Latin)", None, None),
    (1092, 15, "ending", "Hindi", {"end_call"}, None),
]

_PHONE_RUN = re.compile(r"\+?\d(?:[\s\-.]*\d){6,}")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
_SENTENCE_END = re.compile(r"[.!?।॥](\s|$)")


_synth_map: dict[str, str] = {}


def _synth_number(match: re.Match) -> str:
    # Each distinct real number gets its own synthetic one with the same digit
    # count, so a history like "that's only 9 digits" -> "here are 10" still
    # reads the same way to the model. Reset per case.
    digits = re.sub(r"\D", "", match.group(0))
    if digits not in _synth_map:
        base = f"98765{len(_synth_map) + 1:05d}"
        _synth_map[digits] = (base + "0" * len(digits))[: len(digits)]
    return _synth_map[digits]


def synth(text: str) -> str:
    """What may leave this machine: phone-like runs -> synthetic numbers."""
    return _PHONE_RUN.sub(_synth_number, _EMAIL.sub("caller@example.com", text or ""))


def mask(text: str) -> str:
    """What may be printed or stored: no digits at all, no e-mails."""
    return re.sub(r"\d", "#", _EMAIL.sub("<email>", text or ""))


def _find_env() -> Path:
    for d in [AGENT_DIR, *AGENT_DIR.parents]:
        if (d / ".env").is_file():
            return d / ".env"
    raise SystemExit("no .env found above agent/")


def _bootstrap() -> None:
    from dotenv import load_dotenv

    os.environ["PGOPTIONS"] = "-c default_transaction_read_only=on"
    os.environ["LLM_FALLBACK"] = "0"
    load_dotenv(_find_env(), override=False)
    sys.path.insert(0, str(AGENT_DIR))


def _ro_connect():
    import psycopg

    conn = psycopg.connect(os.environ["DATABASE_URL"], options="-c default_transaction_read_only=on")
    assert conn.execute("SHOW default_transaction_read_only").fetchone()[0] == "on"
    return conn


def load_calls(conn, ids) -> dict:
    rows = conn.execute(
        "SELECT id, account_id, agent_id, reply_language, call_type, direction, transcript_json "
        "FROM calls WHERE id = ANY(%s) AND account_id = ANY(%s)",
        (list(ids), list(INTERNAL_ACCOUNTS)),
    ).fetchall()
    return {r[0]: dict(zip(("id", "account_id", "agent_id", "reply_language", "call_type", "direction"), r[:6]),
                       transcript=json.loads(r[6])) for r in rows}


def split_turns(transcript: list, last_user_idx: int):
    """(history up to the turn, merged caller text of the turn)."""
    start = last_user_idx
    while start - 1 >= 0 and transcript[start - 1].get("role") == "user":
        start -= 1
    text = " ".join((m.get("text") or "").strip() for m in transcript[start:last_user_idx + 1])
    return transcript[:start], text


class _Done:
    def __await__(self):
        if False:
            yield
        return None

    def __getattr__(self, name):
        return lambda *a, **k: None


class FakeSession:
    def __init__(self, userdata):
        self.userdata = userdata
        self.agent_state = "listening"
        self.current_speech = None

    def say(self, *a, **k):
        return _Done()

    def generate_reply(self, *a, **k):
        return _Done()

    def interrupt(self, *a, **k):
        return _Done()

    def __getattr__(self, name):
        return lambda *a, **k: _Done()


def build_agent(main, db, call: dict, lang_override: str | None):
    cfg = db.get_agent_config(call["agent_id"])
    assert cfg and cfg.get("account_id") in INTERNAL_ACCOUNTS, "agent not on an internal account"
    cfg = dict(cfg)
    # Standard pipeline prompt regardless of the agent's current model
    # (agent 4 is on Gemini Live now; its earlier calls ran this pipeline).
    cfg["model"] = "sarvam/sarvam-105b-conversations"
    if lang_override:
        cfg["language"] = lang_override
    if "{{" in (cfg.get("system_prompt") or ""):
        defaults = {
            v["name"]: v.get("defaultValue", "")
            for v in main._parse_json_config(cfg.get("variables"), [])
            if isinstance(v, dict) and v.get("name")
        }
        values = {"first_name": "", "last_name": "", "name": "", "phone": "", "company": "", "custom": {}}
        cfg["system_prompt"] = main._substitute_template_vars(cfg["system_prompt"], values, defaults)
    agent = main.RealEstateAgent(cfg, None, None, direction=call.get("direction"), call_type=call.get("call_type"))
    userdata = {
        "room": None, "lead_data": {}, "campaign_contact_id": None, "campaign_id": None,
        "pipeline_profile": "", "lead_captured": False, "ending_call": False, "transfer_phone": "",
        "silence_reminders": 0, "greeting_played": True, "account_id": cfg.get("account_id"),
        "agent_id": cfg.get("id"), "crm_integration_keys": [], "agent_webhook_url": "",
        "direction": call.get("direction"), "disconnect_reason": "", "tool_calls": [],
        "diagnostic_events": [], "voicemail_checked": True,
        "latency_metrics": {"eouMs": [], "eotProbability": []},
    }
    agent._fake_session = FakeSession(userdata)
    return agent, cfg


async def build_context(main, agent, history: list, turn_text: str):
    from livekit.agents import llm
    from livekit.agents import StopResponse

    ctx = llm.ChatContext()
    ctx.add_message(role="system", content=agent.instructions)
    notes = []

    async def _turn(text: str, final: bool):
        msg = ctx.add_message(role="user", content=synth(text))
        try:
            await asyncio.wait_for(agent.on_user_turn_completed(ctx, msg), timeout=10)
        except StopResponse:
            notes.append("StopResponse" + (" (TARGET TURN)" if final else ""))
        except Exception as exc:  # replay is best-effort for earlier turns
            notes.append(f"{type(exc).__name__} in on_user_turn_completed{' (target)' if final else ''}")

    pending_user = []
    for m in history:
        if m.get("role") == "user":
            pending_user.append(m.get("text") or "")
            continue
        if pending_user:
            await _turn(" ".join(pending_user), False)
            pending_user = []
        if (m.get("text") or "").strip():
            ctx.add_message(role="assistant", content=synth(m["text"].strip()))
    if pending_user:
        await _turn(" ".join(pending_user), False)
    await _turn(turn_text, True)
    directive = agent._pending_turn_directive
    if directive:  # what llm_node attaches
        ctx = ctx.copy()
        ctx.add_message(role="system", content=directive)
    return ctx, notes


def _tool_schema(tool) -> dict:
    from livekit.agents.llm import utils

    try:
        return utils.build_legacy_openai_schema(tool, internally_tagged=True).get("parameters") or {}
    except Exception:
        return {}


def grade(case, tool_calls: list, tools_by_name: dict, target_phone: str | None = None) -> dict:
    expected = case[4]
    known = {target_phone} if target_phone else set(_synth_map.values())
    called = [t["name"] for t in tool_calls]
    valid = True
    problems = []
    for t in tool_calls:
        try:
            args = json.loads(t["arguments"] or "{}")
        except ValueError:
            valid = False
            problems.append(f"{t['name']}: invalid JSON")
            continue
        tool = tools_by_name.get(t["name"])
        if tool is None:
            valid = False
            problems.append(f"{t['name']}: not an offered tool")
            continue
        for req in _tool_schema(tool).get("required", []):
            if args.get(req) in (None, ""):
                valid = False
                problems.append(f"{t['name']}: missing {req}")
        if t["name"] in ("capture_platform_lead", "log_lead", "book_appointment") and args.get("phone"):
            if not any(p in re.sub(r"\D", "", str(args["phone"])) for p in known):
                problems.append(f"{t['name']}: phone not the caller's")
                valid = False
    if expected is None:
        right = not called
    else:
        right = bool(set(called) & expected)
    return {"right_tool": right, "args_valid": valid, "problems": problems}


async def run_one(llm_obj, ctx, tools) -> dict:
    from livekit.agents import APIConnectOptions

    t0 = time.perf_counter()
    first_tok = first_out = first_sentence = None
    text = ""
    tool_calls = []
    usage = None
    err = None
    try:
        stream = llm_obj.chat(chat_ctx=ctx, tools=tools, conn_options=APIConnectOptions(max_retry=0, timeout=30))
        async with stream:
            async for chunk in stream:
                now = time.perf_counter() - t0
                if chunk.usage is not None:
                    usage = chunk.usage
                d = chunk.delta
                if d is None:
                    continue
                if d.content:
                    if first_tok is None:
                        first_tok = now
                    text += d.content
                    if first_sentence is None and _SENTENCE_END.search(text):
                        first_sentence = now
                if d.tool_calls:
                    for tc in d.tool_calls:
                        tool_calls.append({"name": tc.name, "arguments": tc.arguments})
                if (d.content or d.tool_calls) and first_out is None:
                    first_out = now
    except Exception as exc:
        err = f"{type(exc).__name__}: {str(exc)[:200]}"
    total = time.perf_counter() - t0
    if first_sentence is None and text:
        first_sentence = total  # one unpunctuated sentence: TTS gets it at the end
    return {
        "ttft": first_tok, "first_output": first_out, "first_sentence": first_sentence, "total": total,
        "text": text, "tool_calls": tool_calls, "error": err,
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "cached_tokens": getattr(usage, "prompt_cached_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
    }


def cost_inr(model: str, r: dict) -> float:
    pin, pcache, pout = PRICES_INR[model]
    p = r.get("prompt_tokens") or 0
    c = r.get("cached_tokens") or 0
    o = r.get("completion_tokens") or 0
    return ((p - c) * pin + c * pcache + o * pout) / 1e6


async def cmd_run(args) -> None:
    _bootstrap()
    import db  # noqa: F401  (agent/db.py, pooled; read-only via PGOPTIONS)
    import dbconn
    import main

    conn = dbconn.connect()
    try:
        ro = conn.execute("SHOW default_transaction_read_only").fetchone()
        assert (ro["default_transaction_read_only"] if isinstance(ro, dict) else ro[0]) == "on"
    finally:
        conn.close()

    async def _noop(*a, **k):
        return None

    main._hang_up = _noop
    main.RealEstateAgent.session = property(lambda self: self._fake_session)

    with _ro_connect() as rc:
        calls = load_calls(rc, {c[0] for c in CASES})
    llms = {}
    skipped: dict = {}
    results = []
    spent = 0.0
    cases = CASES[: args.limit] if args.limit else CASES
    for n, case in enumerate(cases):
        call = calls.get(case[0])
        if call is None:
            print(f"[{n}] call {case[0]} not found on internal accounts; skipped")
            continue
        history, turn_text = split_turns(call["transcript"], case[1])
        agent, cfg = build_agent(main, db, call, case[5])
        _synth_map.clear()
        ctx, notes = await build_context(main, agent, history, turn_text)
        _m = _PHONE_RUN.search(turn_text)
        target_phone = _synth_map.get(re.sub(r"\D", "", _m.group(0))) if _m else None
        tools = list(agent.tools)
        tools_by_name = {}
        for t in tools:
            nm = getattr(t, "id", None) or getattr(getattr(t, "info", None), "name", None) or getattr(t, "__name__", "")
            tools_by_name[nm] = t
        is_demo = bool(cfg.get("is_platform_demo"))
        row = {
            "case": n, "call_id": case[0], "turn_idx": case[1], "category": case[2], "language": case[3],
            "expected": sorted(case[4]) if case[4] else None, "agent_id": call["agent_id"],
            "caller": mask(turn_text), "replay_notes": notes,
            "system_chars": len(agent.instructions), "directive_chars": len(agent._pending_turn_directive or ""),
            "tools": sorted(tools_by_name), "runs": {},
        }
        for rep in range(args.reps):
            for model in MODELS:
                key = (model, is_demo)
                if key not in llms:
                    try:
                        llms[key] = main._build_llm(model, max_output_tokens=200 if is_demo else 400)
                    except RuntimeError as exc:  # e.g. GEMINI_API_KEY not in this environment
                        llms[key] = None
                        skipped.setdefault(model, str(exc))
                        print(f"skipping {model}: {exc}")
                    if llms[key] is not None:
                        # Production workers keep warm HTTP connections; pay
                        # the TLS handshake once here, outside the numbers.
                        from livekit.agents import llm as _llm

                        warm = _llm.ChatContext()
                        warm.add_message(role="user", content="hi")
                        w = await run_one(llms[key], warm, None)
                        spent += cost_inr(model, w)
                if llms[key] is None:
                    continue
                r = await run_one(llms[key], ctx, tools)
                r.update(grade(case, r["tool_calls"], tools_by_name, target_phone))
                r["cost_inr"] = cost_inr(model, r)
                spent += r["cost_inr"]
                r["text"] = mask(r["text"])
                r["tool_calls"] = [{"name": t["name"], "arguments": mask(t["arguments"] or "")} for t in r["tool_calls"]]
                row["runs"].setdefault(model, []).append(r)
                ttft = r["first_output"]
                print(f"[{n}] {case[2]:16} {model:34} rep{rep} first_out={ttft if ttft is None else round(ttft, 2)} "
                      f"tools={[t['name'] for t in r['tool_calls']]} ok={r['right_tool']} "
                      f"in={r['prompt_tokens']} cached={r['cached_tokens']} out={r['completion_tokens']} "
                      f"err={r['error']} spent=₹{spent:.2f}", flush=True)
                if spent >= args.cap_inr:
                    break
            if spent >= args.cap_inr:
                break
        results.append(row)
        Path(args.out).write_text(json.dumps({"spent_inr": spent, "skipped_models": skipped, "results": results}, ensure_ascii=False, indent=1))
        if spent >= args.cap_inr:
            print(f"cost cap ₹{args.cap_inr} reached; stopping")
            break
    print(f"done: {len(results)} turns, estimated spend ₹{spent:.2f}")


# ---------------------------------------------------------------- report

def _pct(vals, p):
    vals = sorted(v for v in vals if v is not None)
    if not vals:
        return None
    k = max(0, min(len(vals) - 1, round(p / 100 * (len(vals) - 1))))
    return vals[k]


def _ms(v):
    return "–" if v is None else f"{v * 1000:,.0f}"


def cmd_report(args) -> None:
    data = json.loads(Path(args.results).read_text())
    rows = data["results"]
    out = []
    w = out.append
    w("<!-- generated by agent/scripts/llm_bakeoff.py report; numbers are measured, prose below the tables is hand-written -->\n")
    summary = {}
    for model in MODELS:
        runs = [r for row in rows for r in row["runs"].get(model, [])]
        if not runs:
            continue
        ok = [r for r in runs if not r["error"]]
        tool_rows = [r for row in rows if row["expected"] for r in row["runs"].get(model, [])]
        none_rows = [r for row in rows if not row["expected"] for r in row["runs"].get(model, [])]
        pin = statistics.mean([r["prompt_tokens"] or 0 for r in ok]) if ok else 0
        cin = statistics.mean([r["cached_tokens"] or 0 for r in ok]) if ok else 0
        oout = statistics.mean([r["completion_tokens"] or 0 for r in ok]) if ok else 0
        per_turn = statistics.mean([r["cost_inr"] for r in ok]) if ok else 0
        p_in, p_c, p_out = PRICES_INR[model]
        summary[model] = dict(
            n=len(runs), errors=len(runs) - len(ok),
            ttft50=_pct([r["first_output"] for r in ok], 50), ttft90=_pct([r["first_output"] for r in ok], 90),
            tok50=_pct([r["ttft"] for r in ok], 50),
            sent50=_pct([r["first_sentence"] for r in ok], 50), sent90=_pct([r["first_sentence"] for r in ok], 90),
            tot50=_pct([r["total"] for r in ok], 50),
            tool_ok=sum(r["right_tool"] and r["args_valid"] for r in tool_rows), tool_n=len(tool_rows),
            none_ok=sum(r["right_tool"] for r in none_rows), none_n=len(none_rows),
            pin=pin, cin=cin, oout=oout, per_turn=per_turn, per_min=per_turn * 6,
            per_min_uncached=(pin * p_in + oout * p_out) / 1e6 * 6,
            prices=(p_in, p_c, p_out),
        )
    data["summary"] = summary
    Path(args.results).write_text(json.dumps(data, ensure_ascii=False, indent=1))
    w("| Model | Requests (errors) | First output p50 / p90 (ms) | First text token p50 (ms) | First sentence p50 / p90 (ms) | Total p50 (ms) | Tool turns right + valid args | No-tool turns with no tool | Avg input / cached / output tokens | ₹ per 1M in / cached / out | Est. ₹/turn | Est. ₹/call-min (6 turns) | ₹/call-min if nothing cached |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for m, s in summary.items():
        w(f"| `{m}` | {s['n']} ({s['errors']}) | {_ms(s['ttft50'])} / {_ms(s['ttft90'])} | {_ms(s['tok50'])} | "
          f"{_ms(s['sent50'])} / {_ms(s['sent90'])} | {_ms(s['tot50'])} | {s['tool_ok']}/{s['tool_n']} | "
          f"{s['none_ok']}/{s['none_n']} | {s['pin']:,.0f} / {s['cin']:,.0f} / {s['oout']:,.0f} | "
          f"{s['prices'][0]:.1f} / {s['prices'][1]:.1f} / {s['prices'][2]:.1f} | {s['per_turn']:.4f} | "
          f"{s['per_min']:.3f} | {s['per_min_uncached']:.3f} |")
    w("")
    w("### Per-turn tool results\n")
    w("| # | Call | Category | Language | Expected tool | " + " | ".join(f"`{m.split('/')[-1]}`" for m in summary) + " |")
    w("|---|---|---|---|---|" + "---|" * len(summary))
    for row in rows:
        cells = []
        for m in summary:
            rs = row["runs"].get(m, [])
            cells.append(" / ".join(
                ("✔" if r["right_tool"] and r["args_valid"] else "✘")
                + (",".join(t["name"] for t in r["tool_calls"]) or "text")
                + (" ERR" if r["error"] else "")
                for r in rs))
        w(f"| {row['case']} | {row['call_id']} | {row['category']} | {row['language']} | "
          f"{', '.join(row['expected']) if row['expected'] else '(reply)'} | " + " | ".join(cells) + " |")
    w("")
    w("### Replies side by side (Hindi / Hinglish / Marathi turns, first run, digits masked)\n")
    for row in rows:
        if not any(k in row["language"] for k in ("Hindi", "Hinglish", "Marathi")):
            continue
        w(f"**#{row['case']} · call {row['call_id']} · {row['category']} · {row['language']}**  ")
        w(f"Caller: {row['caller']}\n")
        w("| Model | Reply (first run) |")
        w("|---|---|")
        for m in summary:
            rs = row["runs"].get(m, [])
            if not rs:
                continue
            r = rs[0]
            tc = "; ".join(f"`{t['name']}({t['arguments'][:120]})`" for t in r["tool_calls"])
            body = (r["text"] or "").replace("\n", " ").replace("|", "\\|").strip()
            if r["error"]:
                body = f"ERROR {r['error']}"
            w(f"| `{m.split('/')[-1]}` | {body or '—'}{' ' + tc if tc else ''} |")
        w("")
    Path(args.md).write_text("\n".join(out) + "\n")
    print(f"wrote {args.md}")


def main_cli() -> None:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("--out", required=True)
    r.add_argument("--reps", type=int, default=2)
    r.add_argument("--limit", type=int, default=0)
    r.add_argument("--cap-inr", type=float, default=150.0)
    g = sub.add_parser("report")
    g.add_argument("--results", required=True)
    g.add_argument("--md", required=True)
    a = p.parse_args()
    if a.cmd == "run":
        asyncio.run(cmd_run(a))
    else:
        cmd_report(a)


if __name__ == "__main__":
    main_cli()
