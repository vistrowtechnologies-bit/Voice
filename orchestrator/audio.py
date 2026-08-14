"""Audio format conversion, shared by the EnableX phone path (server.py)
and the browser path (browser_server.py).

EnableX sends/expects G.711 ulaw, 8000 Hz, mono, Base64-encoded per frame
(confirmed against developer.enablex.io/voice/media-streaming.html,
2026-07-27) — the ulaw-specific helpers below (ulaw_b64_frames_to_wav,
wav_or_mp3_to_ulaw, frame_energy, chunk_ulaw) exist only for that path.
Browser mic audio arrives as raw PCM16 already (decoded client-side via
Web Audio), so it skips ulaw entirely — pcm16_to_wav and
UtteranceVAD.push_pcm16_frame are its equivalents. Our STT/TTS pipeline
(stt.py/tts.py) speaks WAV — Sarvam's STT accepts a WAV upload, and
Sarvam/ElevenLabs TTS return WAV/MP3 at their own native sample rates
(typically 22050+ Hz).

Uses stdlib `audioop` (ulaw2lin/lin2ulaw/ratecv) — no extra dependency,
same module agent/recording.py already used for PCM mixing.
"""

from __future__ import annotations

import array
import audioop
import io
import wave

import numpy as np

_ULAW_SAMPLE_RATE = 8000
_FADE_SAMPLES = 80  # 10ms at 8000Hz
_ULAW_SAMPLE_WIDTH = 2  # audioop's lin16 width used as the intermediate format


def _lowpass_pcm16(pcm16: bytes, source_rate: int, cutoff_hz: float, numtaps: int = 63) -> bytes:
    """Windowed-sinc FIR low-pass filter (Hamming window, unity DC gain).

    audioop.ratecv (used below for the actual rate conversion) is a plain
    linear-interpolation resampler with no filtering of its own. Every TTS
    provider here returns audio well above 8kHz (ElevenLabs 44.1kHz,
    Sarvam/Google ~22-24kHz) — downsampling that directly to 8kHz for the
    phone leg folds everything above the new Nyquist frequency (4kHz) back
    into the audible range as noise, heard live as crackling/gritty audio.
    Filtering out that content first (before ratecv decimates) is the
    standard fix. Not used on the browser path, which stays near the TTS
    provider's native rate and never downsamples enough to alias audibly."""
    if len(pcm16) % 2:
        pcm16 = pcm16[:-1]
    samples = np.frombuffer(pcm16, dtype=np.int16).astype(np.float64)
    if samples.size == 0:
        return pcm16
    fc = cutoff_hz / source_rate  # normalized cutoff (0..0.5)
    n = np.arange(numtaps) - (numtaps - 1) / 2
    taps = 2 * fc * np.sinc(2 * fc * n)
    taps *= np.hamming(numtaps)
    taps /= taps.sum()  # unity DC gain
    filtered = np.convolve(samples, taps, mode="same")
    return np.clip(filtered, -32768, 32767).astype(np.int16).tobytes()


