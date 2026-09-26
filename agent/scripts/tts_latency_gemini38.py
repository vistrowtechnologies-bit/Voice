"""Gemini 3.8 Flash-Lite vs Chirp 3 HD: time to first audio, plus samples.

Measures the exact streaming path live calls use (PatchedGeminiTTS, clause
split included), with text fed 3 characters every 25ms like the LLM does and
the conditions interleaved within each repeat, same method as
docs/TTS-LATENCY-2026-09-10.md. Writes one WAV per voice so you can listen.

Usage (needs GOOGLE_APPLICATION_CREDENTIALS_JSON, read from ../.env too):
    cd agent && .venv/bin/python3 scripts/tts_latency_gemini38.py
    cd agent && .venv/bin/python3 scripts/tts_latency_gemini38.py --repeats 6 --phone
"""

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from livekit import rtc  # noqa: E402

from emotion import GEMINI_TONE_PROMPTS  # noqa: E402
from google_tts_streaming_patch import PatchedGeminiTTS  # noqa: E402

TEXT = "नमस्ते! मैं Vistrow Voice से बोल रही हूँ, क्या आपके पास दो मिनट हैं? आपकी प्रॉपर्टी की पूछताछ के बारे में बात करनी थी।"
PROMPT = GEMINI_TONE_PROMPTS["balanced"]

# label -> (voice_name, model_name or None for Chirp 3, which picks its own)
CONDITIONS = {
    "chirp3 HD Callirrhoe (baseline)": ("hi-IN-Chirp3-HD-Callirrhoe", None),
    "gemini 3.8 flash-lite Kore": ("Kore", "gemini-3.8-flash-lite-tts"),
    "gemini 3.8 flash-lite Puck": ("Puck", "gemini-3.8-flash-lite-tts"),
    "gemini 3.1 preview Kore": ("Kore", "gemini-3.1-flash-tts-preview"),
    "gemini 2.5 flash Kore": ("Kore", "gemini-2.5-flash-tts"),
}


def build(voice_name: str, model_name: str | None, creds: dict, phone: bool) -> PatchedGeminiTTS:
    kwargs = {"language": "hi-IN", "voice_name": voice_name, "credentials_info": creds}
    if phone:
        kwargs["sample_rate"] = 8000
    if model_name:
        kwargs["model_name"] = model_name
        kwargs["prompt"] = PROMPT
    return PatchedGeminiTTS(**kwargs)


async def one_run(tts: PatchedGeminiTTS) -> tuple[float | None, float, list[rtc.AudioFrame]]:
    """(ms to first audio, ms to last audio, frames)."""
    stream = tts.stream()
    start = time.perf_counter()

    async def feed():
        for i in range(0, len(TEXT), 3):
            stream.push_text(TEXT[i:i + 3])
            await asyncio.sleep(0.025)
        stream.end_input()

    feeder = asyncio.create_task(feed())
    first = None
    frames: list[rtc.AudioFrame] = []
    async with stream:
        async for ev in stream:
            if first is None:
                first = (time.perf_counter() - start) * 1000
            frames.append(ev.frame)
    await feeder
    return first, (time.perf_counter() - start) * 1000, frames


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeats", type=int, default=4)
    ap.add_argument("--phone", action="store_true", help="8kHz, as on phone calls")
    ap.add_argument("--out", default="tts_latency_samples")
    args = ap.parse_args()

    raw = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")
    if not raw:
        sys.exit("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set (env or .env)")
    creds = json.loads(raw)
    out = Path(args.out)
    out.mkdir(exist_ok=True)

    ttss = {label: build(v, m, creds, args.phone) for label, (v, m) in CONDITIONS.items()}
    firsts: dict[str, list[float]] = {label: [] for label in CONDITIONS}
    errors: dict[str, str] = {}
    print(f"text: {len(TEXT)} chars, fed 3 chars / 25ms, {args.repeats} interleaved repeats\n")

    # Repeat 0 is a warm-up (connection setup) and is not counted.
    for rep in range(args.repeats + 1):
        for label, tts in ttss.items():
            if label in errors:
                continue
            try:
                first, total, frames = await one_run(tts)
            except Exception as e:  # model not on Cloud TTS yet, 429, auth...
                errors[label] = f"{type(e).__name__}: {e}"[:300]
                continue
            if rep == 0:
                wav = rtc.combine_audio_frames(frames).to_wav_bytes()
                (out / f"{label.split(' (')[0].replace(' ', '_')}.wav").write_bytes(wav)
                continue
            if first is not None:
                firsts[label].append(first)
            print(f"  rep {rep} {label:<34} first audio {first or 0:6.0f}ms  done {total:6.0f}ms")

    print("\n| voice | median first audio | runs (ms) |\n|---|---|---|")
    for label, vals in firsts.items():
        if label in errors:
            print(f"| {label} | FAILED | {errors[label]} |")
        elif vals:
            print(f"| {label} | {statistics.median(vals):.0f}ms | {', '.join(f'{v:.0f}' for v in vals)} |")
    print(f"\nListen: {out.resolve()}/*.wav")
    for tts in ttss.values():
        await tts.aclose()


if __name__ == "__main__":
    asyncio.run(main())
