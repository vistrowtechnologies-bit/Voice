"""Scheduled follow-up calls (owner decisions 2026-10-15).

A finished call earns at most one follow-up: a call-back at the time the
caller asked for, a site-visit reminder, or a nurture call for an interested
lead - per the agent's own rules (follow_up_policy). main.py hands the plan
to db.schedule_follow_up_call, which parks it as a pending campaign contact
for the dialer; the follow-up call then opens on why we are calling back.
"""
import datetime
import os
import sys
import unittest
from unittest.mock import MagicMock, patch
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ.setdefault("SARVAM_API_KEY", "test-key-not-used-offline")

import db
import follow_ups
import main
import retry_rules
from contact_notes import lead_opening_instruction

IST = ZoneInfo("Asia/Kolkata")
# A Wednesday morning.
NOW = datetime.datetime(2026, 10, 14, 10, 0, tzinfo=IST)
POLICY = retry_rules.follow_up_policy("")


def at(day: int, hour: int, minute: int = 0, month: int = 10) -> datetime.datetime:
    return datetime.datetime(2026, month, day, hour, minute, tzinfo=IST)


class CallbackPlan(unittest.TestCase):
    def test_date_and_time_as_asked(self):
        plan = follow_ups.plan(POLICY, {"callback": {"date": "2026-10-16", "time": "18:30", "purpose": "price sheet"}}, {}, NOW)
        self.assertEqual((plan["kind"], plan["at"], plan["summary"]), ("callback", at(16, 18, 30), "price sheet"))

    def test_date_only_defaults_to_eleven(self):
        self.assertEqual(follow_ups.plan(POLICY, {"callback": {"date": "2026-10-16"}}, {}, NOW)["at"], at(16, 11))

    def test_time_only_is_today_if_ahead_else_tomorrow(self):
        self.assertEqual(follow_ups.plan(POLICY, {"callback": {"time": "17:00"}}, {}, NOW)["at"], at(14, 17))
        self.assertEqual(follow_ups.plan(POLICY, {"callback": {"time": "09:00"}}, {}, NOW)["at"], at(15, 9))

    def test_a_time_already_behind_us_is_now(self):
        self.assertEqual(follow_ups.plan(POLICY, {"callback": {"date": "2026-10-13", "time": "17:00"}}, {}, NOW)["at"], NOW)

    def test_bad_or_absent_values_plan_nothing(self):
        self.assertIsNone(follow_ups.plan(POLICY, {"callback": {"date": "next tuesday"}}, {}, NOW))
        self.assertIsNone(follow_ups.plan(POLICY, {"callback": {}}, {}, NOW))

    def test_switched_off_per_agent(self):
        policy = retry_rules.follow_up_policy({"callbackEnabled": False})
        self.assertIsNone(follow_ups.plan(policy, {"callback": {"date": "2026-10-16", "time": "18:30"}}, {}, NOW))

    def test_summary_prefers_the_post_call_read(self):
        plan = follow_ups.plan(POLICY, {"callback": {"time": "17:00", "purpose": "p"}},
                               {"business_summary": "Wants a 2BHK in Khopoli under 60L"}, NOW)
        self.assertEqual(plan["summary"], "Wants a 2BHK in Khopoli under 60L")


