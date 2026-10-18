"""Per-call token totals for realtime (Gemini Live) generations.

Until 2026-10-18 only llm_metrics reached _add_llm_usage; the
realtime_model_metrics branch computed a label and nothing else, so every
realtime call saved calls.llm_* as NULL and the Google bill (₹8.5/min against
a ₹1.35 list price) could not be traced per call. Realtime generations now
feed the same totals plus a text/audio split, logged per generation and
persisted to calls.llm_rt_text_in / llm_rt_audio_in / llm_rt_text_out /
llm_rt_audio_out.
"""
import inspect
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

from livekit.agents.metrics import RealtimeModelMetrics

import db
import main


def _metric(text_in, audio_in, cached, text_out, audio_out, cancelled=False):
    """A real RealtimeModelMetrics as the google plugin builds it from
    UsageMetadata (livekit-agents 1.8.6)."""
    return RealtimeModelMetrics(
        label="google.realtime.RealtimeModel", request_id="g1", timestamp=0.0, duration=1.2,
        ttft=0.5, cancelled=cancelled,
        input_tokens=text_in + audio_in, output_tokens=text_out + audio_out,
        total_tokens=text_in + audio_in + text_out + audio_out, tokens_per_second=10.0,
        input_token_details=RealtimeModelMetrics.InputTokenDetails(
            text_tokens=text_in, audio_tokens=audio_in, cached_tokens=cached,
            cached_tokens_details=RealtimeModelMetrics.CachedTokenDetails(text_tokens=cached),
        ),
        output_token_details=RealtimeModelMetrics.OutputTokenDetails(
            text_tokens=text_out, audio_tokens=audio_out,
        ),
    )


class AddRealtimeUsage(unittest.TestCase):
    def test_totals_and_split_accumulate_across_generations(self):
        usage = main._new_llm_usage()
        main._add_realtime_usage(usage, _metric(9_000, 1_200, 0, 40, 600))
        main._add_realtime_usage(usage, _metric(9_100, 1_300, 8_000, 0, 0, cancelled=True))
        main._add_realtime_usage(usage, _metric(9_200, 1_400, 8_000, 35, 550))
        self.assertEqual(
            usage,
            {
                "requests": 3, "cancelledRequests": 1,
                "promptTokens": 31_200, "cachedTokens": 16_000, "completionTokens": 1_225,
                "rtTextIn": 27_300, "rtAudioIn": 3_900, "rtTextOut": 75, "rtAudioOut": 1_150,
            },
        )

    def test_handler_meters_logs_and_records_realtime_generations(self):
        # The handler is a closure inside entrypoint(); check its source feeds
        # realtime metrics into the usage totals, logs the split and emits
        # the same diagnostic event the llm_metrics branch does.
        src = inspect.getsource(main.entrypoint)
        handler = src[src.index("def _on_metrics_collected"):src.index("if metric_type == \"eou_metrics\"")]
        self.assertIn("_add_realtime_usage(usage, metric)", handler)
        self.assertIn("[rt-usage] model=%s in=%s (text=%s audio=%s cached=%s) out=%s (text=%s audio=%s) room=%s", handler)
        self.assertIn('"metric", "llm", "AI response started"', handler)
        self.assertIn("completionTokens=rt_completion", handler)


class _Conn:
    def __init__(self):
        self.calls, self.closed = [], False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params):
        self.calls.append((sql, params))

    def close(self):
        self.closed = True


class SetCallLlmUsageSplit(unittest.TestCase):
    def test_writes_the_realtime_split_columns(self):
        usage = main._new_llm_usage()
        main._add_realtime_usage(usage, _metric(9_000, 1_200, 8_000, 40, 600))
        conn = _Conn()
        with patch.object(db.dbconn, "connect", return_value=conn):
            db.set_call_llm_usage(77, usage)
        sql, params = conn.calls[0]
        for column in ("llm_rt_text_in", "llm_rt_audio_in", "llm_rt_text_out", "llm_rt_audio_out"):
            self.assertIn(f"{column} = ?", sql)
        self.assertEqual(params, (1, 10_200, 8_000, 640, 9_000, 1_200, 40, 600, 77))
        self.assertTrue(conn.closed)


@unittest.skipUnless(os.environ.get("TEST_DATABASE_URL"), "set TEST_DATABASE_URL to a throwaway Postgres database")
class SetCallLlmUsageDbTests(unittest.TestCase):
    """Round trip on a real Postgres: the agent-side migration adds the split
    columns, the write lands, and a text-LLM call leaves them NULL."""

    def test_migration_and_write_round_trip(self):
        os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
        import dbconn
        db.init_db()
        conn = dbconn.connect()
        try:
            with conn:
                for column in ("llm_requests", "llm_prompt_tokens", "llm_cached_tokens", "llm_completion_tokens"):
                    # server/calls_db.py owns these; a fresh test database has none.
                    conn.execute(f"ALTER TABLE calls ADD COLUMN IF NOT EXISTS {column} INTEGER")
                rows = [
                    conn.execute(
                        "INSERT INTO calls (room_name, started_at, ended_at, transcript_json) "
                        "VALUES ('rt-test', '', '', '[]') RETURNING id"
                    ).fetchone()["id"]
                    for _ in range(2)
                ]
        finally:
            conn.close()
        rt_call, text_call = rows
        usage = main._new_llm_usage()
        main._add_realtime_usage(usage, _metric(9_000, 1_200, 8_000, 40, 600))
        db.set_call_llm_usage(rt_call, usage)
        db.set_call_llm_usage(text_call, {"requests": 2, "promptTokens": 50, "cachedTokens": 0, "completionTokens": 7})
        conn = dbconn.connect()
        try:
            cols = ("llm_requests, llm_prompt_tokens, llm_cached_tokens, llm_completion_tokens, "
                    "llm_rt_text_in, llm_rt_audio_in, llm_rt_text_out, llm_rt_audio_out")
            rt = conn.execute(f"SELECT {cols} FROM calls WHERE id = ?", (rt_call,)).fetchone()
            text = conn.execute(f"SELECT {cols} FROM calls WHERE id = ?", (text_call,)).fetchone()
        finally:
            conn.close()
        self.assertEqual(tuple(rt.values()), (1, 10_200, 8_000, 640, 9_000, 1_200, 40, 600))
        self.assertEqual(tuple(text.values()), (2, 50, 0, 7, None, None, None, None))


if __name__ == "__main__":
    unittest.main(verbosity=2)
