"""EarlyFlushTTS must never be wired into main.py until this passes reliably.

Call 984, 2026-09-16: the deployed patch cut both the greeting and an
early reply down to ~1.3s of audio instead of their real ~6-11s length.
Confirmed against the real call recording (agent channel: two clean
bursts of ~0.8s each, then silence for the rest of each sentence), then
reproduced offline against the real Sarvam API below. Intermittent — the
same code path, same text, sometimes completes normally and sometimes
truncates after the first clause — which is why the pre-deploy testing
(extensive on time-to-first-audio) never caught it: nothing checked that
the FULL reply's audio still arrives, only how fast it starts.

Skipped by default (real network calls, and it's slow enough to run
several times over to catch an intermittent bug) — run explicitly:
    RUN_SARVAM_LIVE_TESTS=1 python3 test_sarvam_early_flush_completeness.py
"""
import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k in ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"):
    os.environ.setdefault(_k, "x")

GREETING = ("Namaste Abhi, main Artha bol rahi hoon Vistrow Technologies se. "
            "Aapne website ke liye enquiry ki thi, usi ke regarding call kiya hai. "
            "Abhi ek minute baat kar sakte hain?")

# Chars/sec Sarvam actually produces for this style of text, measured against
# unpatched sarvam.TTS on the same greeting (~15.5 chars/sec). A truncated
# reply comes out far above this, not marginally over it (call 984's greeting
# measured at ~127 chars/sec — a ~8x gap, not noise).
_MIN_CHARS_PER_SEC = 8.0


async def _full_duration(tts, text: str) -> tuple[float, float]:
    from livekit.agents.utils import http_context
    try:
        http_context._new_session_ctx()
    except RuntimeError:
        pass  # already in a session context
    total_samples = 0
    rate = None
    import time
    t0 = time.monotonic()
    stream = tts.stream()

    async def feed():
        for i in range(0, len(text), 12):  # simulate streamed LLM chunks
            stream.push_text(text[i:i + 12])
            await asyncio.sleep(0.15)
        stream.end_input()

    feeder = asyncio.create_task(feed())
    first = None
    async for ev in stream:
        if first is None:
            first = (time.monotonic() - t0) * 1000
        frame = ev.frame
        rate = frame.sample_rate
        total_samples += len(frame.data) // frame.num_channels
    await feeder
    await stream.aclose()
    return first or 0.0, (total_samples / rate if rate else 0.0)


@unittest.skipUnless(os.environ.get("RUN_SARVAM_LIVE_TESTS"), "hits the real Sarvam API")
class EarlyFlushMustNotTruncate(unittest.TestCase):
    def test_full_reply_audio_arrives_every_run(self):
        import main
        from sarvam_early_flush_patch import EarlyFlushTTS

        async def run_all():
            tone = main.TONE_PRESETS.get("casual", main.TONE_PRESETS[main.DEFAULT_TONE])
            for run in range(5):
                tts = EarlyFlushTTS(target_language_code="hi-IN", model="bulbul:v3",
                                     speaker="priya", **tone)
                main._use_clause_tokenizer(tts, "test")
                try:
                    _, duration = await _full_duration(tts, GREETING)
                finally:
                    await tts.aclose()
                rate = len(GREETING) / duration if duration else float("inf")
                self.assertGreaterEqual(
                    duration, len(GREETING) / 40,  # generous floor, well above a 1-clause-only cut
                    f"run {run}: greeting truncated — {duration:.2f}s of audio for "
                    f"{len(GREETING)} chars ({rate:.0f} chars/sec, floor is {_MIN_CHARS_PER_SEC})",
                )

        asyncio.run(run_all())


if __name__ == "__main__":
    unittest.main()
