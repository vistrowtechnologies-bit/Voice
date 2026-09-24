"""Solved tickets lose their stored FILES after 14 days — never the ticket or
its conversation. Offline: storage and database are mocked."""
import datetime
import json
import unittest
from unittest.mock import MagicMock, patch

import support_files

NOW = datetime.datetime(2026, 10, 10, 12, 0, tzinfo=datetime.timezone.utc)


def _conn(tickets, messages):
    conn = MagicMock()
    conn.__enter__ = lambda s: s
    conn.__exit__ = lambda *a: False

    def execute(sql, params=()):
        cur = MagicMock()
        if sql.startswith("SELECT id, attachments_json FROM support_tickets"):
            cur.fetchall.return_value = tickets
        elif sql.startswith("SELECT id, attachments_json FROM support_ticket_messages"):
            cur.fetchall.return_value = messages
        return cur

    conn.execute.side_effect = execute
    return conn


class Purge(unittest.TestCase):
    def _run(self, tickets, messages, fail_keys=()):
        client = MagicMock()
        client.delete_object.side_effect = lambda Bucket, Key: (_ for _ in ()).throw(RuntimeError()) if Key in fail_keys else None
        conn = _conn(tickets, messages)
        with patch.object(support_files.storage, "b2_client", return_value=(client, "bucket")), \
             patch.object(support_files.calls_db, "_connect", return_value=conn):
            total = support_files.purge_solved_ticket_files(NOW)
        return total, client, conn

    def test_files_on_the_ticket_and_its_replies_are_deleted_and_marked(self):
        tickets = [{"id": 2, "attachments_json": json.dumps([{"id": "a", "filename": "shot.png", "key": "support/2/2/a"}])}]
        messages = [{"id": 9, "attachments_json": json.dumps([{"id": "b", "filename": "log.pdf", "key": "support/2/2/b"}])}]
        total, client, conn = self._run(tickets, messages)
        self.assertEqual(total, 2)
        self.assertEqual({c.kwargs["Key"] for c in client.delete_object.call_args_list}, {"support/2/2/a", "support/2/2/b"})
        updates = [c.args for c in conn.execute.call_args_list if c.args[0].startswith("UPDATE")]
        self.assertEqual(len(updates), 2)
        for _, params in updates:
            saved = json.loads(params[0])[0]
            self.assertTrue(saved["purged"])
            self.assertNotIn("key", saved)
            self.assertIn("filename", saved)  # the name stays in the thread

    def test_the_ticket_and_conversation_are_never_deleted(self):
        tickets = [{"id": 2, "attachments_json": json.dumps([{"id": "a", "key": "k"}])}]
        _, _, conn = self._run(tickets, [])
        self.assertFalse(any("DELETE" in c.args[0].upper() for c in conn.execute.call_args_list))

    def test_a_failed_delete_keeps_the_key_for_the_next_run(self):
        tickets = [{"id": 2, "attachments_json": json.dumps([{"id": "a", "key": "stuck"}])}]
        total, _, conn = self._run(tickets, [], fail_keys=("stuck",))
        self.assertEqual(total, 0)
        self.assertFalse(any(c.args[0].startswith("UPDATE") for c in conn.execute.call_args_list))

    def test_only_tickets_solved_more_than_14_days_ago(self):
        _, _, conn = self._run([], [])
        sql, params = conn.execute.call_args_list[0].args
        self.assertIn("status IN ('resolved', 'closed')", sql)
        self.assertIn("resolved_at <= ?", sql)
        self.assertEqual(params, ("2026-09-26 12:00:00",))

    def test_no_storage_configured_does_nothing(self):
        with patch.object(support_files.storage, "b2_client", return_value=(None, None)), \
             patch.object(support_files.calls_db, "_connect") as connect:
            self.assertEqual(support_files.purge_solved_ticket_files(NOW), 0)
        connect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
