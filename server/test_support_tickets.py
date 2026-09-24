"""Support tickets: scoped to their workspace, and the status follows the
conversation. Offline — the connection is mocked, nothing touches a database.

Until 2026-09-24 a ticket could be created and emailed but never read back,
by the customer or by us, and zero tickets had ever been filed.
"""
import unittest
from unittest.mock import MagicMock, patch

import calls_db


def _conn(fetchone=None, fetchall=(), rowcount=1):
    conn = MagicMock()
    conn.__enter__ = lambda s: s
    conn.__exit__ = lambda *a: False
    cur = conn.execute.return_value
    cur.fetchone.return_value = fetchone
    cur.fetchall.return_value = list(fetchall)
    cur.rowcount = rowcount
    return conn


class AWorkspaceOnlySeesItsOwnTickets(unittest.TestCase):
    def test_detail_is_scoped_to_the_account(self):
        conn = _conn(fetchone=None)
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertIsNone(calls_db.get_support_ticket(41, account_id=2))
        sql, params = conn.execute.call_args_list[0].args
        self.assertIn("t.account_id = ?", sql)
        self.assertEqual(params, (41, 2))

    def test_list_is_scoped_to_the_account(self):
        conn = _conn(fetchall=[])
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.list_support_tickets(2, "open")
        sql, params = conn.execute.call_args.args
        self.assertIn("t.account_id = ?", sql)
        self.assertEqual(params, (2, "open"))

    def test_platform_inbox_lists_every_workspace(self):
        conn = _conn(fetchall=[])
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.list_support_tickets(None)
        sql, params = conn.execute.call_args.args
        self.assertNotIn("account_id = ?", sql)
        self.assertEqual(params, ())

    def test_cannot_reply_to_another_workspaces_ticket(self):
        conn = _conn(fetchone=None)
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertIsNone(calls_db.add_support_ticket_message(41, "customer", "hi", account_id=3))
        self.assertFalse(any("INSERT INTO support_ticket_messages" in c.args[0] for c in conn.execute.call_args_list))


class StatusFollowsTheConversation(unittest.TestCase):
    def _reply(self, author, current_status):
        conn = _conn(fetchone={"id": 41, "account_id": 2, "status": current_status})
        with patch.object(calls_db, "_connect", return_value=conn), \
             patch.object(calls_db, "get_support_ticket", return_value={"id": 41}):
            calls_db.add_support_ticket_message(41, author, "a reply", account_id=2 if author == "customer" else None)
        update = next(c for c in conn.execute.call_args_list if c.args[0].startswith("UPDATE support_tickets"))
        return update.args[1][0]

    def test_customer_reply_reopens_a_resolved_ticket(self):
        self.assertEqual(self._reply("customer", "resolved"), "open")
        self.assertEqual(self._reply("customer", "closed"), "open")

    def test_support_reply_marks_an_open_ticket_in_progress(self):
        self.assertEqual(self._reply("support", "open"), "in_progress")

    def test_support_reply_does_not_reopen_a_resolved_ticket(self):
        self.assertEqual(self._reply("support", "resolved"), "resolved")

    def test_only_known_authors(self):
        with self.assertRaises(ValueError):
            calls_db.add_support_ticket_message(41, "robot", "x")


class Updates(unittest.TestCase):
    def test_unknown_status_or_priority_is_rejected(self):
        with self.assertRaises(ValueError):
            calls_db.update_support_ticket(41, status="deleted")
        with self.assertRaises(ValueError):
            calls_db.update_support_ticket(41, priority="p0")

    def test_customer_update_is_scoped_and_misses_other_workspaces(self):
        conn = _conn(rowcount=0)
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertIsNone(calls_db.update_support_ticket(41, status="resolved", account_id=3))
        sql, params = conn.execute.call_args.args
        self.assertTrue(sql.endswith("WHERE id = ? AND account_id = ?"))
        self.assertEqual(params[-2:], (41, 3))

    def test_new_ticket_insert_returns_its_id(self):
        # dbconn's lastrowid fetches the INSERT's result row; with no
        # RETURNING id it raised on every ticket and the insert rolled back.
        conn = _conn()
        conn.execute.return_value.lastrowid = 7
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.create_support_ticket(2, 5, "a@b.c", "technical", "s", "d", "/x", [])
        self.assertTrue(conn.execute.call_args.args[0].rstrip().endswith("RETURNING id"))

    def test_new_ticket_priority_falls_back_to_normal(self):
        conn = _conn()
        conn.execute.return_value.lastrowid = 7
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.create_support_ticket(2, 5, "a@b.c", "technical", "s", "d", "/x", [], priority="p0")
        self.assertEqual(conn.execute.call_args.args[1][-1], "normal")


if __name__ == "__main__":
    unittest.main()
