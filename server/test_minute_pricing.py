"""Minute-based plans (owner decision 2026-10-17): 1 credit = 1 standard minute.

Offline tests price through the real billing formula; the DB-backed ones run
against a throwaway Postgres (TEST_DATABASE_URL) only."""
import datetime
import os
import unittest

import calls_db
import plan_policy

TEST_DB = os.environ.get("TEST_DATABASE_URL")

STANDARD_VOICES = (
    None,                                   # legacy rows
    "google:chirp3:Achernar",               # Vistrow HD (Chirp 3 HD)
    "google:hi-IN-Standard-A",              # Native (Google Standard)
    "sarvam4:ritu_hi_customer_warm",        # Bharat v4 voice
    "ritu",                                 # bare Sarvam voice
    "abhilash",                             # Sarvam v2 (economy tier)
    "custom:vv_123",                        # cloned voice
)
STANDARD_MODELS = (None, "sarvam/sarvam-105b-conversations", "gpt-5.4-nano", "gpt-4.1-nano", "gpt-4o-mini")
LIVE_MODELS = (
    "gemini-live",
    "gemini-live:gemini-2.5-flash-native-audio-preview-09-2025",
    "gemini-live:gemini-3.1-flash-live-preview",
    "gemini-live:gemini-3.8-live",
)
RATES = {"browser": 1.0, "widget": 1.0, "phone": 1.0}


def _credits(voice, model, minutes=1.0, call_type="phone"):
    return calls_db.credits_for_call({"call_type": call_type, "voice": voice, "model": model}, RATES, minutes)


class PlanMinutes(unittest.TestCase):
    def test_monthly_minutes(self):
        self.assertEqual({k: p["credits"] for k, p in plan_policy.PLANS.items()},
                         {"starter": 400, "growth": 1100, "scale": 2700})
        self.assertEqual({k: p["price_inr"] for k, p in plan_policy.PLANS.items()},
                         {"starter": 2999, "growth": 5999, "scale": 12999})
        self.assertEqual({k: calls_db.PLAN_PRICING[k]["credits"] for k in plan_policy.PLANS},
                         {"starter": 400, "growth": 1100, "scale": 2700})

    def test_annual_allocation_and_default_price(self):
        self.assertEqual({k: p["annual_credits_per_month"] for k, p in plan_policy.PLANS.items()},
                         {"starter": 500, "growth": 1200, "scale": 3000})
        self.assertEqual({k: plan_policy.plan_allowance(k, "annual") for k in plan_policy.PLANS},
                         {"starter": 6000, "growth": 14400, "scale": 36000})
        self.assertEqual({k: plan_policy.plan_allowance(k, "monthly") for k in plan_policy.PLANS},
                         {"starter": 400, "growth": 1100, "scale": 2700})
        self.assertEqual(plan_policy.ANNUAL_MONTHS_CHARGED, 11)
        self.assertEqual(plan_policy.ANNUAL_PRICE_INR, {"starter": 32989, "growth": 65989, "scale": 142989})

    def test_public_plan_shape(self):
        plans = {p["plan"]: p for p in plan_policy.public_plans()}
        self.assertEqual(list(plans), ["starter", "growth", "scale"])
        self.assertEqual(plans["growth"], {
            "plan": "growth", "monthlyPrice": 5999, "annualPrice": 65989, "monthlyMinutes": 1100,
            "annualMinutesPerMonth": 1200, "annualMinutesPerYear": 14400, "overagePerMinute": 6,
            "clonedVoicesIncluded": plan_policy.PLANS["growth"].get("cloned_voices"),
            "agents": 5, "concurrentCalls": 15, "knowledgeBases": 5, "storageGb": 25,
        })


class MinuteRates(unittest.TestCase):
    def test_one_standard_minute_is_one_credit(self):
        for voice in STANDARD_VOICES:
            for model in STANDARD_MODELS:
                with self.subTest(voice=voice, model=model):
                    self.assertEqual(_credits(voice, model), 1.0)
        # Duration scales linearly, every channel.
        for call_type in RATES:
            self.assertEqual(_credits("google:chirp3:Achernar", "sarvam/sarvam-105b-conversations", 7.5, call_type), 7.5)

    def test_vistrow_live_is_two_minutes_whatever_the_voice(self):
        # Owner, 19 Oct 2026: 3 -> 2 after measuring Rs 3.3-4.1/min on real calls.
        for model in LIVE_MODELS:
            for voice in ("google:chirp3:Kore", "google:kore", None):
                with self.subTest(model=model, voice=voice):
                    self.assertEqual(_credits(voice, model), 2.0)
        self.assertEqual(plan_policy.LIVE_MINUTES_PER_MINUTE, 2.0)

    def test_tiers_shown_to_tenants(self):
        self.assertEqual(calls_db.model_tier("sarvam/sarvam-105b-conversations"), "standard")
        self.assertEqual(calls_db.model_tier("gemini-live"), "realtime")
        self.assertEqual(calls_db.model_tier("gemini-live:gemini-3.1-flash-live-preview"), "realtime_plus")
        for tier in calls_db._MODEL_TIER_MULTIPLIERS:
            self.assertIn(tier, calls_db._MODEL_TIER_LABELS)

    def test_premium_voices_keep_their_2x(self):
        # Not part of the 2026-10-17 decision; unchanged relative to a standard minute.
        self.assertEqual(_credits("elevenlabs:abc", "sarvam/sarvam-105b-conversations"), 2.0)
        self.assertEqual(_credits("google:kore", "gpt-5.4-nano"), 2.0)


