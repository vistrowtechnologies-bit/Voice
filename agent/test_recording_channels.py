"""The recording is one centred mono track with both sides mixed.

History: it was mono, then split caller-left/agent-right (ed11c60) so the
caller alone could be extracted; playback in one ear each was worse for the
people actually listening, so it is mono again.

The reason for the split, kept for context:

They were summed into one mono track. On widget call 954 that made the
recording impossible to reason about: the agent, the caller and the ambience
bed were one signal, and a transcription service turned the office babble
underneath into an invented conversation about revenue and targets that never
took place. Our own STT found zero words in that clip at production gain,
which is how we know it was babble and not a second speaker.

It also blocked a real diagnosis: telling ringback from a live line needs the
CALLER channel alone, and that could not be extracted from the mix.
"""
import asyncio
import audioop
import math
import os
import struct
import sys
import unittest
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recording


def _tone(freq, secs, sr=16000, amp=8000):
    return b"".join(struct.pack("<h", int(amp * math.sin(2 * math.pi * freq * i / sr)))
                    for i in range(int(sr * secs)))


def _approx_freq(pcm, sr=16000):
    xs = struct.unpack(f"<{len(pcm) // 2}h", pcm)
    crossings = sum(1 for a, b in zip(xs, xs[1:]) if (a < 0) != (b < 0))
    return crossings / 2 / (len(xs) / sr)


def _write(caller, agent):
    r = recording.CallRecorder.__new__(recording.CallRecorder)
    r._tasks = []
    r._caller_chunks = [caller] if caller else []
    r._agent_chunks = [agent] if agent else []
    return asyncio.run(r.stop())


class RecordingIsCentredMono(unittest.TestCase):
    def setUp(self):
        self.path = _write(_tone(300, 1.0), _tone(900, 1.0))

    def tearDown(self):
        if self.path and os.path.exists(self.path):
            os.unlink(self.path)

    def test_the_file_is_mono(self):
        """Stereo put the agent in one ear and the caller in the other."""
        with wave.open(self.path) as w:
            self.assertEqual(w.getnchannels(), 1)
            self.assertEqual(w.getsampwidth(), 2)

    def test_both_sides_are_audible(self):
        with wave.open(self.path) as w:
            data = w.readframes(w.getnframes())
        peak = audioop.max(data, 2)
        self.assertGreater(peak, 8000)
        self.assertLess(peak, 32767)

    def test_lengths_are_padded_not_truncated(self):
        """A caller who talks longer than the agent must not be cut off."""
        path = _write(_tone(300, 2.0), _tone(900, 0.5))
        try:
            with wave.open(path) as w:
                self.assertEqual(w.getnframes(), 32000)
        finally:
            os.unlink(path)

    def test_nothing_captured_writes_nothing(self):
        self.assertIsNone(_write(b"", b""))


if __name__ == "__main__":
    unittest.main()