class VisitReminderPlan(unittest.TestCase):
    def test_more_than_a_day_ahead_rings_the_day_before_at_the_set_time(self):
        plan = follow_ups.plan(POLICY, {"site_visit": {"date": "2026-10-18", "time": "15:00"}}, {}, NOW)
        self.assertEqual((plan["kind"], plan["at"]), ("visit_reminder", at(17, 11)))
        policy = retry_rules.follow_up_policy({"visitReminderTime": "09:30"})
        self.assertEqual(follow_ups.plan(policy, {"site_visit": {"date": "2026-10-18", "time": "15:00"}}, {}, NOW)["at"],
                         at(17, 9, 30))

    def test_sooner_than_a_day_rings_two_hours_before(self):
        plan = follow_ups.plan(POLICY, {"site_visit": {"date": "2026-10-15", "time": "09:00"}}, {}, NOW)
        self.assertEqual(plan["at"], at(15, 7))

    def test_a_visit_too_close_or_past_gets_no_reminder(self):
        self.assertIsNone(follow_ups.plan(POLICY, {"site_visit": {"date": "2026-10-14", "time": "11:00"}}, {}, NOW))
        self.assertIsNone(follow_ups.plan(POLICY, {"site_visit": {"date": "2026-10-10", "time": "11:00"}}, {}, NOW))

    def test_no_time_means_ten_in_the_morning(self):
        self.assertEqual(follow_ups.plan(POLICY, {"site_visit": {"date": "2026-10-15"}}, {}, NOW)["at"], at(15, 8))

    def test_switched_off_per_agent(self):
        policy = retry_rules.follow_up_policy({"visitReminderEnabled": False})
        self.assertIsNone(follow_ups.plan(policy, {"site_visit": {"date": "2026-10-18", "time": "15:00"}}, {}, NOW))


class NurturePlan(unittest.TestCase):
    def test_interested_with_nothing_booked_rings_n_days_later_at_eleven(self):
        plan = follow_ups.plan(POLICY, {}, {"interest_level": "High"}, NOW)
        self.assertEqual((plan["kind"], plan["at"]), ("nurture", at(17, 11)))
        policy = retry_rules.follow_up_policy({"nurtureDays": 7})
        self.assertEqual(follow_ups.plan(policy, {}, {"interest_level": "warm"}, NOW)["at"], at(21, 11))

    def test_nurture_time_is_set_per_agent(self):
        policy = retry_rules.follow_up_policy({"nurtureTime": "16:00"})
        self.assertEqual(follow_ups.plan(policy, {}, {"interest_level": "warm"}, NOW)["at"], at(17, 16))
        # A date-only callback keeps its own 11:00.
        self.assertEqual(follow_ups.plan(policy, {"callback": {"date": "2026-10-16"}}, {}, NOW)["at"], at(16, 11))

    def test_not_interested_or_unknown_gets_nothing(self):
        for level in ("not interested", "none", "", "cold", None):
            self.assertIsNone(follow_ups.plan(POLICY, {}, {"interest_level": level}, NOW), level)

    def test_switched_off_per_agent(self):
        policy = retry_rules.follow_up_policy({"nurtureEnabled": False})
        self.assertIsNone(follow_ups.plan(policy, {}, {"interest_level": "high"}, NOW))

    def test_callback_then_visit_then_nurture(self):
        lead = {"callback": {"time": "17:00"}, "site_visit": {"date": "2026-10-18", "time": "15:00"}}
        self.assertEqual(follow_ups.plan(POLICY, lead, {"interest_level": "high"}, NOW)["kind"], "callback")
        del lead["callback"]
        self.assertEqual(follow_ups.plan(POLICY, lead, {"interest_level": "high"}, NOW)["kind"], "visit_reminder")

    def test_an_opt_out_cancels_every_follow_up(self):
        lead = {"opted_out": True, "callback": {"time": "17:00"}}
        self.assertIsNone(follow_ups.plan(POLICY, lead, {"interest_level": "high"}, NOW))

    def test_a_nurture_call_does_not_earn_another_nurture_call(self):
        self.assertIsNone(follow_ups.plan(POLICY, {}, {"interest_level": "high"}, NOW, previous_kind="nurture"))
        # ...but a callback they asked for on that call is honoured.
        self.assertEqual(follow_ups.plan(POLICY, {"callback": {"time": "17:00"}}, {}, NOW, previous_kind="nurture")["kind"],
                         "callback")
        self.assertEqual(follow_ups.plan(POLICY, {}, {"interest_level": "high"}, NOW, previous_kind="callback")["kind"],
                         "nurture")


