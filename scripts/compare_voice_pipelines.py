#!/usr/bin/env python3
"""Compare real Vistrow calls by exact STT + LLM + TTS configuration.

Run with the server environment so DATABASE_URL is available:

    server/.venv/bin/python scripts/compare_voice_pipelines.py --days 14

The report deliberately uses completed real-call metrics rather than vendor
headline latency. A stack needs at least ``--min-turns`` complete turns before
it is ranked. JSON output is available for a dashboard/import pipeline.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")
import dbconn  # noqa: E402


def percentile(values: list[float], quantile: float) -> int | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, round((len(ordered) - 1) * quantile)))
    return round(ordered[index])


def summary(values: list[float]) -> dict[str, int | None]:
    return {
        "p50": round(statistics.median(values)) if values else None,
        "p95": percentile(values, 0.95),
    }


@dataclass
class StackSamples:
    calls: set[int] = field(default_factory=set)
    eou: list[float] = field(default_factory=list)
    stt: list[float] = field(default_factory=list)
    llm: list[float] = field(default_factory=list)
    tts: list[float] = field(default_factory=list)
    first_audio_observed: list[float] = field(default_factory=list)


def _metrics(raw: str | dict | None) -> dict:
    if isinstance(raw, dict):
        return raw
    try:
        return json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}


def collect(days: int) -> dict[tuple[str, str, str], StackSamples]:
    conn = dbconn.connect()
    try:
        rows = conn.execute(
            "SELECT id, model, voice, latency_metrics_json FROM calls "
            "WHERE started_at::timestamptz >= now() - (? * interval '1 day') "
            "AND COALESCE(latency_metrics_json, '') <> '' "
            "AND COALESCE(test_run_id, '') = '' ORDER BY id",
            (days,),
        ).fetchall()
    finally:
        conn.close()

    groups: dict[tuple[str, str, str], StackSamples] = defaultdict(StackSamples)
    for row in rows:
        metrics = _metrics(row["latency_metrics_json"])
        stack = metrics.get("stack") or {}
        # Rows before the stack marker shipped are still useful for LLM/TTS
        # comparisons. Their STT was Sarvam: it was the only configured lane.
        stt_name = stack.get("stt") or "sarvam (legacy)"
        llm_name = stack.get("llm") or row["model"] or "unknown"
        tts_name = stack.get("tts") or row["voice"] or "unknown"
        sample = groups[(stt_name, llm_name, tts_name)]
        sample.calls.add(int(row["id"]))
        eou = [float(v) for v in metrics.get("eouMs") or []]
        stt = [float(v) for v in metrics.get("transcriptionMs") or []]
        llm = [float(v) for v in metrics.get("llmTtftMs") or [] if float(v) > 0]
        tts = [float(v) for v in metrics.get("ttsTtfbMs") or [] if float(v) > 0]
        sample.eou.extend(eou)
        sample.stt.extend(stt)
        sample.llm.extend(llm)
        sample.tts.extend(tts)
        sample.first_audio_observed.extend(
            float(v) for v in metrics.get("callerStopToFirstAudioMs") or [] if float(v) > 0
        )
    return groups


def build_report(days: int, min_turns: int) -> list[dict]:
    rows = []
    for (stt_name, llm_name, tts_name), samples in collect(days).items():
        observed = samples.first_audio_observed
        comparable_turns = len(observed) if observed else min(len(samples.eou), len(samples.llm), len(samples.tts))
        if comparable_turns < min_turns:
            continue
        if observed:
            total = summary(observed)
            measurement = "observed"
        else:
            # Older calls predate the state-to-state metric. Do not zip the
            # independent arrays: greetings and cancelled generations can
            # shift their indexes. A sum of stage percentiles is useful for
            # historical direction only and is labelled as an estimate.
            stage_summaries = [summary(samples.eou), summary(samples.llm), summary(samples.tts)]
            total = {
                key: sum(stage[key] or 0 for stage in stage_summaries)
                for key in ("p50", "p95")
            }
            measurement = "estimated-stage-sum"
        rows.append({
            "stt": stt_name,
            "llm": llm_name,
            "tts": tts_name,
            "calls": len(samples.calls),
            "turns": comparable_turns,
            "endpointMs": summary(samples.eou),
            "transcriptionMs": summary(samples.stt),
            "llmTtftMs": summary(samples.llm),
            "ttsTtfbMs": summary(samples.tts),
            "callerStopToAudioMs": total,
            "measurement": measurement,
        })
    return sorted(rows, key=lambda row: row["callerStopToAudioMs"]["p50"] or 10**9)


def markdown(rows: list[dict], days: int, min_turns: int) -> str:
    title = f"# Voice pipeline comparison — last {days} days\n"
    note = (
        f"Only stacks with at least {min_turns} comparable turns are shown. "
        "All values are milliseconds; p50/p95 are written as `p50 / p95`. "
        "`observed` is the exact caller-stop-to-audio state span; `estimated-stage-sum` "
        "is used only for calls recorded before that metric shipped.\n\n"
    )
    header = "| STT | LLM | TTS | Calls | Turns | Endpoint | STT final | LLM TTFT | TTS TTFB | Stop → audio | Measure |\n|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|\n"
    body = ""
    for row in rows:
        fmt = lambda value: f"{value['p50']} / {value['p95']}"  # noqa: E731
        body += (
            f"| {row['stt']} | {row['llm']} | {row['tts']} | {row['calls']} | {row['turns']} | "
            f"{fmt(row['endpointMs'])} | {fmt(row['transcriptionMs'])} | {fmt(row['llmTtftMs'])} | "
            f"{fmt(row['ttsTtfbMs'])} | **{fmt(row['callerStopToAudioMs'])}** | {row['measurement']} |\n"
        )
    return title + note + (header + body if rows else "No stack has enough measured turns yet.\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--min-turns", type=int, default=3)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if not os.environ.get("DATABASE_URL"):
        parser.error("DATABASE_URL is required")
    rows = build_report(max(1, args.days), max(1, args.min_turns))
    print(json.dumps(rows, indent=2, ensure_ascii=False) if args.json else markdown(rows, args.days, args.min_turns))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
