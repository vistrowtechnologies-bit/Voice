"""Native Google audio profiles; never apply these to the STT/LLM/TTS pipeline."""
from google.genai import types

DEFAULT_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
MODEL_31 = "gemini-3.1-flash-live-preview"
API_MODELS = {DEFAULT_MODEL, MODEL_31}


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
