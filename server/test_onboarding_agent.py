"""The starter agent is set up from the onboarding answers, and only the
untouched starter (or the one onboarding already set up) is ever changed."""

import unittest
from unittest.mock import patch

import calls_db
import onboarding_agent

PROFILE = {
    "industry": "Real estate",
    "useCases": ["Qualify leads", "Book appointments"],
    "languages": ["Hindi", "English", "Marathi"],
}


class AgentFromProfileTests(unittest.TestCase):
    def test_real_estate_hindi_lead_qualifier(self) -> None:
        agent = onboarding_agent.agent_from_profile(PROFILE, "Sunrise Homes")
        self.assertEqual(agent["language"], "hi-IN")
        self.assertIn("Sunrise Homes", agent["welcomeMessage"])
        self.assertIn("नमस्ते", agent["welcomeMessage"])
        prompt = agent["systemPrompt"]
        self.assertIn("# Role", prompt)
        self.assertIn("a real estate business", prompt)
        self.assertIn("Marathi", prompt)  # other caller languages are named
        self.assertIn("Never make up prices", prompt)
        keys = [f["key"] for f in agent["postCallFields"]]
        self.assertEqual(keys[0], "caller_name")
        for key in ("budget", "lead_quality", "appointment_booked"):
            self.assertIn(key, keys)
        self.assertLessEqual(len(keys), 8)
        self.assertEqual(len(keys), len(set(keys)))

    def test_language_choice(self) -> None:
        self.assertEqual(onboarding_agent.agent_language(["English"]), "en-IN")
        self.assertEqual(onboarding_agent.agent_language(["English", "Tamil"]), "ta-IN")
        self.assertEqual(onboarding_agent.agent_language(["Other"]), "hi-IN")

    def test_regional_language_gets_no_unreviewed_greeting(self) -> None:
        agent = onboarding_agent.agent_from_profile({"languages": ["Tamil"]}, "Acme")
        self.assertEqual(agent["language"], "ta-IN")
        self.assertEqual(agent["welcomeMessage"], "")

    def test_outbound_only_has_no_inbound_greeting(self) -> None:
        agent = onboarding_agent.agent_from_profile({"useCases": ["Payment reminders"], "languages": ["English"]}, "Acme")
        self.assertEqual(agent["welcomeMessage"], "")
        self.assertIn("promised_payment_date", [f["key"] for f in agent["postCallFields"]])

    def test_other_industry_and_missing_company(self) -> None:
        agent = onboarding_agent.agent_from_profile({"industry": "Other", "industryOther": "pet grooming"}, "")
        self.assertIn("a pet grooming business", agent["systemPrompt"])
        self.assertIn("our company", agent["systemPrompt"])


class _Conn:
    def __init__(self, onboarded_at, marker, starter_id):
        self.onboarded_at, self.marker, self.starter_id = onboarded_at, marker, starter_id

    def close(self) -> None:
        pass

    def execute(self, sql: str, params: tuple = ()):
        rows = []
        if "FROM accounts" in sql:
            rows = [{"onboarded_at": self.onboarded_at}]
        elif "FROM settings" in sql:
            rows = [{"value": self.marker}] if self.marker else []
        elif "WHERE id = ? AND account_id" in sql:
            rows = [{"id": params[0]}] if str(params[0]) == self.marker else []
        elif "name = 'Artha'" in sql:
            rows = [{"id": self.starter_id}] if self.starter_id else []
        return _Result(rows)


class _Result:
    def __init__(self, rows):
        self.rows = rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class ApplyTests(unittest.TestCase):
    def _apply(self, conn):
        with patch.object(calls_db, "_connect", return_value=conn), \
                patch.object(calls_db, "update_agent") as update, \
                patch.object(calls_db, "set_setting") as setting:
            result = calls_db.apply_onboarding_agent(7, {"language": "hi-IN"})
        return result, update, setting

    def test_untouched_starter_is_set_up_and_remembered(self) -> None:
        result, update, setting = self._apply(_Conn(None, None, 41))
        self.assertEqual(result, 41)
        update.assert_called_once_with(41, {"language": "hi-IN"}, 7)
        setting.assert_called_once_with(calls_db.ONBOARDING_AGENT_SETTING, "41", 7)

    def test_going_back_reapplies_to_the_same_agent(self) -> None:
        result, update, _ = self._apply(_Conn(None, "41", None))
        self.assertEqual(result, 41)
        update.assert_called_once()

    def test_customised_or_finished_account_is_never_touched(self) -> None:
        for conn in (_Conn(None, None, None), _Conn("2026-10-15", None, 41)):
            result, update, _ = self._apply(conn)
            self.assertIsNone(result)
            update.assert_not_called()


class AdminMappingTests(unittest.TestCase):
    def _info(self, **edits):
        import json
        import admin_db

        expected = onboarding_agent.agent_from_profile(PROFILE, "Sunrise Homes")
        agent = {
            "id": 41, "name": "Artha", "status": "draft", "language": expected["language"],
            "welcome_message": expected["welcomeMessage"], "system_prompt": expected["systemPrompt"],
            "post_call_fields": json.dumps(expected["postCallFields"]), "updated_at": None, **edits,
        }

        class Conn:
            def execute(self, sql, params=()):
                return _Result([{"value": "41"}] if "FROM settings" in sql else [agent])

        return admin_db._onboarding_agent(Conn(), {"id": 7, "name": "Sunrise Homes", "onboarding_profile": PROFILE})

    def test_untouched_agent_shows_as_set_up(self) -> None:
        info = self._info()
        self.assertEqual(info["id"], 41)
        self.assertFalse(any(info["changed"].values()))
        self.assertIn("budget", info["postCallFields"])

    def test_customer_edits_are_flagged_per_setting(self) -> None:
        info = self._info(system_prompt="My own prompt", language="en-IN")
        self.assertTrue(info["changed"]["instructions"])
        self.assertTrue(info["changed"]["language"])
        self.assertFalse(info["changed"]["fields"])
        self.assertEqual(info["language"], "en-IN")
        self.assertEqual(info["setUp"]["language"], "hi-IN")  # what onboarding set, shown as "was"


if __name__ == "__main__":
    unittest.main()
