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
        self.assertEqual(block.count("await _hang_up(ctx.room.name)"), 2, "config-missing and paused both hang up")


if __name__ == "__main__":
    unittest.main()
