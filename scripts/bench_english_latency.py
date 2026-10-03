"""Measure caller-stops -> agent-speaks latency against the STAGING stack.

Joins a staging room as a synthetic caller, speaks pre-recorded English
questions (16-bit WAV, any rate), and times the gap between the last sample of
speech and the first audible agent audio. Refuses anything that is not the
staging web address. Needs the agent venv (livekit rtc + httpx).

  python scripts/bench_english_latency.py --web https://web-stg-... \
      --email vistrowai@gmail.com --password ... --wavs-dir DIR \
      --variant name:model=gpt-4.1-mini,voice=elevenlabs:ID,sttProvider=google-chirp3 ...
"""
from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
import wave
from pathlib import Path

import httpx
from livekit import rtc

SPEAK_RMS = 600  # int16 RMS above which a frame counts as audible speech


def read_wav(path: Path) -> tuple[bytes, int]:
    with wave.open(str(path)) as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2, f"{path}: need mono 16-bit"
        return w.readframes(w.getnframes()), w.getframerate()


def rms(frame: rtc.AudioFrame) -> float:
    import array

    a = array.array("h", bytes(frame.data))
    return (sum(x * x for x in a) / max(len(a), 1)) ** 0.5


class Caller:
    def __init__(self) -> None:
        self.room = rtc.Room()
        self.last_agent_audio = 0.0  # monotonic time of the latest audible agent frame
        self.first_audio_after: float | None = None
        self.watch_after: float | None = None
        self._tasks: list[asyncio.Task] = []

    async def _listen(self, track: rtc.Track) -> None:
        async for ev in rtc.AudioStream(track):
            if rms(ev.frame) > SPEAK_RMS:
                now = time.monotonic()
                self.last_agent_audio = now
                if self.watch_after is not None and self.first_audio_after is None and now >= self.watch_after:
                    self.first_audio_after = now

    async def join(self, url: str, token: str) -> rtc.AudioSource:
        @self.room.on("track_subscribed")
        def _on_track(track, pub, participant):  # noqa: ANN001
            if track.kind == rtc.TrackKind.KIND_AUDIO:
                self._tasks.append(asyncio.create_task(self._listen(track)))

        await self.room.connect(url, token)
        src = rtc.AudioSource(48000, 1)
        track = rtc.LocalAudioTrack.create_audio_track("mic", src)
        await self.room.local_participant.publish_track(
            track, rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE)
        )
        return src

    async def wait_agent_quiet(self, quiet_s: float = 1.6, timeout: float = 30.0) -> bool:
        """Wait until the agent has spoken and then been silent for quiet_s."""
        start = time.monotonic()
        while time.monotonic() - start < timeout:
            if self.last_agent_audio and time.monotonic() - self.last_agent_audio > quiet_s:
                return True
            await asyncio.sleep(0.05)
        return False

    async def ask(self, src: rtc.AudioSource, pcm: bytes, rate: int, reply_timeout: float = 15.0) -> float | None:
        import audioop

        if rate != 48000:
            pcm, _ = audioop.ratecv(pcm, 2, 1, rate, 48000, None)
        self.first_audio_after = None
        self.watch_after = None
        frame_samples = 480  # 10 ms at 48 kHz
        step = frame_samples * 2
        for i in range(0, len(pcm), step):
            chunk = pcm[i : i + step].ljust(step, b"\0")
            await src.capture_frame(rtc.AudioFrame(chunk, 48000, 1, frame_samples))
            await asyncio.sleep(0.01)
        await src.wait_for_playout()
        t_stop = time.monotonic()
        self.watch_after = t_stop
        silence = rtc.AudioFrame(b"\0" * step, 48000, 1, frame_samples)
        while time.monotonic() - t_stop < reply_timeout and self.first_audio_after is None:
            await src.capture_frame(silence)  # keep the mic open so the agent can end the turn
            await asyncio.sleep(0.01)
        return None if self.first_audio_after is None else (self.first_audio_after - t_stop) * 1000

    async def close(self) -> None:
        for t in self._tasks:
            t.cancel()
        await self.room.disconnect()


async def run_variant(web: str, cookies, agent_id: int, wavs: list[Path], turns: int) -> list[float | None]:
    async with httpx.AsyncClient(base_url=web, cookies=cookies, timeout=60) as c:
        r = await c.post("/api/token", json={"identity": f"bench-{int(time.time())}", "room": f"bench-{int(time.time())}", "agentId": agent_id})
        r.raise_for_status()
        j = r.json()
    caller = Caller()
    src = await caller.join(j.get("url") or j.get("serverUrl") or j["wsUrl"], j["token"])
    out: list[float | None] = []
    try:
        if not await caller.wait_agent_quiet():
            print("  no greeting heard", file=sys.stderr)
            return out
        for i in range(turns):
            pcm, rate = read_wav(wavs[i % len(wavs)])
            ms = await caller.ask(src, pcm, rate)
            out.append(ms)
            if not await caller.wait_agent_quiet():
                break
    finally:
        await caller.close()
    return out


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--web", required=True)
    ap.add_argument("--email", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--wavs-dir", required=True)
    ap.add_argument("--turns", type=int, default=5)
    ap.add_argument("--variant", action="append", required=True, help="name:key=val,key=val (PATCH fields)")
    a = ap.parse_args()
    if "web-stg" not in a.web and "staging" not in a.web:
        print("Refusing: --web must be the staging web address.")
        return 2
    wavs = sorted(Path(a.wavs_dir).glob("*.wav"))
    async with httpx.AsyncClient(base_url=a.web, timeout=60) as c:
        (await c.post("/api/auth/login", json={"email": a.email, "password": a.password})).raise_for_status()
        agents = (await c.get("/api/agents")).json()
        agent_id = agents[0]["id"]
        cookies = c.cookies
        print(f"agent {agent_id} ({agents[0].get('name')}); {len(wavs)} questions\n")
        for spec in a.variant:
            name, _, kv = spec.partition(":")
            fields = dict(p.split("=", 1) for p in kv.split(",") if p)
            pr = await c.patch(f"/api/agents/{agent_id}", json=fields)
            if pr.status_code >= 400:
                print(f"{name}: PATCH failed {pr.status_code} {pr.text[:160]}")
                continue
            await asyncio.sleep(3)
            ms = await run_variant(a.web, cookies, agent_id, wavs, a.turns)
            ok = [m for m in ms if m is not None]
            if ok:
                print(f"{name:34s} n={len(ok)}/{len(ms)} median={statistics.median(ok):6.0f} ms  min={min(ok):6.0f}  max={max(ok):6.0f}   {[round(x) for x in ok]}")
            else:
                print(f"{name:34s} no responses measured")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
