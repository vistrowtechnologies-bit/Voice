"""inbound_routes settings were decorative until 2026-09-18 (stored by the
dashboard, read by nothing at call time). These pin the rules that now decide
whether a real customer's call is answered, so a wrong 'block' can't slip in.
"""
import datetime
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import inbound_rules

MON_10AM = datetime.datetime(2026, 9, 14, 10, 0)   # Monday
SAT_10AM = datetime.datetime(2026, 9, 19, 10, 0)   # Saturday
MON_2AM = datetime.datetime(2026, 9, 14, 2, 0)

BUSINESS = {
    "status": "active", "max_concurrent": 1,
    "window_start": "09:00", "window_end": "17:00",
    "active_days": "Mon,Tue,Wed,Thu,Fri",
}


class NoRouteMeansNoChange(unittest.TestCase):
    def test_number_without_a_route_is_always_answered(self):
        self.assertIsNone(inbound_rules.route_rejection(None, MON_2AM, live_calls=99))

    def test_empty_route_settings_do_not_restrict(self):
        route = {"status": "active", "max_concurrent": 0, "window_start": None,
                 "window_end": None, "active_days": None, "start_date": None, "end_date": None}
        self.assertIsNone(inbound_rules.route_rejection(route, MON_2AM, live_calls=50))

    def test_the_live_route_in_production_still_answers(self):
        # Route 5 as configured on 2026-09-18: 5 concurrent, all days, no window.
        route = {"status": "active", "max_concurrent": 5, "window_start": None,
                 "window_end": None, "active_days": "Mon,Tue,Wed,Thu,Fri,Sat,Sun"}
        self.assertIsNone(inbound_rules.route_rejection(route, MON_2AM, live_calls=4))
        self.assertIsNotNone(inbound_rules.route_rejection(route, MON_2AM, live_calls=5))


class BusinessHours(unittest.TestCase):
    def test_inside_hours_on_an_active_day(self):
        self.assertIsNone(inbound_rules.route_rejection(BUSINESS, MON_10AM, 0))

    def test_outside_hours(self):
        self.assertIn("outside", inbound_rules.route_rejection(BUSINESS, MON_2AM, 0))

    def test_inactive_day(self):
        self.assertIn("not an active day", inbound_rules.route_rejection(BUSINESS, SAT_10AM, 0))

    def test_window_edges_are_inclusive(self):
        at_open = MON_10AM.replace(hour=9, minute=0)
        at_close = MON_10AM.replace(hour=17, minute=0)
        self.assertIsNone(inbound_rules.route_rejection(BUSINESS, at_open, 0))
        self.assertIsNone(inbound_rules.route_rejection(BUSINESS, at_close, 0))

    def test_overnight_window_wraps_midnight(self):
        night = {"status": "active", "window_start": "22:00", "window_end": "06:00"}
        self.assertIsNone(inbound_rules.route_rejection(night, MON_2AM, 0))
        self.assertIsNotNone(inbound_rules.route_rejection(night, MON_10AM, 0))

    def test_garbage_hours_never_block(self):
        for bad in ("", "abc", "25:00", "9", None):
            route = {"status": "active", "window_start": bad, "window_end": "17:00"}
            self.assertIsNone(inbound_rules.route_rejection(route, MON_2AM, 0), bad)

    def test_unparseable_day_list_never_blocks(self):
        route = {"status": "active", "active_days": "garbage,,,"}
        self.assertIsNone(inbound_rules.route_rejection(route, MON_2AM, 0))


class Concurrency(unittest.TestCase):
    def test_under_the_limit_is_answered(self):
        self.assertIsNone(inbound_rules.route_rejection(BUSINESS, MON_10AM, live_calls=0))

    def test_at_the_limit_is_rejected(self):
        self.assertIn("limit", inbound_rules.route_rejection(BUSINESS, MON_10AM, live_calls=1))

    def test_bad_limit_values_mean_unlimited(self):
        for bad in (None, 0, "", "abc", -3):
            route = dict(BUSINESS, max_concurrent=bad)
            self.assertIsNone(inbound_rules.route_rejection(route, MON_10AM, live_calls=99), bad)


class DatesAndStatus(unittest.TestCase):
    def test_before_start_date(self):
        route = dict(BUSINESS, start_date="2026-10-01")
        self.assertIn("starts on", inbound_rules.route_rejection(route, MON_10AM, 0))

    def test_after_end_date(self):
        route = dict(BUSINESS, end_date="2026-09-01")
        self.assertIn("ended on", inbound_rules.route_rejection(route, MON_10AM, 0))

    def test_inside_the_date_range(self):
        route = dict(BUSINESS, start_date="2026-09-01", end_date="2026-12-31")
        self.assertIsNone(inbound_rules.route_rejection(route, MON_10AM, 0))

    def test_paused_route_rejects(self):
        self.assertIn("paused", inbound_rules.route_rejection(dict(BUSINESS, status="paused"), MON_10AM, 0))

    def test_malformed_dates_never_block(self):
        route = dict(BUSINESS, start_date="not-a-date", end_date="31-12-2026")
        self.assertIsNone(inbound_rules.route_rejection(route, MON_10AM, 0))


if __name__ == "__main__":
    unittest.main(verbosity=2)
