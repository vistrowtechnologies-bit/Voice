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
        update = next(c for c in conn.execute.call_args_list if c.args[0].startswith("UPDATE support_tickets SET status"))
        return update.args[1][0]

    def test_customer_reply_reopens_a_resolved_ticket(self):
        self.assertEqual(self._reply("customer", "resolved"), "open")
        self.assertEqual(self._reply("customer", "closed"), "open")

    def test_support_reply_marks_an_open_ticket_in_progress(self):
        self.assertEqual(self._reply("support", "open"), "in_progress")

    def test_support_reply_does_not_reopen_a_resolved_ticket(self):
        self.assertEqual(self._reply("support", "resolved"), "resolved")

    def _update_params(self, author, current_status, attachments):
        conn = _conn(fetchone={"id": 41, "account_id": 2, "status": current_status})
        with patch.object(calls_db, "_connect", return_value=conn), \
             patch.object(calls_db, "get_support_ticket", return_value={"id": 41}):
            calls_db.add_support_ticket_message(41, author, "x", attachments=attachments)
        return next(c for c in conn.execute.call_args_list if c.args[0].startswith("UPDATE support_tickets SET status")).args

    def test_a_file_added_to_a_solved_ticket_restarts_the_file_clock(self):
        sql, params = self._update_params("support", "resolved", [{"id": "f", "key": "k"}])
        self.assertIn("WHEN ? THEN", sql)
        self.assertEqual(params, ("resolved", "resolved", True, 41))

    def test_a_plain_reply_on_a_solved_ticket_keeps_the_clock(self):
        _, params = self._update_params("support", "resolved", None)
        self.assertEqual(params, ("resolved", "resolved", False, 41))

    def test_only_known_authors(self):
        with self.assertRaises(ValueError):
            calls_db.add_support_ticket_message(41, "robot", "x")


class Updates(unittest.TestCase):
    def test_unknown_status_or_priority_is_rejected(self):
        with self.assertRaises(ValueError):
            calls_db.update_support_ticket(41, status="deleted")
        with self.assertRaises(ValueError):
            calls_db.update_support_ticket(41, priority="p0")

    def test_closing_a_solved_ticket_keeps_its_first_solve_time(self):
        conn = _conn(rowcount=1)
        with patch.object(calls_db, "_connect", return_value=conn), patch.object(calls_db, "get_support_ticket", return_value={}):
            calls_db.update_support_ticket(41, status="closed")
        self.assertIn("COALESCE(resolved_at,", conn.execute.call_args_list[0].args[0])

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


class Attachments(unittest.TestCase):
    def test_storage_keys_never_reach_the_browser(self):
        files = calls_db._public_files('[{"id":"a1","filename":"shot.png","contentType":"image/png","size":10,"key":"support/2/9/a1-shot.png"}]')
        self.assertEqual(files, [{"id": "a1", "filename": "shot.png", "contentType": "image/png", "size": 10, "downloadable": True, "purged": False}])
        self.assertNotIn("key", files[0])

    def test_unstored_file_is_listed_but_not_downloadable(self):
        self.assertFalse(calls_db._public_files('[{"id":"a1","filename":"x.log"}]')[0]["downloadable"])
        self.assertEqual(calls_db._public_files("not json"), [])

    def test_file_index_covers_the_opening_message_and_every_reply(self):
        conn = _conn(fetchone={"attachments_json": '[{"id":"t1","key":"k1"}]'},
                     fetchall=[{"attachments_json": '[{"id":"m1","key":"k2"}]'}, {"attachments_json": "[]"}])
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertEqual([f["id"] for f in calls_db.ticket_file_index(9)], ["t1", "m1"])

    def test_reply_stores_its_files(self):
        conn = _conn(fetchone={"id": 41, "account_id": 2, "status": "open"})
        with patch.object(calls_db, "_connect", return_value=conn), \
             patch.object(calls_db, "get_support_ticket", return_value={"id": 41}):
            calls_db.add_support_ticket_message(41, "customer", "", account_id=2, attachments=[{"id": "m1", "key": "k"}])
        insert = next(c for c in conn.execute.call_args_list if "INSERT INTO support_ticket_messages" in c.args[0])
        self.assertIn('"m1"', insert.args[1][-2])  # attachments_json; source_ref is last


