"""A note can only be added to a contact that belongs to the caller's account."""
import unittest
from unittest.mock import MagicMock, patch

import calls_db


class ContactNoteOwnershipTests(unittest.TestCase):
    def _conn(self, owned):
        conn = MagicMock()
        conn.__enter__.return_value = conn
        conn.execute.return_value.fetchone.return_value = {"x": 1} if owned else None
        return conn

    def test_other_accounts_contact_is_refused_and_nothing_is_written(self):
        conn = self._conn(owned=False)
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertIsNone(calls_db.add_contact_note(442, 7, "hello", "a@b.c"))
        sql = [c.args[0] for c in conn.execute.call_args_list]
        self.assertEqual(len(sql), 1)
        self.assertIn("FROM contacts WHERE id = ? AND account_id = ?", sql[0])
        self.assertFalse(any("INSERT" in s for s in sql))

    def test_own_contact_gets_the_note(self):
        conn = self._conn(owned=True)
        conn.execute.return_value.fetchone.side_effect = [
            {"x": 1}, {"id": 9, "body": "hello", "created_by": "a@b.c", "created_at": "now"}]
        with patch.object(calls_db, "_connect", return_value=conn):
            note = calls_db.add_contact_note(442, 7, "hello", "a@b.c")
        self.assertEqual(note["id"], 9)


if __name__ == "__main__":
    unittest.main()
