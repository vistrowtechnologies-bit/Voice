"""Native Google audio profiles; never apply these to the STT/LLM/TTS pipeline."""
import os
from google.genai import types

DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
MODEL_31 = "gemini-3.1-flash-live-preview"
# GA successor to 3.1 (Google lists 3.1 as legacy); same per-minute price.
# Uses the 3.1 profile: every non-DEFAULT_MODEL branch below.
MODEL_38 = "gemini-3.8-live"
API_MODELS = {DEFAULT_MODEL, MODEL_31, MODEL_38}


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
            # HIGH for every model. Call 1421 (3.8, HIGH): room noise started
            # turns transcribed as "¿Qué?". Call 1425 (3.8, LOW): the caller
            # spoke and nothing was detected for ~17 s. Google: prefixPaddingMs
            # is "the required duration of detected speech before
            # start-of-speech is committed", so 3.x keeps HIGH and requires
            # 400 ms of speech, which a breath or click does not reach.
            start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_HIGH,
            end_of_speech_sensitivity=(
                types.EndSensitivity.END_SENSITIVITY_HIGH if model == DEFAULT_MODEL
                else types.EndSensitivity.END_SENSITIVITY_LOW
            ),
            prefix_padding_ms=20 if model == DEFAULT_MODEL else 400,
            silence_duration_ms=silence_ms,
        ),
    )


def thinking_config(model: str) -> types.ThinkingConfig:
    """2.5 takes a token budget; 3.1 takes a level. Suppress thought captions."""
    if model == DEFAULT_MODEL:
        return types.ThinkingConfig(thinking_budget=0, include_thoughts=False)
    if model == MODEL_31:
        return types.ThinkingConfig(thinking_level="minimal", include_thoughts=False)
    if model == MODEL_38:
        # 3.8 Live documents no thinking_level/budget; only hide thoughts.
        return types.ThinkingConfig(include_thoughts=False)
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


AUDIO_TOKENS_PER_SECOND = 25  # Google's own figure on the Live API pricing page


def context_compression(
    instructions: str, *, keep_seconds: int = 45
) -> types.ContextWindowCompressionConfig:
    """Cap the conversation history Google re-bills on every turn.

    The whole context (instruction + every retained turn, caller audio
    included) is re-sent and re-billed on each turn. Bill, 17 Oct 2026, on
    3.1/3.8 Live: 181,111 audio-input tokens billed for ~15 min of caller
    audio, i.e. ~22,500 real tokens at 25 tokens/s re-billed about 8x,
    worth Rs 3.8 of the Rs 8.5/min. The old thresholds (instruction + 10k
    to trigger, back to instruction + 6k) were sized on text and a 5-minute
    call never reached them, so compression never ran. The re-bill factor is
    roughly the number of turns kept in history, so compression must engage
    within the first minute of a call: the trigger sits at the instruction
    plus ~1 minute of audio (plus headroom), and the sliding window keeps
    the instruction plus ``keep_seconds`` of audio (~1-2 recent turns at
    the default 30 s, ~750 audio tokens plus transcripts). Call 1415 (19 Oct,
    3.8, 90 s kept) still billed audio-in at ~Rs 3.5/min, over half the
    call's cost; the owner chose 30 s. Google always retains the system
    instruction and keeps the most recent turns. Facts already saved through
    the lead tools are unaffected.

    Call 1420 (19 Oct, 30 s): the window trimmed back to the bare
    instruction about once a minute (context 7,142 -> 5,422 tokens, text
    4,808), so Artha re-greeted mid-call and re-asked the company and use
    case. The instruction was estimated at chars/4 (~4,300) but really cost
    4,808 tokens (~3.6 chars/token: Devanagari and Hinglish tokenize worse
    than English), so "instruction + 30 s" was about the instruction alone.
    It is now estimated at chars/3, which errs high, and 60 s are kept (owner:
    memory over the last rupee).
    """
    # chars/3 errs high for every prompt measured so far (4.31 chars/token on
    # the English demo text, ~3.6 on the live Artha prompt), so the window
    # never cuts into the conversation.
    instruction_tokens = len(instructions) // 3 + 1
    keep_tokens = AUDIO_TOKENS_PER_SECOND * keep_seconds
    # Call 1421 (19 Oct, 60 s kept, 1,500 headroom): audio built up to ~3,800
    # tokens per turn before each trim, ~Rs 5/min of re-billed caller audio.
    # 45 s kept (call 1421 still remembered company and name after a trim at
    # 60 s; 45 s holds the last several exchanges) and trimming 750 tokens
    # (~30 s) past the target keep the average history far smaller.
    trigger_tokens = instruction_tokens + max(1_500, keep_tokens + 750)
    target_tokens = instruction_tokens + keep_tokens
    assert instruction_tokens < target_tokens < trigger_tokens
    return types.ContextWindowCompressionConfig(
        trigger_tokens=trigger_tokens,
        sliding_window=types.SlidingWindow(target_tokens=target_tokens),
    )
