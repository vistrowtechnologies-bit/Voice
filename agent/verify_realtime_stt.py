"""Full local check of the realtime STT path. Run this BEFORE any test call.

Three live calls each exposed a bug that was findable locally:

  call 929  every preemptive generation invalidated  - preflight gated on
            _speaking, so the last one was a truncated fragment
  call 933  51 seconds of silence, one agent turn    - LiveKit's frames
            exceeded Sarvam's 16KB cap and were ALL rejected, non-fatally
  call 934  3,409ms median turn gap vs 2,325ms       - Sarvam's default
            silence_duration_ms=500 paid on every turn

Each was caught by a real phone call because the local probe used 20ms
buffers and one utterance. This exercises the actual path instead:
_build_stt with the flag on, production-sized frames, several turns.

    cd agent && ./.venv/bin/python verify_realtime_stt.py
"""
from __future__ import annotations

import asyncio
import base64
import io
import os
import re
import sys
import time
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("LIVEKIT_URL", "ws://x")
os.environ.setdefault("LIVEKIT_API_KEY", "x")
os.environ.setdefault("LIVEKIT_API_SECRET", "x")
os.environ["SARVAM_REALTIME_STT"] = "1"

import aiohttp  # noqa: E402
from livekit import rtc  # noqa: E402

import main  # noqa: E402
import sarvam_realtime_stt  # noqa: E402

# Measured on call 934 from the worker's own log line, not guessed:
#   "livekit frame size 1052 bytes (33ms at 16000Hz)"
FRAME_BYTES = 1052

# Real caller turns, not one lab sentence. The bare greeting is here because
# call 915 lost two of them (349ms, 452ms) and sat silent for 112 seconds.
TURNS = [
    "हेलो।",
    "हाँ जी बोलिए, मुझे अपनी मिठाई की दुकान के लिए एक नई वेबसाइट बनवानी है।",
    "इसका कितना खर्चा आएगा?",
]

WORDS = lambda t: [w for w in re.split(r"[\s,।.!?]+", t.casefold()) if w]  # noqa: E731


async def synth(session: aiohttp.ClientSession, text: str) -> bytes:
    r = await session.post(
        "https://api.sarvam.ai/text-to-speech",
        headers={"API-SUBSCRIPTION-KEY": os.environ["SARVAM_API_KEY"],
                 "Content-Type": "application/json"},
        json={"text": text, "target_language_code": "hi-IN",
              "speaker": "priya", "model": "bulbul:v3"},
    )
    if r.status != 200:
        raise SystemExit(f"TTS failed HTTP {r.status}: {(await r.text())[:200]}")
    j = await r.json()
    with wave.open(io.BytesIO(base64.b64decode(j["audios"][0]))) as w:
        pcm, sr = w.readframes(w.getnframes()), w.getframerate()
    if sr != 16000:
        import audioop
        pcm, _ = audioop.ratecv(pcm, 2, 1, sr, 16000, None)
    return pcm


async def one_turn(engine, pcm: bytes) -> dict:
    stream = engine.stream()
    t0 = time.perf_counter()
    pre: list[tuple[float, str]] = []
    fin: list[tuple[float, str]] = []

    async def feed():
        spc = FRAME_BYTES // 2
        for i in range(0, len(pcm), FRAME_BYTES):
            chunk = pcm[i:i + FRAME_BYTES]
            if len(chunk) < FRAME_BYTES:
                break
            stream.push_frame(rtc.AudioFrame(data=chunk, sample_rate=16000,
                                             num_channels=1, samples_per_channel=spc))
            await asyncio.sleep(FRAME_BYTES / 2 / 16000)   # real-time pacing
        sil = b"\x00" * FRAME_BYTES
        for _ in range(45):    # trailing silence so VAD closes the turn
            stream.push_frame(rtc.AudioFrame(data=sil, sample_rate=16000,
                                             num_channels=1, samples_per_channel=spc))
            await asyncio.sleep(FRAME_BYTES / 2 / 16000)
        stream.end_input()

    async def collect():
        async for ev in stream:
            name = ev.type.name if hasattr(ev.type, "name") else str(ev.type)
            txt = ev.alternatives[0].text if ev.alternatives else ""
            ms = (time.perf_counter() - t0) * 1000
            if name == "PREFLIGHT_TRANSCRIPT":
                pre.append((ms, txt))
            elif name == "FINAL_TRANSCRIPT":
                fin.append((ms, txt))
                return

    err = None
    try:
        await asyncio.wait_for(asyncio.gather(feed(), collect()), timeout=90)
    except Exception as e:                       # noqa: BLE001
        err = f"{type(e).__name__}: {e}"
    finally:
        await stream.aclose()
    return {"pre": pre, "fin": fin, "err": err}


async def main_() -> int:
    http = aiohttp.ClientSession()
    engine = main._build_stt(None, "hi-IN")
    if not isinstance(engine, sarvam_realtime_stt.RealtimeSTT):
        print(f"FAIL: _build_stt returned {type(engine).__name__}, not RealtimeSTT")
        await http.close()
        return 1
    engine._session = http

    o = engine._opts
    print("config actually sent to Sarvam:")
    for k, v in o.query().items():
        print(f"    {k:24} {v}")
    print(f"\nframe size {FRAME_BYTES} bytes "
          f"({FRAME_BYTES/2/16000*1000:.0f}ms) — production value from call 934")
    print(f"chunking to {sarvam_realtime_stt._CHUNK_BYTES} bytes/message "
          f"(cap is 16000)\n")

    failures: list[str] = []
    for text in TURNS:
        pcm = await synth(http, text)
        r = await one_turn(engine, pcm)
        pre, fin, err = r["pre"], r["fin"], r["err"]
        label = text[:38] + ("…" if len(text) > 38 else "")
        print(f"── {label}")
        if err:
            print(f"   ERROR {err}")
            failures.append(f"{label}: {err}")
            continue
        if not fin:
            print("   no FINAL_TRANSCRIPT")
            failures.append(f"{label}: no final transcript")
            continue
        if not pre:
            print("   0 preflights — preemptive generation cannot fire")
            failures.append(f"{label}: no preflights")
            continue
        match = WORDS(pre[-1][1]) == WORDS(fin[0][1])
        lead = fin[0][0] - pre[-1][0]
        print(f"   preflights {len(pre):>3}   head start {lead:>6.0f}ms   "
              f"last preflight matches final: {match}")
        print(f"   final: {fin[0][1][:70]!r}")
        if not match:
            print(f"   last preflight: {pre[-1][1][:70]!r}")
            failures.append(
                f"{label}: last preflight != final, livekit will cancel the "
                f"preemptive run")
        await asyncio.sleep(1.0)

    await http.close()
    print()
    if failures:
        print(f"NOT READY TO CALL — {len(failures)} problem(s):")
        for f in failures:
            print(f"   - {f}")
        return 1
    print("All turns produced matching preflights. Safe to place a test call.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main_()))
