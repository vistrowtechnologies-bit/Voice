import unittest

import calls_db


class TenantCallDiagnosticsTests(unittest.TestCase):
    def test_raw_events_are_sorted_and_internal_fields_are_removed(self) -> None:
        row = {
            "diagnostic_events_json": """[
                {"id":"tool","kind":"tool","stage":"action","label":"internal","name":"book_appointment","status":"ok","offsetMs":2500,"durationMs":420,"provider":"secret-vendor","error":"secret payload"},
                {"id":"start","kind":"lifecycle","stage":"dispatch","label":"Call dispatched","status":"ok","offsetMs":0}
            ]""",
            "duration_seconds": 3,
        }

        events, captured = calls_db._tenant_diagnostic_events(row)

        self.assertTrue(captured)
        self.assertEqual([event["id"] for event in events], ["start", "tool"])
        self.assertEqual(events[1]["label"], "Booked an appointment")
        self.assertEqual(events[1]["durationMs"], 420)
        self.assertNotIn("provider", events[1])
        self.assertNotIn("error", events[1])
        self.assertNotIn("name", events[1])

    def test_legacy_events_only_use_measured_milestones(self) -> None:
        row = {
            "diagnostic_events_json": "",
            "connect_latency_ms": 300,
            "agent_join_latency_ms": 700,
            "first_response_latency_ms": 1400,
            "duration_seconds": 10,
            "disconnect_reason": "participant_disconnected",
        }

        events, captured = calls_db._tenant_diagnostic_events(row)

        self.assertFalse(captured)
        self.assertEqual(events[-1]["label"], "Call ended")
        self.assertEqual(events[-1]["offsetMs"], 10_000)
        self.assertEqual(events[-1]["status"], "ok")


if __name__ == "__main__":
    unittest.main()
