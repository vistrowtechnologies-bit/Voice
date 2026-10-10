"""Native Google audio profiles; never apply these to the STT/LLM/TTS pipeline."""
import os
from google.genai import types

DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
MODEL_31 = "gemini-3.1-flash-live-preview"
API_MODELS = {DEFAULT_MODEL, MODEL_31}


def activity_detection(model: str) -> types.RealtimeInputConfig:
    """Keep native endpointing independent of the pipeline and of other models.

    2.5 uses Google's default HIGH end sensitivity after live traces showed
    multi-second waits for input events. The 500 ms silence window still
    protects short pauses. 3.1 retains its verified LOW/200 ms profile.
    Explicit per-model overrides win over the legacy shared override.
    """
    if model not in API_MODELS:
        raise ValueError(f"Unsupported realtime model: {model}")
    key = "REALTIME_25_SILENCE_MS" if model == DEFAULT_MODEL else "REALTIME_31_SILENCE_MS"
    default = "500" if model == DEFAULT_MODEL else "700"
    value = os.environ.get(key, os.environ.get("REALTIME_SILENCE_MS", default))
    try:
        silence_ms = int(value)
        if not 200 <= silence_ms <= 2000:
            raise ValueError
    except (TypeError, ValueError):
        raise ValueError(f"{key} must be an integer between 200 and 2000 ms") from None
    return types.RealtimeInputConfig(
        automatic_activity_detection=types.AutomaticActivityDetection(
            start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
            end_of_speech_sensitivity=(
                types.EndSensitivity.END_SENSITIVITY_HIGH if model == DEFAULT_MODEL
                else types.EndSensitivity.END_SENSITIVITY_LOW
            ),
            prefix_padding_ms=20 if model == DEFAULT_MODEL else 200,
            silence_duration_ms=silence_ms,
        ),
    )


def thinking_config(model: str) -> types.ThinkingConfig:
    """2.5 takes a token budget; 3.1 takes a level. Suppress thought captions."""
    if model == DEFAULT_MODEL:
        return types.ThinkingConfig(thinking_budget=0, include_thoughts=False)
    if model == MODEL_31:
        return types.ThinkingConfig(thinking_level="minimal", include_thoughts=False)
    raise ValueError(f"Unsupported realtime model: {model}")


def aec_warmup_duration(*, realtime: bool, phone: bool) -> float | None:
    # LiveKit replaces mic frames with silence while warming up during speech.
    # Native realtime must receive the caller's first words and interruptions.
    # Browser WebRTC echo cancellation remains enabled independently.
    return None if realtime or phone else 3.0


def automated_speech_blocked(userdata: dict, now: float, *, recent_voice_s: float) -> bool:
    """Do not inject reminders into native audio while a real turn is active.

    Google finalizes input/state events late. Raw audio is therefore an
    additional presence signal, including for deferred timers, not only the
    main 'away' handler.
    """
    if (userdata.get("realtime_greeting_pending")
            or userdata.get("agent_state") in {"thinking", "speaking"}
            or userdata.get("user_state") == "speaking"):
        return True
    meter = userdata.get("turn_meter")
    age = meter.voice_age(now) if meter is not None else None
    return age is not None and age < recent_voice_s


def input_transcription(model: str, language: str) -> types.AudioTranscriptionConfig:
    """Hint 2.5's native recognition, without forcing the speech output language.

    Hints are not a language lock; English remains available for mixed speech.
    Do not change 3.1's already tested automatic language detection.
    """
    if model not in API_MODELS:
        raise ValueError(f"Unsupported realtime model: {model}")
    supported = {"hi", "en", "mr", "ta", "te", "kn", "ml", "bn", "gu", "pa", "ur"}
    if model == DEFAULT_MODEL and language.split("-")[0].lower() in supported:
        hints = [language]
        if language.split("-")[0].lower() != "en":
            hints.append("en-IN")
        return types.AudioTranscriptionConfig(language_codes=hints)
    return types.AudioTranscriptionConfig()


def clean_browser_input(model: str, *, phone: bool) -> bool:
    """2.5 browser calls: no background ambience and always noise-suppressed input.

    Lab, 10 Oct 2026 (same Hindi utterance streamed straight to the API, our
    exact 2.5 config, 3 runs each): office ambience after the caller stopped
    took 4.3 s to first audio vs 3.1 s with silence, while 3.1 was unaffected
    (~2.0 s). On a browser the agent's own ambience leaks back into the mic
    through echo cancellation, and 2.5's server-side end-of-speech detector
    keeps the turn open on it. Steady room noise alone did not slow it.
    Phone lines have no acoustic echo path, and 3.1 is unaffected, so both
    keep their tested behaviour.
    """
    return model == DEFAULT_MODEL and not phone


def context_compression(instructions: str) -> types.ContextWindowCompressionConfig:
    """Cap the conversation history Google re-bills on every turn.

    The bill (Oct 6-9 2026) showed the platform demo averaging ~44k text
    input tokens per turn against a ~18k-token instruction: the rest is the
    growing conversation, re-sent each turn. Once history passes ~10k tokens
    beyond the instruction, Google's sliding window drops the oldest turns
    back to ~6k (the system instruction is always kept). Roughly the last
    few minutes of a call stay in context; facts already saved through the
    lead tools are unaffected.
    """
    instruction_tokens = len(instructions) // 4 + 1  # ~4.2 chars/token measured for these prompts
    return types.ContextWindowCompressionConfig(
        trigger_tokens=instruction_tokens + 10_000,
        sliding_window=types.SlidingWindow(target_tokens=instruction_tokens + 6_000),
    )
