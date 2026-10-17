"""Live check of Sarvam voice cloning through our own code (custom_voices).

Run by hand only; it calls Sarvam for real and is billed (one create, one
short synthesis). Never run from tests or CI.

    SARVAM_API_KEY=... python server/scripts/voice_clone_live_check.py \
        reference.wav out.mp3 --gender female [--language hi-IN]

  1. custom_voices.sarvam_create (data.voice_id + reference_text parsing,
     style=conversational, gender) -> prints the voice id masked and the
     transcript Sarvam made of the clip;
  2. POST /voices/clone: one short Hindi line in the clone -> out.mp3;
  3. DELETE /voices/delete/{id} -> must answer 204.
The voice is deleted even if step 2 fails. The key is never printed. The
database is never touched (DATABASE_URL is pointed at a dead address).
"""

from __future__ import annotations

import argparse
import os
import sys
import wave
from pathlib import Path

# Importing custom_voices imports calls_db; make sure nothing here could ever
# reach a real database (load_dotenv does not override a set variable).
os.environ["DATABASE_URL"] = "postgresql://localhost:1/voice_clone_live_check_unused"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import custom_voices as cv  # noqa: E402

HINDI_LINE = "नमस्ते! यह आपकी क्लोन की गई आवाज़ का एक छोटा सा परीक्षण है।"


def mask(voice_id: str) -> str:
    return voice_id if len(voice_id) <= 12 else f"{voice_id[:8]}...{voice_id[-4:]}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav", help="reference clip: 10-15 s, one speaker, quiet room")
    ap.add_argument("out", help="where to save the synthesized Hindi line (mp3)")
    ap.add_argument("--gender", required=True, choices=cv.GENDERS)
    ap.add_argument("--language", default="hi-IN", choices=sorted(cv.LANGUAGES),
                    help="the language spoken in the clip (default hi-IN)")
    args = ap.parse_args()

    if not os.environ.get("SARVAM_API_KEY"):
        print("SARVAM_API_KEY is not set.", file=sys.stderr)
        return 2
    ref = Path(args.wav).read_bytes()
    try:
        with wave.open(args.wav, "rb") as w:
            secs = w.getnframes() / float(w.getframerate())
        print(f"reference: {secs:.1f} s, {len(ref)} bytes")
        if not 10.0 <= secs <= 15.0:
            print("warning: Sarvam recommends 10-15 s of reference audio", file=sys.stderr)
    except wave.Error:
        print("warning: not a plain WAV file; sending it as is", file=sys.stderr)

    name = cv._new_id()  # same naming scheme as real clones ("vv_<16>")
    voice_id = None
    deleted = synthesized = False
    try:
        voice_id, reference_text = cv.sarvam_create(name, args.language, ref, args.gender)
        print(f"created: name={name} voice_id={mask(voice_id)}")
        print(f"reference_text: {reference_text!r}")
        audio, ctype = cv.sarvam_tts(voice_id, HINDI_LINE, "hi-IN")
        Path(args.out).write_bytes(audio)
        synthesized = True
        print(f"synthesized: {len(audio)} bytes ({ctype}) -> {args.out}")
    except cv.SarvamError as e:
        print(f"Sarvam error: HTTP {e.status} code={e.code or '-'} request_id={e.request_id or '-'}: "
              f"{e.message[:300]}", file=sys.stderr)
    except cv.VendorError as e:
        print(f"Sarvam error: {e}", file=sys.stderr)
    finally:
        if voice_id:
            status, _raw = cv._http("DELETE", f"{cv._SARVAM_BASE}/voices/delete/{voice_id}",
                                    {"api-subscription-key": os.environ["SARVAM_API_KEY"]})
            deleted = status == 204
            print(f"delete: HTTP {status} ({'OK' if deleted else 'NOT 204: delete it by hand in Sarvam'})")
    return 0 if synthesized and deleted else 1


if __name__ == "__main__":
    sys.exit(main())
