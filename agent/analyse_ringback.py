"""Measure what ringback actually looks like on a real call recording.

The point is to calibrate a detector, not to guess. LiveKit's sip.callStatus
goes "active" on SIP 183 Session Progress (early media), not 200 OK, so it
reports "answered" while the handset is still ringing — measured at 2.98s on a
ringing phone. livekit/livekit#3841 reports exactly this and is closed as "not
planned", and Twilio's MachineDetection is unavailable over SIP trunks
(livekit/agents#6125), so no signalling answer exists for anyone. The
documented industry workaround is audio-level detection, which is what this
calibrates.

Indian carrier ringback is nominally a 400Hz tone, ~0.4s on / 0.2s off /
0.4s on / 2s off. Two properties separate it from a live line:

  1. it is NARROWBAND - nearly all energy in one bin
  2. it is LOUD and periodic, where an answered-but-silent line is quiet
     broadband room noise

Spectral flatness (geometric mean / arithmetic mean of the power spectrum)
captures 1 directly: a pure tone approaches 0, noise approaches 1.

    ./.venv/bin/python analyse_ringback.py ~/Downloads/939.mp3
"""
from __future__ import annotations

import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

WIN_MS = 32          # analysis window
TONE_LO, TONE_HI = 300, 550   # Indian ringback sits at 400Hz


def load_pcm(path: Path) -> tuple[np.ndarray, int]:
    """Decode anything ffmpeg understands to mono 16k float32 in [-1, 1]."""
    if path.suffix.lower() == ".wav":
        with wave.open(str(path)) as w:
            if w.getnchannels() == 1 and w.getframerate() == 16000 and w.getsampwidth() == 2:
                raw = w.readframes(w.getnframes())
                return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0, 16000
    # afconvert ships with macOS, so this needs nothing installed. ffmpeg is
    # tried first only because it is the more predictable of the two.
    import shutil, tempfile
    if shutil.which("ffmpeg"):
        out = subprocess.run(
            ["ffmpeg", "-v", "quiet", "-i", str(path), "-ac", "1", "-ar", "16000",
             "-f", "s16le", "-"],
            capture_output=True, check=True,
        ).stdout
        return np.frombuffer(out, dtype=np.int16).astype(np.float32) / 32768.0, 16000
    if not shutil.which("afconvert"):
        raise SystemExit("need ffmpeg or afconvert to decode this file")
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d) / "out.wav"
        subprocess.run(
            ["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1",
             str(path), str(tmp)],
            capture_output=True, check=True,
        )
        with wave.open(str(tmp)) as w:
            raw = w.readframes(w.getnframes())
            sr = w.getframerate()
        return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0, sr


def frames(pcm: np.ndarray, sr: int):
    n = int(sr * WIN_MS / 1000)
    for i in range(0, len(pcm) - n, n):
        yield i / sr, pcm[i:i + n]


def features(win: np.ndarray, sr: int) -> tuple[float, float, float]:
    """(rms, spectral flatness, share of energy in the ringback band)."""
    rms = float(np.sqrt(np.mean(win ** 2)))
    spec = np.abs(np.fft.rfft(win * np.hanning(len(win)))) ** 2
    spec = spec + 1e-12
    flatness = float(np.exp(np.mean(np.log(spec))) / np.mean(spec))
    freqs = np.fft.rfftfreq(len(win), 1 / sr)
    band = spec[(freqs >= TONE_LO) & (freqs <= TONE_HI)].sum() / spec.sum()
    return rms, flatness, float(band)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1]).expanduser()
    if not path.exists():
        print(f"no such file: {path}")
        return 1
    pcm, sr = load_pcm(path)
    print(f"{path.name}: {len(pcm)/sr:.1f}s at {sr}Hz\n")

    rows = [(t, *features(w, sr)) for t, w in frames(pcm, sr)]
    print(f"{'time':>7}  {'rms':>7}  {'flatness':>9}  {'400Hz share':>12}  verdict")
    print("  (a pure tone -> flatness near 0 and a high band share)")
    prev = None
    for t, rms, flat, band in rows:
        tone = rms > 0.01 and flat < 0.15 and band > 0.5
        verdict = "RINGBACK" if tone else ("quiet" if rms < 0.01 else "voice/noise")
        if verdict != prev or t < 12:      # print transitions plus the first 12s
            print(f"{t:>6.2f}s  {rms:>7.4f}  {flat:>9.4f}  {band:>11.2f}  {verdict}")
        prev = verdict

    tone_t = [t for t, rms, flat, band in rows if rms > 0.01 and flat < 0.15 and band > 0.5]
    print()
    if tone_t:
        print(f"ringback detected from {min(tone_t):.2f}s to {max(tone_t):.2f}s "
              f"({len(tone_t)} windows)")
        print(f">>> the handset was still ringing until {max(tone_t):.2f}s")
        print(">>> anything the agent said before that went into the ring tone")
    else:
        print("no ringback-like tone found — thresholds need widening, or this "
              "carrier's early media is not a clean tone")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
