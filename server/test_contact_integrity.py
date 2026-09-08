"""Offline contact identity regressions. Never connects to a database."""
import unittest
from unittest.mock import MagicMock

import calls_db


class ContactPhoneIntegrityTests(unittest.TestCase):
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
