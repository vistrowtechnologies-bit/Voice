"""get_compliance_config falls back to the safe defaults (recording OFF) when
the database cannot be reached at all, not only when the query fails.
dbconn.connect() used to sit outside the try, so a PoolTimeout escaped and
broke building the agent's tools (_requires_spoken_consent) on any path that
had not preloaded the compliance config."""
import os
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db
from psycopg_pool import PoolTimeout


class ComplianceWithTheDatabaseDown(unittest.TestCase):
    def test_unreachable_database_returns_the_fallback(self):
        db._compliance_cache.pop(987654, None)
        with patch.object(db.dbconn, "connect", side_effect=PoolTimeout("no connection")):
            cfg = db.get_compliance_config(987654)
        self.assertEqual(cfg, db._COMPLIANCE_FALLBACK)
        self.assertFalse(cfg.get("record_calls"))
        self.assertNotIn(987654, db._compliance_cache)


if __name__ == "__main__":
    unittest.main()
