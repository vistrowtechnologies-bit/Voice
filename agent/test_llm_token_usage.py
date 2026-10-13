"""Per-call LLM token totals (token audit 2026-10-12, §6).

Completion tokens and cancelled (preemptive/interrupted) requests used to go
unrecorded: the metrics handler skipped metric.cancelled entirely. The totals
now include both and are written to calls.llm_* after the call row is saved,
best-effort, so a worker deployed before the server migration loses only the
totals, never the call.
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

from livekit.agents.metrics import LLMMetrics

import db
import main


def _metric(prompt, cached, completion, cancelled=False):
    return LLMMetrics(
        label="openai.LLM", request_id="r", timestamp=0.0, duration=1.0, ttft=0.4,
        cancelled=cancelled, completion_tokens=completion, prompt_tokens=prompt,
        prompt_cached_tokens=cached, total_tokens=prompt + completion, tokens_per_second=10.0,
    )


class AddLlmUsage(unittest.TestCase):
    def test_totals_include_cancelled_requests(self):
        usage = main._new_llm_usage()
        main._add_llm_usage(usage, _metric(11_400, 0, 42))
        main._add_llm_usage(usage, _metric(12_000, 9_000, 0, cancelled=True))
        main._add_llm_usage(usage, _metric(12_500, 0, 37))
        self.assertEqual(
            usage,
            {"requests": 3, "cancelledRequests": 1, "promptTokens": 35_900,
             "cachedTokens": 9_000, "completionTokens": 79},
        )

    def test_handler_counts_cancelled_and_completion_tokens(self):
        # The handler is a closure inside entrypoint(); check its source keeps
        # both the cancelled branch and completionTokens in the diagnostic.
        src = inspect.getsource(main.entrypoint)
        self.assertIn('metric_type == "llm_metrics" and metric.cancelled', src)
        self.assertIn("completionTokens=metric.completion_tokens", src)
        self.assertIn("db.set_call_llm_usage", src)


class _Conn:
    def __init__(self, fail=False):
        self.fail, self.calls, self.closed = fail, [], False

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params):
        if self.fail:
            raise RuntimeError('column "llm_requests" does not exist')
        self.calls.append((sql, params))

    def close(self):
        self.closed = True


class SetCallLlmUsage(unittest.TestCase):
    USAGE = {"requests": 4, "cancelledRequests": 1, "promptTokens": 50_000,
             "cachedTokens": 0, "completionTokens": 160}

    def test_writes_the_four_columns(self):
        conn = _Conn()
        with patch.object(db.dbconn, "connect", return_value=conn):
            db.set_call_llm_usage(77, self.USAGE)
        sql, params = conn.calls[0]
        self.assertIn("llm_prompt_tokens", sql)
        self.assertIn("llm_completion_tokens", sql)
        self.assertEqual(params, (4, 50_000, 0, 160, 77))
        self.assertTrue(conn.closed)

    def test_missing_column_never_raises(self):
        conn = _Conn(fail=True)
        with patch.object(db.dbconn, "connect", return_value=conn):
            db.set_call_llm_usage(77, self.USAGE)  # must not raise
        self.assertTrue(conn.closed)

    def test_no_call_or_no_requests_is_a_no_op(self):
        with patch.object(db.dbconn, "connect") as connect:
            db.set_call_llm_usage(None, self.USAGE)
            db.set_call_llm_usage(77, main._new_llm_usage())
            db.set_call_llm_usage(77, None)
        connect.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