class MainSchedulesThePlan(unittest.TestCase):
    """main._schedule_follow_up: the agent's setting is read from its config
    row, the moment is converted to UTC, and the lead's fields carry over."""

    CFG = {"account_id": 7, "follow_up_policy": '{"nurtureDays": 2}'}
    CTX = {"campaign_id": 44, "custom_fields": {"source": "arthaleads", "arthaleads_lead_id": "L9", "project": "SP Khopoli"}}

    def _run(self, lead, extracted, ctx=None):
        with patch.object(db, "get_compliance_config", return_value={"timezone": "Asia/Kolkata"}), \
                patch.object(db, "schedule_follow_up_call", return_value=123) as schedule, \
                patch.object(main, "datetime") as dt:
            dt.now.return_value = NOW
            result = main._schedule_follow_up(self.CFG, ctx or self.CTX, lead, extracted, 1001, 3)
        return result, schedule

    def test_callback_is_queued_in_utc_with_the_previous_calls_fields(self):
        result, schedule = self._run({"phone": "+919812300011", "name": "Priya", "callback": {"date": "2026-10-16", "time": "18:30"}}, {})
        self.assertEqual(result, 123)
        args, kwargs = schedule.call_args
        account_id, agent_id, phone, name, fields, when = args
        self.assertEqual((account_id, agent_id, phone, name), (7, 3, "+919812300011", "Priya"))
        self.assertEqual(when, "2026-10-16 13:00:00")  # 18:30 IST
        self.assertEqual(kwargs, {"source_campaign_id": 44})
        self.assertEqual(fields["follow_up_kind"], "callback")
        self.assertEqual(fields["previous_call_id"], 1001)
        self.assertEqual((fields["arthaleads_lead_id"], fields["project"], fields["source"]), ("L9", "SP Khopoli", "arthaleads"))

    def test_nurture_reads_the_agents_days(self):
        _, schedule = self._run({"phone": "+919812300011"}, {"interest_level": "high"})
        self.assertEqual(schedule.call_args.args[5], "2026-10-16 05:30:00")  # 11:00 IST, 2 days on
        self.assertEqual(schedule.call_args.args[4]["follow_up_kind"], "nurture")

    def test_visit_reminder_carries_the_visit_time(self):
        _, schedule = self._run({"phone": "+919812300011", "site_visit": {"date": "2026-10-18", "time": "15:00"}}, {}, ctx={})
        self.assertEqual(schedule.call_args.args[4]["follow_up_visit_at"], "2026-10-18 15:00")

    def test_the_previous_calls_kind_is_passed_on(self):
        ctx = {**self.CTX, "custom_fields": {**self.CTX["custom_fields"], "follow_up_kind": "nurture"}}
        result, schedule = self._run({"phone": "+919812300011"}, {"interest_level": "high"}, ctx=ctx)
        self.assertIsNone(result)
        schedule.assert_not_called()

    def test_nothing_to_schedule_or_no_phone_queues_nothing(self):
        for lead in ({"phone": "+919812300011"}, {"callback": {"time": "17:00"}}):
            result, schedule = self._run(lead, {})
            self.assertIsNone(result)
            schedule.assert_not_called()


class FakeConn:
    def __init__(self, from_number="", campaign=None, dup=None):
        self.from_number, self.campaign, self.dup, self.writes = from_number, campaign, dup, []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def close(self):
        pass

    def execute(self, sql, params=()):
        cur = MagicMock()
        if sql.startswith("SELECT from_number FROM campaigns"):
            cur.fetchone.return_value = {"from_number": self.from_number} if self.from_number else None
        elif sql.startswith("SELECT number FROM phone_numbers"):
            cur.fetchone.return_value = None
        elif sql.startswith("SELECT id, status FROM campaigns"):
            cur.fetchone.return_value = self.campaign
        elif sql.startswith("INSERT INTO campaigns"):
            self.writes.append((sql, params))
            cur.fetchone.return_value = {"id": 500}
        elif sql.startswith("SELECT id, status FROM campaign_contacts"):
            cur.fetchone.return_value = self.dup
        else:
            self.writes.append((sql, params))
            cur.fetchone.return_value = {"id": 900}
        return cur


