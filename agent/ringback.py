"""Live ringback detection on an outbound call's caller-side audio.

sip.callStatus="active" does not mean a human answered: carriers send 183
early media while the handset is still ringing, and the agent's held outbound
opening was released on its 8s hard cap straight into that ring tone. Measured
on campaign 20 (2026-09-17), 9 of 16 recordings carried 13-19s of ringback on
the caller channel after "active", while the agent greeted at ~8s.

Energy alone cannot tell ringback from a live-but-quiet line (a live line sits
at digital silence ~40% of the time), so this keys on periodicity instead:
Indian ringback is a strict ~1.0s on/off cycle. On those 16 recordings every
ringback window scored 0.66-0.67 at a 1.00s lag, and the one long real
conversation never exceeded 0.32 or locked to a 1.0s period.

Pure numpy, no LiveKit imports, so it can be exercised offline against real
recordings (see test_ringback.py).
"""

from collections import deque

import numpy as np

SAMPLE_RATE = 16000
HOP_S = 0.02
WINDOW_S = 3.0
EVAL_EVERY_S = 0.5
MIN_SCORE = 0.5
PERIOD_RANGE_S = (0.9, 1.1)
# Below this the window is silence, whose "periodicity" is just noise.
MIN_WINDOW_DBFS = -55.0
# Consecutive agreeing evaluations needed to flip state (EVAL_EVERY_S each),
# so a single odd window can neither start nor end a ringback verdict.
CONFIRM_EVALS = 2


def periodicity(envelope: np.ndarray, hop_s: float = HOP_S) -> tuple[float, float | None]:
    """(peak normalised autocorrelation, lag in seconds) within 0.6-1.6s."""
    e = envelope - envelope.mean()
    max_lag = int(1.6 / hop_s)
    if len(e) < max_lag + 2 or not np.any(e):
        return 0.0, None
    ac = np.correlate(e, e, mode="full")[len(e) - 1:]
    if ac[0] <= 0:
        return 0.0, None
    ac = ac / ac[0]
    lo = int(0.6 / hop_s)
    best = lo + int(np.argmax(ac[lo:max_lag]))
    return float(ac[best]), best * hop_s


def window_is_ringback(envelope: np.ndarray) -> bool:
    rms = float(np.sqrt(np.mean(envelope ** 2)))
    if 20 * np.log10(rms + 1e-12) < MIN_WINDOW_DBFS:
        return False
    score, lag = periodicity(envelope)
    return bool(lag is not None and score >= MIN_SCORE and PERIOD_RANGE_S[0] <= lag <= PERIOD_RANGE_S[1])


class RingbackDetector:
    """Feed mono float or int16 samples; read .active / .seen.

    active: None until a full window has been evaluated, then True while
    ringback is confirmed, False otherwise. seen: whether ringback was ever
    confirmed on this call.
    """

    def __init__(self, sample_rate: int = SAMPLE_RATE) -> None:
        self._hop = max(1, int(sample_rate * HOP_S))
        self._pending = np.zeros(0, dtype=np.float64)
        self._env: deque[float] = deque(maxlen=int(WINDOW_S / HOP_S))
        self._hops_since_eval = 0
        self._eval_hops = int(EVAL_EVERY_S / HOP_S)
        self._streak = 0
        self.active: bool | None = None
        self.seen = False
        self.cleared_after_seen = False

    def add(self, samples) -> None:
        x = np.asarray(samples)
        if x.dtype == np.int16:
            x = x.astype(np.float64) / 32768.0
        else:
            x = x.astype(np.float64)
        buf = np.concatenate([self._pending, x])
        n = len(buf) // self._hop
        for i in range(n):
            chunk = buf[i * self._hop:(i + 1) * self._hop]
            self._env.append(float(np.sqrt(np.mean(chunk ** 2))))
            self._hops_since_eval += 1
            if len(self._env) == self._env.maxlen and self._hops_since_eval >= self._eval_hops:
                self._hops_since_eval = 0
                self._evaluate()
        self._pending = buf[n * self._hop:]

    def _evaluate(self) -> None:
        verdict = window_is_ringback(np.fromiter(self._env, dtype=np.float64))
        if self.active is None:
            self.active = False
        if verdict == self.active:
            self._streak = 0
            return
        self._streak += 1
        if self._streak >= CONFIRM_EVALS:
            self.active = verdict
            self._streak = 0
            if verdict:
                self.seen = True
            elif self.seen:
                self.cleared_after_seen = True
