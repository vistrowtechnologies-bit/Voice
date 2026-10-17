"""Live check of SarvamCloneTTS against Sarvam's real clone WebSocket.

Creates a throwaway cloned voice from a reference WAV, speaks three short
Hindi replies and one Marathi reply (a language reconfigure) through ONE
WebSocket via agent/sarvam_clone_tts.SarvamCloneTTS, measures time to first
audio per reply, saves each reply as a WAV, then deletes the voice (expect
204). Costs about Rs 0.6 (Rs 30 per 10K characters).

    python agent/scripts/clone_ws_live_check.py REFERENCE.wav OUT_DIR [--rate 8000] [--verify-language]

SARVAM_API_KEY comes from the environment or the nearest .env above this
file; it is never printed.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
import wave

import aiohttp

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import sarvam_clone_tts as sct  # noqa: E402

SARVAM = "https://api.sarvam.ai"
HINDI = [
    "नमस्ते, मैं आपकी कैसे मदद कर सकती हूँ?",
    "जी, आपका फ्लैट दो बेडरूम का है या तीन बेडरूम का?",
    "ठीक है, मैं आपको कल सुबह दस बजे कॉल करती हूँ।",
]
MARATHI = "नमस्कार, मी तुम्हाला कशी मदत करू शकते?"


def load_key() -> str:
    if os.environ.get("SARVAM_API_KEY"):
        return os.environ["SARVAM_API_KEY"]
    path = HERE
    while True:
        env = os.path.join(path, ".env")
        if os.path.isfile(env):
            for line in open(env, encoding="utf-8"):
                if line.startswith("SARVAM_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    os.environ["SARVAM_API_KEY"] = key
                    return key
        parent = os.path.dirname(path)
        if parent == path:
            raise SystemExit("SARVAM_API_KEY not found")
        path = parent


async def create_voice(session: aiohttp.ClientSession, key: str, ref: str) -> str:
    form = aiohttp.FormData()
    for k, v in {"name": "vv-phase2-live-check", "language": "hi-IN", "style": "conversational",
                 "gender": "female"}.items():
        form.add_field(k, v)
    with open(ref, "rb") as f:
        form.add_field("file", f.read(), filename="reference.wav", content_type="audio/wav")
    async with session.post(f"{SARVAM}/voices/create", data=form, headers={"api-subscription-key": key}) as r:
        body = await r.json(content_type=None)
        data = body.get("data") if isinstance(body.get("data"), dict) else body
        print(f"create: HTTP {r.status} status={data.get('status')}")
        if r.status >= 300 or not data.get("voice_id"):
            raise SystemExit(f"voice create failed: HTTP {r.status}")
        return data["voice_id"]


async def delete_voice(session: aiohttp.ClientSession, key: str, voice_id: str) -> int:
    async with session.delete(f"{SARVAM}/voices/delete/{voice_id}", headers={"api-subscription-key": key}) as r:
        print(f"delete: HTTP {r.status}")
        return r.status


async def speak(tts: sct.SarvamCloneTTS, text: str) -> tuple[float, bytes]:
    """Pushes the text word by word, as an LLM would; returns (seconds from
    the last word to first audio, pcm)."""
    pcm = b""
    first = None
    async with tts.stream() as stream:
        for word in text.split(" "):
            stream.push_text(word + " ")
        t0 = time.monotonic()
        stream.end_input()
        async for ev in stream:
            if first is None:
                first = time.monotonic() - t0
            pcm += ev.frame.data.tobytes()
    return (first if first is not None else float("nan")), pcm


def save(path: str, pcm: bytes, rate: int) -> None:
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm)


async def detect_language(session: aiohttp.ClientSession, key: str, path: str) -> str:
    form = aiohttp.FormData()
    form.add_field("model", "saarika:v2.5")
    form.add_field("language_code", "unknown")
    with open(path, "rb") as f:
        form.add_field("file", f.read(), filename="reply.wav", content_type="audio/wav")
    async with session.post(f"{SARVAM}/speech-to-text", data=form, headers={"api-subscription-key": key}) as r:
        body = await r.json(content_type=None)
        return f"HTTP {r.status} language_code={body.get('language_code')}"


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("reference")
    ap.add_argument("out_dir")
    ap.add_argument("--rate", type=int, default=8000)
    ap.add_argument("--verify-language", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    key = load_key()
    async with aiohttp.ClientSession() as session:
        voice_id = await create_voice(session, key, args.reference)
        try:
            tts = sct.SarvamCloneTTS(voice_id=voice_id, language="hi-IN", sample_rate=args.rate, api_key=key)
            t0 = time.monotonic()
            tts.prewarm()
            await tts._connect_task
            print(f"prewarm (connect + config): {time.monotonic() - t0:.3f}s")
            files = []
            for i, (lang, text) in enumerate([("hi-IN", t) for t in HINDI] + [("mr-IN", MARATHI)], 1):
                if lang != tts.language:
                    tts.update_options(target_language_code=lang)
                ttfa, pcm = await speak(tts, text)
                path = os.path.join(args.out_dir, f"reply{i}_{lang}.wav")
                save(path, pcm, args.rate)
                files.append(path)
                print(f"reply {i} {lang}: first audio {ttfa:.3f}s after input end, "
                      f"{len(pcm) / 2 / args.rate:.2f}s of audio -> {path}")
            print(f"sockets opened: {tts.connections_opened} (expect 1)")
            await tts.aclose()
            if args.verify_language:
                for path in (files[0], files[-1]):
                    print(f"STT language of {os.path.basename(path)}: {await detect_language(session, key, path)}")
        finally:
            status = await delete_voice(session, key, voice_id)
            if status != 204:
                print("WARNING: voice not deleted; delete it from the Sarvam dashboard")


if __name__ == "__main__":
    asyncio.run(main())
