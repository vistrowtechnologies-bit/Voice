"""Offline regression checks using the deployed LiveKit 1.8.3 audio path."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from livekit import rtc
from livekit.agents.voice.agent_activity import AgentActivity

import realtime_config as config
from turn_latency import TurnLatencyMeter


def test_native_endpointing_models_are_independent(monkeypatch):
    for key in ("REALTIME_SILENCE_MS", "REALTIME_25_SILENCE_MS", "REALTIME_31_SILENCE_MS"):
        monkeypatch.delenv(key, raising=False)
    assert config.activity_detection(config.DEFAULT_MODEL).automatic_activity_detection.silence_duration_ms == 500
    assert config.activity_detection(config.MODEL_31).automatic_activity_detection.silence_duration_ms == 700
    monkeypatch.setenv("REALTIME_25_SILENCE_MS", "600")
    assert config.activity_detection(config.DEFAULT_MODEL).automatic_activity_detection.silence_duration_ms == 600
    assert config.activity_detection(config.MODEL_31).automatic_activity_detection.silence_duration_ms == 700
    for model in config.API_MODELS:
        aad = config.activity_detection(model).automatic_activity_detection
        assert aad.end_of_speech_sensitivity.value == "END_SENSITIVITY_LOW"
        assert not aad.disabled


def test_existing_shared_override_is_preserved(monkeypatch):
    monkeypatch.setenv("REALTIME_SILENCE_MS", "800")
    monkeypatch.delenv("REALTIME_25_SILENCE_MS", raising=False)
    monkeypatch.setenv("REALTIME_31_SILENCE_MS", "900")
    assert config.activity_detection(config.DEFAULT_MODEL).automatic_activity_detection.silence_duration_ms == 800
    assert config.activity_detection(config.MODEL_31).automatic_activity_detection.silence_duration_ms == 900


@pytest.mark.parametrize("value", ["garbage", "0", "199", "2001"])
def test_invalid_native_window_rejected(monkeypatch, value):
    monkeypatch.setenv("REALTIME_25_SILENCE_MS", value)
    with pytest.raises(ValueError, match="200 and 2000"):
        config.activity_detection(config.DEFAULT_MODEL)


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


def test_delayed_provider_states_do_not_allow_reminder_during_real_speech():
    meter = TurnLatencyMeter()
    meter.feed(0.2, 10.0)
    meter.feed(0.2, 10.2)
    data = {"turn_meter": meter, "user_state": "listening", "agent_state": "listening"}
    assert config.automated_speech_blocked(data, 10.3, recent_voice_s=8)
    assert not config.automated_speech_blocked(data, 18.3, recent_voice_s=8)


@pytest.mark.parametrize("active", [
    {"agent_state": "thinking"}, {"agent_state": "speaking"},
    {"user_state": "speaking"}, {"realtime_greeting_pending": True},
])
def test_reminder_and_silence_hangup_wait_for_active_turn(active):
    assert config.automated_speech_blocked(active, 100, recent_voice_s=12)


def test_never_spoken_caller_can_still_be_checked_on_when_idle():
    assert not config.automated_speech_blocked(
        {"turn_meter": TurnLatencyMeter()}, 100, recent_voice_s=8,
    )
