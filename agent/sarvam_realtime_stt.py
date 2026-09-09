"""Whether to use Sarvam's realtime streaming STT.

This module used to contain a hand-rolled client for
wss://api.sarvam.ai/speech-to-text-realtime/ws — about 400 lines of protocol,
chunking and event mapping — because livekit-plugins-sarvam 1.6.4 had no way
to reach that socket: its SarvamSTTModels allowlist was
Literal["saarika:v2.5", "saaras:v2.5", "saaras:v3"] and it connected to the
legacy endpoint, which Sarvam's own docs describe as giving "only a final per
utterance".

1.8.0 ships `sarvam.STTStreaming` (an alias for STTRealtime), and Sarvam's
LiveKit production guide names it as the class new builds should use. Keeping
our own client alongside theirs would mean maintaining a protocol
reimplementation for no benefit, so it is gone; _build_stt constructs theirs.

Everything the adapter learned the hard way is now a setting on their class:
audio is chunked below the 16,000-byte per-frame cap (call 933 ran 51 seconds
in silence because every frame was rejected with a NON-FATAL chunk_too_large,
so nothing surfaced the failure), and partial delivery turned out to be
account-gated rather than broken — the entitled key returned 32 partials where
the other returned zero across 13 connections.

The flag stays so the legacy `sarvam.STT` path remains one env var away.
"""
import os


def enabled() -> bool:
    return (os.environ.get("SARVAM_REALTIME_STT") or "").strip().lower() in (
        "1", "true", "yes", "on",
    )
