"""Native provider event timestamps without recording speech or changing streams.

LiveKit 1.8.3's Google metric.timestamp is generation creation, and ttft ends
at the first received audio frame. Collection time is often much later.
Neither field alone measures the caller's perceived response time.
"""
import math
import time


def first_audio_time(metric):
    start, delay = float(metric.timestamp), float(metric.ttft)
    if not math.isfinite(start) or not math.isfinite(delay) or start <= 0 or delay < 0:
        return None
    return start + delay


def attach(session, userdata, logger, *, clock=time.time, monotonic=time.monotonic):
    """Observe public native events; callbacks never consume or alter audio."""
    # Bounded per session, and IDs only: no transcript contents in timing logs.
    seen_transcripts = set()

    def voice_age_ms():
        meter = userdata.get("turn_meter")
        age = meter.voice_age(monotonic()) if meter is not None else None
        return round(age * 1000) if age is not None else None

    def generation(ev):
        logger.info(
            "[native-timing] generation id=%s at=%.3f requested=%s lastVoiceAgeMs=%s",
            ev.response_id, clock(), ev.user_initiated, voice_age_ms(),
        )

    def transcript(ev):
        first = ev.item_id not in seen_transcripts
        if first:
            if len(seen_transcripts) >= 128:
                seen_transcripts.clear()
            seen_transcripts.add(ev.item_id)
        if first or ev.is_final:
            logger.info(
                "[native-timing] input-caption id=%s at=%.3f first=%s final=%s lastVoiceAgeMs=%s",
                ev.item_id, clock(), first, ev.is_final, voice_age_ms(),
            )

    session.on("generation_created", generation)
    session.on("input_audio_transcription_completed", transcript)
