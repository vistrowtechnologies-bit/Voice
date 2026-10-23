"""Call 1476 (23 Oct 2026): request_callback held the reply 3.8 s and still
failed - appointments.appt_date/start_time are NOT NULL, and a callback with
no day or time passed None, so no callback request had ever been stored."""
import asyncio
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import db
import tools


class CallbackWithoutADayIsStored(unittest.TestCase):
    def test_missing_date_and_time_are_empty_strings_not_null(self):
        conn = MagicMock()
        with patch.object(db.dbconn, "connect", return_value=conn), \
                patch.object(db, "account_phone", return_value="+919800000001"):
            result = db.record_callback_request(2, 26, "Abhishek", "9800000001", "", "", "team call")
        self.assertEqual(result, {"ok": True})
        params = conn.execute.call_args.args[1]
        self.assertEqual(params[5:7], ("", ""))


class CallbackDoesNotWaitForWebhooks(unittest.TestCase):
    def test_fan_out_runs_in_the_background(self):
        ctx = SimpleNamespace(userdata={"account_id": 2, "agent_id": 26, "lead_data": {}})
        with patch.object(tools, "_is_demo", return_value=False), \
                patch.object(tools.db, "record_callback_request", return_value={"ok": True}), \
                patch.object(tools, "_fan_out_in_background") as background, \
                patch.object(tools, "_post_webhook") as awaited_webhook:
            asyncio.run(tools.request_callback.__wrapped__(ctx, name="Abhishek", phone="9800000001"))
        background.assert_called_once()
        awaited_webhook.assert_not_called()



class TestCallsWriteNothing(unittest.TestCase):
    """Owner, 23 Oct 2026: dashboard test calls booked real appointments."""

    def _ctx(self, room_name):
        return SimpleNamespace(userdata={"account_id": 2, "agent_id": 26, "lead_data": {},
                                         "room": SimpleNamespace(name=room_name)})

    def test_test_rooms_are_recognised(self):
        self.assertTrue(tools._is_test_call(self._ctx("test-agent-26-qlzml5hk")))
        self.assertTrue(tools._is_test_call(self._ctx("test-phone-26-abc")))
        self.assertFalse(tools._is_test_call(self._ctx("call-26-abc")))
        self.assertFalse(tools._is_test_call(SimpleNamespace(userdata={})))

    def test_a_test_call_books_and_requests_callbacks_without_writing(self):
        ctx = self._ctx("test-agent-26-x")
        with patch.object(tools, "_is_demo", return_value=False), \
                patch.object(tools.db, "book_native_appointment") as book, \
                patch.object(tools.db, "record_callback_request") as callback, \
                patch.object(tools, "_fan_out_in_background"):
            self.assertEqual(asyncio.run(tools._calendar_book(ctx, "2026-10-25", "14:00", 30, "A", "9800000001", "x")),
                             {"ok": True})
            asyncio.run(tools.request_callback.__wrapped__(ctx, name="A", phone="9800000001"))
        book.assert_not_called()
        callback.assert_not_called()


class CallbackNeverUsesTheBusinessNumber(unittest.TestCase):
    """Call 1479: request_callback was called with the business's own number."""

    def test_number_from_the_prompt_is_rejected(self):
        agent = SimpleNamespace(instructions="Contact +91 90670 97779, hello@vistrow.com.")
        ctx = SimpleNamespace(userdata={"account_id": 2, "lead_data": {}}, session=SimpleNamespace(current_agent=agent))
        with patch.object(tools.db, "record_callback_request") as write:
            reply = asyncio.run(tools.request_callback.__wrapped__(ctx, name="Abhishek", phone="9067097779"))
        self.assertIn("CALLBACK NOT RECORDED", reply)
        write.assert_not_called()

    def test_the_callers_own_number_is_fine_even_if_in_the_prompt(self):
        agent = SimpleNamespace(instructions="Caller number 9067097779")
        ctx = SimpleNamespace(userdata={"visitor_phone": "+919067097779"}, session=SimpleNamespace(current_agent=agent))
        self.assertFalse(tools._is_business_own_number(ctx, "9067097779"))

if __name__ == "__main__":
    unittest.main()
