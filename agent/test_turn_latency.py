import unittest

from turn_latency import TurnLatencyMeter


def run(meter, start, end, rms, step=0.02):
    t = start
    while t < end:
        meter.feed(rms, t)
        t += step
    return t


class TurnLatency(unittest.TestCase):
    def test_measures_stop_to_reply(self):
        m = TurnLatencyMeter()
        run(m, 0.0, 1.0, 0.003)          # line noise
        run(m, 1.0, 3.0, 0.1)            # caller speaks until t=3.0
        run(m, 3.0, 4.3, 0.003)          # silence
        ms = m.agent_started(4.3)
        self.assertTrue(1250 <= ms <= 1350, ms)

    def test_resumed_caller_only_last_stop_counts(self):
        m = TurnLatencyMeter()
        run(m, 0.0, 1.0, 0.1)
        run(m, 1.0, 1.6, 0.003)
        run(m, 1.6, 2.5, 0.1)
        run(m, 2.5, 3.2, 0.003)
        ms = m.agent_started(3.2)
        self.assertTrue(650 <= ms <= 750, ms)

    def test_reply_during_caller_speech_is_not_timed(self):
        m = TurnLatencyMeter()
        run(m, 0.0, 2.0, 0.1)
        self.assertIsNone(m.agent_started(1.5))

    def test_blip_is_not_a_turn(self):
        m = TurnLatencyMeter()
        run(m, 0.0, 0.08, 0.1)           # a click shorter than the onset window
        run(m, 0.08, 2.0, 0.003)
        self.assertIsNone(m.agent_started(2.0))

    def test_noisy_line_does_not_pin_speech_on(self):
        m = TurnLatencyMeter()
        run(m, 0.0, 6.0, 0.008)          # steady line noise, just under the minimum gate
        run(m, 6.0, 8.0, 0.2)
        run(m, 8.0, 9.0, 0.008)
        self.assertIsNotNone(m.agent_started(9.0))

    def test_one_measurement_per_turn(self):
        m = TurnLatencyMeter()
        run(m, 0.0, 1.0, 0.1)
        run(m, 1.0, 2.0, 0.003)
        self.assertIsNotNone(m.agent_started(2.0))
        self.assertIsNone(m.agent_started(2.5))


if __name__ == "__main__":
    unittest.main()


class VoiceAge(unittest.TestCase):
    def test_none_before_any_voice(self):
        m = TurnLatencyMeter()
        run(m, 0.0, 1.0, 0.003)
        self.assertIsNone(m.voice_age(1.0))

    def test_age_counts_from_the_last_loud_frame(self):
        m = TurnLatencyMeter()
        run(m, 0.0, 2.0, 0.1)
        run(m, 2.0, 6.0, 0.003)
        age = m.voice_age(6.0)
        self.assertTrue(4.0 <= age <= 4.1, age)
