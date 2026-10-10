"""A DB failure at call start must decline the call, never answer it as the
wrong agent.

db.get_agent_config / get_phone_number_by_number return None on a query
error and raise on a pool timeout (dbconn.connect sits outside their try).
Before this, a None config built RealEstateAgent({}) - the generic default
persona with no account, unbilled and invisible to the tenant - and a None
number owner kept the SIP dispatch rule's static agent_id, which belongs to
another tenant.
"""
import asyncio
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import main


def run(coro):
    return asyncio.run(coro)


async def _done(value=None, exc=None):
    if exc is not None:
        raise exc
    return value


class NumberOwner(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(main, "_CALL_START_DB_RETRY_DELAY_S", 0)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_owner_found_first_time(self):
        with mock.patch.object(main.db, "get_phone_number_by_number", return_value={"agent_id": 5}) as lookup:
            self.assertEqual(run(main._lookup_number_owner("+911")), {"agent_id": 5})
        self.assertEqual(lookup.call_count, 1)

    def test_transient_failure_is_retried_once(self):
        with mock.patch.object(main.db, "get_phone_number_by_number", side_effect=[None, {"agent_id": 5}]):
            self.assertEqual(run(main._lookup_number_owner("+911")), {"agent_id": 5})

    def test_pool_timeout_twice_resolves_to_unknown(self):
        with mock.patch.object(main.db, "get_phone_number_by_number", side_effect=RuntimeError("PoolTimeout")):
            self.assertIsNone(run(main._lookup_number_owner("+911")))


class AgentConfig(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(main, "_CALL_START_DB_RETRY_DELAY_S", 0)
        patcher.start()
        self.addCleanup(patcher.stop)

    def await_config(self, first, agent_id, retry=None):
        async def go():
            task = asyncio.ensure_future(first)
            return await main._await_agent_config(task, agent_id)
        with mock.patch.object(main.db, "get_agent_config", side_effect=[retry]) as retry_lookup:
            return run(go()), retry_lookup

    def test_config_returned_without_retry(self):
        config, retry = self.await_config(_done({"id": 5}), 5)
        self.assertEqual(config, {"id": 5})
        retry.assert_not_called()

    def test_none_for_named_agent_is_retried(self):
        config, retry = self.await_config(_done(None), 5, retry={"id": 5})
        self.assertEqual(config, {"id": 5})
        retry.assert_called_once_with(5)

    def test_raised_lookup_is_retried_then_none(self):
        config, _ = self.await_config(_done(exc=RuntimeError("PoolTimeout")), 5, retry=None)
        self.assertIsNone(config)

    def test_demo_room_without_agent_id_is_not_retried(self):
        config, retry = self.await_config(_done(None), None)
        self.assertIsNone(config)
        retry.assert_not_called()


class EntrypointDeclines(unittest.TestCase):
    """The entrypoint must hang up on an unresolved owner or a missing named
    config, before anything is built or spoken."""
    def setUp(self):
        import inspect
        self.src = inspect.getsource(main.entrypoint)

    def test_unresolved_number_owner_hangs_up(self):
        start = self.src.index("owner = await _lookup_number_owner(dialled_number)")
        block = self.src[start:self.src.index("owner_agent_id = owner.get", start)]
        self.assertIn("await _hang_up(ctx.room.name)", block)
        self.assertIn("return", block)

    def test_missing_named_config_hangs_up_before_admission(self):
        start = self.src.index("config = await _await_agent_config(")
        block = self.src[start:self.src.index("_admission_task = ", start)]
        self.assertIn('config is None and call_context.get("agent_id") is not None', block)
        self.assertEqual(
            block.count("await _hang_up(ctx.room.name)"), 3,
            "config-missing, paused and unowned-agent all hang up",
        )

    def test_unowned_agent_is_declined_and_reported_before_admission(self):
        start = self.src.index("if _is_unowned_tenant_agent(config, call_context):")
        self.assertLess(start, self.src.index("_admission_task = "))
        block = self.src[start:self.src.index("_admission_base = ", start)]
        self.assertIn("db.log_platform_error", block)
        self.assertIn("await _hang_up(ctx.room.name)", block)
        self.assertIn("return", block)

    def test_admission_decline_tells_the_widget_before_hanging_up(self):
        start = self.src.index("if not _admitted:")
        block = self.src[start:self.src.index("return", start)]
        self.assertLess(
            block.index('await _signal_end_reason(ctx.room, "busy")'),
            block.index("await _hang_up(ctx.room.name)"),
        )

    def test_agent_construction_failure_hangs_up_and_frees_the_slot(self):
        # A missing provider key / unsupported realtime model raises inside
        # RealEstateAgent(...) after the caller joined and after admission
        # claimed a slot.
        start = self.src.index("agent = RealEstateAgent(")
        guard = self.src[self.src.rindex("try:", 0, start):start]
        self.assertEqual(guard.strip(), "try:", "construction must sit directly inside a try")
        block = self.src[start:self.src.index("_agent_ready_ms = ", start)]
        self.assertIn("except Exception", block)
        self.assertIn("db.log_platform_error", block)
        self.assertIn('account_id=cfg.get("account_id")', block)
        self.assertIn("await _hang_up(ctx.room.name)", block)
        self.assertIn("ctx.shutdown(", block)
        self.assertIn("return", block)
        # The slot is released by the shutdown callback, which must already be
        # registered before construction can fail.
        self.assertLess(self.src.index("ctx.add_shutdown_callback(_release_call_slot)"), start)


class UnownedAgent(unittest.TestCase):
    """account_id None skips every plan/credit/concurrency check in
    try_start_call, so only genuine platform paths may keep it."""

    def test_named_tenant_agent_without_account_is_declined(self):
        self.assertTrue(main._is_unowned_tenant_agent({"account_id": None}, {"agent_id": 7}))

    def test_owned_agent_is_allowed(self):
        self.assertFalse(main._is_unowned_tenant_agent({"account_id": 3}, {"agent_id": 7}))

    def test_platform_paths_keep_working(self):
        # Default demo room (no agent_id), the marketing demo and industry demos.
        self.assertFalse(main._is_unowned_tenant_agent({"account_id": None}, {"agent_id": None}))
        self.assertFalse(main._is_unowned_tenant_agent(
            {"account_id": None, "is_platform_demo": 1}, {"agent_id": 7}))
        self.assertFalse(main._is_unowned_tenant_agent(
            {"account_id": None, "public_demo_slug": "healthcare"}, {"agent_id": 7}))
        self.assertTrue(main._is_unowned_tenant_agent(
            {"account_id": None, "public_demo_slug": "  "}, {"agent_id": 7}))

    def test_no_config_is_left_to_the_existing_checks(self):
        self.assertFalse(main._is_unowned_tenant_agent(None, {"agent_id": 7}))
        self.assertFalse(main._is_unowned_tenant_agent({}, {"agent_id": None}))


class EndReasonSignal(unittest.TestCase):
    def setUp(self):
        patcher = mock.patch.object(main, "_END_REASON_PROPAGATE_S", 0)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_sets_the_attribute_the_widget_reads(self):
        room = mock.Mock()
        room.local_participant.set_attributes = mock.AsyncMock()
        run(main._signal_end_reason(room, "busy"))
        room.local_participant.set_attributes.assert_awaited_once_with({"vistrow.end_reason": "busy"})

    def test_failure_never_raises(self):
        room = mock.Mock()
        room.local_participant.set_attributes = mock.AsyncMock(side_effect=RuntimeError("not connected"))
        run(main._signal_end_reason(room, "busy"))  # must not raise


if __name__ == "__main__":
    unittest.main()
