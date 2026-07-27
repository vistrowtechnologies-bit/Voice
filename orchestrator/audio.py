"""Audio format conversion for EnableX's Media Streaming API.

EnableX sends/expects G.711 ulaw, 8000 Hz, mono, Base64-encoded per frame
(confirmed against developer.enablex.io/voice/media-streaming.html,
2026-07-27). Our STT/TTS pipeline (stt.py/tts.py) speaks WAV — Sarvam's
STT accepts a WAV upload, and Sarvam/ElevenLabs TTS return WAV/MP3 at their
own native sample rates (typically 22050+ Hz). This module is the glue
between those two worlds: ulaw8k <-> PCM16, resampling, and WAV wrapping.

Uses stdlib `audioop` (ulaw2lin/lin2ulaw/ratecv) — no extra dependency,
same module agent/recording.py already used for PCM mixing.
"""

from __future__ import annotations

import audioop
import io
import wave

_ULAW_SAMPLE_RATE = 8000
_ULAW_SAMPLE_WIDTH = 2  # audioop's lin16 width used as the intermediate format


def ulaw_b64_frames_to_wav(ulaw_bytes: bytes) -> bytes:
    """Decodes a run of concatenated raw ulaw bytes (already Base64-decoded
    by the caller) into a mono 16-bit PCM WAV at 8000 Hz — ready for
    stt.transcribe(), which just needs *a* valid WAV; Sarvam handles
    whatever sample rate the container declares."""
    pcm16 = audioop.ulaw2lin(ulaw_bytes, 2)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(_ULAW_SAMPLE_RATE)
        wav_file.writeframes(pcm16)
    return buf.getvalue()


def wav_or_mp3_to_ulaw(audio_bytes: bytes, content_type: str) -> bytes:
    """Converts a TTS reply (WAV from Sarvam, or MP3 from ElevenLabs) down
    to raw 8000 Hz mono ulaw bytes ready to chunk into EnableX `media`
    events. MP3 needs decoding first — done via a lazy `pydub`/ffmpeg
    import so a Sarvam-only deployment (no ElevenLabs voices in use)
    doesn't need ffmpeg installed at all.
    """
    if content_type == "audio/wav":
        with io.BytesIO(audio_bytes) as buf, wave.open(buf, "rb") as wav_file:
            n_channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            frame_rate = wav_file.getframerate()
            pcm16 = wav_file.readframes(wav_file.getnframes())
    elif content_type == "audio/mpeg":
        pcm16, n_channels, sample_width, frame_rate = _decode_mp3(audio_bytes)
    else:
        raise ValueError(f"Unsupported TTS content type for EnableX playback: {content_type!r}")

    if sample_width != 2:
        pcm16 = audioop.lin2lin(pcm16, sample_width, 2)
    if n_channels == 2:
        pcm16 = audioop.tomono(pcm16, 2, 0.5, 0.5)
    if frame_rate != _ULAW_SAMPLE_RATE:
        pcm16, _ = audioop.ratecv(pcm16, 2, 1, frame_rate, _ULAW_SAMPLE_RATE, None)
    return audioop.lin2ulaw(pcm16, 2)


def _decode_mp3(mp3_bytes: bytes) -> tuple[bytes, int, int, int]:
    """(pcm16_bytes, n_channels, sample_width, frame_rate). Requires ffmpeg
    on PATH (via pydub) — only exercised when an agent's voice is an
    ElevenLabs one; a Sarvam-only deployment never hits this path."""
    from pydub import AudioSegment

    seg = AudioSegment.from_file(io.BytesIO(mp3_bytes), format="mp3")
    return seg.raw_data, seg.channels, seg.sample_width, seg.frame_rate


def chunk_ulaw(ulaw_bytes: bytes, frame_ms: int = 20) -> list[bytes]:
    """Splits raw ulaw bytes into frame_ms-sized chunks (default 20ms, the
    conventional RTP packetization interval EnableX's own inbound `media`
    events use) for sending back as a sequence of `media` WebSocket events
    rather than one giant frame."""
    bytes_per_ms = _ULAW_SAMPLE_RATE // 1000  # 1 byte/sample at 8-bit ulaw
    chunk_size = bytes_per_ms * frame_ms
    return [ulaw_bytes[i : i + chunk_size] for i in range(0, len(ulaw_bytes), chunk_size)] or [b""]


class UtteranceVAD:
    """Minimal energy-based turn-detector: accumulates decoded PCM16 frames
    and flags "utterance complete" after `silence_ms` of low energy
    following at least `min_speech_ms` of actual speech. This is a
    deliberately simple Phase 2 stand-in for a real VAD model (webrtcvad/
    silero) — good enough to prove the phone-call adapter end-to-end;
    swap in a real VAD model before this handles production call volume,
    since energy thresholds alone are fooled by line noise/background
    sound on real PSTN audio in ways a trained VAD model isn't.
    """

    def __init__(self, silence_ms: int = 700, min_speech_ms: int = 300, energy_threshold: int = 400):
        self._silence_ms = silence_ms
        self._min_speech_ms = min_speech_ms
        self._energy_threshold = energy_threshold
        self._buffer = bytearray()
        self._speech_ms = 0
        self._trailing_silence_ms = 0

    def push_ulaw_frame(self, ulaw_frame: bytes, frame_ms: int = 20) -> bytes | None:
        """Feed one ~frame_ms chunk of raw ulaw audio. Returns the complete
        utterance's raw ulaw bytes once silence-after-speech is detected,
        else None (still listening)."""
        pcm16 = audioop.ulaw2lin(ulaw_frame, 2)
        energy = audioop.rms(pcm16, 2)
        self._buffer.extend(ulaw_frame)
        if energy >= self._energy_threshold:
            self._speech_ms += frame_ms
            self._trailing_silence_ms = 0
        else:
            self._trailing_silence_ms += frame_ms

        if self._speech_ms >= self._min_speech_ms and self._trailing_silence_ms >= self._silence_ms:
            utterance = bytes(self._buffer)
            self._buffer.clear()
            self._speech_ms = 0
            self._trailing_silence_ms = 0
            return utterance
        return None

    def reset(self) -> None:
        self._buffer.clear()
        self._speech_ms = 0
        self._trailing_silence_ms = 0