class Overage(unittest.TestCase):
    def test_overage_rate_per_plan(self):
        self.assertEqual({k: calls_db.plan_overage_rate_inr(k) for k in plan_policy.PLANS},
                         {"starter": 7.0, "growth": 6.0, "scale": 5.0})
        self.assertEqual(calls_db.plan_overage_rate_inr("unknown"), 7.0)


class Margins(unittest.TestCase):
    def test_every_rate_covers_the_default_minute_cost(self):
        cost = plan_policy.COST_PER_DEFAULT_MINUTE_INR
        for key, plan in plan_policy.PLANS.items():
            with self.subTest(plan=key):
                self.assertGreater(plan["price_inr"] / plan["credits"], cost)
                self.assertGreater(plan_policy.ANNUAL_PRICE_INR[key] / plan_policy.plan_allowance(key, "annual"), cost)
                self.assertGreater(plan["overage_per_minute_inr"], cost)


def _utc(**delta):
    return (datetime.datetime.utcnow() + datetime.timedelta(**delta)).strftime("%Y-%m-%d %H:%M:%S")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class MinuteBillingOnDatabase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        calls_db.init_tables()

    def setUp(self):
        stamp = os.urandom(4).hex()
        self.aid = calls_db.create_account_with_owner("M", "M", f"m-{stamp}@example.com", "h", email_verified=True)["account_id"]
        # A managed account like the live tenants: calendar-month window.
        calls_db.end_trial(self.aid)

    def sql(self, query, params=()):
        conn = calls_db._connect()
        with conn:
            conn.execute(query, params)
        conn.close()

    def set_credits(self, total):
        self.sql("INSERT INTO settings (account_id, key, value) VALUES (?, 'credits_total', ?) "
                 "ON CONFLICT (account_id, key) DO UPDATE SET value = EXCLUDED.value", (self.aid, str(total)))

    def call(self, minutes, model="sarvam/sarvam-105b-conversations", voice="google:chirp3:Aoede"):
        self.sql("INSERT INTO calls (account_id, room_name, started_at, ended_at, duration_seconds, call_type, model, voice, "
                 "transcript_json) VALUES (?, ?, ?, ?, ?, 'phone', ?, ?, '[]')",
                 (self.aid, f"phone-{os.urandom(4).hex()}", _utc(minutes=-5), _utc(), int(minutes * 60), model, voice))

    def test_existing_custom_balance_is_kept_as_is(self):
        # A live tenant's hand-set allowance: no migration rewrites it, and it
        # is now read as standard minutes.
        self.set_credits(5000)
        calls_db.init_tables()
        self.call(10)
        summary = calls_db.billing_summary(self.aid)
        self.assertEqual(summary["creditsTotal"], 5000)
        self.assertEqual(summary["creditsUsed"], 10.0)  # 10 Bharat minutes = 10 (was 20)
        self.assertEqual(summary["creditsRemaining"], 4990.0)
        self.assertEqual(summary["creditUnit"], "standard_minute")

    def test_live_minutes_count_two(self):
        self.set_credits(100)
        self.call(10, model="gemini-live", voice="google:chirp3:Kore")
        self.assertEqual(calls_db.billing_summary(self.aid)["creditsUsed"], 20.0)

    def test_overage_uses_the_plan_minute_rate(self):
        self.sql("UPDATE accounts SET plan = 'growth' WHERE id = ?", (self.aid,))
        self.set_credits(100)
        self.call(130)
        summary = calls_db.billing_summary(self.aid)
        self.assertEqual(summary["overageCredits"], 30.0)
        self.assertEqual(summary["overageRateInr"], 6.0)
        self.assertEqual(summary["overageAmountInr"], 180.0)
        closed = calls_db.overage_for_account_period(self.aid, "growth", _utc(days=-1), _utc(minutes=1))
        self.assertEqual((closed["overageCredits"], closed["overageAmountInr"]), (30.0, 180.0))

    def test_paid_period_allowance_monthly_and_annual(self):
        calls_db.reset_plan_credits(self.aid, "growth")
        self.assertEqual(calls_db.billing_summary(self.aid)["creditsTotal"], 1100)
        calls_db.reset_plan_credits(self.aid, "scale", "annual")
        self.assertEqual(calls_db.billing_summary(self.aid)["creditsTotal"], 36000)


if __name__ == "__main__":
    unittest.main()
