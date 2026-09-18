"""calls.started_at is stored in two shapes and must never be compared as text.

Older rows are 'YYYY-MM-DD HH:MM:SS', newer ones ISO ('...T...+00:00') — 948
of 1026 rows in production on 2026-09-18. A TEXT range comparison drops every
ISO row whose date equals the boundary date, because 'T' (0x54) sorts after
' ' (0x20). Live effect before the fix: the "calls today" answer reported 0
for a day with 12 real calls, and 2 for a day with 24.
"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import calls_db


class StartedAtIsNeverComparedAsText(unittest.TestCase):
    def test_text_ordering_really_does_drop_iso_rows(self):
        # The premise, not the code: this is why the cast is required.
        iso, spaced_boundary = "2026-09-17T11:48:25.520780+00:00", "2026-09-17 18:30:00"
        self.assertGreater(iso, spaced_boundary)          # sorts as text: excluded
        self.assertLess(iso[:10], spaced_boundary[:10] + "x")

    def test_no_raw_text_range_comparison_survives_in_the_source(self):
        src = open(os.path.join(os.path.dirname(calls_db.__file__), "calls_db.py")).read()
        offenders = re.findall(r"started_at\s*(?:>=|<=|<|>)\s*\?", src)
        self.assertEqual(offenders, [], f"started_at compared as text in {len(offenders)} place(s)")

    def test_every_range_comparison_casts_both_sides(self):
        src = open(os.path.join(os.path.dirname(calls_db.__file__), "calls_db.py")).read()
        for match in re.findall(r"started_at::timestamp\s*(?:>=|<)\s*(\S+)", src):
            # A bound parameter must be cast too; a SQL expression already is.
            self.assertTrue(
                match.startswith("?::timestamp") or not match.startswith("?"),
                f"uncast boundary: {match}",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
