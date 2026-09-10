"""Renaming a contact must not collide with a DELETED one. Never connects to a database.

Live case on account 2: contact 2031 ("Unknown", phone "8080197945") could not
be renamed at all. canonical_contact_phone turns that into "+918080197945" on
save, and the duplicate check matched contact 1926 — which was deleted on
2026-09-08 and is invisible everywhere in the UI. The operator got "Another
contact already uses this phone number" with nothing they could act on.

The check also compared the raw `phone` string, while the same person is
stored four ways on account 1 ("+91 8080197945", "+918080197945",
"8080197945", "918080197945"). Exact matching therefore missed real
duplicates and caught unreal ones the moment canonicalisation changed the
stored value.
"""
import unittest
from unittest.mock import patch

import calls_db


class _Cursor:
    def __init__(self, rows):
        self._rows = rows

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def fetchall(self):
        return self._rows


class _FakeConn:
    """Serves the handful of statements update_contact issues."""

    def __init__(self, current, others):
        self.current = current
        self.others = others
        self.updates = []

    def execute(self, sql, params=()):
        s = " ".join(sql.split())
        if s.startswith("SELECT * FROM contacts WHERE id"):
            return _Cursor([self.current])
        if s.startswith("SELECT id, phone FROM contacts WHERE account_id"):
            # The real query filters deleted rows in SQL; honour that here so
            # the test fails if that clause is ever dropped again.
            self.saw_deleted_filter = "deleted_at IS NULL" in s
            return _Cursor([r for r in self.others if r.get("deleted_at") is None])
        if s.startswith("UPDATE contacts SET"):
            self.updates.append(params)
            return _Cursor([])
        return _Cursor([])

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def close(self):
        pass


def _row(**kw):
    base = {"id": 0, "account_id": 2, "name": "", "phone": None, "email": "",
            "company": "", "status": "new", "tags": "", "custom_fields": "{}",
            "deleted_at": None}
    base.update(kw)
    return base


class RenamingOverADeletedDuplicate(unittest.TestCase):
    def _run(self, others, new_name="Abhishek"):
        current = _row(id=2031, name="Unknown", phone="8080197945")
        conn = _FakeConn(current, others)
        # update_contact re-reads through contact_detail at the end, which
        # opens its own connection; the fake only models the update path.
        with patch.object(calls_db, "_connect", return_value=conn), \
             patch.object(calls_db, "contact_detail", return_value={"id": 2031}):
            result = calls_db.update_contact(2031, {"name": new_name}, 2)
        return conn, result

    def test_a_deleted_contact_no_longer_blocks_the_rename(self):
        """The exact live rows: 1926 and 1927 both deleted on 2026-09-08."""
        others = [
            _row(id=1926, name="abhishek", phone="+918080197945",
                 deleted_at="2026-09-08 09:16:17"),
            _row(id=1927, name="Unknown", phone="918080197945",
                 deleted_at="2026-09-08 09:16:22"),
        ]
        conn, _ = self._run(others)
        self.assertTrue(conn.updates, "the rename was rejected")
        self.assertEqual(conn.updates[0][0], "Abhishek")

    def test_the_deleted_filter_is_in_the_query_itself(self):
        conn, _ = self._run([])
        self.assertTrue(getattr(conn, "saw_deleted_filter", False),
                        "duplicate check no longer filters deleted_at")

    def test_a_live_duplicate_still_blocks(self):
        others = [_row(id=9, name="Abhishek", phone="+918080197945")]
        with self.assertRaises(ValueError) as ctx:
            self._run(others)
        self.assertIn("already uses this phone number", str(ctx.exception))

    def test_a_live_duplicate_in_a_different_format_also_blocks(self):
        """Exact string matching missed these — the same person, four ways."""
        for stored in ("+91 8080197945", "918080197945", "08080197945",
                       "8080197945"):
            with self.subTest(stored=stored):
                with self.assertRaises(ValueError):
                    self._run([_row(id=9, name="Abhishek", phone=stored)])

    def test_an_unrelated_number_does_not_block(self):
        conn, _ = self._run([_row(id=9, name="Sandeep", phone="+917066880808")])
        self.assertTrue(conn.updates, "an unrelated contact blocked the rename")


if __name__ == "__main__":
    unittest.main()
