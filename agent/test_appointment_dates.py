"""Appointments must never be offered or booked in the past, and the model's
"today" must be the same day the calendar uses.

check_appointment_availability only filtered past times when the date was
today, so a past date returned every slot; those slots became "verified" for
book_appointment and book_native_appointment inserted them. Separately the
prompt's "today" was hardcoded IST while availability used the account's own
timezone.
"""
import asyncio
import datetime as _dt
import os
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import db
import main

# Saturday 10 Oct 2026, 08:40 UTC = 14:10 IST.
_FIXED_UTC = _dt.datetime(2026, 10, 10, 8, 40, tzinfo=_dt.timezone.utc)


class _FixedDateTime(_dt.datetime):
    @classmethod
    def now(cls, tz=None):
        return _FIXED_UTC.astimezone(tz) if tz else _FIXED_UTC.replace(tzinfo=None)


_FAKE_DATETIME_MODULE = types.SimpleNamespace(datetime=_FixedDateTime, date=_dt.date)
_CFG = dict(db._AVAILABILITY_DEFAULTS)  # Asia/Kolkata, Sat 10:00-19:00, 30 min


class Availability(unittest.TestCase):
    def setUp(self):
        self.conn = mock.MagicMock(name="conn")
        self.conn.execute.return_value.fetchall.return_value = []  # no bookings
        for patcher in (
            mock.patch.object(db, "datetime", _FAKE_DATETIME_MODULE),
            mock.patch.object(db.dbconn, "connect", return_value=self.conn),
            mock.patch.object(db, "get_availability_config", return_value=dict(_CFG)),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_past_date_has_no_slots(self):
        self.assertEqual(db.check_appointment_availability(1, "2026-10-09", 30), [])

    def test_today_drops_times_already_passed(self):
        slots = db.check_appointment_availability(1, "2026-10-10", 30)
        self.assertEqual(slots[0], "14:30")  # it is 14:10 IST
        self.assertNotIn("14:00", slots)

    def test_future_date_has_the_full_day(self):
        slots = db.check_appointment_availability(1, "2026-10-12", 30)  # Monday
        self.assertEqual(slots[0], "10:00")

    def test_booking_a_past_time_is_refused_without_an_insert(self):
        result = db.book_native_appointment(1, 2, "2026-10-10", "13:00", 30, "A", "+911", "visit")
        self.assertFalse(result["ok"])
        db.dbconn.connect.assert_not_called()

    def test_booking_a_past_date_is_refused(self):
        result = db.book_native_appointment(1, 2, "2026-10-09", "16:00", 30, "A", "+911", "visit")
        self.assertFalse(result["ok"])

    def test_booking_a_future_time_still_inserts(self):
        with mock.patch.object(db, "_appt_slot_conflict", return_value=False), \
             mock.patch.object(db, "account_phone", return_value="+911"):
            result = db.book_native_appointment(1, 2, "2026-10-10", "16:00", 30, "A", "+911", "visit")
        self.assertEqual(result, {"ok": True})


class PromptToday(unittest.TestCase):
    # 19:00 UTC: already Sunday 11 Oct in India, still Saturday 10 Oct in Dubai.
    NEAR_MIDNIGHT = _dt.datetime(2026, 10, 10, 19, 0, tzinfo=_dt.timezone.utc)

    def test_non_ist_tenant_gets_its_own_today(self):
        local, label = main._call_local_now("Asia/Dubai", self.NEAR_MIDNIGHT)
        self.assertEqual(local.date(), _dt.date(2026, 10, 10))
        self.assertEqual(local.strftime("%H:%M"), "23:00")
        self.assertEqual(label, "(Asia/Dubai time)")

    def test_ist_default_keeps_the_ist_label(self):
        local, label = main._call_local_now(None, self.NEAR_MIDNIGHT)
        self.assertEqual(local.date(), _dt.date(2026, 10, 11))
        self.assertEqual(label, "IST")

    def test_invalid_timezone_falls_back_to_ist(self):
        local, label = main._call_local_now("Not/AZone", self.NEAR_MIDNIGHT)
        self.assertEqual(label, "IST")
        self.assertEqual(local.date(), _dt.date(2026, 10, 11))

    def test_prompt_uses_the_availability_timezone(self):
        import inspect
        src = inspect.getsource(main.RealEstateAgent.__init__)
        self.assertIn('_call_local_now((config.get("_availability_config") or {}).get("timezone"))', src)
        self.assertNotIn("datetime.now(_IST)", src)

    def test_call_context_loads_the_availability_config(self):
        with mock.patch.object(main.db, "get_compliance_config", return_value={}), \
             mock.patch.object(main.db, "get_availability_config", return_value={"timezone": "Asia/Dubai"}) as avail:
            config = asyncio.run(main._load_runtime_call_context({"account_id": 7}, None))
        avail.assert_called_once_with(7)
        self.assertEqual(config["_availability_config"], {"timezone": "Asia/Dubai"})

    def test_failed_availability_read_falls_back_to_empty(self):
        with mock.patch.object(main.db, "get_compliance_config", return_value={}), \
             mock.patch.object(main.db, "get_availability_config", side_effect=RuntimeError("PoolTimeout")):
            config = asyncio.run(main._load_runtime_call_context({"account_id": 7}, None))
        self.assertEqual(config["_availability_config"], {})


if __name__ == "__main__":
    unittest.main()
