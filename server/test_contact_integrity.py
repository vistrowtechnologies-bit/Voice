"""Offline contact identity regressions. Never connects to a database."""
import unittest
from unittest.mock import MagicMock, patch

import calls_db


class ContactPhoneIntegrityTests(unittest.TestCase):
    def setUp(self) -> None:
        # The account's country lives in the settings table; these tests are
        # offline, so pin it to India — what every pre-existing account is.
        stub = patch.object(calls_db, "get_account_country", return_value="IN")
        stub.start()
        self.addCleanup(stub.stop)

    def test_indian_local_number_gets_country_code(self) -> None:
        self.assertEqual(calls_db.canonical_contact_phone("8080197945"), "+918080197945")

    def test_existing_indian_prefixes_collapse_to_one_identity(self) -> None:
        expected = "+918080197945"
        for value in ("+91 80801 97945", "918080197945", "08080197945"):
            self.assertEqual(calls_db.canonical_contact_phone(value), expected)

    def test_explicit_international_number_is_preserved(self) -> None:
        self.assertEqual(calls_db.canonical_contact_phone("+1 (415) 555-2671"), "+14155552671")

    def test_invalid_phone_is_rejected(self) -> None:
        for value in ("", "not provided", "+0123456789", "123"):
            self.assertEqual(calls_db.canonical_contact_phone(value), "")

    def test_bare_local_number_is_read_in_the_account_country(self) -> None:
        with patch.object(calls_db, "get_account_country", return_value="US"):
            self.assertEqual(calls_db.canonical_contact_phone("(415) 555-2671", 9), "+14155552671")
        with patch.object(calls_db, "get_account_country", return_value="AE"):
            self.assertEqual(calls_db.canonical_contact_phone("050 123 4567", 9), "+971501234567")

    def test_dnc_key_matches_however_a_us_number_was_typed(self) -> None:
        # The old India-only digits key gave "14155552671" vs "4155552671",
        # so a blocked US number would have been dialled again.
        with patch.object(calls_db, "get_account_country", return_value="US"):
            self.assertEqual(calls_db._normalize_phone("+1 415 555 2671", 9),
                             calls_db._normalize_phone("415-555-2671", 9))

    def test_call_sync_cannot_overwrite_a_corrected_contact_name(self) -> None:
        conn = MagicMock()
        conn.execute.return_value.fetchall.return_value = [{
            "lead_phone": "8080197945",
            "lead_name": "Unknown",
            "last_call": "2026-09-08 10:00:00",
            "visited": 0,
        }]

        calls_db._sync_contacts_from_calls(conn, 7)

        upsert_sql = conn.execute.call_args_list[1].args[0]
        upsert_values = conn.execute.call_args_list[1].args[1]
        self.assertIn("contacts.source = 'call'", upsert_sql)
        self.assertIn("lower(trim(contacts.name))", upsert_sql)
        self.assertEqual(upsert_values[2], "+918080197945")


if __name__ == "__main__":
    unittest.main()
