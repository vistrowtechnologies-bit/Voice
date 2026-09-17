"""agent/ringback.py - ringback detection on outbound caller audio.

The thresholds come from campaign 20's 16 real recordings (2026-09-17),
validated offline before this detector was wired in: all 10 ringback legs
locked within 3.5-5.0s, and none of the 3 real conversations (up to 139s)
ever locked. Call audio can't be committed, so these tests pin the same
behaviour on synthetic signals shaped like what those recordings contained:
a strict ~1.0s tone/silence cycle for ringback, irregular bursts for speech.
"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ringback

SR = ringback.SAMPLE_RATE
rng = np.random.default_rng(7)


def ring_tone(seconds: float, on_s: float = 0.5, period_s: float = 1.0) -> np.ndarray:
    t = np.arange(int(seconds * SR)) / SR
    gate = (t % period_s) < on_s
    return (0.15 * np.sin(2 * np.pi * 425 * t) * gate).astype(np.float64)


def speech_like(seconds: float) -> np.ndarray:
    """Irregular syllable-length bursts separated by irregular pauses."""
    out, n = [], int(seconds * SR)
    while sum(len(x) for x in out) < n:
        burst = int(rng.uniform(0.08, 0.45) * SR)
        env = np.hanning(burst) * rng.uniform(0.05, 0.3)
        out.append(rng.normal(0, 1, burst) * env)
        out.append(rng.normal(0, 0.002, int(rng.uniform(0.05, 0.6) * SR)))
    return np.concatenate(out)[:n]


def feed(signal: np.ndarray) -> tuple[ringback.RingbackDetector, list[tuple[float, bool | None]]]:
    det, timeline, step = ringback.RingbackDetector(SR), [], int(SR * 0.01)
    for i in range(0, len(signal), step):
        det.add(signal[i:i + step])
        timeline.append(((i + step) / SR, det.active))
    return det, timeline


def first_time(timeline, value):
    return next((t for t, a in timeline if a is value), None)


class RingbackLocks(unittest.TestCase):
    def test_ringback_locks_before_the_8s_hard_cap(self):
        det, tl = feed(ring_tone(12))
        locked_at = first_time(tl, True)
        self.assertIsNotNone(locked_at)
        self.assertLess(locked_at, 6.0)  # real data: 3.5-5.0s
        self.assertIs(next(a for t, a in tl if t >= 8.0), True)
        self.assertTrue(det.seen)

    def test_int16_frames_as_livekit_delivers_them(self):
        pcm = (ring_tone(8) * 32767).astype(np.int16)
        det, _ = feed(pcm)
        self.assertTrue(det.active)

    def test_ringback_then_pickup_clears(self):
        det, tl = feed(np.concatenate([ring_tone(10), speech_like(8)]))
        self.assertTrue(det.seen)
        self.assertFalse(det.active)
        self.assertTrue(det.cleared_after_seen)


class NeverLocksOnARealLine(unittest.TestCase):
    def test_speech_never_locks(self):
        for _ in range(5):
            det, _ = feed(speech_like(60))
            self.assertFalse(det.seen)

    def test_silence_never_locks(self):
        det, tl = feed(np.zeros(SR * 10))
        self.assertFalse(det.seen)
        self.assertIs(det.active, False)

    def test_no_verdict_before_a_full_window(self):
        det, _ = feed(ring_tone(2.0))
        self.assertIsNone(det.active)


class PeriodicityPrimitive(unittest.TestCase):
    def test_one_second_cycle_scores_high_at_one_second(self):
        det = ringback.RingbackDetector(SR)
        det.add(ring_tone(3.0))
        env = np.fromiter(det._env, dtype=np.float64)
        score, lag = ringback.periodicity(env)
        self.assertGreaterEqual(score, ringback.MIN_SCORE)
        self.assertAlmostEqual(lag, 1.0, delta=0.05)


if __name__ == "__main__":
    unittest.main(verbosity=2)
