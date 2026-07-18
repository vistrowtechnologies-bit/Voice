"""Call recording — captured client-side inside the agent process rather than
via LiveKit's official record=True/Egress path. That official path calls
JobContext.init_recording(), which (per livekit-agents' own job.py) spins up
a billed cloud-observability pipeline any time audio recording is requested,
regardless of whether traces/logs are separately disabled. Tapping the room's
audio tracks directly here never touches that code path, so recording stays
genuinely free — the only cost is Backblaze B2 storage (see upload_recording
below), chosen over Cloudflare R2 because B2's free tier (10GB, permanent)
never requires a card on file, where R2 gates its free tier behind adding a
payment method even at $0 due.

Best-effort throughout: a recording hiccup must never break call teardown or
surface to the caller. Every public function swallows its own exceptions.
"""

import asyncio
import audioop
import io
import logging
import os
import tempfile
import wave

from livekit import rtc

logger = logging.getLogger("recording")

_SAMPLE_RATE = 16000


class CallRecorder:
    """Tapes both sides of one call into a single mono WAV, both sides mixed
    together rather than hard-panned to a channel — a hard L/R split sounds
    like only one party is speaking per ear on typical phone/laptop playback.
    Attach right after session.start()."""

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

        def _capture_if_audio(track, sid: str, chunks: list[bytes], side: str) -> None:
            if sid in seen_sids:
                return
            if track.kind != rtc.TrackKind.KIND_AUDIO:
                logger.info("recording: skipping non-audio track sid=%s kind=%s side=%s", sid, track.kind, side)
                return
            seen_sids.add(sid)
            logger.info("recording: starting capture task sid=%s side=%s", sid, side)
            self._tasks.append(asyncio.create_task(self._pump(track, chunks, side)))

        local_pubs = list(self._room.local_participant.track_publications.values())
        remote_pubs = [
            pub for participant in self._room.remote_participants.values() for pub in participant.track_publications.values()
        ]
        logger.info(
            "recording: start() called, local_publications=%d remote_publications=%d",
            len(local_pubs),
            len(remote_pubs),
        )

        for pub in local_pubs:
            if pub.track is not None:
                _capture_if_audio(pub.track, pub.sid, self._agent_chunks, "agent")
            else:
                logger.info("recording: local publication sid=%s has no track yet", pub.sid)

        for pub in remote_pubs:
            if pub.track is not None:
                _capture_if_audio(pub.track, pub.sid, self._caller_chunks, "caller")
            else:
                logger.info("recording: remote publication sid=%s has no track yet", pub.sid)

        def _on_local_published(pub, track) -> None:
            logger.info("recording: local_track_published event sid=%s", pub.sid)
            _capture_if_audio(track, pub.sid, self._agent_chunks, "agent")

        def _on_remote_subscribed(track, pub, participant) -> None:
            logger.info("recording: track_subscribed event sid=%s", pub.sid)
            _capture_if_audio(track, pub.sid, self._caller_chunks, "caller")

        self._room.on("local_track_published", _on_local_published)
        self._room.on("track_subscribed", _on_remote_subscribed)

    async def _pump(self, track: rtc.Track, chunks: list[bytes], side: str) -> None:
        frame_count = 0
        try:
            stream = rtc.AudioStream.from_track(
                track=track, sample_rate=_SAMPLE_RATE, num_channels=1
            )
            async for event in stream:
                chunks.append(bytes(event.frame.data))
                frame_count += 1
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("recording: capture task died for track %s (side=%s, frames_before_death=%d)", track.sid, side, frame_count)
        finally:
            logger.info("recording: capture task for side=%s ended, frames=%d, bytes=%d", side, frame_count, sum(len(c) for c in chunks))

    async def stop(self) -> str | None:
        """Cancels capture and writes a local temp WAV. Returns its path, or
        None if nothing was captured."""
        logger.info("recording: stop() called, active tasks=%d", len(self._tasks))
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass

        caller_pcm = b"".join(self._caller_chunks)
        agent_pcm = b"".join(self._agent_chunks)
        logger.info(
            "recording: stop() captured caller_bytes=%d agent_bytes=%d", len(caller_pcm), len(agent_pcm)
        )
        if not caller_pcm and not agent_pcm:
            return None

        try:
            caller_pcm = caller_pcm[: len(caller_pcm) - (len(caller_pcm) % 2)]
            agent_pcm = agent_pcm[: len(agent_pcm) - (len(agent_pcm) % 2)]
            # audioop.add requires equal-length fragments — pad the shorter
            # side with silence so both lines up sample-for-sample.
            length = max(len(caller_pcm), len(agent_pcm))
            caller_pcm = caller_pcm + b"\x00" * (length - len(caller_pcm))
            agent_pcm = agent_pcm + b"\x00" * (length - len(agent_pcm))
            # Saturates on overflow rather than wrapping, so simultaneous
            # speech (interruptions/overlap) won't produce audible clipping
            # artifacts the way a naive sample-sum would.
            mixed = audioop.add(caller_pcm, agent_pcm, 2)

            fd, path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            with wave.open(path, "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(_SAMPLE_RATE)
                wav_file.writeframes(mixed)
            return path
        except Exception:
            logger.exception("failed to build recording WAV")
            return None


def upload_recording(local_path: str, account_id: int | None, call_id: int | None) -> str | None:
    """Uploads a local WAV to Backblaze B2 (via its S3-compatible API) and
    returns its object key, or None if B2 isn't configured (a supported,
    silent no-op) or the upload failed. Always deletes the local temp file."""
    try:
        endpoint_url = os.environ.get("B2_ENDPOINT_URL")
        key_id = os.environ.get("B2_KEY_ID")
        application_key = os.environ.get("B2_APPLICATION_KEY")
        bucket = os.environ.get("B2_BUCKET_NAME")
        region = os.environ.get("B2_REGION")
        if not (endpoint_url and key_id and application_key and bucket and region and call_id):
            logger.info(
                "recording: upload skipped, B2 not fully configured (endpoint=%s key_id=%s bucket=%s region=%s call_id=%s)",
                bool(endpoint_url), bool(key_id), bool(bucket), bool(region), call_id,
            )
            return None
        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=key_id,
            aws_secret_access_key=application_key,
            region_name=region,
        )
        key = f"recordings/{account_id or 0}/{call_id}.wav"
        with open(local_path, "rb") as f:
            client.upload_fileobj(io.BytesIO(f.read()), bucket, key, ExtraArgs={"ContentType": "audio/wav"})
        logger.info("recording: uploaded to B2 key=%s", key)
        return key
    except Exception:
        logger.exception("recording upload to B2 failed for call %s", call_id)
        return None
    finally:
        try:
            os.remove(local_path)
        except OSError:
            pass
