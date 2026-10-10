"""Zoho gets one lead per reachable caller, upserted, with a useful description.
Every event (mid-call updates, bookings, and the end of EVERY call) used to
create a new "Unknown caller" record."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tools


END = {"type": "call_completed", "name": "Asha", "phone": "+919876543210", "channel": "widget",
       "extracted_data": {"business_type": "Real estate", "budget": "50k", "empty": ""},
       "agent_name": "Artha", "duration_seconds": 93.4, "recording_url": "https://x/rec"}


class WhatIsSent(unittest.TestCase):
    def test_only_the_end_of_call_event_with_a_way_to_reach_them(self):
        self.assertTrue(tools._zoho_should_send(END))
        self.assertTrue(tools._zoho_should_send({**END, "phone": "", "email": "a@x.in"}))
        self.assertFalse(tools._zoho_should_send({**END, "phone": "", "email": ""}), "anonymous visitor")
        for mid_call in ("lead_update", "platform_lead_update", "appointment_booked", "callback_requested"):
            self.assertFalse(tools._zoho_should_send({**END, "type": mid_call}), mid_call)

    def test_record_is_upserted_on_present_fields_only(self):
        body = tools._zoho_lead_body(END)
        record = body["data"][0]
        self.assertEqual(body["duplicate_check_fields"], ["Phone"])
        self.assertNotIn("Email", record, "an empty match field could hit an unrelated lead")
        self.assertEqual(record["Last_Name"], "Asha")
        self.assertEqual(record["Lead_Source"], "Website Widget")

    def test_description_carries_the_post_call_read(self):
        desc = tools._zoho_lead_body(END)["data"][0]["Description"]
        for part in ("Business type: Real estate", "Budget: 50k", "Agent: Artha", "Call length: 93 s", "Recording: https://x/rec"):
            self.assertIn(part, desc)
        self.assertNotIn("Empty", desc)

    def test_upsert_endpoint_and_skip_wiring(self):
        import inspect
        self.assertIn("/crm/v2/Leads/upsert", inspect.getsource(tools._deliver_zoho_crm_lead))
        fan_out = inspect.getsource(tools._deliver_to_integrations)
        self.assertLess(fan_out.index("if not _zoho_should_send(lead):"), fan_out.index("_deliver_zoho_crm_lead("))


if __name__ == "__main__":
    unittest.main()
