"""log_lead must not make the caller wait for a webhook.

Measured across calls 905-926: a turn with no tool call reaches speech in
1,642ms (median, n=100); a turn containing log_lead takes 3,708ms (n=11).
The tool's own body runs in 6ms. The whole ~2s gap was this awaited fan-out
- publish, webhook, integrations - plus the second full-prompt LLM call it
delayed, while the caller sat listening to "One second...".

Nothing in the spoken reply depends on the webhook landing, and lead_data is
updated in memory before the fan-out starts, so the summary handed back to
the model is true whether or not the network call has finished.

The risk this trades into, and why drain_background_fanout exists: a lead
logged in the final seconds of a call would be cut off by teardown, because
_publish_event writes to a room that stops existing. Losing leads to save
2s would be a bad trade; these tests pin both halves.
"""
import asyncio
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import tools

log_lead = tools.log_lead.__wrapped__

SLOW = 0.4  # stands in for the ~1.8s fan-out the code comment measured


class FakeContext:
    """RunContext only needs to carry userdata for this path."""

    def __init__(self):
        self.userdata = {"lead_data": {}}


class Harness(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.calls = []
        self._orig = (tools._publish_event, tools._post_webhook, tools._fan_out_integrations)

        async def slow(name):
            async def _f(*a, **k):
                await asyncio.sleep(SLOW)
                self.calls.append(name)
            return _f

        tools._publish_event = await slow("publish")
        tools._post_webhook = await slow("webhook")
        tools._fan_out_integrations = await slow("integrations")

    async def asyncTearDown(self):
        tools._publish_event, tools._post_webhook, tools._fan_out_integrations = self._orig
        await tools.drain_background_fanout(timeout=5)


class LogLeadReturnsImmediately(Harness):
    async def test_does_not_wait_for_the_fan_out(self):
        ctx = FakeContext()
        t0 = time.perf_counter()
        result = await log_lead(ctx, name="Rahul Deshmukh", phone="9876543210")
        elapsed = time.perf_counter() - t0
        # Three awaited network calls would be 3*SLOW. Anything near that
        # means the caller is back to waiting on a webhook.
        self.assertLess(elapsed, SLOW,
                        f"log_lead blocked for {elapsed*1000:.0f}ms — fan-out is back on the speech path")
        self.assertIn("Saved", result)

    async def test_the_reply_is_still_accurate(self):
        # The model reasons from this string when picking its next question,
        # so it must reflect the merged state even though the write is async.
        ctx = FakeContext()
        result = await log_lead(ctx, name="Rahul Deshmukh", need="website for sweets shop")
        self.assertIn("Rahul Deshmukh", result)

    @unittest.expectedFailure
    def test_need_reaches_the_webhook(self):
        """PRE-EXISTING BUG, unrelated to the non-blocking change.

        `need` is stored as use_case and the docstring calls it "the one
        field that is never inapplicable" - it exists so a dentist, caterer
        or software buyer gets their requirement recorded at all. But
        _LEAD_FIELDS omits use_case, and _LEAD_FIELDS builds BOTH the summary
        handed back to the model and the event dict sent to the webhook and
        CRM fan-out. tools.py:647 and :681 read lead.get("use_case") from
        that dict, so they always read "".

        Marked expectedFailure rather than fixed here: adding the field
        changes the webhook payload every tenant integration receives, which
        is their call to make, not a side effect of a latency fix.
        """
        self.assertIn("use_case", tools._LEAD_FIELDS)

    async def test_lead_data_is_updated_synchronously(self):
        ctx = FakeContext()
        await log_lead(ctx, name="Rahul Deshmukh", phone="9876543210")
        self.assertEqual(ctx.userdata["lead_data"]["name"], "Rahul Deshmukh")
        self.assertTrue(ctx.userdata["lead_captured"])


class TheFanOutStillHappens(Harness):
    async def test_all_three_targets_run_in_the_background(self):
        ctx = FakeContext()
        await log_lead(ctx, name="Rahul Deshmukh", phone="9876543210")
        self.assertEqual(self.calls, [], "fan-out ran inline, not in the background")
        await tools.drain_background_fanout(timeout=5)
        self.assertEqual(sorted(self.calls), ["integrations", "publish", "webhook"])

    async def test_drain_waits_for_a_lead_logged_at_the_last_moment(self):
        # A lead logged as the call ends must survive teardown. Without the
        # drain this is exactly where non-blocking loses data.
        ctx = FakeContext()
        await log_lead(ctx, name="Rahul Deshmukh", phone="9876543210")
        await tools.drain_background_fanout(timeout=5)
        self.assertEqual(len(self.calls), 3)

    async def test_drain_is_a_no_op_when_nothing_is_pending(self):
        t0 = time.perf_counter()
        await tools.drain_background_fanout(timeout=5)
        self.assertLess(time.perf_counter() - t0, 0.05)

    async def test_a_failing_webhook_never_reaches_the_caller(self):
        # The lead is already recorded; a webhook 500 must not become a tool
        # error the model then apologises for on the phone.
        async def boom(*a, **k):
            raise RuntimeError("webhook 500")

        tools._post_webhook = boom
        ctx = FakeContext()
        result = await log_lead(ctx, name="Rahul Deshmukh", phone="9876543210")
        self.assertIn("Saved", result)
        await tools.drain_background_fanout(timeout=5)


class TasksAreNotGarbageCollected(Harness):
    async def test_pending_tasks_are_strongly_referenced(self):
        # asyncio keeps only a weak reference to a running task. Without the
        # module-level set, an unreferenced fan-out can be collected
        # mid-flight — silently dropping leads rather than delaying them.
        ctx = FakeContext()
        await log_lead(ctx, name="Rahul Deshmukh", phone="9876543210")
        self.assertTrue(tools._BACKGROUND_FANOUT, "no strong reference held to the fan-out task")
        await tools.drain_background_fanout(timeout=5)
        self.assertFalse([t for t in tools._BACKGROUND_FANOUT if not t.done()])

    async def test_several_leads_in_one_call_all_complete(self):
        # log_lead is called repeatedly across a call, one field at a time.
        ctx = FakeContext()
        for field in ("Rahul Deshmukh", "9876543210", "Pune"):
            await log_lead(ctx, name=field)
        await tools.drain_background_fanout(timeout=5)
        self.assertEqual(len(self.calls), 9)  # 3 leads x 3 targets


if __name__ == "__main__":
    unittest.main(verbosity=2)
