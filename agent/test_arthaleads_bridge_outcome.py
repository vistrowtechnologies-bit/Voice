"""Voice -> ArthaLeads after a call (2026-10-15 bridge fix).

- crm_outcome maps what the call produced to ArthaLeads' own booking /
  status vocabulary (constants/leadOptions.js) with follow-up and site-visit
  times, and claims nothing it does not know.
- The ArthaLeads body carries the lead id this call was placed for, the
  direction and that outcome.
- A temporary ArthaLeads failure is retried; a permanent one is not."""
import asyncio
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import aiohttp
import tools

# ArthaLeads backend/constants/leadOptions.js (keep in sync).
ARTHALEADS_BOOKING = {"", "Interested", "Not Interested", "Not Reachable", "Low Budget", "Call Back",
                      "Site Visit Booked", "Site Visit Done", "Booked", "Other Location", "Commercial"}
ARTHALEADS_STATUS = {"New", "Contacted", "Site Visit", "Negotiation", "Closed Won", "Closed Lost"}

SPOKE = [{"role": "assistant", "text": "Namaskaram"}, {"role": "user", "text": "Avunu, cheppandi"}]


class CrmOutcome(unittest.TestCase):
    def test_carrier_recording_is_not_a_contact(self):
        # Live call 1395: the network's "please try again later" recording was
        # transcribed as a caller turn; Vistrow had classified it carrier_unavailable.
        carrier = [{"role": "user", "text": "कृपया थोड्या वेळानंतर पुन्हा।"}]
        out = tools.crm_outcome({"transcript": carrier, "direction": "outbound",
                                 "failure_reason": "carrier_unavailable"})
        self.assertEqual(out, {"booking": "Not Reachable"})

    def test_voicemail_greeting_is_not_a_contact(self):
        out = tools.crm_outcome({"transcript": SPOKE, "direction": "outbound", "voicemail_detected": True})
        self.assertNotIn("status", out)
        self.assertEqual(out.get("booking"), "Not Reachable")

    def test_a_real_conversation_is_still_contacted(self):
        out = tools.crm_outcome({"transcript": SPOKE, "direction": "outbound", "failure_reason": "",
                                 "voicemail_detected": False})
        self.assertEqual(out.get("status"), "Contacted")

    def check_vocabulary(self, out):
        self.assertIn(out.get("booking", ""), ARTHALEADS_BOOKING)
        if "status" in out:
            self.assertIn(out["status"], ARTHALEADS_STATUS)

    def test_site_visit_wins_and_carries_the_visit_time_in_ist(self):
        out = tools.crm_outcome({"transcript": SPOKE, "site_visit": {"date": "2026-10-17", "time": "11:00",
                                                                      "purpose": "site visit"},
                                 "callback": {"date": "2026-10-18"}})
        self.assertEqual((out["booking"], out["status"]), ("Site Visit Booked", "Site Visit"))
        self.assertEqual(out["site_visit_at"], "2026-10-17T11:00:00+05:30")
        self.assertNotIn("follow_up_at", out)
        self.check_vocabulary(out)

    def test_callback_sets_a_follow_up(self):
        out = tools.crm_outcome({"transcript": SPOKE, "callback": {"date": "2026-10-20", "time": "18:30",
                                                                    "purpose": "after Diwali"}})
        self.assertEqual((out["booking"], out["status"], out["follow_up_at"]),
                         ("Call Back", "Contacted", "2026-10-20T18:30:00+05:30"))
        self.assertEqual(out["note"], "after Diwali")
        self.check_vocabulary(out)

    def test_callback_without_a_date_has_no_follow_up_time(self):
        out = tools.crm_outcome({"transcript": SPOKE, "callback": {"time": "18:30"}})
        self.assertEqual(out["booking"], "Call Back")
        self.assertNotIn("follow_up_at", out)

    def test_account_timezone_is_used(self):
        out = tools.crm_outcome({"transcript": SPOKE, "callback": {"date": "2026-10-20", "time": "09:00"},
                                 "timezone": "Asia/Dubai"})
        self.assertEqual(out["follow_up_at"], "2026-10-20T09:00:00+04:00")

    def test_opt_out_is_not_interested(self):
        out = tools.crm_outcome({"transcript": SPOKE, "opted_out": True})
        self.assertEqual((out["booking"], out["status"]), ("Not Interested", "Contacted"))

    def test_unanswered_outbound_is_not_reachable_and_does_not_advance_the_stage(self):
        out = tools.crm_outcome({"transcript": [{"role": "assistant", "text": "Hello?"}], "direction": "outbound"})
        self.assertEqual(out, {"booking": "Not Reachable"})

    def test_silent_inbound_says_nothing(self):
        self.assertEqual(tools.crm_outcome({"transcript": [], "direction": "inbound"}), {})

    def test_interest_level_is_used_only_when_recognisable(self):
        self.assertEqual(tools.crm_outcome({"transcript": SPOKE, "extracted_data": {"interest_level": "High"}})["booking"],
                         "Interested")
        self.assertEqual(tools.crm_outcome({"transcript": SPOKE, "extracted_data": {"interest_level": "not interested"}})["booking"],
                         "Not Interested")
        out = tools.crm_outcome({"transcript": SPOKE, "extracted_data": {"interest_level": "maybe later?"}})
        self.assertEqual(out, {"status": "Contacted"})


