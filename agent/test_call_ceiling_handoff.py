"""The platform call ceiling ends agent-only calls, not a call a person has
taken over; a tenant's own limit still applies to every call. The widget's
busy signal (and its wait) is skipped on phone calls."""
import asyncio
import inspect
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import call_limit
import main


async def _no_sleep(_s):
    return None


def run_guard(userdata, spare):
    hung_up = []

    async def hang_up():
        hung_up.append(True)

    asyncio.run(call_limit.run_guard(
        600, userdata=userdata, speak=lambda _i: None, hang_up=hang_up,
        spare_handed_off=spare, sleep=_no_sleep,
    ))
    return bool(hung_up)


class CeilingSparesAHandedOffCall(unittest.TestCase):
    def test_platform_ceiling_leaves_a_human_handoff_running(self):
        self.assertFalse(run_guard({"handed_off": True}, spare=True))

    def test_platform_ceiling_still_ends_an_agent_only_call(self):
        self.assertTrue(run_guard({}, spare=True))

    def test_tenant_limit_ends_a_handed_off_call_as_before(self):
        self.assertTrue(run_guard({"handed_off": True}, spare=False))


class TenantLimit(unittest.TestCase):
    def test_only_a_limit_below_the_ceiling_counts_as_the_tenants(self):
        ceiling = main._PLATFORM_MAX_CALL_DURATION_S
        for configured, tenant in ((0, 0), (None, 0), ("x", 0), (300, 300), (ceiling, 0), (ceiling + 60, 0)):
            self.assertEqual(main._tenant_max_call_duration_s(configured), tenant, configured)
            self.assertEqual(main._effective_max_call_duration_s(configured), tenant or ceiling)

    def test_entrypoint_spares_only_under_the_platform_ceiling(self):
        src = inspect.getsource(main.entrypoint)
        self.assertIn('spare_handed_off=_tenant_max_call_duration_s(cfg.get("max_call_duration_s")) == 0', src)


class BusySignalIsWidgetOnly(unittest.TestCase):
    def test_phone_declines_skip_the_signal(self):
        src = inspect.getsource(main.entrypoint)
        block = src[src.index("if not _admitted:"):]
        block = block[:block.index("await _hang_up(ctx.room.name)")]
        self.assertIn('if call_context.get("call_type") != "phone":', block)


if __name__ == "__main__":
    unittest.main()
