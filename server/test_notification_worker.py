"""Settings → Preferences → Notifications must actually send, once, to the
right people. Offline: settings, sends and queries are all stubbed."""
import unittest
import unittest.mock
from unittest.mock import patch

import notification_worker as nw


class FakeSettings:
    def __init__(self, initial=None):
        self.store = dict(initial or {})

    def get(self, key, account_id):
        return self.store.get((account_id, key))

    def set(self, key, value, account_id):
        self.store[(account_id, key)] = value


class Base(unittest.TestCase):
    def setUp(self):
        self.settings = FakeSettings()
        self.sent = []
        self.patches = [
            patch.object(nw.calls_db, "get_setting", side_effect=self.settings.get),
            patch.object(nw.calls_db, "set_setting", side_effect=self.settings.set),
            patch.object(nw, "_send", side_effect=lambda to, subject, *a: self.sent.append((tuple(to), subject)) or len(to)),
            patch.object(nw, "recipients", return_value=["owner@example.com"]),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)


class Leads(Base):
    def test_first_run_records_a_starting_point_and_sends_nothing(self):
        with patch.object(nw, "_max_call_id", return_value=1079), patch.object(nw, "new_leads") as fetch:
            nw.check_leads(2)
        fetch.assert_not_called()
        self.assertEqual(self.settings.get(nw._LEADS_MARK, 2), "1079")
        self.assertEqual(self.sent, [])

    def test_new_leads_are_batched_into_one_email_and_not_resent(self):
        self.settings.set(nw._LEADS_MARK, "1079", 2)
        leads = [
            {"id": 1080, "lead_name": "Asha", "lead_phone": "+919800000001", "lead_email": "", "call_type": "phone", "direction": "inbound", "duration_seconds": 60, "agent_name": "Artha"},
            {"id": 1082, "lead_name": "Ravi", "lead_phone": "+919800000002", "lead_email": "", "call_type": "widget", "direction": None, "duration_seconds": 40, "agent_name": "Artha"},
        ]
        with patch.object(nw, "new_leads", return_value=leads):
            nw.check_leads(2)
        self.assertEqual(len(self.sent), 1)
        self.assertIn("2 new leads", self.sent[0][1])
        self.assertEqual(self.settings.get(nw._LEADS_MARK, 2), "1082")
        with patch.object(nw, "new_leads", return_value=[]):
            nw.check_leads(2)
        self.assertEqual(len(self.sent), 1)


class IntegrationFailures(Base):
    def _rows(self, error):
        return [{"key": "zoho_crm", "name": "Zoho CRM", "status": "connected", "last_error": error}]

    def _run(self, error):
        conn = unittest.mock.MagicMock()
        conn.execute.return_value.fetchall.return_value = self._rows(error)
        with patch.object(nw.calls_db, "_connect", return_value=conn):
            nw.check_integrations(2)

    def test_one_email_per_failure_then_rearmed_after_recovery(self):
        self._run("Delivery failed — check connection")
        self._run("Delivery failed — check connection")
        self.assertEqual(len(self.sent), 1)
        self.assertIn("Zoho CRM", self.sent[0][1])
        self._run(None)  # recovered
        self._run("Delivery failed — check connection")  # fails again
        self.assertEqual(len(self.sent), 2)


class Credits(Base):
    def _run(self, remaining, total=1100.0):
        with patch.object(nw.calls_db, "billing_summary", return_value={"creditsRemaining": remaining, "creditsTotal": total}):
            nw.check_credits(2)

    def test_low_credits_email_once_and_rearm_after_top_up(self):
        self._run(655.9)
        self.assertEqual(self.sent, [])
        self._run(90)
        self._run(80)
        self.assertEqual(len(self.sent), 1)
        self._run(900)  # topped up
        self._run(50)
        self.assertEqual(len(self.sent), 2)

    def test_an_untouched_small_allocation_is_not_low(self):
        # 10 of 10 credits left must not trigger an email (it would have with
        # an absolute 20-credit floor).
        self._run(10, total=10)
        self.assertEqual(self.sent, [])


class Recipients(unittest.TestCase):
    def test_preferences_are_honoured_and_missing_rows_default_on(self):
        conn = unittest.mock.MagicMock()
        conn.execute.return_value.fetchall.return_value = [
            {"email": "on@example.com", "pref": 1},
            {"email": "off@example.com", "pref": 0},
            {"email": "never-opened@example.com", "pref": None},
        ]
        with patch.object(nw.calls_db, "_connect", return_value=conn):
            self.assertEqual(nw.recipients(2, "notify_leads"), ["on@example.com", "never-opened@example.com"])


if __name__ == "__main__":
    unittest.main()
