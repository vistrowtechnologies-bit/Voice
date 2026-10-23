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


if __name__ == "__main__":
    unittest.main()
