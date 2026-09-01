"""One-time offline render of the platform-demo's pre-rendered opener clips.

Run this whenever _PLATFORM_DEMO_OPENERS / _PLATFORM_DEMO_OPENERS_EN change
(new/edited lines, different voice) and commit the resulting greeting_cache/
directory. Worker processes then load these WAV files at boot instead of
calling Google TTS live — the live-render approach synthesized the same
handful of lines from every idle process on every deploy, which hit Google's
per-minute TTS rate limit (429 RESOURCE_EXHAUSTED) whenever more than one
process warmed up at once.

Usage: cd agent && .venv/bin/python3 scripts/render_greetings.py
"""

import asyncio
import json
import sys
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google_tts_streaming_patch import PatchedGeminiTTS  # noqa: E402
from main import (  # noqa: E402
    _GOOGLE_31_MODEL,
    _GOOGLE_CREDENTIALS,
    _GREETING_CACHE_PER_SET,
    _PLATFORM_DEMO_OPENERS,
    _PLATFORM_DEMO_OPENERS_EN,
    _synthesize_frames,
)

OUT_DIR = Path(__file__).resolve().parent.parent / "greeting_cache"


def _write_wav(path: Path, frames) -> None:
    data = b"".join(bytes(f.data) for f in frames)
    sample_rate = frames[0].sample_rate
    num_channels = frames[0].num_channels
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(num_channels)
        wf.setsampwidth(2)  # int16 PCM, matches rtc.AudioFrame's own format
        wf.setframerate(sample_rate)
        wf.writeframes(data)


async def main() -> None:
    if not _GOOGLE_CREDENTIALS:
        print("GOOGLE_APPLICATION_CREDENTIALS_JSON is not set — nothing to render.")
        return

    OUT_DIR.mkdir(exist_ok=True)
    manifest = []

    for language, opener_set in (("hi-IN", _PLATFORM_DEMO_OPENERS), ("en-IN", _PLATFORM_DEMO_OPENERS_EN)):
        tts = PatchedGeminiTTS(
            language=language,
            voice_name="Kore",
            model_name=_GOOGLE_31_MODEL,
            credentials_info=_GOOGLE_CREDENTIALS,
        )
        # Only the female set is ever spoken with Kore (a female voice) —
        # mirrors the same restriction the old live-render path had.
        texts = (opener_set.get("female") or [])[:_GREETING_CACHE_PER_SET]
        for i, text in enumerate(texts):
            print(f"rendering {language} #{i}: {text[:50]}...")
            frames = await _synthesize_frames(tts, text)
            if not frames:
                print(f"  -> got no audio, skipping")
                continue
            filename = f"{language}_{i}.wav"
            _write_wav(OUT_DIR / filename, frames)
            manifest.append(
                {"voice": "google31:kore", "language": language, "gender": "female", "text": text, "file": filename}
            )

    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"wrote {len(manifest)} clip(s) to {OUT_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
