"""A campaign's own calling schedule, which narrows the account window.

The account-wide window stays the outer limit — a campaign can be stricter,
never looser. Unset and malformed fields must never block a dial, the same
rule inbound routes follow.
"""
import datetime
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import campaign_window

MON_10AM = datetime.datetime(2026, 9, 14, 10, 0)
SAT_10AM = datetime.datetime(2026, 9, 19, 10, 0)
MON_8PM = datetime.datetime(2026, 9, 14, 20, 0)

WEEKDAY_MORNINGS = {"window_start": "09:00", "window_end": "12:00",
                    "active_days": "Mon,Tue,Wed,Thu,Fri"}


class NoScheduleMeansNoRestriction(unittest.TestCase):
    def test_campaign_without_a_schedule_dials(self):
        self.assertIsNone(campaign_window.campaign_block_reason({}, MON_8PM))

    def test_empty_fields_do_not_restrict(self):
        campaign = {"window_start": None, "window_end": "", "active_days": None, "end_date": None}
        self.assertIsNone(campaign_window.campaign_block_reason(campaign, MON_8PM))

    def test_malformed_values_never_block(self):
        for bad in ({"window_start": "abc", "window_end": "12:00"},
                    {"window_start": "25:00", "window_end": "12:00"},
                    {"active_days": "garbage,,,"},
                    {"end_date": "31-12-2026"}):
            self.assertIsNone(campaign_window.campaign_block_reason(bad, MON_8PM), bad)


class Schedule(unittest.TestCase):
    def test_inside_the_window_on_an_active_day(self):
        self.assertIsNone(campaign_window.campaign_block_reason(WEEKDAY_MORNINGS, MON_10AM))

    def test_outside_the_window(self):
        self.assertIn("outside", campaign_window.campaign_block_reason(WEEKDAY_MORNINGS, MON_8PM))

    def test_inactive_day(self):
        self.assertIn("not an active day", campaign_window.campaign_block_reason(WEEKDAY_MORNINGS, SAT_10AM))

    def test_window_edges_are_inclusive(self):
        for hour in (9, 12):
            self.assertIsNone(
                campaign_window.campaign_block_reason(WEEKDAY_MORNINGS, MON_10AM.replace(hour=hour, minute=0))
            )

    def test_overnight_window_wraps_midnight(self):
        night = {"window_start": "22:00", "window_end": "06:00"}
        self.assertIsNone(campaign_window.campaign_block_reason(night, MON_10AM.replace(hour=2)))
        self.assertIsNotNone(campaign_window.campaign_block_reason(night, MON_10AM))

    def test_past_the_end_date(self):
        self.assertIn("ended on", campaign_window.campaign_block_reason({"end_date": "2026-09-01"}, MON_10AM))

    def test_on_the_end_date_still_dials(self):
        self.assertIsNone(campaign_window.campaign_block_reason({"end_date": "2026-09-14"}, MON_10AM))


if __name__ == "__main__":
    unittest.main(verbosity=2)
