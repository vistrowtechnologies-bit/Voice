"""Razorpay webhook deliveries are processed once; a failure releases the
claim so Razorpay's retry can run it."""
import ast
import logging
import os
import types
import unittest


HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "token_api.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()
TREE = ast.parse(SOURCE)


def function_source(name: str) -> str:
    node = next(n for n in ast.walk(TREE) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
    return ast.get_source_segment(SOURCE, node) or ""


class FakeDb:
    def __init__(self):
        self.seen, self.released = set(), []

    def claim_razorpay_webhook_event(self, event_id, event_type):
        if event_id in self.seen:
            return False
        self.seen.add(event_id)
        return True

    def release_razorpay_webhook_event(self, event_id):
        self.seen.discard(event_id)
        self.released.append(event_id)


def handler(db, process):
    ns = {"calls_db": db, "logger": logging.getLogger("t"), "_process_razorpay_event": process}
    exec(function_source("_handle_razorpay_webhook"), ns)
    return ns["_handle_razorpay_webhook"]


class DeliveredOnce(unittest.TestCase):
    def test_redelivery_is_not_processed_again(self):
        db, calls = FakeDb(), []
        handle = handler(db, lambda e: calls.append(e) or {"ok": True})
        event = {"event": "subscription.charged"}
        handle(event, "evt_1")
        handle(event, "evt_1")
        self.assertEqual(len(calls), 1)

    def test_failure_releases_the_claim_for_razorpays_retry(self):
        db, attempts = FakeDb(), []

        def flaky(event):
            attempts.append(1)
            if len(attempts) == 1:
                raise RuntimeError("db down")
            return {"ok": True}

        handle = handler(db, flaky)
        with self.assertRaises(RuntimeError):
            handle({"event": "subscription.charged"}, "evt_2")
        self.assertEqual(db.released, ["evt_2"])
        self.assertEqual(handle({"event": "subscription.charged"}, "evt_2"), {"ok": True})
        self.assertEqual(len(attempts), 2)

    def test_missing_event_id_still_processes(self):
        db, calls = FakeDb(), []
        handler(db, lambda e: calls.append(e) or {"ok": True})({"event": "payment.captured"}, "")
        self.assertEqual(len(calls), 1)


class Wiring(unittest.TestCase):
    def test_route_offloads_and_passes_the_event_id(self):
        route = function_source("billing_razorpay_webhook")
        self.assertIn('request.headers.get("x-razorpay-event-id", "")', route)
        self.assertIn("asyncio.to_thread(", route)

    def test_charged_skips_an_already_recorded_payment(self):
        process = function_source("_process_razorpay_event")
        charged = process[process.index('"subscription.charged"'):]
        self.assertLess(charged.index("invoice_exists_for_payment"), charged.index("record_invoice"))

    def test_unmatched_paid_events_reach_system_health(self):
        self.assertEqual(function_source("_process_razorpay_event").count("_report_unmatched_razorpay_event("), 2)
        self.assertIn("admin_db.log_error(", function_source("_report_unmatched_razorpay_event"))


if __name__ == "__main__":
    unittest.main()
