"""Every ambience clip must sound the same loudness at the same slider %.

Call 990: "call_center" at the dashboard's 10% slider was reported far
louder than "office" ever was at that setting. Traced (measured, not
guessed - decoded each .ogg and took the RMS of the raw samples) to the
bundled clips not being mastered anywhere near the same loudness:
call_center's source file is ~29 dB hotter than office's at the same
nominal volume=1.0, and the gain formula was applying the same raw
multiplier to every clip, calibrated only against office's known-quiet
file. _AMBIENT_CLIP_GAIN_RATIO in main.py normalizes each clip against
office's already call-validated loudness curve.
"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")
import main

# Independently measured (see this file's own analysis, not re-derived from
# main.py's ratios) - decoded each bundled .ogg, RMS of the raw samples,
# at the library's native volume=1.0.
_MEASURED_RMS = {
    "office": 0.00171,
    "city": 0.01607,
    "call_center": 0.05004,
    "keyboard_typing": 0.01089,
    "keyboard_typing2": 0.01151,
    "forest": 0.00255,
    "hold_music": 0.10804,
}


def _dbfs(rms: float) -> float:
    return 20 * math.log10(rms)


class EveryClipHasAGainRatio(unittest.TestCase):
    def test_every_ambient_clip_key_has_a_ratio(self):
        for key in main._AMBIENT_CLIPS:
            self.assertIn(key, main._AMBIENT_CLIP_GAIN_RATIO, f"{key} has no gain ratio defined")

    def test_office_ratio_is_exactly_one(self):
        # office is the reference clip the whole slider range was
        # calibrated against - it must never be rescaled.
        self.assertEqual(main._AMBIENT_CLIP_GAIN_RATIO["office"], 1.0)


class ClipsSoundTheSameLoudnessAtTheSameSlider(unittest.TestCase):
    """The actual regression check: applying main.py's own ratio to each
    clip's independently-measured RMS must land within a fraction of a dB
    of office's loudness at that same slider position - not exactly on top
    of it (the ratios are rounded to 4 decimal places), but nowhere close
    to the ~29 dB gap call 990 reported."""

    def test_call_center_matches_office_within_a_third_of_a_db(self):
        for slider in (0.1, 0.5, 1.0):
            office_gain = slider * 6.0 * main._AMBIENT_CLIP_GAIN_RATIO["office"]
            call_center_gain = slider * 6.0 * main._AMBIENT_CLIP_GAIN_RATIO["call_center"]
            office_dbfs = _dbfs(_MEASURED_RMS["office"] * office_gain)
            call_center_dbfs = _dbfs(_MEASURED_RMS["call_center"] * call_center_gain)
            self.assertAlmostEqual(office_dbfs, call_center_dbfs, delta=0.3)

    def test_hold_music_matches_office_within_a_third_of_a_db(self):
        # The hottest clip of the seven (-19.3 dBFS source vs office's
        # -55.4) - if any clip would still clip through rounding error in
        # the ratio, it's this one.
        for slider in (0.1, 0.5, 1.0):
            office_gain = slider * 6.0 * main._AMBIENT_CLIP_GAIN_RATIO["office"]
            hold_gain = slider * 6.0 * main._AMBIENT_CLIP_GAIN_RATIO["hold_music"]
            office_dbfs = _dbfs(_MEASURED_RMS["office"] * office_gain)
            hold_dbfs = _dbfs(_MEASURED_RMS["hold_music"] * hold_gain)
            self.assertAlmostEqual(office_dbfs, hold_dbfs, delta=0.3)

    def test_the_old_uniform_formula_would_have_failed_this(self):
        # Documents exactly what call 990 heard, so this test file makes
        # sense on its own without needing the commit history.
        slider = 0.1
        old_uniform_gain = slider * 6.0  # main.py's formula before this fix
        office_dbfs = _dbfs(_MEASURED_RMS["office"] * old_uniform_gain)
        call_center_dbfs = _dbfs(_MEASURED_RMS["call_center"] * old_uniform_gain)
        self.assertGreater(call_center_dbfs - office_dbfs, 25)


if __name__ == "__main__":
    unittest.main()
