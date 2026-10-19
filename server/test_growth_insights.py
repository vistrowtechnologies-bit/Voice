"""The Analytics tab's business insights, against a throwaway Postgres
(TEST_DATABASE_URL): pipeline value from spoken budgets, which ad works,
languages, and the best and worst scored call."""
import json
import os
import unittest

TEST_DB = os.environ.get("TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DB, "set TEST_DATABASE_URL to a throwaway Postgres database")
class GrowthInsightsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DB
        import calls_db
        cls.db = calls_db
        calls_db.init_tables()
        stamp = os.urandom(4).hex()
        cls.a = calls_db.create_account_with_owner("G", "G", f"gi-a-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.other = calls_db.create_account_with_owner("O", "O", f"gi-o-{stamp}@example.com", "h", email_verified=True)["account_id"]
        cls.call(cls.a, "+919800000001", "Riya", "around 80 lakh to 1 crore", minutes_ago=60, booked=True, language="hi-IN", qa=91)
        cls.call(cls.a, "+919800000002", "Arjun", "दो करोड़", minutes_ago=120, language="hi-IN", qa=55)
        cls.call(cls.a, "+919800000003", "Neha", "basic", minutes_ago=180, language="en-IN")
        cls.call(cls.a, "+919800000004", "", "", minutes_ago=200, language="en-IN")  # not qualified
        cls.call(cls.a, "+919800000001", "Riya", "", minutes_ago=30, language="hi-IN")  # same person again
        cls.call(cls.other, "+919800000009", "Other", "5 crore", minutes_ago=60, language="hi-IN", qa=99)
        for i, (phone, ad) in enumerate((("+919800000001", "Treetopia Plots"), ("+919800000005", "Treetopia Plots"), ("+919800000002", "1 BHK Homes"))):
            cls.lead(cls.a, f"gi-{stamp}-{i}", phone, ad, minutes_ago=240)

    @classmethod
    def sql(cls, query, params=()):
        conn = cls.db._connect()
        try:
            with conn:
                return conn.execute(query, params).fetchone()
        finally:
            conn.close()

    @classmethod
    def call(cls, account, phone, name, budget, *, minutes_ago, booked=False, language="hi-IN", qa=None):
        intel = json.dumps({"qa_score": qa, "summary": f"{name} call"}) if qa is not None else None
        cls.sql(
            "INSERT INTO calls (account_id, room_name, started_at, ended_at, call_type, lead_phone, lead_name, lead_budget, "
            "site_visit_json, reply_language, duration_seconds, transcript_json, intelligence_json, recording_key) "
            "VALUES (?, ?, ((now() AT TIME ZONE 'UTC') - make_interval(mins => ?))::text, "
            "((now() AT TIME ZONE 'UTC') - make_interval(mins => ?))::text, 'phone', ?, ?, ?, ?, ?, 120, '[]', ?, 'rec/x.ogg') RETURNING id",
            (account, f"gi-{os.urandom(4).hex()}", minutes_ago, minutes_ago - 2, phone, name or None, budget or None,
             json.dumps({"date": "2026-10-25"}) if booked else None, language, intel),
        )

    @classmethod
    def lead(cls, account, external_id, phone, ad, *, minutes_ago):
        cls.sql(
            "INSERT INTO contacts (account_id, name, phone, source, custom_fields) VALUES (?, 'Lead', ?, 'arthaleads', ?) "
            "ON CONFLICT (account_id, phone) DO UPDATE SET custom_fields = excluded.custom_fields RETURNING id",
            (account, phone, json.dumps({"external_id": external_id, "ad_headline": ad})),
        )
        cls.sql(
            "INSERT INTO inbound_lead_events (account_id, source, external_id, created_at) "
            "VALUES (?, 'arthaleads', ?, ((now() AT TIME ZONE 'UTC') - make_interval(mins => ?))::text) RETURNING external_id",
            (account, external_id, minutes_ago),
        )

    def test_pipeline_counts_each_qualified_person_once_with_parsed_budgets(self):
        p = self.db.growth_insights(self.a, days=30)["pipeline"]
        # Riya (80L-1Cr -> 90L, booked), Arjun (2 Cr), Neha ("basic": no budget).
        self.assertEqual((p["qualifiedLeads"], p["withBudget"], p["bookedLeads"]), (3, 2, 1))
        self.assertEqual(p["totalInr"], 90 * 10**5 + 2 * 10**7)
        self.assertEqual(p["bookedInr"], 90 * 10**5)

    def test_which_ad_works(self):
        ads = {a["ad"]: a for a in self.db.growth_insights(self.a, days=30)["ads"]}
        self.assertEqual(ads["Treetopia Plots"], {"ad": "Treetopia Plots", "leads": 2, "called": 1, "qualified": 1, "booked": 1})
        self.assertEqual(ads["1 BHK Homes"], {"ad": "1 BHK Homes", "leads": 1, "called": 1, "qualified": 1, "booked": 0})

    def test_languages(self):
        langs = {l["language"]: l for l in self.db.growth_insights(self.a, days=30)["languages"]}
        self.assertEqual((langs["hi-IN"]["calls"], langs["hi-IN"]["qualified"]), (3, 3))
        self.assertEqual((langs["en-IN"]["calls"], langs["en-IN"]["qualified"]), (2, 1))

    def test_best_and_worst_call_stay_in_the_account(self):
        r = self.db.growth_insights(self.a, days=30)
        self.assertEqual((r["bestCall"]["qaScore"], r["bestCall"]["title"], r["bestCall"]["hasRecording"]), (91, "Riya", True))
        self.assertEqual(r["worstCall"]["qaScore"], 55)
        self.assertEqual(r["scoredCalls"], 2)

    def test_empty_account(self):
        account = self.db.create_account_with_owner("E", "E", f"gi-e-{os.urandom(4).hex()}@example.com", "h", email_verified=True)["account_id"]
        r = self.db.growth_insights(account)
        self.assertEqual((r["pipeline"]["qualifiedLeads"], r["ads"], r["languages"], r["bestCall"], r["worstCall"]), (0, [], [], None, None))


if __name__ == "__main__":
    unittest.main()