def pcm16_to_wav(pcm16: bytes, sample_rate: int) -> bytes:
    """Wraps raw mono 16-bit PCM in a WAV container at the given sample
    rate — ready for stt.transcribe(), which just needs *a* valid WAV;
    Sarvam handles whatever sample rate the container declares. Shared by
    both the EnableX path (8000Hz, decoded from ulaw first) and the
    browser path (whatever rate the mic's AudioContext used)."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16)
    return buf.getvalue()


def ulaw_b64_frames_to_wav(ulaw_bytes: bytes) -> bytes:
    """Decodes a run of concatenated raw ulaw bytes (already Base64-decoded
    by the caller) into a mono 16-bit PCM WAV at 8000 Hz."""
    return pcm16_to_wav(audioop.ulaw2lin(ulaw_bytes, 2), _ULAW_SAMPLE_RATE)


def _fade_edges(pcm16: bytes, fade_samples: int = _FADE_SAMPLES) -> bytes:
    """Linearly ramps the first/last `fade_samples` int16 samples to/from
    zero. Streaming replies sentence-by-sentence means each clip is a
    separate TTS call — none of them reliably zero-cross at their edges,
    so concatenating them back-to-back on the wire produces an audible
    click at every sentence boundary. This removes that discontinuity."""
    if len(pcm16) % 2:
        pcm16 = pcm16[:-1]  # array('h') needs an even byte count
    if not pcm16:
        return pcm16
    samples = array.array("h")
    samples.frombytes(pcm16)
    n = len(samples)
    fade = min(fade_samples, n // 2)
    for i in range(fade):
        factor = i / fade
        samples[i] = int(samples[i] * factor)
        samples[n - 1 - i] = int(samples[n - 1 - i] * factor)
    return samples.tobytes()


def _decode_to_pcm16(audio_bytes: bytes, content_type: str, target_rate: int) -> bytes:
    """Shared by wav_or_mp3_to_ulaw and wav_or_mp3_to_pcm16 — decodes a TTS
    reply (WAV from Sarvam, or MP3 from ElevenLabs) to mono 16-bit PCM at
    target_rate. MP3 needs decoding first — done via a lazy `pydub`/ffmpeg
    import so a Sarvam-only deployment (no ElevenLabs voices in use)
    doesn't need ffmpeg installed at all."""
    if content_type == "audio/wav":
        with io.BytesIO(audio_bytes) as buf, wave.open(buf, "rb") as wav_file:
            n_channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            frame_rate = wav_file.getframerate()
            pcm16 = wav_file.readframes(wav_file.getnframes())
    elif content_type == "audio/mpeg":
        pcm16, n_channels, sample_width, frame_rate = _decode_mp3(audio_bytes)
    else:
        raise ValueError(f"Unsupported TTS content type: {content_type!r}")

    if sample_width != 2:
        pcm16 = audioop.lin2lin(pcm16, sample_width, 2)
    if n_channels == 2:
        pcm16 = audioop.tomono(pcm16, 2, 0.5, 0.5)
    if frame_rate != target_rate:
        if frame_rate > target_rate:
            # Anti-alias before decimating — see _lowpass_pcm16. 0.9x
            # the new Nyquist frequency leaves headroom for the filter's
            # own roll-off, matching standard practice (e.g. libsamplerate).
            pcm16 = _lowpass_pcm16(pcm16, frame_rate, cutoff_hz=0.9 * (target_rate / 2))
        pcm16, _ = audioop.ratecv(pcm16, 2, 1, frame_rate, target_rate, None)
    return _fade_edges(pcm16)


def wav_or_mp3_to_ulaw(audio_bytes: bytes, content_type: str) -> bytes:
    """Converts a TTS reply down to raw 8000 Hz mono ulaw bytes ready to
    chunk into EnableX `media` events."""
    pcm16 = _decode_to_pcm16(audio_bytes, content_type, _ULAW_SAMPLE_RATE)
    return audioop.lin2ulaw(pcm16, 2)


def wav_or_mp3_to_pcm16(audio_bytes: bytes, content_type: str, target_rate: int) -> bytes:
    """Converts a TTS reply down to raw 16-bit mono PCM at target_rate —
    used by the browser path to feed CallRecorder (which expects PCM16,
    not ulaw)."""
    return _decode_to_pcm16(audio_bytes, content_type, target_rate)


def _decode_mp3(mp3_bytes: bytes) -> tuple[bytes, int, int, int]:
    """(pcm16_bytes, n_channels, sample_width, frame_rate). Requires ffmpeg
    on PATH (via pydub) — only exercised when an agent's voice is an
    ElevenLabs one; a Sarvam-only deployment never hits this path."""
    from pydub import AudioSegment

    seg = AudioSegment.from_file(io.BytesIO(mp3_bytes), format="mp3")
    return seg.raw_data, seg.channels, seg.sample_width, seg.frame_rate


