"""Offline regression checks using the deployed LiveKit 1.8.3 audio path."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from livekit import rtc
from livekit.agents.voice.agent_activity import AgentActivity

import realtime_config as config


@pytest.mark.parametrize("model", sorted(config.API_MODELS))
def test_native_thinking_profiles_do_not_mix_parameters(model):
    options = config.thinking_config(model)
    assert options.include_thoughts is False
    if model == config.DEFAULT_MODEL:
        assert options.thinking_budget == 0
        assert options.thinking_level is None
    else:
        assert options.thinking_level.value == "MINIMAL"
        assert options.thinking_budget is None


@pytest.mark.parametrize("realtime,phone,expected", [
    (True, False, None), (True, True, None),
    (False, False, 3.0), (False, True, None),
])
def test_caller_audio_during_greeting(realtime, phone, expected):
    """Old browser settings actually zeroed mic frames; native now retains them."""
    warmup = config.aec_warmup_duration(realtime=realtime, phone=phone)
    assert warmup == expected
    activity = object.__new__(AgentActivity)
    activity._started = True
    activity._session = SimpleNamespace(
        agent_state="speaking", _aec_warmup_remaining=warmup or 0,
        _aec_warmup_timer=object() if warmup else None,
    )
    activity._current_speech = None
    activity._audio_recognition = None
    activity._rt_session = Mock()
    frame = rtc.AudioFrame(data=b"\x01\x02" * 320, sample_rate=16000,
                           num_channels=1, samples_per_channel=320)
    activity.push_audio(frame)
    sent = activity._rt_session.push_audio.call_args.args[0]
    if expected is None:
        assert sent is frame
        assert bytes(sent.data) == bytes(frame.data)
    else:
        assert not any(bytes(sent.data))
