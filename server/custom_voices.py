"""Clone your voice: a customer records their own voice and we clone it.

Owner decision 2026-10-16 (real bills): every clone is a Sarvam clone, for
all languages, server-side only:
  - Sarvam Instant Voice Cloning (beta; POST /voices/create -> voice_id,
    needs the text_to_speech_voice_cloning capability on our Sarvam account).
    About Rs 1.4 per minute of agent speech (Rs 30 per 10K chars; stock Bulbul
    v4 is ~Rs 0.37/min). Created from a 10-15 s reference clip cut from the
    sample (silence trimmed, best window chosen: choose_reference); the clip is kept in storage (sarvam_ref_key) so the voice can be
    re-created. If Sarvam cloning fails (capability missing, 503, ...) the
    clone fails and any credits are refunded - there is no other vendor.
  - ElevenLabs Instant Voice Cloning is OFF: it costs ~Rs 3.5-3.8/min and our
    pay-as-you-go ElevenLabs account has no plan that includes it. The code is
    kept behind VOICE_CLONE_ELEVENLABS=1 (default off); the call worker can
    still speak an ElevenLabs clone if one ever exists.

engine_default is the vendor a call uses: Sarvam whenever its clone exists.

The browser never sees a vendor: responses, errors, ids (vv_...) and URLs
are ours, previews are served from this server, vendor ids and storage keys
stay in the database. Agents use a clone as voice "custom:vv_<id>"; the call
worker resolves it (agent/custom_voice.py) and falls back to a default voice
if the clone is unavailable.

Pricing (owner, 2026-10-16): the first clone is free on Growth and Scale (and
the platform owner); each further clone within the plan limit costs
CLONE_EXTRA_CREDITS once, at creation, refunded if cloning fails. Calls on a
cloned voice carry no per-minute premium: calls_db.voice_tier() bills
"custom:" as the standard voice tier, so a Vistrow Bharat call costs the same
BHARAT credits per minute as on any standard voice.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import logging
import math
import operator
import os
import re
import secrets
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
import wave
from array import array

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, Form, HTTPException, Response, UploadFile

import calls_db
import plan_policy
import storage

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------- pricing
# Owner-tunable. First clone free (Growth/Scale/owner), later clones cost
# CLONE_EXTRA_CREDITS each, charged once at creation.
FIRST_CLONE_FREE = True
CLONE_EXTRA_CREDITS = 25
# Owner and platform accounts have no plan limit; reported as this number.
OWNER_CLONE_LIMIT = 100
# A cloned voice bills like any standard voice: what a call costs per minute
# on the default Vistrow Bharat model (standard voice x premium model = 2).
BHARAT_CREDITS_PER_MINUTE = round(
    calls_db._credits_per_minute(
        1.0,
        calls_db._VOICE_TIER_MULTIPLIERS[calls_db.voice_tier(None)],
        calls_db._MODEL_TIER_MULTIPLIERS[calls_db.model_tier("sarvam/sarvam-105b-conversations")],
    ),
    2,
)

# ---------------------------------------------------------------- limits
VOICE_PREFIX = "custom:"
_ID_RE = re.compile(r"^vv_[a-z0-9]{16}$")
# Sarvam's docs (read 2026-10-16): 10-15 s of reference is what the model is
# tuned for; longer rarely helps and can drift. So 10 s of speech is enough,
# an in-browser recording is capped at 60 s, and an uploaded file may be up
# to 5 min (we pick the best 12-15 s from it).
SAMPLE_MIN_S = 10.0
RECORDING_MAX_S = 60.0
SAMPLE_MAX_S = 300.0
SAMPLE_MAX_BYTES = 20 * 1024 * 1024
CONSENT_MAX_BYTES = 2 * 1024 * 1024
CONSENT_MIN_S = 2.0
PREVIEW_MAX_CHARS = 200
# Vendor cost guard: new (uncached) previews per account per day.
PREVIEW_DAILY_LIMIT = 40
# A clone still "processing" after this long was lost (server restart).
STALE_PROCESSING_MIN = 20
NAME_MAX = 60
# The reference clip Sarvam clones from: silence trimmed off both ends, then
# the best contiguous 12-15 s of speech (see choose_reference).
_PCM_RATE = 24000
REF_MIN_S = 12.0
REF_MAX_S = 15.0
SPEECH_MIN_S = 10.0
_FRAME_S = 0.05                 # analysis frame: 50 ms
_FRAME = int(_PCM_RATE * _FRAME_S)
_ABS_SPEECH_RMS = 150.0         # ~ -47 dBFS: quieter than this is never speech
_CLIP_PEAK = 32000              # a frame whose peak reaches this is clipped
_LONG_PAUSE_S = 1.0             # pauses longer than this count against a window
_EDGE_PAD_S = 0.1               # kept around speech so word onsets aren't cut

# Sarvam voice cloning languages (docs, 2026-10-12). A clone speaks any of
# them on calls (cross-lingual); the voice's own language is what it was
# recorded in.
_SARVAM_CLONE_LANGS = {"as-IN", "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN"}
LANGUAGES = {code: label for code, label in __import__("voice_catalog").LANGUAGE_LABELS.items()
             if code in _SARVAM_CLONE_LANGS}

_ALLOWED_EXT = {"webm", "ogg", "oga", "opus", "wav", "mp3", "mpeg", "m4a", "mp4", "aac", "flac"}

_UNAVAILABLE = "Voice cloning is not available right now. Please try again later."
_CREATE_FAILED = "We couldn't create this voice from the recording. Any credits charged have been returned. Please try again with a clearer recording."
_PREVIEW_FAILED = "We couldn't play this preview right now. Please try again."

_ELEVEN_BASE = "https://api.elevenlabs.io"
_SARVAM_BASE = "https://api.sarvam.ai"
ELEVEN_MODEL = "eleven_flash_v2_5"

# Default preview line per language: a clone speaks every language in
# LANGUAGES, so the owner can hear it in each one.
_DEFAULT_PREVIEW = {
    "hi-IN": "नमस्ते! आपके ग्राहकों से कॉल पर आपकी आवाज़ कुछ ऐसी सुनाई देगी।",
    "en-IN": "Hello! This is how your voice will sound on calls with your customers.",
    "mr-IN": "नमस्कार! तुमच्या ग्राहकांशी कॉलवर तुमचा आवाज असा ऐकू येईल.",
    "ta-IN": "வணக்கம்! உங்கள் வாடிக்கையாளர்களுடன் பேசும்போது உங்கள் குரல் இப்படித்தான் கேட்கும்.",
    "te-IN": "నమస్కారం! మీ కస్టమర్లతో కాల్స్‌లో మీ గొంతు ఇలా వినిపిస్తుంది.",
    "kn-IN": "ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಗ್ರಾಹಕರ ಜೊತೆ ಕರೆಗಳಲ್ಲಿ ನಿಮ್ಮ ಧ್ವನಿ ಹೀಗೆ ಕೇಳಿಸುತ್ತದೆ.",
    "ml-IN": "നമസ്കാരം! നിങ്ങളുടെ ഉപഭോക്താക്കളുമായുള്ള കോളുകളിൽ നിങ്ങളുടെ ശബ്ദം ഇങ്ങനെയാണ് കേൾക്കുക.",
    "gu-IN": "નમસ્તે! તમારા ગ્રાહકો સાથેના કૉલ પર તમારો અવાજ આવો સંભળાશે.",
    "bn-IN": "নমস্কার! আপনার গ্রাহকদের সঙ্গে কলে আপনার গলা এরকমই শোনাবে।",
    "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਤੁਹਾਡੇ ਗਾਹਕਾਂ ਨਾਲ ਕਾਲ 'ਤੇ ਤੁਹਾਡੀ ਆਵਾਜ਼ ਕੁਝ ਇਸ ਤਰ੍ਹਾਂ ਸੁਣਾਈ ਦੇਵੇਗੀ।",
    "od-IN": "ନମସ୍କାର! ଆପଣଙ୍କ ଗ୍ରାହକଙ୍କ ସହ କଲରେ ଆପଣଙ୍କ ସ୍ୱର ଏମିତି ଶୁଣାଯିବ।",
}

SCRIPT_EN = (
    "Good morning, and thank you for taking a moment to listen. I am recording this short passage so "
    "that my voice can be used to speak with our customers. Every day, people call us with questions "
    "about our services, our prices, and the time it takes to get things done. Some want a quick answer, "
    "and others want to talk through every detail before they decide. Either way, they deserve a calm, "
    "friendly voice that listens carefully and explains things clearly. "
    "On a busy afternoon, the phone may ring again and again. A caller might ask whether we are open on "
    "Sunday, how far we are from the railway station, or whether an appointment is available next "
    "Tuesday at four o'clock. Numbers matter too: twenty-five, one hundred and twelve, three thousand "
    "five hundred, and nine lakh rupees should all sound natural. "
    "I will speak at my normal pace, the way I would talk to someone sitting across the table. If I make "
    "a small mistake, I will simply keep going. Thank you for your time, and have a wonderful day."
)
SCRIPT_HI = (
    "नमस्ते, और सुनने के लिए समय निकालने का धन्यवाद। मैं यह छोटा सा अंश इसलिए रिकॉर्ड कर रहा हूँ ताकि "
    "मेरी आवाज़ से हमारे ग्राहकों से बात की जा सके। हर दिन लोग हमें हमारी सेवाओं, कीमतों और काम पूरा होने में "
    "लगने वाले समय के बारे में फ़ोन करते हैं। कुछ लोगों को जल्दी जवाब चाहिए, और कुछ फ़ैसला करने से पहले हर "
    "बात विस्तार से समझना चाहते हैं। दोनों ही एक शांत, दोस्ताना आवाज़ के हक़दार हैं जो ध्यान से सुने और "
    "साफ़-साफ़ समझाए। "
    "व्यस्त दोपहर में फ़ोन बार-बार बज सकता है। कोई पूछ सकता है कि क्या हम रविवार को खुले हैं, रेलवे स्टेशन से "
    "हम कितनी दूर हैं, या क्या अगले मंगलवार चार बजे का अपॉइंटमेंट मिल सकता है। संख्याएँ भी स्वाभाविक लगनी "
    "चाहिए: पच्चीस, एक सौ बारह, साढ़े तीन हज़ार, और नौ लाख रुपये। "
    "मैं अपनी सामान्य रफ़्तार से बोलूँगा, जैसे सामने बैठे किसी व्यक्ति से बात करता हूँ। अगर कोई छोटी सी गलती "
    "हो जाए, तो मैं बस बोलता रहूँगा। आपके समय के लिए धन्यवाद, आपका दिन शुभ हो।"
)


class CloneError(Exception):
    """A refusal with a customer-facing message (never names a vendor)."""

    def __init__(self, status: int, detail: str) -> None:
        super().__init__(detail)
        self.status, self.detail = status, detail


# ------------------------------------------------------------- environment

def _eleven_key() -> str | None:
    # Same variable the LiveKit elevenlabs plugin / agent read; the longer
    # name is accepted too, as server/vendor_health.py does.
    return os.environ.get("ELEVEN_API_KEY") or os.environ.get("ELEVENLABS_API_KEY")


def _sarvam_key() -> str | None:
    return os.environ.get("SARVAM_API_KEY")


def _eleven_clones_enabled() -> bool:
    """ElevenLabs cloning is off unless VOICE_CLONE_ELEVENLABS=1 (owner,
    2026-10-16: Sarvam only)."""
    return os.environ.get("VOICE_CLONE_ELEVENLABS", "0") == "1" and bool(_eleven_key())


def _ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


def service_ready() -> bool:
    """Whether a clone can be created at all. Logs what is missing."""
    missing = []
    if not (_sarvam_key() or _eleven_clones_enabled()):
        missing.append("SARVAM_API_KEY")
    if storage.b2_client()[0] is None:
        missing.append("B2_* storage variables")
    if not _ffmpeg():
        missing.append("ffmpeg binary")
    if missing:
        logger.warning("voice cloning unavailable: missing %s", ", ".join(missing))
        return False
    return True


# ------------------------------------------------------------- vendor HTTP

def _http(method: str, url: str, headers: dict, body: bytes | None = None, timeout: float = 60) -> tuple[int, bytes]:
    """One HTTP request; returns (status, body). The only network path, so
    tests replace this and never reach a vendor."""
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _multipart(fields: dict, files: list[tuple[str, str, bytes, str]]) -> tuple[bytes, str]:
    boundary = "vv" + secrets.token_hex(12)
    out = io.BytesIO()
    for name, value in fields.items():
        out.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n".encode())
        out.write(str(value).encode("utf-8") + b"\r\n")
    for name, filename, data, ctype in files:
        out.write(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: {ctype}\r\n\r\n".encode()
        )
        out.write(data + b"\r\n")
    out.write(f"--{boundary}--\r\n".encode())
    return out.getvalue(), f"multipart/form-data; boundary={boundary}"


class VendorError(Exception):
    """Internal only: logged, never shown to the customer."""


def _json_or_raise(status: int, raw: bytes, what: str) -> dict:
    if status >= 300:
        raise VendorError(f"{what} returned HTTP {status}: {raw[:300]!r}")
    try:
        return json.loads(raw or b"{}")
    except ValueError as e:
        raise VendorError(f"{what} returned non-JSON") from e


def eleven_create(name: str, mp3: bytes) -> str:
    body, ctype = _multipart(
        {"name": name, "remove_background_noise": "true"},
        [("files", "sample.mp3", mp3, "audio/mpeg")],
    )
    status, raw = _http("POST", f"{_ELEVEN_BASE}/v1/voices/add",
                        {"xi-api-key": _eleven_key() or "", "Content-Type": ctype}, body, timeout=120)
    voice_id = _json_or_raise(status, raw, "ElevenLabs voices/add").get("voice_id")
    if not voice_id:
        raise VendorError("ElevenLabs voices/add returned no voice_id")
    return voice_id


def eleven_delete(voice_id: str) -> None:
    status, raw = _http("DELETE", f"{_ELEVEN_BASE}/v1/voices/{voice_id}", {"xi-api-key": _eleven_key() or ""})
    if status >= 300 and status != 404:
        raise VendorError(f"ElevenLabs delete returned HTTP {status}: {raw[:200]!r}")


def eleven_tts(voice_id: str, text: str) -> tuple[bytes, str]:
    status, raw = _http(
        "POST", f"{_ELEVEN_BASE}/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128",
        {"xi-api-key": _eleven_key() or "", "Content-Type": "application/json", "Accept": "audio/mpeg"},
        json.dumps({"text": text, "model_id": ELEVEN_MODEL}).encode(),
    )
    if status >= 300 or not raw:
        raise VendorError(f"ElevenLabs TTS returned HTTP {status}: {raw[:200]!r}")
    return raw, "audio/mpeg"


def sarvam_create(name: str, language: str, ref_wav: bytes) -> str:
    body, ctype = _multipart({"name": name, "language": language}, [("file", "reference.wav", ref_wav, "audio/wav")])
    status, raw = _http("POST", f"{_SARVAM_BASE}/voices/create",
                        {"api-subscription-key": _sarvam_key() or "", "Content-Type": ctype}, body, timeout=120)
    voice_id = _json_or_raise(status, raw, "Sarvam voices/create").get("voice_id")
    if not voice_id:
        raise VendorError("Sarvam voices/create returned no voice_id")
    return voice_id


def sarvam_delete(voice_id: str) -> None:
    status, raw = _http("DELETE", f"{_SARVAM_BASE}/voices/delete/{voice_id}", {"api-subscription-key": _sarvam_key() or ""})
    if status >= 300 and status != 404:
        raise VendorError(f"Sarvam delete returned HTTP {status}: {raw[:200]!r}")


def sarvam_tts(voice_id: str, text: str, language: str) -> tuple[bytes, str]:
    body, ctype = _multipart(
        {"voice_id": voice_id, "text": text, "language_code": language, "output_audio_codec": "mp3"}, [],
    )
    status, raw = _http("POST", f"{_SARVAM_BASE}/voices/clone",
                        {"api-subscription-key": _sarvam_key() or "", "Content-Type": ctype}, body)
    data = _json_or_raise(status, raw, "Sarvam voices/clone")
    b64 = data.get("audio_b64") or data.get("audio")
    if isinstance(b64, list):
        b64 = b64[0] if b64 else None
    if not b64:
        raise VendorError("Sarvam voices/clone returned no audio")
    return base64.b64decode(b64), "audio/mpeg"


# ------------------------------------------------------------------ audio

class AudioError(Exception):
    pass


def decode_pcm(data: bytes) -> bytes:
    """Any browser recording -> 24 kHz mono s16le PCM. Duration comes from
    the decoded length: Chrome's MediaRecorder webm carries no duration."""
    proc = subprocess.run(
        [_ffmpeg() or "ffmpeg", "-v", "error", "-i", "pipe:0", "-ac", "1", "-ar", str(_PCM_RATE), "-f", "s16le", "pipe:1"],
        input=data, capture_output=True, timeout=120,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise AudioError(proc.stderr[:300].decode("utf-8", "replace"))
    return proc.stdout


def to_mp3(pcm: bytes) -> bytes:
    proc = subprocess.run(
        [_ffmpeg() or "ffmpeg", "-v", "error", "-f", "s16le", "-ar", str(_PCM_RATE), "-ac", "1", "-i", "pipe:0",
         "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", "pipe:1"],
        input=pcm, capture_output=True, timeout=120,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise AudioError(proc.stderr[:300].decode("utf-8", "replace"))
    return proc.stdout


def pcm_seconds(pcm: bytes) -> float:
    return len(pcm) / (2 * _PCM_RATE)


_TOO_LITTLE_SPEECH = ("We could only hear about {secs} seconds of you speaking. Please record at least "
                      "10 seconds of yourself talking, in a quiet room.")


def _frame_stats(pcm: bytes) -> list[tuple[float, int]]:
    """(RMS, peak) of each 50 ms frame of 24 kHz mono s16le PCM."""
    samples = array("h")
    samples.frombytes(pcm[: len(pcm) // 2 * 2])
    if sys.byteorder == "big":
        samples.byteswap()
    out = []
    for i in range(0, len(samples) - _FRAME + 1, _FRAME):
        f = samples[i:i + _FRAME]
        out.append((math.sqrt(sum(map(operator.mul, f, f)) / _FRAME), max(max(f), -min(f))))
    return out


def _speech_threshold(rms: list[float]) -> float:
    """RMS above which a frame counts as speech: 3x the noise floor (the
    quietest 10% of frames), but never above 30% of the loud frames (so a
    noisy room still finds the speech) nor below an absolute floor."""
    ordered = sorted(rms)
    noise = ordered[len(ordered) // 10]
    loud = ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]
    return max(_ABS_SPEECH_RMS, min(noise * 3, loud * 0.3))


def _window_score(voiced: list[bool], clipped: list[bool]) -> float:
    """Higher is better: mostly speech, no long pauses, nothing clipped."""
    n = len(voiced)
    excess_pause, run = 0.0, 0
    for v in voiced + [True]:
        if v:
            excess_pause += max(0.0, run * _FRAME_S - _LONG_PAUSE_S)
            run = 0
        else:
            run += 1
    return sum(voiced) / n - 2.0 * (sum(clipped) / n) - 0.1 * excess_pause


def choose_reference(pcm: bytes) -> tuple[int, int]:
    """(start, end) sample offsets of the reference clip: leading and
    trailing silence trimmed, then - if more than 15 s is left - the
    contiguous 12-15 s window with the most speech, fewest long pauses and
    no clipping, cut at pauses rather than mid-word. Raises CloneError when
    less than 10 s of speech remains after trimming."""
    frames = _frame_stats(pcm)
    if not frames:
        raise CloneError(400, _TOO_LITTLE_SPEECH.format(secs=0))
    rms = [r for r, _p in frames]
    thr = _speech_threshold(rms)
    voiced = [r >= thr for r in rms]
    clipped = [p >= _CLIP_PEAK for _r, p in frames]
    if not any(voiced):
        raise CloneError(400, _TOO_LITTLE_SPEECH.format(secs=0))
    first = voiced.index(True)
    last = len(voiced) - 1 - voiced[::-1].index(True)
    span = last - first + 1
    if span * _FRAME_S < SPEECH_MIN_S:
        raise CloneError(400, _TOO_LITTLE_SPEECH.format(secs=f"{span * _FRAME_S:.0f}"))
    max_n, min_n = round(REF_MAX_S / _FRAME_S), round(REF_MIN_S / _FRAME_S)
    if span <= max_n:
        start, end = first, last + 1
    else:
        best_score, start = None, first
        for s in range(first, last + 2 - max_n, 5):  # 0.25 s steps
            score = _window_score(voiced[s:s + max_n], clipped[s:s + max_n])
            if best_score is None or score > best_score + 1e-9:
                best_score, start = score, s
        # Start just after a pause (up to 0.3 s earlier), not mid-word.
        for j in range(start, max(first, start - 6) - 1, -1):
            if j == first or not voiced[j - 1]:
                start = j
                break
        # End where a pause starts, as late as possible but at least 12 s in.
        end = min(start + max_n, last + 1)
        for i in range(end, start + min_n - 1, -1):
            if i >= len(voiced) or not voiced[i]:
                end = i
                break
        while end - start > min_n and not voiced[end - 1]:
            end -= 1
    # A little room around the speech, without going past 15 s.
    pad = round(_EDGE_PAD_S / _FRAME_S)
    room = max(0, max_n - (end - start))
    lead = min(pad, start, room)
    start -= lead
    end = min(len(frames), end + min(pad, room - lead))
    return start * _FRAME, end * _FRAME


def reference_clip(pcm: bytes) -> bytes:
    """The 10-15 s WAV Sarvam clones from (choose_reference)."""
    start, end = choose_reference(pcm)
    chunk = pcm[start * 2:end * 2]
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(_PCM_RATE)
        w.writeframes(chunk)
    return out.getvalue()


# --------------------------------------------------------------- storage

def _store(key: str, data: bytes, ctype: str) -> None:
    client, bucket = storage.b2_client()
    if client is None:
        raise CloneError(503, _UNAVAILABLE)
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=ctype)


def _unstore(keys: list[str]) -> None:
    client, bucket = storage.b2_client()
    if client is None:
        return
    for key in keys:
        try:
            client.delete_object(Bucket=bucket, Key=key)
        except Exception:
            logger.warning("custom voice: could not delete stored object %s", key)


# ------------------------------------------------------------------ model

def _iso(value) -> str:
    if not value:
        return ""
    text = str(value)
    return text.replace(" ", "T") + ("Z" if "T" not in text and not text.endswith("Z") else "")


def public(row) -> dict:
    """The only shape that leaves the server."""
    return {
        "id": row["id"],
        "name": row["name"],
        "language": row["language"],
        "status": row["status"],
        "error": row["error"] or "",
        "createdAt": _iso(row["created_at"]),
        "creditsPerMinute": BHARAT_CREDITS_PER_MINUTE,
        "voiceValue": VOICE_PREFIX + row["id"],
        # One recording speaks every supported language (cross-lingual).
        "speaksLanguages": list(LANGUAGES),
    }


def is_custom_value(value: str | None) -> bool:
    return bool(value) and str(value).startswith(VOICE_PREFIX)


def _new_id() -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
    return "vv_" + "".join(secrets.choice(alphabet) for _ in range(16))


def _plan_owner(conn, account_id: int) -> tuple[str, bool]:
    return calls_db._account_plan_and_owner(conn, account_id)


def _limit(plan: str, owner: bool) -> int:
    if owner:
        return OWNER_CLONE_LIMIT
    return int(plan_policy.PLANS.get((plan or "").lower(), {}).get("cloned_voices", 0))


def _used(conn, account_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) c FROM custom_voices WHERE account_id = ? AND deleted_at IS NULL AND status <> 'failed'",
        (account_id,),
    ).fetchone()
    return int(row["c"] or 0)


def _next_clone_credits(conn, account_id: int, plan: str, owner: bool) -> int:
    """0 for the account's first clone ever (failed ones don't count, deleted
    ones do - re-creating after a delete is not a new 'first'), else the extra
    clone price."""
    if not FIRST_CLONE_FREE:
        return CLONE_EXTRA_CREDITS
    prior = conn.execute(
        "SELECT COUNT(*) c FROM custom_voices WHERE account_id = ? AND status <> 'failed'", (account_id,)
    ).fetchone()
    return 0 if int(prior["c"] or 0) == 0 else CLONE_EXTRA_CREDITS


def _remaining_credits(conn, account_id: int, lock: bool = False) -> float:
    """credits_total minus this period's usage - the same numbers as
    billing_summary's creditsRemaining, read on the caller's connection."""
    total_row = conn.execute(
        "SELECT value FROM settings WHERE account_id = ? AND key = 'credits_total'" + (" FOR UPDATE" if lock else ""),
        (account_id,),
    ).fetchone()
    total = int(total_row["value"]) if total_row else calls_db.PLAN_PRICING["starter"]["credits"]
    sub = conn.execute(
        "SELECT plan, status, current_period_start FROM subscriptions WHERE account_id = ?", (account_id,)
    ).fetchone()
    period_start = calls_db.usage_period_start(conn, account_id, sub)
    rates = calls_db.credit_rates(account_id, conn=conn)
    used, _by_type, _by_tier = calls_db._credits_used_in_period(conn, account_id, rates, period_start)
    return max(0.0, round(total - used, 1))


def _company(conn, account_id: int) -> str:
    row = conn.execute("SELECT name FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return (row["name"] if row else "") or "our company"


def consent_sentence(company: str) -> str:
    return (
        f"I confirm that this is my own voice, and I give {company} permission to create an AI copy of it "
        f"and use it on {company}'s calls with customers."
    )


def _fail_and_refund(conn, voice_id: str, message: str) -> int:
    """Mark failed and return the setup credits exactly once (row-locked)."""
    row = conn.execute(
        "SELECT account_id, setup_credits_charged FROM custom_voices WHERE id = ? FOR UPDATE", (voice_id,)
    ).fetchone()
    if row is None:
        return 0
    refunded = int(row["setup_credits_charged"] or 0)
    conn.execute(
        "UPDATE custom_voices SET status = 'failed', error = ?, setup_credits_charged = 0 WHERE id = ?",
        (message, voice_id),
    )
    if refunded:
        calls_db._adjust_credits_total(conn, row["account_id"], refunded)
    return refunded


def _sweep_stale(conn, account_id: int) -> None:
    rows = conn.execute(
        "SELECT id FROM custom_voices WHERE account_id = ? AND status = 'processing' AND deleted_at IS NULL "
        f"AND created_at::timestamp < (now() AT TIME ZONE 'UTC') - interval '{STALE_PROCESSING_MIN} minutes'",
        (account_id,),
    ).fetchall()
    for r in rows:
        logger.warning("custom voice %s stuck in processing; failing and refunding", r["id"])
        _fail_and_refund(conn, r["id"], _CREATE_FAILED)


# ------------------------------------------------------------- operations

def quote(account_id: int) -> dict:
    conn = calls_db._connect()
    try:
        with conn:
            _sweep_stale(conn, account_id)
            plan, owner = _plan_owner(conn, account_id)
            limit, used = _limit(plan, owner), _used(conn, account_id)
            setup = _next_clone_credits(conn, account_id, plan, owner)
            balance = _remaining_credits(conn, account_id)
            company = _company(conn, account_id)
    finally:
        conn.close()
    reason = ""
    if limit <= 0:
        reason = "Voice cloning is available on the Growth and Scale plans."
    elif used >= limit:
        reason = (f"Your plan includes {limit} cloned voice{'s' if limit != 1 else ''}. "
                  "Delete one or upgrade your plan to add another.")
    elif setup and balance < setup:
        reason = f"You need {setup} credits to create another voice. Your balance is {balance:g}. Top up to continue."
    elif not service_ready():
        reason = _UNAVAILABLE
    return {
        "setupCredits": setup,
        "firstCloneFree": setup == 0,
        "creditsPerMinute": BHARAT_CREDITS_PER_MINUTE,
        "limit": limit,
        "used": used,
        "canCreate": not reason,
        "reason": reason,
        "balance": balance,
        "consentSentence": consent_sentence(company),
        "script": SCRIPT_EN,
        "scriptHi": SCRIPT_HI,
    }


def list_voices(account_id: int) -> list[dict]:
    conn = calls_db._connect()
    try:
        with conn:
            _sweep_stale(conn, account_id)
            rows = conn.execute(
                "SELECT * FROM custom_voices WHERE account_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id",
                (account_id,),
            ).fetchall()
    finally:
        conn.close()
    return [public(r) for r in rows]


def get_row(account_id: int, voice_id: str):
    """The account's own, non-deleted voice row, else None. Every lookup by
    id goes through here so another account's id is simply 'not found'."""
    if not _ID_RE.match(voice_id or ""):
        return None
    conn = calls_db._connect()
    try:
        row = conn.execute(
            "SELECT * FROM custom_voices WHERE id = ? AND account_id = ? AND deleted_at IS NULL",
            (voice_id, account_id),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _require(account_id: int, voice_id: str) -> dict:
    row = get_row(account_id, voice_id)
    if row is None:
        raise CloneError(404, "Voice not found.")
    return row


def validate_agent_voice(account_id: int, value: str) -> None:
    """Agent save: a custom voice must be this account's own, ready clone."""
    voice_id = value[len(VOICE_PREFIX):]
    row = get_row(account_id, voice_id)
    if row is None:
        raise CloneError(400, "Select one of your own cloned voices.")
    if row["status"] != "ready":
        raise CloneError(400, "That cloned voice isn't ready yet.")


def _ext(filename: str | None) -> str:
    ext = (filename or "").rsplit(".", 1)[-1].lower() if "." in (filename or "") else ""
    return ext if ext in _ALLOWED_EXT else "webm"


def _audio_type_ok(content_type: str | None, filename: str | None) -> bool:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct.startswith("audio/") or ct == "video/webm" or ct == "video/mp4":
        return True
    return ct in ("", "application/octet-stream") and (filename or "").rsplit(".", 1)[-1].lower() in _ALLOWED_EXT


def start_create(account_id: int, user_id: int | None, name: str, language: str,
                 sample: bytes, sample_type: str, sample_name: str,
                 consent: bytes, consent_type: str, consent_name: str,
                 source: str = "upload") -> tuple[dict, int, dict]:
    """Validate, charge (if not free), store the audio, insert the row as
    'processing'. Returns (voice, credits_charged, job) - the job is handed
    to finish_create() in the background."""
    name = " ".join((name or "").split())[:NAME_MAX]
    if not name:
        raise CloneError(400, "Give your voice a name.")
    if language not in LANGUAGES:
        raise CloneError(400, "Choose a supported language for this voice.")
    if not sample or not _audio_type_ok(sample_type, sample_name):
        raise CloneError(400, "Upload your voice recording as an audio file.")
    if len(sample) > SAMPLE_MAX_BYTES:
        raise CloneError(400, "The recording is too large. Keep it under 20 MB.")
    if not consent or not _audio_type_ok(consent_type, consent_name):
        raise CloneError(400, "Record the consent sentence before creating the voice.")
    if len(consent) > CONSENT_MAX_BYTES:
        raise CloneError(400, "The consent recording is too large. Keep it under 2 MB.")

    # Cheap refusals first (no audio work for an account that can't create).
    conn = calls_db._connect()
    try:
        plan, owner = _plan_owner(conn, account_id)
        if _limit(plan, owner) <= 0:
            raise CloneError(403, "Voice cloning is available on the Growth and Scale plans.")
    finally:
        conn.close()
    if not service_ready():
        raise CloneError(503, _UNAVAILABLE)

    try:
        pcm = decode_pcm(sample)
    except (AudioError, subprocess.TimeoutExpired, OSError):
        logger.warning("custom voice: sample did not decode", exc_info=True)
        raise CloneError(400, "We couldn't read that recording. Please record again.")
    seconds = pcm_seconds(pcm)
    if seconds < SAMPLE_MIN_S:
        raise CloneError(400, f"The recording is {seconds:.0f} seconds long. Please record at least 10 seconds.")
    if source == "record" and seconds > RECORDING_MAX_S + 1:
        raise CloneError(400, "Recordings can be up to 60 seconds. 15 seconds is plenty, so please record again.")
    if seconds > SAMPLE_MAX_S:
        raise CloneError(400, "The recording is longer than 5 minutes. Please keep it shorter.")
    ref_wav = reference_clip(pcm)  # refuses when there is too little speech
    try:
        consent_s = pcm_seconds(decode_pcm(consent))
    except (AudioError, subprocess.TimeoutExpired, OSError):
        raise CloneError(400, "We couldn't read the consent recording. Please record it again.")
    if consent_s < CONSENT_MIN_S:
        raise CloneError(400, "The consent recording is too short. Please read the whole sentence.")

    voice_id = _new_id()
    prefix = f"custom-voices/{account_id}/{voice_id}"
    sample_key = f"{prefix}/sample.{_ext(sample_name)}"
    consent_key = f"{prefix}/consent.{_ext(consent_name)}"
    ref_key = f"{prefix}/reference.wav"

    conn = calls_db._connect()
    try:
        with conn:
            # Serialises concurrent creates for one account (limit + credits).
            conn.execute("SELECT id FROM accounts WHERE id = ? FOR UPDATE", (account_id,))
            plan, owner = _plan_owner(conn, account_id)
            limit = _limit(plan, owner)
            if _used(conn, account_id) >= limit:
                raise CloneError(403, f"Your plan includes {limit} cloned voice{'s' if limit != 1 else ''}. "
                                      "Delete one or upgrade your plan to add another.")
            charge = _next_clone_credits(conn, account_id, plan, owner)
            if charge:
                balance = _remaining_credits(conn, account_id, lock=True)
                if balance < charge:
                    raise CloneError(402, f"You need {charge} credits to create another voice. "
                                          f"Your balance is {balance:g}. Top up to continue.")
            conn.execute(
                "INSERT INTO custom_voices (id, account_id, name, language, status, sample_key, consent_key, "
                "sarvam_ref_key, consent_verified, setup_credits_charged, created_by) "
                "VALUES (?, ?, ?, ?, 'processing', ?, ?, ?, FALSE, ?, ?)",
                (voice_id, account_id, name, language, sample_key, consent_key, ref_key, charge, user_id),
            )
            if charge:
                calls_db._adjust_credits_total(conn, account_id, -charge)
            row = conn.execute("SELECT * FROM custom_voices WHERE id = ?", (voice_id,)).fetchone()
            voice = public(row)
    finally:
        conn.close()

    try:
        _store(sample_key, sample, (sample_type or "audio/webm").split(";")[0])
        _store(consent_key, consent, (consent_type or "audio/webm").split(";")[0])
        _store(ref_key, ref_wav, "audio/wav")
    except Exception:
        logger.exception("custom voice %s: storing audio failed", voice_id)
        fail(voice_id)
        _unstore([sample_key, consent_key, ref_key])
        raise CloneError(503, _UNAVAILABLE)
    job = {"voice_id": voice_id, "name": name, "language": language, "pcm": pcm, "ref_wav": ref_wav}
    return voice, charge, job


def fail(voice_id: str, message: str = _CREATE_FAILED) -> int:
    conn = calls_db._connect()
    try:
        with conn:
            return _fail_and_refund(conn, voice_id, message)
    finally:
        conn.close()


def choose_engine(language: str, eleven_id: str | None, sarvam_id: str | None) -> str | None:
    """Sarvam whenever its clone exists (every language, owner 2026-10-16)."""
    if sarvam_id:
        return "sarvam"
    if eleven_id:
        return "elevenlabs"
    return None


def finish_create(job: dict) -> None:
    """Background: clone with each configured vendor. Ready if at least one
    worked; otherwise failed and refunded. Never raises."""
    voice_id, language = job["voice_id"], job["language"]
    label = f"vistrow-{voice_id}"  # vendor-side name: no customer data
    eleven_id = sarvam_id = None
    try:
        if _eleven_clones_enabled():
            try:
                eleven_id = eleven_create(label, to_mp3(job["pcm"]))
            except Exception:
                logger.exception("custom voice %s: ElevenLabs clone failed", voice_id)
        if _sarvam_key() and language in _SARVAM_CLONE_LANGS:
            try:
                sarvam_id = sarvam_create(label, language, job["ref_wav"])
            except Exception:
                # A 403 here usually means the text_to_speech_voice_cloning
                # capability is not enabled on our Sarvam account.
                logger.exception("custom voice %s: Sarvam clone failed", voice_id)
        engine = choose_engine(language, eleven_id, sarvam_id)
        conn = calls_db._connect()
        try:
            with conn:
                if engine is None:
                    _fail_and_refund(conn, voice_id, _CREATE_FAILED)
                    return
                updated = conn.execute(
                    "UPDATE custom_voices SET status = 'ready', error = '', elevenlabs_voice_id = ?, "
                    "sarvam_voice_id = ?, engine_default = ? WHERE id = ? AND status = 'processing' "
                    "AND deleted_at IS NULL RETURNING id",
                    (eleven_id, sarvam_id, engine, voice_id),
                ).fetchone()
        finally:
            conn.close()
        if updated is None:
            # Swept or deleted meanwhile: don't leave orphan vendor voices.
            _vendor_delete({"id": voice_id, "elevenlabs_voice_id": eleven_id, "sarvam_voice_id": sarvam_id})
        logger.info("custom voice %s ready: engine=%s eleven=%s sarvam=%s",
                    voice_id, engine, bool(eleven_id), bool(sarvam_id))
    except Exception:
        logger.exception("custom voice %s: finishing failed", voice_id)
        try:
            fail(voice_id)
        except Exception:
            logger.exception("custom voice %s: could not mark failed", voice_id)


def rename(account_id: int, voice_id: str, name: str) -> dict:
    _require(account_id, voice_id)
    name = " ".join((name or "").split())[:NAME_MAX]
    if not name:
        raise CloneError(400, "Give your voice a name.")
    conn = calls_db._connect()
    try:
        with conn:
            row = conn.execute(
                "UPDATE custom_voices SET name = ? WHERE id = ? AND account_id = ? AND deleted_at IS NULL RETURNING *",
                (name, voice_id, account_id),
            ).fetchone()
    finally:
        conn.close()
    return public(row)


def _vendor_delete(row: dict) -> None:
    if row.get("elevenlabs_voice_id"):
        try:
            eleven_delete(row["elevenlabs_voice_id"])
        except Exception:
            logger.exception("custom voice %s: ElevenLabs delete failed", row["id"])
    if row.get("sarvam_voice_id"):
        try:
            sarvam_delete(row["sarvam_voice_id"])
        except Exception:
            logger.exception("custom voice %s: Sarvam delete failed", row["id"])


def delete(account_id: int, voice_id: str) -> None:
    row = _require(account_id, voice_id)
    conn = calls_db._connect()
    try:
        with conn:
            agents = conn.execute(
                "SELECT name FROM agents WHERE account_id = ? AND voice = ? ORDER BY name",
                (account_id, VOICE_PREFIX + voice_id),
            ).fetchall()
            if agents:
                names = ", ".join(a["name"] or "Untitled agent" for a in agents)
                raise CloneError(409, f"This voice is used by: {names}. Choose another voice for "
                                      f"{'these agents' if len(agents) > 1 else 'that agent'} first.")
            conn.execute(
                f"UPDATE custom_voices SET deleted_at = {calls_db._NOW} WHERE id = ? AND account_id = ?",
                (voice_id, account_id),
            )
            conn.execute("DELETE FROM custom_voice_previews WHERE voice_id = ?", (voice_id,))
    finally:
        conn.close()
    _vendor_delete(row)
    _unstore([k for k in (row.get("sample_key"), row.get("consent_key"), row.get("sarvam_ref_key")) if k])


def preview(account_id: int, voice_id: str, text: str | None, language: str | None = None) -> tuple[bytes, str]:
    row = _require(account_id, voice_id)
    if row["status"] != "ready":
        raise CloneError(409, "This voice isn't ready yet.")
    language = language or row["language"]
    if language == "or-IN":
        language = "od-IN"
    if language not in LANGUAGES:
        raise CloneError(400, "Choose a supported language for the preview.")
    text = " ".join((text or "").split())
    if len(text) > PREVIEW_MAX_CHARS:
        raise CloneError(400, f"Preview text can be at most {PREVIEW_MAX_CHARS} characters.")
    if not text:
        text = _DEFAULT_PREVIEW.get(language) or _DEFAULT_PREVIEW["en-IN"]
    # Cached per (voice, language, text): the same words in another
    # language are a different recording.
    sha = hashlib.sha256(f"{language}\n{text}".encode("utf-8")).hexdigest()
    conn = calls_db._connect()
    try:
        cached = conn.execute(
            "SELECT audio, content_type FROM custom_voice_previews WHERE voice_id = ? AND text_sha = ?",
            (voice_id, sha),
        ).fetchone()
        if cached:
            return bytes(cached["audio"]), cached["content_type"]
        recent = conn.execute(
            "SELECT COUNT(*) c FROM custom_voice_previews p JOIN custom_voices v ON v.id = p.voice_id "
            "WHERE v.account_id = ? AND p.created_at > now() - interval '1 day'",
            (account_id,),
        ).fetchone()
    finally:
        conn.close()
    if int(recent["c"] or 0) >= PREVIEW_DAILY_LIMIT:
        raise CloneError(429, "You've reached today's preview limit. Please try again tomorrow.")
    try:
        if row["engine_default"] == "sarvam" and row["sarvam_voice_id"] and _sarvam_key():
            audio, ctype = sarvam_tts(row["sarvam_voice_id"], text, language)
        elif row["elevenlabs_voice_id"] and _eleven_key():
            audio, ctype = eleven_tts(row["elevenlabs_voice_id"], text)
        elif row["sarvam_voice_id"] and _sarvam_key():
            audio, ctype = sarvam_tts(row["sarvam_voice_id"], text, language)
        else:
            raise VendorError("no engine available for preview")
    except Exception:
        logger.exception("custom voice %s: preview synthesis failed", voice_id)
        raise CloneError(502, _PREVIEW_FAILED)
    conn = calls_db._connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO custom_voice_previews (voice_id, text_sha, audio, content_type) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (voice_id, text_sha) DO NOTHING",
                (voice_id, sha, audio, ctype),
            )
    finally:
        conn.close()
    return audio, ctype


# ------------------------------------------------------------------ routes

async def _read_capped(upload: UploadFile, cap: int, too_big: str) -> bytes:
    data = await upload.read(cap + 1)
    if len(data) > cap:
        raise HTTPException(400, too_big)
    return data


def build_router(require_role) -> APIRouter:
    """Routes, mounted by token_api (`require_role` is its dependency
    factory, so the session middleware and role checks are the usual ones)."""
    router = APIRouter()

    def _http_error(e: CloneError) -> HTTPException:
        return HTTPException(e.status, e.detail)

    @router.get("/voices/custom/quote")
    def custom_voice_quote(user: dict = Depends(require_role("member"))) -> dict:
        return quote(user["account_id"])

    @router.get("/voices/custom")
    def custom_voice_list(user: dict = Depends(require_role("member"))) -> list[dict]:
        return list_voices(user["account_id"])

    @router.post("/voices/custom", status_code=201)
    async def custom_voice_create(
        background: BackgroundTasks,
        name: str = Form(...),
        language: str = Form(...),
        sample: UploadFile = File(...),
        consent: UploadFile = File(...),
        # "record" (in-browser, up to 60 s) or "upload" (a file, up to 5 min).
        source: str = Form("upload"),
        user: dict = Depends(require_role("admin")),
    ) -> dict:
        sample_bytes = await _read_capped(sample, SAMPLE_MAX_BYTES, "The recording is too large. Keep it under 20 MB.")
        consent_bytes = await _read_capped(consent, CONSENT_MAX_BYTES, "The consent recording is too large. Keep it under 2 MB.")
        try:
            voice, charged, job = await _run_sync(
                start_create, user["account_id"], user.get("user_id"), name, language,
                sample_bytes, sample.content_type, sample.filename,
                consent_bytes, consent.content_type, consent.filename,
                "record" if source == "record" else "upload",
            )
        except CloneError as e:
            raise _http_error(e)
        background.add_task(finish_create, job)
        return {**voice, "creditsCharged": charged}

    @router.get("/voices/custom/{voice_id}/preview")
    def custom_voice_preview(voice_id: str, text: str = "", language: str = "",
                             user: dict = Depends(require_role("member"))) -> Response:
        try:
            audio, ctype = preview(user["account_id"], voice_id, text, language or None)
        except CloneError as e:
            raise _http_error(e)
        return Response(content=audio, media_type=ctype, headers={"Cache-Control": "private, max-age=86400"})

    @router.patch("/voices/custom/{voice_id}")
    def custom_voice_rename(voice_id: str, body: dict = Body(...), user: dict = Depends(require_role("admin"))) -> dict:
        try:
            return rename(user["account_id"], voice_id, str((body or {}).get("name") or ""))
        except CloneError as e:
            raise _http_error(e)

    @router.delete("/voices/custom/{voice_id}")
    def custom_voice_delete(voice_id: str, user: dict = Depends(require_role("admin"))) -> dict:
        try:
            delete(user["account_id"], voice_id)
        except CloneError as e:
            raise _http_error(e)
        return {"ok": True}

    return router


async def _run_sync(fn, *args):
    from starlette.concurrency import run_in_threadpool

    return await run_in_threadpool(fn, *args)