def frame_energy(ulaw_frame: bytes) -> int:
    """RMS energy of one ulaw frame — used both by UtteranceVAD's full
    turn-detection and by server.py's lighter-weight barge-in check (a
    handful of consecutive loud frames during agent playback, without
    waiting for a full utterance-complete)."""
    return audioop.rms(audioop.ulaw2lin(ulaw_frame, 2), 2)


def frame_energy_pcm16(pcm16_frame: bytes) -> int:
    """Same as frame_energy, for the browser path — mic audio is already
    PCM16, no ulaw decode needed first."""
    return audioop.rms(pcm16_frame, 2)


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

    def __init__(self, silence_ms: int = 550, min_speech_ms: int = 300, energy_threshold: int = 400):
        self._silence_ms = silence_ms
        self._min_speech_ms = min_speech_ms
        self._energy_threshold = energy_threshold
        self._buffer = bytearray()
        self._speech_ms = 0
        self._trailing_silence_ms = 0

    @property
    def energy_threshold(self) -> int:
        return self._energy_threshold

    def push_ulaw_frame(self, ulaw_frame: bytes, frame_ms: int = 20) -> bytes | None:
        """EnableX path: feed one ~frame_ms chunk of raw ulaw audio. Returns
        the complete utterance's raw ulaw bytes once silence-after-speech
        is detected, else None (still listening)."""
        return self._push(ulaw_frame, audioop.ulaw2lin(ulaw_frame, 2), frame_ms)

    def push_pcm16_frame(self, pcm16_frame: bytes, frame_ms: int) -> bytes | None:
        """Browser path: feed one ~frame_ms chunk of raw 16-bit PCM audio
        (already decoded client-side, no ulaw involved). Returns the
        complete utterance's raw PCM16 bytes once silence-after-speech is
        detected, else None."""
        return self._push(pcm16_frame, pcm16_frame, frame_ms)

    def _push(self, raw_frame: bytes, pcm16_for_energy: bytes, frame_ms: int) -> bytes | None:
        energy = audioop.rms(pcm16_for_energy, 2)
        self._buffer.extend(raw_frame)
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


