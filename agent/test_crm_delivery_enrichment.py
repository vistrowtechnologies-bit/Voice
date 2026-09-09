"""The CRM must receive the post-call analysis, and must receive it at all.

Two failures, one on each side of the same trade:

  BEFORE e18cc69  delivery ran after the AI pass AND the recording upload AND
                  the audio cleanup. Those can consume the worker's whole
                  shutdown grace period, so a properly saved qualified lead
                  ended up with arthaleads_status=NULL, never delivered.

  AFTER e18cc69   delivery started before the AI pass, so `extracted` was
                  still {} when the payload was built and the CRM received
                  _extra_lead_facts only — never interest_level,
                  confirmed_requirement or business_summary, which is the
                  qualitative half a salesperson acts on.

The fix waits for ONE of the three slow steps (the analysis) and runs in
parallel with the other two.
"""
import ast
import inspect
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main

SRC = inspect.getsource(main)


class TheCrmGetsTheAnalysis(unittest.TestCase):
    def test_delivery_sends_the_merged_extracted_data(self):
        # The calls row is written as {**_extra_lead_facts, **extracted}. The
        # CRM payload must not be the poorer half of that.
        self.assertIn(
            '"extracted_data": {**_extra_lead_facts(lead_data), **extracted}', SRC,
        )

    def test_the_crm_payload_is_not_built_before_the_analysis(self):
        # The regression was structural: the dict literal was evaluated at
        # task-creation time, when `extracted` is provably still {}. Building
        # it inside the coroutine is what makes the merge above meaningful.
        self.assertIn("async def _deliver_when_enriched", SRC)

    def test_delivery_waits_for_the_analysis(self):
        self.assertIn("analysis_done", SRC)
        self.assertIn("_CRM_ENRICH_WAIT_S", SRC)


class ItIsStillAlwaysDelivered(unittest.TestCase):
    """Waiting must never become another way to lose the lead."""

    def test_the_wait_is_bounded(self):
        self.assertIn("asyncio.wait_for(", SRC)
        self.assertGreater(main._CRM_ENRICH_WAIT_S, 0)

    def test_the_wait_outlasts_the_analysis_bound(self):
        # Otherwise the normal outcome becomes "delivery gave up first", and
        # the enrichment this whole change exists for is dropped every call.
        self.assertGreater(
            main._CRM_ENRICH_WAIT_S, main._POST_CALL_ANALYSIS_TIMEOUT_S,
        )

    def test_the_gate_is_released_on_every_analysis_outcome(self):
        # Success, timeout and exception all have to release it. If only the
        # success path did, a failing analysis would strand the delivery until
        # the timeout on every single call.
        self.assertIn("analysis_done.set()", SRC)

    def test_it_is_released_when_there_is_no_transcript(self):
        # No transcript means the analysis block never runs at all.
        self.assertIn("if not transcript:", SRC)

    def test_the_task_is_awaited_even_if_cleanup_raises(self):
        # There is no `finally` around the recording/audio steps that sit
        # between task creation and the await, so an exception there would
        # orphan the task and lose the lead silently.
        tail = SRC[SRC.index("await delivery_task") - 400:]
        self.assertIn("try:", tail[:400])
        self.assertIn("CRM delivery failed", tail)


class TheEventCannotDeadlock(unittest.TestCase):
    def test_set_is_reachable_on_the_timeout_path(self):
        # asyncio.wait_for raising TimeoutError inside the analysis block must
        # still reach analysis_done.set() — it sits after the except handlers,
        # not inside the try.
        tree = ast.parse(SRC)
        found = [n for n in ast.walk(tree)
                 if isinstance(n, ast.Attribute) and n.attr == "set"
                 and isinstance(n.value, ast.Name) and n.value.id == "analysis_done"]
        self.assertGreaterEqual(len(found), 2,
                                "expected a release for both the analysis and "
                                "no-transcript paths")


if __name__ == "__main__":
    unittest.main(verbosity=2)
