"""error_events must not hold a caller's phone number or email (privacy
audit 2026-10-12: no purge and free-text exception messages)."""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import db


class LogPlatformErrorRedacts(unittest.TestCase):
    def test_contact_details_masked_before_insert(self):
        conn = MagicMock()
        with patch.object(db.dbconn, "connect", return_value=conn):
            db.log_platform_error(
                "lead delivery failed for +91 98765 43210",
                source="agent_fanout", account_id=2,
                context="HTTPError 422: {'email': 'asha@acme.in', 'phone': '919876543210'}",
            )
        params = conn.execute.call_args.args[1]
        self.assertEqual(params[3], "lead delivery failed for [phone]")
        self.assertNotIn("asha@acme.in", params[4])
        self.assertNotIn("919876543210", params[4])
        self.assertEqual(params[0], 2)


if __name__ == "__main__":
    unittest.main()
