"""Call recording — captured client-side inside the agent process rather than
via LiveKit's official record=True/Egress path. That official path calls
JobContext.init_recording(), which (per livekit-agents' own job.py) spins up
a billed cloud-observability pipeline any time audio recording is requested,
regardless of whether traces/logs are separately disabled. Tapping the room's
audio tracks directly here never touches that code path, so recording stays
genuinely free — the only cost is R2 storage (see upload_recording below).

Best-effort throughout: a recording hiccup must never break call teardown or
surface to the caller. Every public function swallows its own exceptions.
"""

import array
import asyncio
import io
import logging
import os
import tempfile
import wave

from livekit import rtc

logger = logging.getLogger("recording")

_SAMPLE_RATE = 16000


class CallRecorder:
    """Tapes both sides of one call into a single stereo WAV (caller on the
    left channel, agent on the right). Attach right after session.start()."""

    def __init__(self, room: rtc.Room) -> None:
        self._room = room
        self._caller_chunks: list[bytes] = []
        self._agent_chunks: list[bytes] = []
        self._tasks: list = []
        self._started = False

    def start(self) -> None:
        if self._started:
            return
        self._started = True

        # Tracks already published before we attached these listeners (the
        # common case — the agent's TTS track and the caller's mic track are
        # usually both up by the time session.start() returns) are picked up
        # here; anything published slightly later is caught by the two event
        # listeners below. Both paths funnel into the same _capture() task,
        # so a track is never recorded twice.
        seen_sids: set[str] = set()

        def _capture_if_audio(track, sid: str, chunks: list[bytes]) -> None:
            if sid in seen_sids or track.kind != rtc.TrackKind.KIND_AUDIO:
                return
            seen_sids.add(sid)
            self._tasks.append(asyncio.create_task(self._pump(track, chunks)))

        for pub in self._room.local_participant.track_publications.values():
            if pub.track is not None:
                _capture_if_audio(pub.track, pub.sid, self._agent_chunks)

        for participant in self._room.remote_participants.values():
            for pub in participant.track_publications.values():
                if pub.track is not None:
                    _capture_if_audio(pub.track, pub.sid, self._caller_chunks)

        def _on_local_published(pub, track) -> None:
            _capture_if_audio(track, pub.sid, self._agent_chunks)

        def _on_remote_subscribed(track, pub, participant) -> None:
            _capture_if_audio(track, pub.sid, self._caller_chunks)

        self._room.on("local_track_published", _on_local_published)
        self._room.on("track_subscribed", _on_remote_subscribed)

    async def _pump(self, track: rtc.Track, chunks: list[bytes]) -> None:
        try:
            stream = rtc.AudioStream.from_track(
                track=track, sample_rate=_SAMPLE_RATE, num_channels=1
            )
            async for event in stream:
                chunks.append(bytes(event.frame.data))
        except Exception:
            logger.exception("recording capture task died for track %s", track.sid)

    async def stop(self) -> str | None:
        """Cancels capture and writes a local temp WAV. Returns its path, or
        None if nothing was captured."""
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        caller_pcm = b"".join(self._caller_chunks)
        agent_pcm = b"".join(self._agent_chunks)
        if not caller_pcm and not agent_pcm:
            return None

        try:
            left = array.array("h")
            left.frombytes(caller_pcm[: len(caller_pcm) - (len(caller_pcm) % 2)])
            right = array.array("h")
            right.frombytes(agent_pcm[: len(agent_pcm) - (len(agent_pcm) % 2)])
            length = max(len(left), len(right))
            left.extend([0] * (length - len(left)))
            right.extend([0] * (length - len(right)))

            stereo = array.array("h", bytes(length * 4))
            stereo[0::2] = left
            stereo[1::2] = right

            fd, path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            with wave.open(path, "wb") as wav_file:
                wav_file.setnchannels(2)
                wav_file.setsampwidth(2)
                wav_file.setframerate(_SAMPLE_RATE)
                wav_file.writeframes(stereo.tobytes())
            return path
        except Exception:
            logger.exception("failed to build recording WAV")
            return None


def upload_recording(local_path: str, account_id: int | None, call_id: int | None) -> str | None:
    """Uploads a local WAV to Cloudflare R2 and returns its object key, or
    None if R2 isn't configured (a supported, silent no-op) or the upload
    failed. Always deletes the local temp file."""
    try:
        account_id_str = os.environ.get("R2_ACCOUNT_ID")
        access_key = os.environ.get("R2_ACCESS_KEY_ID")
        secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
        bucket = os.environ.get("R2_BUCKET_NAME")
        if not (account_id_str and access_key and secret_key and bucket and call_id):
            return None
        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id_str}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
        )
        key = f"recordings/{account_id or 0}/{call_id}.wav"
        with open(local_path, "rb") as f:
            client.upload_fileobj(io.BytesIO(f.read()), bucket, key, ExtraArgs={"ContentType": "audio/wav"})
        return key
    except Exception:
        logger.exception("recording upload to R2 failed for call %s", call_id)
        return None
    finally:
        try:
            os.remove(local_path)
        except OSError:
            pass
