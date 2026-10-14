"""Full-page onboarding: answers and first-touch attribution are cleaned,
length-capped, and stored without overwriting values the account already has."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import calls_db
import onboarding_profile


class _RecordingConnection:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple]] = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def close(self) -> None:
        pass

    def execute(self, sql: str, params: tuple = ()):
        self.calls.append((sql, params))
        return SimpleNamespace(lastrowid=None)


class CleaningTests(unittest.TestCase):
    def test_profile_keeps_known_fields_and_caps_lengths(self) -> None:
        profile = onboarding_profile.clean_profile({
            "role": "Founder / Owner",
            "industry": "x" * 500,
            "useCases": ["Qualify leads", "", "y" * 200] + ["z"] * 30,
            "languages": "Hindi",  # not a list: dropped
            "isPlatformOwner": True,  # unknown: dropped
            "companySize": "",
        })
        self.assertEqual(profile["role"], "Founder / Owner")
        self.assertEqual(len(profile["industry"]), 200)
        self.assertEqual(profile["useCases"][0], "Qualify leads")
        self.assertEqual(len(profile["useCases"][1]), 80)
        self.assertLessEqual(len(profile["useCases"]), 20)
        self.assertNotIn("languages", profile)
        self.assertNotIn("isPlatformOwner", profile)
        self.assertNotIn("companySize", profile)

    def test_attribution_keeps_only_marketing_keys(self) -> None:
        attribution = onboarding_profile.clean_attribution({
            "utm_source": "linkedin", "gclid": "abc", "landing_page": "/pricing", "password": "secret", "utm_medium": "",
        })
        self.assertEqual(attribution, {"utm_source": "linkedin", "gclid": "abc", "landing_page": "/pricing"})
        self.assertEqual(onboarding_profile.clean_attribution("not a dict"), {})


class StorageTests(unittest.TestCase):
    def test_profile_fills_phone_and_referral_only_when_empty(self) -> None:
        conn = _RecordingConnection()
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.save_onboarding_profile(7, 9, {"role": "Sales", "phone": "+91 98765 43210", "referralSource": "LinkedIn"})
        sql = [c[0] for c in conn.calls]
        self.assertIn("UPDATE accounts SET onboarding_profile = ? WHERE id = ?", sql[0])
        self.assertEqual(json.loads(conn.calls[0][1][0])["role"], "Sales")
        self.assertTrue(any("referral_source" in s and "= ''" in s for s in sql))
        self.assertTrue(any("UPDATE users SET phone" in s and "= ''" in s for s in sql))

    def test_attribution_is_first_touch_only(self) -> None:
        conn = _RecordingConnection()
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.save_signup_attribution(7, {"utm_source": "google"})
            calls_db.save_signup_attribution(7, {})
        self.assertEqual(len(conn.calls), 1)
        self.assertIn("COALESCE(signup_attribution, '') = ''", conn.calls[0][0])


if __name__ == "__main__":
    unittest.main()