class ArthaLeadsBody(unittest.TestCase):
    def test_body_carries_lead_id_direction_and_outcome(self):
        lead = {"type": "call_completed", "name": "Ravi", "phone": "+919812345678", "transcript": SPOKE,
                "call_id": 9, "direction": "outbound", "arthaleads_lead_id": "65f0c0ffee0000000000abcd",
                "callback": {"date": "2026-10-20", "time": "18:30"}}
        url, body = tools._integration_body("arthaleads", {"token": "t"}, lead)
        self.assertEqual(url, tools._ARTHALEADS_URL)
        self.assertEqual(body["arthaleads_lead_id"], "65f0c0ffee0000000000abcd")
        self.assertEqual(body["direction"], "outbound")
        self.assertEqual(body["crm_outcome"]["booking"], "Call Back")
        self.assertEqual(body["call_id"], 9)

    def test_inbound_web_call_sends_empty_lead_id(self):
        lead = {"type": "call_completed", "name": "Ravi", "phone": "+919812345678", "transcript": SPOKE}
        _, body = tools._integration_body("arthaleads", {"token": "t"}, lead)
        self.assertEqual((body["arthaleads_lead_id"], body["direction"]), ("", ""))


class _Resp:
    def __init__(self, status, text=""):
        self.status, self._text = status, text

    async def text(self):
        return self._text

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _Http:
    def __init__(self, outcomes):
        self.outcomes, self.calls = list(outcomes), 0

    def post(self, url, json=None):
        self.calls += 1
        item = self.outcomes.pop(0)
        if isinstance(item, Exception):
            raise item
        return _Resp(*item)


class Retry(unittest.TestCase):
    def run_post(self, outcomes, retries=2):
        http = _Http(outcomes)
        with patch.object(tools, "_RETRY_DELAYS_S", (0.0, 0.0)):
            result = asyncio.run(tools._post_json_with_retry(http, "u", {}, retries=retries))
        return result, http.calls

    def test_server_error_then_success(self):
        self.assertEqual(self.run_post([(500, "boom"), (502, ""), (201, "ok")]), ((201, "ok"), 3))

    def test_network_error_then_success(self):
        self.assertEqual(self.run_post([aiohttp.ClientConnectionError(), (200, "ok")]), ((200, "ok"), 2))

    def test_permanent_errors_are_not_retried(self):
        for status in (400, 401, 403, 404):
            self.assertEqual(self.run_post([(status, "no")]), ((status, "no"), 1), status)

    def test_gives_up_after_the_retries(self):
        self.assertEqual(self.run_post([(503, "a"), (503, "b"), (503, "c")]), ((503, "c"), 3))
        with self.assertRaises(aiohttp.ClientError):
            self.run_post([aiohttp.ClientConnectionError()] * 3)

    def test_no_retry_for_other_integrations(self):
        self.assertEqual(self.run_post([(500, "x"), (200, "")], retries=0), ((500, "x"), 1))

    def test_403_reason_is_readable(self):
        self.assertEqual(tools._json_message('{"success":false,"message":"This integration is part of the Enterprise plan."}'),
                         "This integration is part of the Enterprise plan.")
        self.assertEqual(tools._json_message("<html>"), "")


class ToolsRememberForTheCrm(unittest.TestCase):
    def context(self):
        from unittest.mock import MagicMock

        ctx = MagicMock()
        ctx.userdata = {"account_id": 2, "agent_id": 5, "lead_data": {}, "visitor_phone": "+919812345678"}
        return ctx

    def test_callback_request_is_kept_in_lead_data(self):
        from unittest.mock import AsyncMock

        ctx = self.context()
        with patch.object(tools, "_is_demo", return_value=False), \
                patch.object(tools.db, "record_callback_request", return_value={"ok": True}), \
                patch.object(tools, "_publish_event", new=AsyncMock()), \
                patch.object(tools, "_post_webhook", new=AsyncMock()), \
                patch.object(tools, "_fan_out_integrations", new=AsyncMock()):
            asyncio.run(tools.request_callback._func(ctx, "Ravi", "9812345678", "2026-10-20", "18:30", "site visit"))
        self.assertEqual(ctx.userdata["lead_data"]["callback"],
                         {"date": "2026-10-20", "time": "18:30", "purpose": "site visit"})

    def test_do_not_call_marks_the_lead_opted_out(self):
        from unittest.mock import AsyncMock

        ctx = self.context()
        with patch.object(tools, "_is_demo", return_value=False), \
                patch.object(tools.db, "record_do_not_call", return_value=True), \
                patch.object(tools, "_publish_event", new=AsyncMock()):
            asyncio.run(tools.do_not_call._func(ctx, "busy"))
        self.assertTrue(ctx.userdata["lead_data"]["opted_out"])


if __name__ == "__main__":
    unittest.main()
