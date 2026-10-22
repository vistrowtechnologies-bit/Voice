"""Retry policy resolution, and the drift guard between the two copies.

server/retry_rules.py and agent/retry_rules.py must stay byte-identical: the
server resolves a dial result, the agent resolves the end of a call, and a
contact's fate must not depend on which process got there first.
"""
import hashlib
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import retry_rules

HERE = os.path.dirname(os.path.abspath(__file__))
AGENT_COPY = os.path.join(HERE, "..", "agent", "retry_rules.py")


class CopiesMatch(unittest.TestCase):
    def test_agent_and_server_copies_are_identical(self):
        digest = lambda p: hashlib.sha256(open(p, "rb").read()).hexdigest()
        self.assertEqual(
            digest(os.path.join(HERE, "retry_rules.py")),
            digest(AGENT_COPY),
            "agent/retry_rules.py has drifted from server/retry_rules.py",
        )


class FallsBackToCampaignDefaults(unittest.TestCase):
    def test_empty_policy_uses_the_campaigns_own_settings(self):
        self.assertEqual(retry_rules.resolve("", "no_answer", 1, 3, 30), (True, 30))
        self.assertEqual(retry_rules.resolve(None, "no_answer", 3, 3, 30), (False, 30))

    def test_unknown_outcome_uses_the_defaults(self):
        self.assertEqual(retry_rules.resolve({"busy": {"attempts": 9}}, "weird", 1, 2, 45), (True, 45))

    def test_malformed_policy_never_raises(self):
        for bad in ("not json", "[]", "123", b"", {"no_answer": "nope"}, {"no_answer": None}):
            self.assertEqual(retry_rules.resolve(bad, "no_answer", 1, 2, 60), (True, 60), bad)

    def test_broken_campaign_defaults_still_produce_a_usable_answer(self):
        self.assertEqual(retry_rules.resolve("", "no_answer", 1, None, None), (False, 60))
        self.assertEqual(retry_rules.resolve("", "no_answer", 1, 0, 0), (False, 60))


class PerOutcomeRules(unittest.TestCase):
    POLICY = {
        "busy": {"attempts": 4, "gapMinutes": 10},
        "voicemail": {"attempts": 2, "gapMinutes": 240},
        "no_answer": {"attempts": 3, "gapMinutes": 30},
    }

    def test_each_outcome_gets_its_own_budget(self):
        self.assertEqual(retry_rules.resolve(self.POLICY, "busy", 1, 1, 60), (True, 10))
        self.assertEqual(retry_rules.resolve(self.POLICY, "voicemail", 1, 1, 60), (True, 240))
        self.assertEqual(retry_rules.resolve(self.POLICY, "no_answer", 2, 1, 60), (True, 30))

    def test_stops_at_that_outcomes_own_ceiling(self):
        self.assertEqual(retry_rules.resolve(self.POLICY, "busy", 4, 1, 60), (False, 10))
        self.assertEqual(retry_rules.resolve(self.POLICY, "voicemail", 2, 9, 60), (False, 240))

    def test_json_string_and_dict_behave_the_same(self):
        import json
        self.assertEqual(
            retry_rules.resolve(json.dumps(self.POLICY), "busy", 1, 1, 60),
            retry_rules.resolve(self.POLICY, "busy", 1, 1, 60),
        )

    def test_absurd_values_are_clamped(self):
        policy = {"no_answer": {"attempts": 5000, "gapMinutes": 10 ** 9}}
        retry, gap = retry_rules.resolve(policy, "no_answer", 19, 1, 60)
        self.assertTrue(retry)
        self.assertEqual(gap, retry_rules.MAX_GAP_MINUTES)
        self.assertFalse(retry_rules.resolve(policy, "no_answer", 20, 1, 60)[0])

    def test_negative_or_zero_attempts_fall_back_rather_than_disable_retries(self):
        for bad in (0, -1, "x"):
            self.assertEqual(
                retry_rules.resolve({"no_answer": {"attempts": bad}}, "no_answer", 1, 2, 60),
                (True, 60),
            )


class ShortCall(unittest.TestCase):
    def test_disabled_by_default(self):
        self.assertEqual(retry_rules.short_call_seconds(""), 0)
        self.assertEqual(retry_rules.short_call_seconds({"no_answer": {"attempts": 2}}), 0)

    def test_reads_the_threshold(self):
        self.assertEqual(retry_rules.short_call_seconds({"short_call": {"underSeconds": 15}}), 15)

    def test_threshold_is_clamped_and_never_raises(self):
        self.assertEqual(retry_rules.short_call_seconds({"short_call": {"underSeconds": 9999}}), 120)
        self.assertEqual(retry_rules.short_call_seconds({"short_call": {"underSeconds": -5}}), 0)
        self.assertEqual(retry_rules.short_call_seconds({"short_call": {"underSeconds": "abc"}}), 0)


