"""A calling-window typo must be refused on save, and a bad stored value must
not turn the window off (it used to mean "call at any hour")."""
import datetime
import unittest
from unittest import mock

import calls_db

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))


def cfg(**overrides):
    return {**calls_db._COMPLIANCE_DEFAULTS, **overrides}


class SaveIsValidated(unittest.TestCase):
    def save(self, **data):
        with mock.patch.object(calls_db, "get_compliance", return_value=cfg()), \
                mock.patch.object(calls_db, "set_setting") as stored:
            calls_db.save_compliance(1, data)
        return stored

    def test_valid_rules_are_saved(self):
        stored = self.save(window_start="08:30", window_end="20:00", timezone="Asia/Dubai", active_days=["Mon"])
        stored.assert_called_once()

    def test_bad_values_are_refused_and_not_stored(self):
        for bad in ({"window_start": "9"}, {"window_end": "25:00"}, {"timezone": "Mars/Base"},
                    {"active_days": ["Monday"]}, {"retention_days": -1}, {"retention_days": "x"}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.save(**bad)


class StoredBadWindowFailsClosed(unittest.TestCase):
    def allowed(self, stored, hour):
        at = datetime.datetime(2026, 10, 12, hour, 0, tzinfo=IST)  # a Monday
        with mock.patch.object(calls_db, "get_compliance", return_value=stored):
            return calls_db.within_calling_window(1, at)[0]

    def test_unparseable_window_uses_the_default_hours(self):
        self.assertFalse(self.allowed(cfg(window_start="9", window_end="21"), 3))
        self.assertTrue(self.allowed(cfg(window_start="9", window_end="21"), 11))

    def test_out_of_range_hour_no_longer_raises(self):
        self.assertFalse(self.allowed(cfg(window_end="25:00"), 23))

    def test_valid_window_unchanged(self):
        self.assertTrue(self.allowed(cfg(window_start="07:00", window_end="08:00"), 7))
        self.assertFalse(self.allowed(cfg(window_start="07:00", window_end="08:00"), 9))


if __name__ == "__main__":
    unittest.main()
