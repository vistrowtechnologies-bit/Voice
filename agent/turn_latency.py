"""Caller-stop -> first-agent-audio timing from the caller's own audio.

Speech-to-speech (Gemini Live) reports the caller's speaking/listening state from
the model's server-side detector, which flaps and arrives late, so the framework
state events cannot time a turn there (call 1122: no "Reply audio reached caller"
at all). This looks at the actual caller audio instead: an adaptive energy gate
finds where the caller stopped, and the agent's "speaking" state marks the reply.

Pure and clock-free so it can be tested with simulated time.
"""

_ONSET_S = 0.15      # sustained energy needed before it counts as speech
_HANG_S = 0.25       # sustained quiet needed before the caller counts as stopped
_MIN_THRESHOLD = 0.012
_FLOOR_RISE = 0.002  # how fast the noise-floor estimate may rise per quiet frame


class TurnLatencyMeter:
    def __init__(self):
        self._floor = 0.004
        self._speaking = False
        self._above_since = None
        self._last_loud = None
        self._quiet_since = None
        self._pending_stop = None

    @property
    def threshold(self) -> float:
        return max(_MIN_THRESHOLD, self._floor * 3.0)

    def feed(self, rms: float, now: float) -> None:
        loud = rms > self.threshold
        if not loud:
            # Track the noise floor only from quiet frames: fall fast, rise slowly.
            self._floor = rms if rms < self._floor else self._floor + _FLOOR_RISE * (rms - self._floor)
            self._above_since = None
            if self._quiet_since is None:
                self._quiet_since = now
            if self._speaking and self._last_loud is not None and now - self._quiet_since >= _HANG_S:
                self._speaking = False
                self._pending_stop = self._last_loud
            return
        self._quiet_since = None
        self._last_loud = now
        if self._above_since is None:
            self._above_since = now
        if not self._speaking and now - self._above_since >= _ONSET_S:
            self._speaking = True
            self._pending_stop = None  # the caller resumed: only the last stop counts

    def voice_age(self, now: float):
        """Seconds since the caller's audio was last above the speech gate, or None if never."""
        return None if self._last_loud is None else max(0.0, now - self._last_loud)

    def agent_started(self, now: float):
        """Latency in ms for the reply that just started, or None if no clean turn."""
        if self._speaking:
            return None  # overlap / barge-in, not a reply to a finished turn
        stop, self._pending_stop = self._pending_stop, None
        if stop is None or now < stop:
            return None
        return round((now - stop) * 1000)
