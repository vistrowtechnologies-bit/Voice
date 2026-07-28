"""Call recording — simplified from agent/recording.py now that the
orchestrator already has raw PCM audio in-process (no LiveKit track
tapping needed at all: the WebSocket adapter feeding session.py hands us
caller/agent audio directly). `upload_recording`'s Backblaze B2 upload
logic is unchanged verbatim from agent/recording.py — that part was
already transport-agnostic.
"""

from __future__ import annotations

import audioop
import io
import logging
import os
import tempfile
import wave

logger = logging.getLogger("orchestrator-recording")

RECORDING_SAMPLE_RATE = 16000  # public: callers must resample to this before append_*_audio


class CallRecorder:
    """Accumulates both sides of one call as raw 16-bit PCM mono chunks,
    mixed together (not hard-panned) same as agent/recording.py — a hard
    L/R split sounds like only one party is speaking per ear on typical
    phone/laptop playback. Call append_caller_audio/append_agent_audio as
    audio arrives from the telephony/browser adapter; call stop() at call
    end to get a local WAV path."""

    def __init__(self) -> None:
        self._caller_chunks: list[bytes] = []
        self._agent_chunks: list[bytes] = []

    def append_caller_audio(self, pcm16_mono: bytes) -> None:
        self._caller_chunks.append(pcm16_mono)

    def append_agent_audio(self, pcm16_mono: bytes) -> None:
        self._agent_chunks.append(pcm16_mono)

    def stop(self) -> str | None:
        """Writes a local temp WAV mixing both sides. Returns its path, or
        None if nothing was captured."""
        caller_pcm = b"".join(self._caller_chunks)
        agent_pcm = b"".join(self._agent_chunks)
        if not caller_pcm and not agent_pcm:
            return None
        try:
            caller_pcm = caller_pcm[: len(caller_pcm) - (len(caller_pcm) % 2)]
            agent_pcm = agent_pcm[: len(agent_pcm) - (len(agent_pcm) % 2)]
            length = max(len(caller_pcm), len(agent_pcm))
            caller_pcm = caller_pcm + b"\x00" * (length - len(caller_pcm))
            agent_pcm = agent_pcm + b"\x00" * (length - len(agent_pcm))
            # Saturates on overflow rather than wrapping, so simultaneous
            # speech (interruptions/overlap) won't produce audible clipping.
            mixed = audioop.add(caller_pcm, agent_pcm, 2)
            fd, path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            with wave.open(path, "wb") as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(RECORDING_SAMPLE_RATE)
                wav_file.writeframes(mixed)
            return path
        except Exception:
            logger.exception("failed to build recording WAV")
            return None


def upload_recording(local_path: str, account_id: int | None, call_id: int | None) -> str | None:
    """Uploads a local WAV to Backblaze B2 (S3-compatible API) and returns
    its object key, or None if B2 isn't configured or the upload failed.
    Always deletes the local temp file. Unchanged from agent/recording.py."""
    try:
        endpoint_url = os.environ.get("B2_ENDPOINT_URL")
        key_id = os.environ.get("B2_KEY_ID")
        application_key = os.environ.get("B2_APPLICATION_KEY")
        bucket = os.environ.get("B2_BUCKET_NAME")
        region = os.environ.get("B2_REGION")
        if not (endpoint_url and key_id and application_key and bucket and region and call_id):
            logger.info("recording: upload skipped, B2 not fully configured")
            return None
        import boto3

        client = boto3.client(
            "s3", endpoint_url=endpoint_url, aws_access_key_id=key_id,
            aws_secret_access_key=application_key, region_name=region,
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