class FollowUpPolicy(unittest.TestCase):
    """The per-agent follow-up rules (agents.follow_up_policy, owner
    decisions 2026-10-15): complete with defaults, clamped, never raising."""

    def test_defaults_when_nothing_is_stored(self):
        for empty in ("", None, "{}", "not json", "[]"):
            self.assertEqual(retry_rules.follow_up_policy(empty), {
                "maxAttempts": 3, "busyMinutes": 10, "switchedOffMinutes": 120, "noAnswerMinutes": 30,
                "voicemailMinutes": 120, "callbackEnabled": True, "visitReminderEnabled": True,
                "visitReminderTime": "11:00", "nurtureEnabled": True, "nurtureDays": 3, "nurtureTime": "11:00",
                "firstCallDelaySeconds": 0,
            }, empty)

    def test_stored_values_are_read_and_clamped(self):
        policy = retry_rules.follow_up_policy({
            "maxAttempts": 99, "busyMinutes": 5, "switchedOffMinutes": 0, "noAnswerMinutes": "45",
            "voicemailMinutes": 10 ** 9, "callbackEnabled": False, "visitReminderEnabled": "no",
            "visitReminderTime": "9:5", "nurtureEnabled": False, "nurtureDays": 400,
        })
        self.assertEqual(policy["maxAttempts"], retry_rules.FOLLOW_UP_MAX_ATTEMPTS_CEILING)
        self.assertEqual(policy["busyMinutes"], 5)
        self.assertEqual(policy["switchedOffMinutes"], 120)  # 0 is not a gap
        self.assertEqual(policy["noAnswerMinutes"], 45)
        self.assertEqual(policy["voicemailMinutes"], retry_rules.MAX_GAP_MINUTES)
        self.assertFalse(policy["callbackEnabled"])
        self.assertTrue(policy["visitReminderEnabled"])  # a non-bool keeps the default
        self.assertEqual(policy["visitReminderTime"], "09:05")
        self.assertFalse(policy["nurtureEnabled"])
        self.assertEqual(policy["nurtureDays"], retry_rules.FOLLOW_UP_MAX_NURTURE_DAYS)

    def test_bad_reminder_time_falls_back(self):
        for bad in ("25:00", "11:60", "eleven", "", None, "11"):
            self.assertEqual(retry_rules.follow_up_policy({"visitReminderTime": bad})["visitReminderTime"], "11:00", bad)

    def test_nurture_time_is_read_and_bad_values_fall_back(self):
        self.assertEqual(retry_rules.follow_up_policy({"nurtureTime": "16:30"})["nurtureTime"], "16:30")
        for bad in ("25:00", "eleven", "", None):
            self.assertEqual(retry_rules.follow_up_policy({"nurtureTime": bad})["nurtureTime"], "11:00", bad)

    def test_each_outcome_waits_its_own_gap_under_one_budget(self):
        policy = retry_rules.follow_up_retry_policy({"maxAttempts": 2, "busyMinutes": 7})
        self.assertEqual(retry_rules.resolve(policy, "busy", 1, 1, 60), (True, 7))
        self.assertEqual(retry_rules.resolve(policy, "switched_off", 1, 1, 60), (True, 120))
        self.assertEqual(retry_rules.resolve(policy, "no_answer", 1, 1, 60), (True, 30))
        self.assertEqual(retry_rules.resolve(policy, "voicemail", 1, 1, 60), (True, 120))
        self.assertEqual(retry_rules.resolve(policy, "failed", 1, 1, 60), (True, 30))
        # The second dial was the last, whatever it came back as.
        for outcome in ("busy", "switched_off", "no_answer", "voicemail"):
            self.assertFalse(retry_rules.resolve(policy, outcome, 2, 9, 60)[0], outcome)

    def test_switched_off_is_an_outcome(self):
        self.assertIn("switched_off", retry_rules.OUTCOMES)

    def test_instant_and_follow_up_campaigns_follow_the_agent_not_their_row(self):
        own = {"busy": {"attempts": 9, "gapMinutes": 99}}
        agent = {"maxAttempts": 1, "busyMinutes": 10}
        for name in retry_rules.AGENT_POLICY_CAMPAIGNS:
            self.assertEqual(retry_rules.resolve(retry_rules.effective_policy(name, own, agent), "busy", 1, 5, 60),
                             (False, 10), name)
        # A bulk campaign keeps its wizard's rules.
        self.assertEqual(retry_rules.resolve(retry_rules.effective_policy("Diwali list", own, agent), "busy", 1, 5, 60),
                         (True, 99))


if __name__ == "__main__":
    unittest.main(verbosity=2)