class EchoCanceller:
    """NLMS adaptive echo canceller for the phone leg's barge-in detector.

    Background: _PHONE_BARGE_IN_ENABLED was disabled outright (see
    orchestrator/server.py) after a real test call showed EVERY reply
    self-cancelling — the phone leg has no acoustic echo cancellation, so
    the agent's own voice, reflected back through the caller's handset/
    line, arrives as "caller audio" and a plain energy threshold can't
    tell it apart from a real interruption. This class exists to make that
    distinction properly: given the exact reference audio we sent out (the
    same PCM16 samples handed to chunk_ulaw for sending), it adaptively
    learns the echo path (delay + attenuation + coloration) and subtracts
    the predicted echo from the incoming mic signal before the existing
    energy-threshold barge-in check ever sees it. Scoped ONLY to the
    barge-in detector's input — the caller's actual audio sent to STT is
    untouched, so a bug here can make barge-in unreliable but can never
    corrupt what the agent actually hears/transcribes.

    Two things make a naive NLMS filter unsafe to use as-is, both handled
    here:

    1. Double-talk. When the caller's real speech arrives on top of the
       echo, a filter that keeps adapting tries to explain that real
       speech as more echo too, corrupting its own weights and measurably
       attenuating genuine speech (confirmed by a synthetic test during
       development: real-speech energy dropped to ~32% of its original
       level with adaptation left unconditionally on). The fix is a
       double-talk detector: freeze weight updates (but keep subtracting
       using the already-converged weights) whenever the current sample's
       energy spikes well above the recent running-average energy —
       that's the signature of near-end speech landing on top of steady
       echo. With this, synthetic tests (realistic multi-tone reference +
       120ms echo delay + a normal-volume overlapping "interruption")
       show genuine echo suppressed by ~97%+, and real speech surviving
       at ~60-70% of its original energy during the overlap — reduced
       from the original, but still well clear of the barge-in
       threshold in every scenario tested (e.g. residual RMS 1128 vs. a
       threshold of 1000), while echo-only residual stays far below it
       (RMS ~23). Not a lossless separation — a simpler two-tone signal
       measured closer to ~100% preservation, so the real number depends
       on the actual reference content — but the practical target (real
       speech still trips the detector, echo alone never does) holds
       across every case tried.
    2. Bootstrapping. The running-average baseline the double-talk
       detector compares against must not be established from silence —
       the echo can start arriving well after the reference audio starts
       being sent (real telephony round-trip delay), so a fixed sample-
       count warmup can fall entirely within that pre-echo silence and
       lock in a near-zero baseline that misreads all subsequent real
       audio (including genuine echo) as double-talk forever. Instead,
       adaptation stays unconditionally on until the incoming signal
       first exceeds a real noise floor, and then for a fixed number of
       samples after that point — guaranteeing the bootstrap window
       actually contains signal, whenever the echo happens to start.

    filter_len=1600 (200ms @ 8kHz) covers a generously long telephony
    round-trip; real EnableX/carrier delay is expected to be well under
    that. Verified real-time cost: ~1-2ms of Python/numpy work per 20ms
    audio frame — negligible against the frame budget.
    """

    def __init__(
        self,
        filter_len: int = 1600,
        mu: float = 0.5,
        dtd_threshold: float = 3.0,
        bootstrap_samples: int = 400,
        noise_floor: float = 200.0,
    ) -> None:
        self._n = filter_len
        self._w = np.zeros(filter_len)
        self._ring = np.zeros(filter_len * 2)
        self._pos = 0
        self._mu = mu
        self._eps = 1e-6
        self._dtd_threshold = dtd_threshold
        self._mic_energy_avg = self._eps
        self._bootstrap_samples = bootstrap_samples
        self._noise_floor_sq = noise_floor * noise_floor
        self._bootstrap_remaining = -1  # -1 = real signal not seen yet

    def process(self, mic_pcm16: np.ndarray, ref_pcm16: np.ndarray) -> np.ndarray:
        """Both inputs are int16 (or compatible) sample arrays of equal
        length, time-aligned at the point they were captured/sent (the
        filter itself learns the actual echo-path delay). Returns the
        echo-cancelled residual as float64 samples — feed straight into an
        energy/RMS check; not intended for STT/playback."""
        n = self._n
        # Cast up front — squaring a raw int16 sample overflows int16's own
        # range for real audio amplitudes (confirmed live: silently wrapped
        # to garbage/negative energy values, which broke the double-talk
        # detector and bootstrap logic without raising an error, just
        # quietly doing nothing). Every arithmetic op below must stay in
        # float64.
        mic_f = mic_pcm16.astype(np.float64)
        ref_f = ref_pcm16.astype(np.float64)
        out = np.empty(len(mic_pcm16), dtype=np.float64)
        for i in range(len(mic_pcm16)):
            self._ring[self._pos] = ref_f[i]
            self._ring[self._pos + n] = ref_f[i]
            self._pos = (self._pos + 1) % n
            window = self._ring[self._pos : self._pos + n][::-1]
            y_hat = self._w @ window
            e = mic_f[i] - y_hat
            out[i] = e

            mic_energy = mic_f[i] * mic_f[i]
            if self._bootstrap_remaining == -1:
                if mic_energy > self._noise_floor_sq:
                    self._bootstrap_remaining = self._bootstrap_samples
                else:
                    continue  # too quiet to learn anything from yet
            in_bootstrap = self._bootstrap_remaining > 0
            double_talk = (not in_bootstrap) and mic_energy > self._dtd_threshold * self._mic_energy_avg
            if not double_talk:
                self._mic_energy_avg = 0.98 * self._mic_energy_avg + 0.02 * mic_energy
                norm = window @ window + self._eps
                self._w += (self._mu / norm) * e * window
                if in_bootstrap:
                    self._bootstrap_remaining -= 1
        return out