class InternalNotes(unittest.TestCase):
    """A note is the support team's private scratchpad."""

    def test_customer_reads_leave_notes_out_by_default(self):
        conn = _conn(fetchone={"id": 2, "account_id": 2, "user_email": "", "category": "general", "status": "open",
                               "subject": "s", "detail": "d", "current_page": "", "attachments_json": "[]", "created_at": "x"})
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.get_support_ticket(2, account_id=2)
        messages_sql = conn.execute.call_args_list[1].args[0]
        self.assertIn("author_type <> 'note'", messages_sql)

    def test_admin_can_ask_for_notes(self):
        conn = _conn(fetchone={"id": 2, "account_id": 2, "user_email": "", "category": "general", "status": "open",
                               "subject": "s", "detail": "d", "current_page": "", "attachments_json": "[]", "created_at": "x"})
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.get_support_ticket(2, include_notes=True)
        self.assertNotIn("'note'", conn.execute.call_args_list[1].args[0])

    def test_notes_never_count_as_the_last_reply_or_a_message(self):
        self.assertEqual(calls_db._TICKET_SELECT.count("author_type <> 'note'"), 2)

    def test_a_note_changes_nothing_on_the_ticket(self):
        conn = _conn(fetchone={"id": 41, "account_id": 2, "status": "resolved"})
        with patch.object(calls_db, "_connect", return_value=conn), \
             patch.object(calls_db, "get_support_ticket", return_value={"id": 41}) as fetch:
            calls_db.add_support_ticket_message(41, "note", "customer is on the Growth plan")
        self.assertFalse(any(c.args[0].startswith("UPDATE support_tickets") for c in conn.execute.call_args_list))
        self.assertTrue(fetch.call_args.kwargs["include_notes"])

    def test_note_files_are_not_downloadable_by_the_customer(self):
        conn = _conn(fetchone={"attachments_json": "[]"}, fetchall=[])
        with patch.object(calls_db, "_connect", return_value=conn):
            calls_db.ticket_file_index(9)
        self.assertIn("author_type <> 'note'", conn.execute.call_args_list[1].args[0])

    def test_a_customer_reply_returns_the_customer_view(self):
        conn = _conn(fetchone={"id": 41, "account_id": 2, "status": "open"})
        with patch.object(calls_db, "_connect", return_value=conn), \
             patch.object(calls_db, "get_support_ticket", return_value={"id": 41}) as fetch:
            calls_db.add_support_ticket_message(41, "customer", "hi", account_id=2)
        self.assertFalse(fetch.call_args.kwargs["include_notes"])


class FirstResponseRatingAssignment(unittest.TestCase):
    def test_first_support_reply_is_timed_once(self):
        conn = _conn(fetchone={"id": 41, "account_id": 2, "status": "open"})
        with patch.object(calls_db, "_connect", return_value=conn), patch.object(calls_db, "get_support_ticket", return_value={}):
            calls_db.add_support_ticket_message(41, "support", "hello")
        self.assertTrue(any("first_response_at = COALESCE(first_response_at" in c.args[0] for c in conn.execute.call_args_list))

    def test_rating_only_on_a_solved_request_of_your_own(self):
        conn = _conn(rowcount=0)
        with patch.object(calls_db, "_connect", return_value=conn):
            self.assertIsNone(calls_db.rate_support_ticket(41, 2, "good"))
        sql, params = conn.execute.call_args.args
        self.assertIn("status IN ('resolved', 'closed')", sql)
        self.assertEqual(params[-2:], (41, 2))
        with self.assertRaises(ValueError):
            calls_db.rate_support_ticket(41, 2, "5 stars")

    def test_assign_only_to_the_support_team(self):
        with patch.object(calls_db, "support_team_members", return_value=[{"id": 2, "name": "V", "email": "v@x"}]):
            with self.assertRaises(ValueError):
                calls_db.assign_support_ticket(41, 99)


if __name__ == "__main__":
    unittest.main()