class QueuedForTheDialer(unittest.TestCase):
    FIELDS = {"follow_up_kind": "callback", "previous_call_id": 1}

    def _schedule(self, conn, phone="+919812300011"):
        with patch.object(db.dbconn, "connect", return_value=conn), \
                patch.object(db, "get_account_country", return_value="IN"):
            return db.schedule_follow_up_call(7, 3, phone, "Priya", self.FIELDS, "2026-10-16 13:00:00", source_campaign_id=44)

    def test_first_follow_up_creates_the_agents_campaign_and_a_pending_timed_contact(self):
        conn = FakeConn(from_number="+918000000001")
        self.assertEqual(self._schedule(conn), 900)
        create, insert = conn.writes
        self.assertIn("INSERT INTO campaigns", create[0])
        self.assertEqual(create[1], (7, "Follow-up calls", 3, "+918000000001"))
        self.assertIn("INSERT INTO campaign_contacts", insert[0])
        self.assertIn("next_attempt_at", insert[0])
        self.assertEqual(insert[1][0], 500)
        self.assertEqual(insert[1][-1], "2026-10-16 13:00:00")
        self.assertIn('"follow_up_kind": "callback"', insert[1][-2])

    def test_a_completed_campaign_is_reopened_a_paused_one_left_alone(self):
        conn = FakeConn(from_number="+918000000001", campaign={"id": 5, "status": "completed"})
        self._schedule(conn)
        reopen = next(w for w in conn.writes if w[0].startswith("UPDATE campaigns"))
        self.assertIn("WHEN status = 'completed' THEN 'running' ELSE status END", reopen[0])

    def test_a_pending_follow_up_for_the_same_number_is_rescheduled_not_duplicated(self):
        conn = FakeConn(from_number="+918000000001", campaign={"id": 5, "status": "running"},
                        dup={"id": 77, "status": "pending"})
        self.assertEqual(self._schedule(conn), 77)
        self.assertFalse(any(w[0].startswith("INSERT INTO campaign_contacts") for w in conn.writes))
        update = next(w for w in conn.writes if w[0].startswith("UPDATE campaign_contacts"))
        self.assertEqual(update[1][-1], 77)

    def test_no_caller_number_or_a_cancelled_campaign_queues_nothing(self):
        conn = FakeConn()
        self.assertIsNone(self._schedule(conn))
        self.assertEqual(conn.writes, [])
        conn = FakeConn(from_number="+918000000001", campaign={"id": 5, "status": "cancelled"})
        self.assertIsNone(self._schedule(conn))
        self.assertEqual(conn.writes, [])


