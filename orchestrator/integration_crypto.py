"""Application-level encryption of integration configs (integrations.config_json).

The config holds OAuth tokens (Google Sheets, Zoho), webhook URLs (Slack's
URL is itself the credential), API keys (ArthaLeads) and similar. Privacy
audit 2026-10-12 gap 5: these sat in Postgres as plain JSON.

Identical copies live in server/, agent/ and orchestrator/, because each
deploys on its own (Railway Voice, LiveKit workers, Railway orchestrator) and
none can import another. Keep the three files the same.

Environment:
  INTEGRATION_ENCRYPTION_KEY    Fernet key(s), comma-separated. The first one
                                encrypts; every one is tried to decrypt (key
                                rotation). Lets this process READ encrypted rows.
  INTEGRATION_ENCRYPTION_WRITE  "on" to also WRITE encrypted rows (and, on the
                                server, encrypt existing plaintext rows at boot).
                                Turn it on only after every reader has the key.

Stored form: "enc:v1:<fernet token>" for encrypted rows, plain JSON for legacy
rows. Reads accept both. Without the key nothing breaks: plaintext rows read
and write as before and a warning is logged. Never log a key or a config.
"""

from __future__ import annotations

import json
import logging
import os

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

logger = logging.getLogger(__name__)

PREFIX = "enc:v1:"
KEY_ENV = "INTEGRATION_ENCRYPTION_KEY"
WRITE_ENV = "INTEGRATION_ENCRYPTION_WRITE"

_cache: dict = {}
_warned: set = set()


class ConfigDecryptError(RuntimeError):
    """An encrypted config could not be decrypted (key missing or wrong)."""


def _warn_once(tag: str, message: str, level: int = logging.WARNING) -> None:
    if tag not in _warned:
        _warned.add(tag)
        logger.log(level, message)


def _fernet() -> MultiFernet | None:
    raw = os.environ.get(KEY_ENV, "").strip()
    if not raw:
        return None
    if _cache.get("raw") != raw:
        try:
            box = MultiFernet([Fernet(k.strip().encode()) for k in raw.split(",") if k.strip()])
        except (ValueError, TypeError):
            box = None
            _warn_once("bad-key", f"{KEY_ENV} is not a valid Fernet key; integration configs stay unencrypted",
                       logging.ERROR)
        _cache.update(raw=raw, box=box)
    return _cache["box"]


def write_enabled() -> bool:
    """True when new writes are encrypted: a valid key AND the write switch."""
    if os.environ.get(WRITE_ENV, "").strip().lower() not in {"1", "on", "true", "yes"}:
        return False
    if _fernet() is None:
        _warn_once("write-no-key", f"{WRITE_ENV} is on but {KEY_ENV} is missing or invalid; writing plaintext")
        return False
    return True


def warn_if_unconfigured() -> None:
    if _fernet() is None:
        _warn_once("no-key", f"{KEY_ENV} is not set: integration tokens are stored without application-level encryption")


def encode_config(config: dict) -> str:
    """The value to store in integrations.config_json."""
    text = json.dumps(config)
    if not write_enabled():
        return text
    return PREFIX + _fernet().encrypt(text.encode()).decode()


def decode_config(stored: str | None, strict: bool = False) -> dict:
    """The config dict from integrations.config_json, encrypted or legacy
    plaintext. Plaintext that isn't JSON raises ValueError, as json.loads
    always did. An encrypted value that can't be decrypted returns {} (logged),
    or raises ConfigDecryptError when strict, for read-modify-write callers
    that must not save {} over the real config."""
    if not stored:
        return {}
    if not stored.startswith(PREFIX):
        return json.loads(stored)
    box = _fernet()
    try:
        if box is None:
            raise InvalidToken
        return json.loads(box.decrypt(stored[len(PREFIX):].encode()).decode())
    except InvalidToken:
        logger.error("an integration config could not be decrypted (%s missing or wrong)", KEY_ENV)
        if strict:
            raise ConfigDecryptError("integration config could not be decrypted") from None
        return {}
