"""Compliance → "Require spoken consent" has to do something.

Until 2026-09-24 the dashboard saved this toggle and nothing read it, so a
tenant who switched it on believed callers were being asked and none were.
Now: the agent asks, record_consent logs the answer on the call, and a
recording is only kept after a clear yes.
"""
import asyncio
import inspect
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")

import main
import tools

record_consent = tools.record_consent.__wrapped__
TENANT = {"id": 26, "account_id": 2, "name": "Artha"}


def _compliance(require_consent: bool, record_calls: bool = True):
    return patch.object(
        main.db, "get_compliance_config",
        return_value={"require_consent": require_consent, "record_calls": record_calls, "retention_days": 0},
    )


class FakeContext:
    def __init__(self):
        self.userdata = {}


class TheToolRecordsTheAnswer(unittest.TestCase):
    def setUp(self):
        stub = patch.object(tools, "_publish_event", new=lambda *a, **k: asyncio.sleep(0))
        stub.start()
        self.addCleanup(stub.stop)

    def test_yes_is_stored(self):
        ctx = FakeContext()
        reply = asyncio.run(record_consent(ctx, granted=True, words="haan theek hai"))
        self.assertTrue(ctx.userdata["spoken_consent"]["granted"])
        self.assertEqual(ctx.userdata["spoken_consent"]["words"], "haan theek hai")
        self.assertIn("normally", reply)

    def test_no_tells_the_model_to_stop_collecting_details(self):
        ctx = FakeContext()
        reply = asyncio.run(record_consent(ctx, granted=False, words="nahi"))
        self.assertFalse(ctx.userdata["spoken_consent"]["granted"])
        self.assertIn("not be recorded", reply)
        self.assertIn("do not ask for or log", reply)


class OnlyWhenTheAccountRequiresIt(unittest.TestCase):
    def test_tool_bound_when_required(self):
        with _compliance(True):
            self.assertIn(record_consent.__name__, [t.__wrapped__.__name__ if hasattr(t, "__wrapped__") else getattr(t, "__name__", "") for t in main._build_tools(dict(TENANT))])

    def test_tool_absent_when_not_required(self):
        with _compliance(False):
            names = [getattr(getattr(t, "__wrapped__", t), "__name__", "") for t in main._build_tools(dict(TENANT))]
        self.assertNotIn("record_consent", names)

    def test_prompt_asks_first_and_mentions_recording_only_when_recording(self):
        with _compliance(True, record_calls=True):
            text = main._consent_instructions(dict(TENANT))
        self.assertIn("very first reply", text)
        self.assertIn("recorded", text)
        with _compliance(True, record_calls=False):
            self.assertNotIn("recorded", main._consent_instructions(dict(TENANT)))
        with _compliance(False):
            self.assertEqual(main._consent_instructions(dict(TENANT)), "")

    def test_public_demos_never_ask(self):
        with _compliance(True):
            self.assertEqual(main._consent_instructions({**TENANT, "is_platform_demo": 1}), "")


class RecordingIsKeptOnlyAfterAYes(unittest.TestCase):
    """The teardown lives inside entrypoint(), so pin the gate in its source."""

    def test_recording_is_discarded_without_granted_consent(self):
        src = inspect.getsource(main.entrypoint)
        gate = src.index('_requires_spoken_consent(cfg) and not spoken.get("granted")')
        self.assertLess(gate, src.index("recording.upload_recording"),
                        "the consent gate must run before the upload, not after it")
        self.assertIn("os.remove(local_path)", src[gate:src.index("recording.upload_recording")])

    def test_the_call_record_carries_the_spoken_answer(self):
        src = inspect.getsource(main.entrypoint)
        self.assertIn('json.dumps(userdata["spoken_consent"]', src)


if __name__ == "__main__":
    unittest.main()
