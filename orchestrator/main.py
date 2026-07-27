"""Phase 1 verification harness — proves the STT -> LLM -> TTS pipeline
works end-to-end against a canned audio file, with no telephony or browser
transport involved (per the migration plan's Phase 1 verification step).

Usage:
    cd orchestrator
    python3 main.py path/to/utterance.wav

Requires only OPENAI_API_KEY and SARVAM_API_KEY in the environment — no
DATABASE_URL needed for this offline smoke test: account_id/agent_id are
left None, and every db.py call already degrades safely to a sane default
when account_id is None (the same contract agent/db.py already guarantees
for a call with no dashboard-configured agent behind it).

This is a one-shot, single-turn smoke test, not a real server — Phase 2/3
will add the actual EnableX WebSocket adapter and browser WebSocket adapter
that call session.handle_utterance() per turn on live audio.
"""

from __future__ import annotations

import asyncio
import sys

from dotenv import load_dotenv

import session as session_module
import tools


async def main() -> None:
    load_dotenv()
    if len(sys.argv) != 2:
        print("usage: python3 main.py path/to/utterance.wav", file=sys.stderr)
        raise SystemExit(1)
    wav_path = sys.argv[1]
    with open(wav_path, "rb") as f:
        caller_wav_bytes = f.read()

    sess = session_module.Session(
        account_id=None,
        agent_id=None,
        call_type="browser",
        voice="shubh",
        agent_name="Artha",
        business_name="a test business",
        model="gpt-4o-mini",
    )
    session_module.build_tools_for_session(sess)
    sess.on_event = lambda payload: print(f"[event] {payload}")

    print(f"Transcribing + running one turn against {wav_path} ...")
    reply_text, audio_bytes, content_type = await session_module.handle_utterance(sess, caller_wav_bytes)

    print(f"\nCaller said : {sess.transcript[-2]['text']}")
    print(f"Agent replied: {reply_text}")
    print(f"Reply audio  : {len(audio_bytes)} bytes, {content_type}")

    out_path = "reply.wav" if content_type == "audio/wav" else "reply.mp3"
    with open(out_path, "wb") as f:
        f.write(audio_bytes)
    print(f"Wrote reply audio to {out_path}")

    print("\nFull transcript so far:")
    for turn in sess.transcript:
        print(f"  {turn['role']}: {turn['text']}")


if __name__ == "__main__":
    asyncio.run(main())
