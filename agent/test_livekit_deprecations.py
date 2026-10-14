"""LiveKit 1.8.6 deprecation cleanup (2026-10-14) and the casual tone change.

- RoomInputOptions -> RoomOptions, proven to resolve to the same settings.
- metrics_collected stays (it is our per-segment latency and token source);
  only its per-call deprecation log line is dropped, and this file fails if a
  LiveKit upgrade stops emitting the event.
"""
import dataclasses
import logging
import os
import sys
import typing
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
import main
from livekit.agents.voice import events
from livekit.agents.voice.room_io.types import AudioInputOptions, RoomInputOptions, RoomOptions

ROOT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(ROOT, "main.py"), encoding="utf-8") as handle:
    SOURCE = handle.read()


def _shallow(obj):
    if obj is None or not dataclasses.is_dataclass(obj):
        return obj
    return {f.name: repr(getattr(obj, f.name)) for f in dataclasses.fields(obj)}


class RoomOptionsMigration(unittest.TestCase):
    def test_session_start_uses_room_options_not_the_legacy_kwarg(self):
        self.assertIn("room_options=RoomOptions(audio_input=AudioInputOptions(noise_cancellation=noise_filter))", SOURCE)
        self.assertNotIn("room_input_options=", SOURCE)
        self.assertNotIn("RoomInputOptions(", SOURCE)

    def test_new_form_resolves_to_exactly_what_the_legacy_form_did(self):
        marker = object()
        legacy = RoomOptions._create_from_legacy(RoomInputOptions(noise_cancellation=marker), None)
        new = RoomOptions(audio_input=AudioInputOptions(noise_cancellation=marker))
        for getter in [m for m in dir(RoomOptions) if m.startswith("get_")]:
            self.assertEqual(_shallow(getattr(legacy, getter)()), _shallow(getattr(new, getter)()), getter)
        self.assertIs(new.get_audio_input_options().noise_cancellation, marker)
        for field in ("participant_kinds", "participant_identity", "close_on_disconnect", "delete_room_on_close"):
            self.assertEqual(getattr(legacy, field), getattr(new, field), field)


class MetricsCollectedKept(unittest.TestCase):
    def test_framework_still_emits_the_event(self):
        # If this fails after a LiveKit upgrade, per-segment TTS TTFB, LLM
        # TTFT/token counts and EOU timings stop being recorded on calls.
        self.assertIn("metrics_collected", typing.get_args(events.EventTypes))

    def test_only_the_deprecation_line_is_dropped(self):
        records: list[str] = []

        class _Capture(logging.Handler):
            def emit(self, record):
                records.append(record.getMessage())

        framework = logging.getLogger("livekit.agents")
        handler = _Capture()
        framework.addHandler(handler)
        try:
            framework.warning(
                "metrics_collected is deprecated. Use session_usage_updated for usage "
                "tracking and ChatMessage.metrics for per-turn latency."
            )
            framework.warning("RoomInputOptions and RoomOutputOptions are deprecated, use RoomOptions instead")
            framework.warning("some other framework warning")
        finally:
            framework.removeHandler(handler)
        self.assertEqual(
            records,
            [
                "RoomInputOptions and RoomOutputOptions are deprecated, use RoomOptions instead",
                "some other framework warning",
            ],
        )


class CasualToneTemperature(unittest.TestCase):
    def test_casual_stays_below_sarvams_mispronunciation_line(self):
        # Sarvam's LiveKit guide: 0.8 and up may mispronounce words.
        casual = main.TONE_PRESETS["casual"]["temperature"]
        self.assertEqual(casual, 0.7)
        self.assertLess(casual, 0.8)
        self.assertGreater(casual, main.TONE_PRESETS["balanced"]["temperature"])

    def test_no_preset_uses_the_settings_that_delay_first_audio(self):
        # Measured 2026-10-14: non-default pace or pitch adds ~115 ms before
        # Sarvam v4's first audio; loudness and temperature are free.
        for name, preset in main.TONE_PRESETS.items():
            self.assertEqual(preset["pace"], 1.0, name)
            self.assertEqual(preset["pitch"], 0.0, name)
        self.assertGreater(main.TONE_PRESETS["casual"]["loudness"], 1.0)

    def test_other_presets_unchanged(self):
        self.assertEqual(main.TONE_PRESETS["professional"]["temperature"], 0.4)
        self.assertEqual(main.TONE_PRESETS["balanced"]["temperature"], 0.6)


if __name__ == "__main__":
    unittest.main()
