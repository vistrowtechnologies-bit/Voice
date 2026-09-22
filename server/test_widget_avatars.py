# -*- coding: utf-8 -*-
"""The avatar catalog and the files on disk have to agree.

Both /widget-avatars routes validate the key against the catalog and then
hand the path to FileResponse, so a key with no file is a 500 on a public,
unauthenticated endpoint that third-party sites hit on every page load —
and a file with no key is dead weight that looks available in the repo.

The catalog was cut to Orb + Artha on 2026-09-22 (the six static headshots
went with it). Anything added back needs its own .png, and should bring a
.mp4 if it is meant to be worth picking.
"""

import os
import unittest
from pathlib import Path

import widget_avatars

AVATARS = Path(__file__).resolve().parent / "static" / "widget-avatars"


class CatalogMatchesDisk(unittest.TestCase):
    def test_every_catalog_key_has_a_still(self):
        for key in widget_avatars.WIDGET_AVATAR_CATALOG:
            self.assertTrue(
                (AVATARS / f"{key}.png").is_file(),
                f"{key} is offered in the picker but {key}.png is missing — the "
                f"public /widget-avatars/{key}.png route would 500",
            )

    def test_no_orphaned_avatar_files(self):
        on_disk = {p.stem for p in AVATARS.glob("*.png")}
        self.assertEqual(
            on_disk - set(widget_avatars.WIDGET_AVATAR_CATALOG),
            set(),
            "an image is sitting in static/widget-avatars with no catalog entry",
        )

    def test_artha_is_the_one_that_moves(self):
        self.assertTrue((AVATARS / "artha.mp4").is_file(), "the waving loop is the point of Artha")
        self.assertIn("artha", widget_avatars.WIDGET_AVATAR_CATALOG)

    def test_removed_headshots_are_rejected(self):
        # A site still holding one of these would render a broken image, so
        # the key must fail validation rather than 404 halfway through.
        for key in ("female1", "female2", "female3", "male1", "male2", "male3"):
            self.assertFalse(widget_avatars.is_valid_avatar_key(key))
            self.assertFalse((AVATARS / f"{key}.png").exists())

    def test_orb_stays_the_default(self):
        keys = list(widget_avatars.WIDGET_AVATAR_CATALOG)
        self.assertEqual(keys[0], "default", "the orb is the fallback every site starts on")
        self.assertTrue(widget_avatars.is_valid_avatar_key("default"))

    def test_unknown_keys_are_rejected(self):
        for key in (None, "", "../../etc/passwd", "nope"):
            self.assertFalse(widget_avatars.is_valid_avatar_key(key))


if __name__ == "__main__":
    unittest.main()
