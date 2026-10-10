"""EnableX inbound: bridge each call leg exactly once, and never block the
API's event loop while doing it."""
import ast
import os
import threading
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


def load_claims():
    ns = {"threading": threading, "_ENABLEX_BRIDGED_VOICE_IDS": set(), "_ENABLEX_BRIDGE_LOCK": threading.Lock()}
    exec(function_source("_claim_enablex_bridge"), ns)
    exec(function_source("_release_enablex_bridge"), ns)
    return ns["_claim_enablex_bridge"], ns["_release_enablex_bridge"]


class BridgeOnce(unittest.TestCase):
    def test_second_event_for_the_same_leg_is_refused(self):
        claim, _ = load_claims()
        self.assertTrue(claim("v1"))
        self.assertFalse(claim("v1"), "a repeated incomingcall or a later connected must not re-bridge")
        self.assertTrue(claim("v2"))

    def test_failed_bridge_releases_the_leg_for_a_later_rescue(self):
        claim, release = load_claims()
        self.assertTrue(claim("v1"))
        release("v1")
        self.assertTrue(claim("v1"))

    def test_concurrent_claims_admit_exactly_one(self):
        claim, _ = load_claims()
        wins, barrier = [], threading.Barrier(8)

        def go():
            barrier.wait()
            if claim("same"):
                wins.append(1)

        threads = [threading.Thread(target=go) for _ in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertEqual(len(wins), 1)


class HandlerWiring(unittest.TestCase):
    def test_route_hands_blocking_work_to_the_threadpool(self):
        route = function_source("enablex_inbound_event")
        self.assertIn("await asyncio.to_thread(_handle_enablex_inbound_event", route)
        self.assertNotIn("calls_db.", route.split("await asyncio.to_thread")[0].split('"""')[-1])

    def test_both_bridge_states_claim_and_failures_release(self):
        handler = function_source("_handle_enablex_inbound_event")
        self.assertIn("_claim_enablex_bridge(voice_id)", handler)
        self.assertEqual(handler.count("_release_enablex_bridge(voice_id)"), 2, "accept failure and bridge failure")
        self.assertNotIn("_ENABLEX_BRIDGED_VOICE_IDS", handler, "only the locked helpers touch the set")
        self.assertLess(handler.index("_claim_enablex_bridge"), handler.index("accept_if_ringing"))


if __name__ == "__main__":
    unittest.main()
