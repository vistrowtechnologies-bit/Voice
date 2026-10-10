from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import realtime_timing


def test_audio_time_uses_generation_timestamp_not_collection_time():
    # Report arrives after playback finished; it still identifies when Google
    # returned the first audio, rather than sliding that event forward.
    metric = SimpleNamespace(timestamp=100.0, ttft=3.2, duration=8.0)
    assert realtime_timing.first_audio_time(metric) == 103.2


@pytest.mark.parametrize("ttft", [-1, float("nan"), float("inf")])
def test_missing_audio_not_recorded_as_instantaneous(ttft):
    assert realtime_timing.first_audio_time(SimpleNamespace(timestamp=100, ttft=ttft)) is None


def test_public_callbacks_do_not_consume_stream_or_log_speech():
    session, logger = Mock(), Mock()
    meter = Mock()
    meter.voice_age.return_value = 0.5
    realtime_timing.attach(session, {"turn_meter": meter}, logger, clock=lambda: 100, monotonic=lambda: 10)
    callbacks = dict(session.on.call_args_list[i].args for i in range(2))
    stream = Mock()
    callbacks["generation_created"](SimpleNamespace(response_id="GR_test", user_initiated=False, message_stream=stream))
    stream.assert_not_called()
    ev = SimpleNamespace(item_id="GI_test", transcript="private caller speech", is_final=False)
    cb = callbacks["input_audio_transcription_completed"]
    cb(ev)
    cb(ev)  # one event for the first partial, then the final only
    ev.is_final = True
    cb(ev)
    assert logger.info.call_count == 3
    assert "private caller speech" not in str(logger.info.call_args_list)