class CarrierOutcomeRetries(unittest.TestCase):
    """record_campaign_voicemail with busy / switched_off: kept in `outcome`,
    waits as 'no_answer' (the status the dialer re-dials), on the agent's gap."""

    class Conn:
        def __init__(self, campaign):
            self.campaign, self.writes = campaign, []

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def close(self):
            pass

        def execute(self, sql, params=()):
            cur = MagicMock()
            if "FROM campaigns" in sql:
                cur.fetchone.return_value = self.campaign
            elif "FROM campaign_contacts" in sql:
                cur.fetchone.return_value = {"attempts": 1}
            else:
                self.writes.append((sql, params))
            return cur

    def _record(self, outcome, campaign):
        conn = self.Conn(campaign)
        with patch.object(db.dbconn, "connect", return_value=conn):
            db.record_campaign_voicemail(38, 10, outcome)
        sql, params = next(w for w in conn.writes if w[0].startswith("UPDATE campaign_contacts"))
        return params

    def test_busy_and_switched_off_wait_their_own_gaps_on_an_instant_campaign(self):
        campaign = {"max_attempts": 3, "retry_minutes": 60, "retry_policy": "",
                    "name": "ArthaLeads Instant Follow-up", "follow_up_policy": '{"busyMinutes": 10, "switchedOffMinutes": 120}'}
        now = datetime.datetime.now(datetime.timezone.utc)
        for outcome, label, minutes in (("busy", "busy", 10), ("switched_off", "switched off", 120)):
            status, written, next_at, _ = self._record(outcome, campaign)
            self.assertEqual((status, written), ("no_answer", label))
            due = datetime.datetime.strptime(next_at, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
            self.assertAlmostEqual((due - now).total_seconds() / 60, minutes, delta=1)

    def test_a_bulk_campaign_keeps_its_own_gap(self):
        campaign = {"max_attempts": 3, "retry_minutes": 45, "retry_policy": "", "name": "Diwali list",
                    "follow_up_policy": '{"busyMinutes": 10}'}
        _, _, next_at, _ = self._record("busy", campaign)
        due = datetime.datetime.strptime(next_at, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
        self.assertAlmostEqual((due - datetime.datetime.now(datetime.timezone.utc)).total_seconds() / 60, 45, delta=1)


BASE = {
    "id": 1, "account_id": 1, "name": "Test", "model": "gpt-4.1-mini",
    "voice": "shubh", "language": "hi-IN", "tone": "balanced",
    "system_prompt": "You are a test agent.", "enabled_functions": "end_call",
    "_compliance_config": {},
}


class FollowUpOpener(unittest.TestCase):
    def test_each_kind_opens_on_why_we_are_calling(self):
        base = {"project": "SP Khopoli", "follow_up_summary": "wants 2BHK"}
        callback = lead_opening_instruction({**base, "follow_up_kind": "callback"}, "Priya", "Telugu")
        self.assertTrue(callback.startswith('They asked us to call them back about "SP Khopoli"'), callback)
        self.assertIn("calling back as they asked", callback)
        self.assertIn("In Telugu", callback)
        self.assertIn("Priya", callback)
        visit = lead_opening_instruction({**base, "follow_up_kind": "visit_reminder", "follow_up_visit_at": "2026-10-18 15:00"},
                                         None, "Hindi")
        self.assertIn("site visit booked", visit)
        self.assertIn("on 2026-10-18 15:00", visit)
        self.assertIn("reschedule", visit)
        self.assertIn("greet them warmly", visit)
        nurture = lead_opening_instruction({**base, "follow_up_kind": "nurture"}, "Priya", "Hindi")
        self.assertIn("they were interested about \"SP Khopoli\"", nurture)
        self.assertIn("following up", nurture)

    def test_follow_up_opener_needs_no_arthaleads_source_and_unknown_kinds_are_ignored(self):
        self.assertTrue(lead_opening_instruction({"follow_up_kind": "callback"}, "A", "Hindi"))
        self.assertEqual(lead_opening_instruction({"follow_up_kind": "weird"}, "A", "Hindi"), "")
        self.assertEqual(lead_opening_instruction({"source": "facebook"}, "A", "Hindi"), "")

    def test_follow_up_call_takes_the_lead_context_and_overrides_the_operator_opener(self):
        ctx = {"direction": "outbound", "custom_fields": {"follow_up_kind": "callback", "project": "SP Khopoli"}}
        config = main._apply_lead_context({**BASE, "welcome_message_outbound": "Namaste, Mira here."}, ctx, "r")
        self.assertEqual(config["_lead_fields"]["follow_up_kind"], "callback")
        agent = main.RealEstateAgent(config, "Priya Sharma", direction="outbound", call_type="phone")
        self.assertEqual(agent._welcome_message, "")
        self.assertTrue(agent._lead_opening.startswith("They asked us to call them back"), agent._lead_opening)
        # The same operator opener still opens an ordinary outbound call.
        plain = main.RealEstateAgent({**BASE, "welcome_message_outbound": "Namaste, Mira here."}, "Priya",
                                     direction="outbound", call_type="phone")
        self.assertEqual(plain._welcome_message, "Namaste, Mira here.")

    def test_summary_is_listed_in_what_we_know_but_the_kind_is_not(self):
        from contact_notes import build_contact_notes

        notes = build_contact_notes({"follow_up_kind": "callback", "follow_up_summary": "wants 2BHK", "previous_call_id": 9})
        self.assertIn("- From our last call with them: wants 2BHK", notes)
        self.assertNotIn("kind", notes)
        self.assertNotIn("Previous call", notes)


if __name__ == "__main__":
    unittest.main()
